import { NextResponse } from "next/server";
import { courseStructureRepository } from "@/modules/coach-config/pedagogyConfig";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PASSAGES_VECTOR_STORE_ID = process.env.OPENAI_PASSAGES_VECTOR_STORE_ID;
const OPENAI_COACH_MODEL = process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";

function pad2(value: string | number) {
  return String(value || "").padStart(2, "0");
}

function maskSecret(value?: string) {
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...`;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function normalize(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(value: unknown) {
  return normalize(value).toLowerCase();
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }

  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, output));
  }

  return output;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return normalize(value.replace(/["“”]/g, ""));
  }
  return "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractFileSearchResults(data: any) {
  const results: Array<{ filename?: string; score?: number; text?: string }> = [];

  function walk(value: any) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (Array.isArray(value.results)) {
      for (const item of value.results) {
        if (item && typeof item === "object") {
          results.push({
            filename: item.filename || item.file_name || item.title || item.name,
            score: typeof item.score === "number" ? item.score : undefined,
            text: typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : "",
          });
        }
      }
    }

    Object.values(value).forEach(walk);
  }

  walk(data);
  return results;
}

function buildExpected(unit: number, localClass: number) {
  const globalClass = courseStructureRepository().currentClass(unit, localClass)?.globalClass || 0;
  return {
    unit,
    localClass,
    globalClass,
    classPackId: `CLASS_PACK_UNIT_${pad2(unit)}_CLASS_${pad2(globalClass)}`,
    localClassAlias: `UNIT_${pad2(unit)}_LOCAL_CLASS_${pad2(localClass)}`,
    globalClassAlias: `GLOBAL_CLASS_${globalClass}`,
    filename: `unit-${pad2(unit)}-local-class-${pad2(localClass)}-global-class-${pad2(globalClass)}-class-pack-unit-${pad2(unit)}-class-${pad2(globalClass)}.md`,
  };
}

function containsExpectedKey(text: string, expected: ReturnType<typeof buildExpected>) {
  const haystack = normalizeForSearch(text);
  const hasFilename = haystack.includes(expected.filename.toLowerCase());
  const hasClassPackId = haystack.includes(expected.classPackId.toLowerCase());
  const hasLocalAndGlobal = haystack.includes(expected.localClassAlias.toLowerCase()) && haystack.includes(expected.globalClassAlias.toLowerCase());
  return hasFilename || hasClassPackId || hasLocalAndGlobal;
}

function resultCorpus(result: { filename?: string; text?: string }) {
  return `${result.filename || ""}\n${result.text || ""}`;
}

function buildDiagnosticQuery(expected: ReturnType<typeof buildExpected>) {
  return [
    "Retrieve exactly one Passages class pack from file_search.",
    "Do not use a semantically similar class pack.",
    "The returned text must contain at least one of these exact retrieval keys:",
    `Filename retrieval key: ${expected.filename}`,
    `Exact retrieval key: ${expected.classPackId}`,
    `Local class retrieval key: ${expected.localClassAlias}`,
    `Global class retrieval key: ${expected.globalClassAlias}`,
    "",
    "Return only lines from that exact file:",
    "Filename retrieval key",
    "Exact retrieval key",
    "Local class retrieval key",
    "Global class retrieval key",
    "Active class teaching contract",
    "Active class section names",
    "Active class grammar focus",
    "Active class vocabulary focus",
    "Active class target structures",
    "",
    "If the exact file is not found, return EXACT_CLASS_NOT_FOUND.",
  ].join("\n");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const unit = Number(url.searchParams.get("unit") || "1") || 1;
  const localClass = Number(url.searchParams.get("class") || url.searchParams.get("localClass") || "4") || 4;
  const expected = buildExpected(unit, localClass);

  const base = {
    ok: false,
    generatedAt: new Date().toISOString(),
    env: {
      hasOpenAiKey: Boolean(OPENAI_API_KEY),
      hasVectorStoreId: Boolean(OPENAI_PASSAGES_VECTOR_STORE_ID),
      vectorStoreIdMasked: maskSecret(OPENAI_PASSAGES_VECTOR_STORE_ID),
      model: OPENAI_COACH_MODEL,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || "",
      vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || "",
      vercelEnv: process.env.VERCEL_ENV || "",
    },
    expected,
  };

  if (!OPENAI_API_KEY || !OPENAI_PASSAGES_VECTOR_STORE_ID) {
    return NextResponse.json({
      ...base,
      diagnosis: "Missing OPENAI_API_KEY or OPENAI_PASSAGES_VECTOR_STORE_ID in this deployment.",
    });
  }

  const query = buildDiagnosticQuery(expected);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_COACH_MODEL,
      input: [
        {
          role: "system",
          content: "You are a deterministic diagnostic tool. Use file_search only. Return only exact lines from the requested Passages class pack. Never return a contract from another class.",
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_output_tokens: 800,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [OPENAI_PASSAGES_VECTOR_STORE_ID],
          max_num_results: 20,
        },
      ],
      include: ["file_search_call.results"],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({
      ...base,
      openAiStatus: response.status,
      openAiError: data?.error?.message || "Unknown OpenAI error",
      diagnosis: "The deployment reached OpenAI but the diagnostic Responses request failed.",
    }, { status: 200 });
  }

  const outputText = data.output_text || data.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("\n") || "";
  const results = extractFileSearchResults(data);
  const filenames = unique(results.map((result) => result.filename || ""));
  const targetResults = results.filter((result) => containsExpectedKey(resultCorpus(result), expected));
  const outputMatchesExpected = containsExpectedKey(outputText, expected);
  const targetText = [
    ...targetResults.map(resultCorpus),
    outputMatchesExpected ? outputText : "",
  ].filter(Boolean).join("\n");
  const allText = `${outputText}\n${collectStrings(results).join("\n")}`;

  const activeClassSectionNames = firstMatch(targetText, [/Active class section names:\s*([^\n]+)/i]);
  const activeClassGrammarFocus = firstMatch(targetText, [/Active class grammar focus:\s*([^\n]+)/i]);
  const activeClassVocabularyFocus = firstMatch(targetText, [/Active class vocabulary focus:\s*([^\n]+)/i]);
  const activeClassTargetStructures = firstMatch(targetText, [/Active class target structures:\s*([^\n]+)/i]);

  const expectedFileFound = targetResults.length > 0 || outputMatchesExpected;
  const contractFound = expectedFileFound && Boolean(activeClassSectionNames || /Active class teaching contract/i.test(targetText));
  const nearestActiveClassSectionNames = firstMatch(allText, [/Active class section names:\s*([^\n]+)/i]);
  const nearestActiveClassGrammarFocus = firstMatch(allText, [/Active class grammar focus:\s*([^\n]+)/i]);

  let diagnosis = "Unknown.";
  if (!results.length) {
    diagnosis = "File search returned no results. The vector store may be empty, stale, or inaccessible.";
  } else if (!expectedFileFound) {
    diagnosis = "File search returned results, but none contained the exact expected filename, class pack id, or unit/local/global retrieval keys. The vector store may be stale or the file_search query needs further tuning.";
  } else if (!contractFound) {
    diagnosis = "The exact expected class pack was found, but the Active class teaching contract was not visible in retrieved snippets. Re-upload regenerated class packs or adjust chunking/query.";
  } else if (!activeClassSectionNames) {
    diagnosis = "The exact expected class pack was found, but Active class section names was not parsed. Check exact contract line formatting.";
  } else {
    diagnosis = "Expected class pack and active class contract were detected by production file_search using exact retrieval keys.";
  }

  return NextResponse.json({
    ...base,
    ok: true,
    openAiStatus: response.status,
    fileSearch: {
      resultCount: results.length,
      targetResultCount: targetResults.length,
      expectedFileFound,
      outputMatchesExpected,
      contractFound,
      filenames,
      topResults: results.slice(0, 8).map((result) => ({
        filename: result.filename || "",
        score: result.score ?? null,
        expectedKeyMatch: containsExpectedKey(resultCorpus(result), expected),
        textPreview: normalize(result.text || "").slice(0, 260),
      })),
      targetResults: targetResults.slice(0, 8).map((result) => ({
        filename: result.filename || "",
        score: result.score ?? null,
        textPreview: normalize(result.text || "").slice(0, 260),
      })),
      detected: {
        activeClassSectionNames,
        activeClassGrammarFocus,
        activeClassVocabularyFocus,
        activeClassTargetStructures,
      },
      nearestDetectedFromAnyResult: {
        activeClassSectionNames: nearestActiveClassSectionNames,
        activeClassGrammarFocus: nearestActiveClassGrammarFocus,
      },
      outputPreview: normalize(outputText).slice(0, 800),
    },
    diagnosis,
  });
}
