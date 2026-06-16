#!/usr/bin/env node

import fs from "node:fs";

const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const hasArg = (name) => args.includes(name);

const baseUrl = process.env.ENGLISH_OS_BASE_URL || "";
const token = process.env.ENGLISH_OS_TOKEN || "";
const required = hasArg("--required") || process.env.PASSAGES_RESULT_PUBLISH_REQUIRED === "true";

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : "Invalid JSON", rawPreview: text.slice(0, 2000) };
  }
}

function readTextFile(filePath, max = 20000) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8").slice(0, max);
}

function summarizeAudit(auditJson) {
  const results = Array.isArray(auditJson?.results) ? auditJson.results : [];
  const failed = results.filter((item) => Array.isArray(item.issues) && item.issues.length > 0).length;
  const warnings = results.filter((item) => (!Array.isArray(item.issues) || item.issues.length === 0) && Array.isArray(item.warnings) && item.warnings.length > 0).length;
  return {
    ok: Boolean(auditJson?.ok),
    filesAudited: results.length,
    failed,
    warningsOnly: warnings,
  };
}

function summarizeRefresh(diagnosticJson) {
  return {
    ok: Boolean(diagnosticJson?.ok),
    diagnosis: diagnosticJson?.diagnosis || "",
    vectorStoreIdMasked: diagnosticJson?.env?.vectorStoreIdMasked || "",
    expectedFileFound: diagnosticJson?.fileSearch?.expectedFileFound ?? null,
    contractFound: diagnosticJson?.fileSearch?.contractFound ?? null,
    activeClassSectionNames: diagnosticJson?.fileSearch?.detected?.activeClassSectionNames || "",
    activeClassGrammarFocus: diagnosticJson?.fileSearch?.detected?.activeClassGrammarFocus || "",
  };
}

const workflow = argValue("--workflow", process.env.GITHUB_WORKFLOW || "unknown");
const unit = argValue("--unit", process.env.DIAGNOSTIC_UNIT || process.env.UNIT || "");
const localClass = argValue("--class", process.env.DIAGNOSTIC_CLASS || "");
const status = argValue("--status", process.env.PASSAGES_WORKFLOW_STATUS || "unknown");
const knowledgePath = argValue("--knowledge-path", process.env.KNOWLEDGE_PATH || "");
const markdownFile = argValue("--markdown-file", "");
const auditJsonFile = argValue("--audit-json", "");
const diagnosticJsonFile = argValue("--diagnostic-json", "");
const extraJsonFile = argValue("--extra-json", "");

const auditJson = readJsonFile(auditJsonFile);
const diagnosticJson = readJsonFile(diagnosticJsonFile);
const extraJson = readJsonFile(extraJsonFile);
const markdown = readTextFile(markdownFile);

const payload = {
  workflow,
  status,
  unit,
  classNumber: localClass,
  knowledgePath,
  repository: process.env.GITHUB_REPOSITORY || "",
  ref: process.env.GITHUB_REF || "",
  sha: process.env.GITHUB_SHA || "",
  actor: process.env.GITHUB_ACTOR || "",
  runId: process.env.GITHUB_RUN_ID || "",
  runNumber: process.env.GITHUB_RUN_NUMBER || "",
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || "",
  runUrl: process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "",
  createdAt: new Date().toISOString(),
  summary: auditJson ? summarizeAudit(auditJson) : diagnosticJson ? summarizeRefresh(diagnosticJson) : {},
  audit: auditJson,
  diagnostic: diagnosticJson,
  extra: extraJson,
  markdown,
};

async function publish() {
  if (!baseUrl || !token) {
    const message = "ENGLISH_OS_BASE_URL or ENGLISH_OS_TOKEN is missing. Skipping Google Sheets publication.";
    if (required) throw new Error(message);
    console.warn(message);
    console.log(JSON.stringify({ ok: false, skipped: true, reason: message, payloadPreview: payload.summary }, null, 2));
    return;
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      action: "appendPassagesWorkflowResult",
      payload,
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, raw: text.slice(0, 1000) };
  }

  if (!response.ok || data?.ok === false) {
    const message = data?.error || `Publication failed with status ${response.status}`;
    if (required) throw new Error(message);
    console.warn(message);
    console.log(JSON.stringify({ ok: false, error: message, response: data }, null, 2));
    return;
  }

  console.log(JSON.stringify({ ok: true, published: true, response: data }, null, 2));
}

publish().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(required ? 1 : 0);
});
