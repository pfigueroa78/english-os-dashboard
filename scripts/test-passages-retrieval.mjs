#!/usr/bin/env node

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VECTOR_STORE_ID = process.env.OPENAI_PASSAGES_VECTOR_STORE_ID;
const MODEL = process.env.OPENAI_RETRIEVAL_TEST_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";

const query = process.argv.slice(2).join(" ") || "CLASS_PACK_UNIT_01_CLASS_04 UNIT_01_LOCAL_CLASS_04 BOOK_PAGES_6_7 PDF_PAGES_15_16";

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY.");
  process.exit(1);
}

if (!VECTOR_STORE_ID) {
  console.error("Missing OPENAI_PASSAGES_VECTOR_STORE_ID.");
  process.exit(1);
}

function getOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function collectFileSearchResults(data) {
  const results = [];

  for (const item of data.output || []) {
    if (item.type !== "file_search_call") continue;
    if (!Array.isArray(item.results)) continue;

    for (const result of item.results) {
      results.push({
        file_id: result.file_id,
        filename: result.filename,
        score: result.score,
        text: String(result.text || "").slice(0, 1200),
      });
    }
  }

  return results;
}

const body = {
  model: MODEL,
  input: [
    {
      role: "system",
      content: "You are a retrieval diagnostic. Search the vector store for the exact requested Passages class pack. Return only what was retrieved. Do not infer or substitute another class.",
    },
    {
      role: "user",
      content: `Search exactly for: ${query}\n\nReturn:\n1. Which file/chunk you found.\n2. Whether the retrieved content belongs to the requested class.\n3. The first useful page/class content snippets.\n\nDo not use content from Alicia, Kenichi, Melanie, should have, or any other unrelated lesson unless it is actually inside the requested class pack.`,
    },
  ],
  tools: [
    {
      type: "file_search",
      vector_store_ids: [VECTOR_STORE_ID],
      max_num_results: 12,
    },
  ],
  include: ["file_search_call.results"],
  max_output_tokens: 1200,
};

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const data = await response.json();

if (!response.ok) {
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  model: MODEL,
  vectorStoreId: VECTOR_STORE_ID,
  query,
  outputText: getOutputText(data),
  fileSearchResults: collectFileSearchResults(data),
}, null, 2));
