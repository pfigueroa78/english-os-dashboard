#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VECTOR_STORE_NAME = process.env.OPENAI_PASSAGES_VECTOR_STORE_NAME || "English OS - Passages Level 1 Knowledge";

const DEFAULT_FILES = [
  process.env.PASSAGES_PDF_PATH || "knowledge/passages-level-1-students-book.pdf",
  process.env.PASSAGES_INDEX_PATH || "knowledge/passages-students-book-index.xlsx",
  process.env.PASSAGES_PAGE_MAP_PATH || "knowledge/passages-level-1-students-book-page-map.md",
  process.env.PASSAGES_CLASS_PACKS_PATH || "knowledge/passages-class-packs.md",
  process.env.PASSAGES_CLASS_PACKS_DIR || "knowledge/class-packs",
].filter(Boolean);

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const shouldUpload = args.has("--upload");
const shouldCheck = args.has("--check") || !shouldUpload;
const forceFreshUpload = args.has("--fresh") || args.has("--force");
const shouldWait = !args.has("--no-wait");
const requestedFiles = rawArgs.filter((arg) => !arg.startsWith("--"));

const filesToUpload = expandFiles(requestedFiles.length ? requestedFiles : DEFAULT_FILES);

function expandFiles(entries) {
  const expanded = [];

  for (const entry of entries) {
    const absoluteEntry = path.resolve(entry);

    if (!fs.existsSync(absoluteEntry)) {
      expanded.push(entry);
      continue;
    }

    const stat = fs.statSync(absoluteEntry);

    if (stat.isDirectory()) {
      const files = fs
        .readdirSync(absoluteEntry)
        .filter((file) => /\.(pdf|xlsx|xls|md|txt)$/i.test(file))
        .sort()
        .map((file) => path.join(entry, file));

      expanded.push(...files);
      continue;
    }

    expanded.push(entry);
  }

  return Array.from(new Set(expanded));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertEnv() {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Export it before running this script.");
  }
}

async function openaiFetch(pathname, options = {}) {
  const response = await fetch(`https://api.openai.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function listAllFiles() {
  const firstPage = await openaiFetch("/files?limit=10000");
  return Array.isArray(firstPage.data) ? firstPage.data : [];
}

async function listAllVectorStores() {
  const firstPage = await openaiFetch("/vector_stores?limit=100");
  return Array.isArray(firstPage.data) ? firstPage.data : [];
}

async function createVectorStore(name) {
  return openaiFetch("/vector_stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function findOrCreateVectorStore() {
  if (forceFreshUpload) {
    const freshName = `${VECTOR_STORE_NAME} - fresh ${new Date().toISOString()}`;
    return createVectorStore(freshName);
  }

  const stores = await listAllVectorStores();
  const existing = stores.find((store) => store.name === VECTOR_STORE_NAME);

  if (existing) {
    return existing;
  }

  return createVectorStore(VECTOR_STORE_NAME);
}

async function uploadFileIfNeeded(filePath, existingFiles) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const filename = path.basename(absolutePath);
  const stat = fs.statSync(absolutePath);

  const existing = forceFreshUpload
    ? null
    : existingFiles.find((file) => file.filename === filename && Number(file.bytes || 0) === stat.size);

  if (existing) {
    return { file: existing, uploaded: false, reusedBy: "filename+size" };
  }

  const form = new FormData();
  form.set("purpose", "assistants");
  const bytes = fs.readFileSync(absolutePath);
  const blob = new Blob([bytes]);
  form.set("file", blob, filename);

  const file = await openaiFetch("/files", {
    method: "POST",
    body: form,
  });

  return { file, uploaded: true, reusedBy: null };
}

async function attachFileToVectorStore(vectorStoreId, fileId) {
  return openaiFetch(`/vector_stores/${vectorStoreId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
}

async function listVectorStoreFiles(vectorStoreId) {
  const data = await openaiFetch(`/vector_stores/${vectorStoreId}/files?limit=100`);
  return Array.isArray(data.data) ? data.data : [];
}

async function waitForVectorStoreFiles(vectorStoreId, expectedFileIds) {
  const pending = new Set(expectedFileIds);
  const deadline = Date.now() + 180_000;
  let lastStatuses = [];

  while (Date.now() < deadline) {
    const files = await listVectorStoreFiles(vectorStoreId);
    lastStatuses = files
      .filter((file) => expectedFileIds.includes(file.id))
      .map((file) => ({ id: file.id, status: file.status }));

    for (const file of files) {
      if (expectedFileIds.includes(file.id) && file.status === "completed") {
        pending.delete(file.id);
      }
    }

    if (pending.size === 0) {
      return { ok: true, statuses: lastStatuses };
    }

    await sleep(3000);
  }

  return { ok: false, pending: Array.from(pending), statuses: lastStatuses };
}

async function check() {
  const [files, stores] = await Promise.all([listAllFiles(), listAllVectorStores()]);
  const expectedNames = filesToUpload.map((filePath) => path.basename(filePath));
  const matchingFiles = files.filter((file) => expectedNames.includes(file.filename));
  const matchingStore = stores.find((store) => store.name === VECTOR_STORE_NAME);

  console.log(JSON.stringify({
    ok: true,
    mode: "check",
    vectorStoreName: VECTOR_STORE_NAME,
    vectorStore: matchingStore || null,
    expectedFileCount: expectedNames.length,
    expectedFilenames: expectedNames,
    matchingFileCount: matchingFiles.length,
    matchingFiles: matchingFiles.map((file) => ({ id: file.id, filename: file.filename, purpose: file.purpose, bytes: file.bytes })),
    next: matchingStore
      ? `Set OPENAI_PASSAGES_VECTOR_STORE_ID=${matchingStore.id}`
      : "Run with --upload after placing the PDF/XLSX/Page Map/Class Packs locally.",
  }, null, 2));
}

async function upload() {
  const vectorStore = await findOrCreateVectorStore();
  let existingFiles = await listAllFiles();
  const attached = [];

  for (const filePath of filesToUpload) {
    const { file, uploaded, reusedBy } = await uploadFileIfNeeded(filePath, existingFiles);
    existingFiles = uploaded ? [...existingFiles, file] : existingFiles;

    const vectorStoreFile = await attachFileToVectorStore(vectorStore.id, file.id);
    attached.push({
      localPath: filePath,
      fileId: file.id,
      filename: file.filename,
      uploaded,
      reusedBy,
      vectorStoreFileId: vectorStoreFile.id,
      status: vectorStoreFile.status,
    });
  }

  const waitResult = shouldWait
    ? await waitForVectorStoreFiles(vectorStore.id, attached.map((item) => item.fileId))
    : { ok: true, skipped: true };

  if (!waitResult.ok) {
    throw new Error(`Vector store files did not complete before timeout: ${JSON.stringify(waitResult)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: "upload",
    vectorStore: { id: vectorStore.id, name: vectorStore.name },
    freshVectorStore: forceFreshUpload,
    uploadedFileCount: attached.filter((item) => item.uploaded).length,
    attachedFileCount: attached.length,
    attached,
    waitResult,
    env: `OPENAI_PASSAGES_VECTOR_STORE_ID=${vectorStore.id}`,
    vercel: `vercel env add OPENAI_PASSAGES_VECTOR_STORE_ID production`,
  }, null, 2));
}

async function main() {
  assertEnv();

  if (filesToUpload.length === 0) {
    throw new Error("No files selected for Passages knowledge upload.");
  }

  if (shouldCheck && !shouldUpload) {
    await check();
    return;
  }

  if (shouldUpload) {
    await upload();
    return;
  }

  throw new Error("No action selected. Use --check or --upload.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
