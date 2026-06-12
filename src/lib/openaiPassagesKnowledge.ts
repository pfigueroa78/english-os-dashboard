import { ENGLISH_OS_COACH_BEHAVIOR_PROMPT } from "@/lib/englishOsCoachPrompt";
import { PASSAGES_TEACHER_STYLE_GUIDANCE } from "@/lib/passagesTeacherStyle";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PASSAGES_VECTOR_STORE_ID = process.env.OPENAI_PASSAGES_VECTOR_STORE_ID;

function pad2(value: string | number) {
  return String(value || "").padStart(2, "0");
}

function normalizeRangeKey(value: string) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/[^0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function hasPassagesKnowledgeBase() {
  return Boolean(OPENAI_API_KEY && OPENAI_PASSAGES_VECTOR_STORE_ID);
}

export function shouldUsePassagesKnowledge(message: string) {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized.includes("dame la clase") ||
    normalized.includes("dar la clase") ||
    normalized.includes("continua la clase") ||
    normalized.includes("continuar la clase") ||
    normalized.includes("continua mi clase") ||
    normalized.includes("continuar mi clase") ||
    normalized.includes("empecemos la clase") ||
    normalized.includes("empezar la clase") ||
    normalized.includes("contenido del libro") ||
    normalized.includes("contenido de la clase") ||
    normalized.includes("student book") ||
    normalized.includes("passages") ||
    normalized.includes("book page") ||
    normalized.includes("pdf page") ||
    normalized.includes("start class") ||
    normalized.includes("continue class") ||
    normalized.includes("give me class")
  );
}

export function buildPassagesKnowledgeInput(params: {
  message: string;
  learnerContext: any;
  classContent: any;
  conversationHistory?: Array<{ role: "user" | "coach"; content: string }>;
}) {
  const classIndex =
    params.classContent?.currentClassIndex ||
    (Array.isArray(params.classContent?.courseClassIndex)
      ? params.classContent.courseClassIndex[0]
      : null) ||
    {};

  const learningState = params.classContent?.learningState || params.learnerContext?.learningState || {};
  const bookContent = Array.isArray(params.classContent?.bookContentIndex)
    ? params.classContent.bookContentIndex[0]
    : null;

  const requestedUnit =
    classIndex.unit ||
    params.classContent?.unit ||
    bookContent?.unit ||
    learningState.currentUnit ||
    "";

  const requestedClass =
    classIndex.classNumber ||
    params.classContent?.classNumber ||
    bookContent?.classNumber ||
    learningState.currentClass ||
    "";

  const unitNumber = Number(requestedUnit || 0);
  const globalClassNumber = Number(requestedClass || 0);
  const localClassNumber =
    unitNumber && globalClassNumber
      ? globalClassNumber - (unitNumber - 1) * 7
      : 0;

  const pdfPages =
    classIndex.pdfInitialPage && classIndex.pdfFinalPage
      ? `${classIndex.pdfInitialPage}-${classIndex.pdfFinalPage}`
      : bookContent?.pdfPages || "";

  const bookPages =
    classIndex.bookInitialPage && classIndex.bookFinalPage
      ? `${classIndex.bookInitialPage}-${classIndex.bookFinalPage}`
      : bookContent?.bookPages || "";

  const classPackId =
    unitNumber && globalClassNumber
      ? `CLASS_PACK_UNIT_${pad2(unitNumber)}_CLASS_${pad2(globalClassNumber)}`
      : "";

  const localClassPackAlias =
    unitNumber && localClassNumber
      ? `UNIT_${pad2(unitNumber)}_LOCAL_CLASS_${pad2(localClassNumber)}`
      : "";

  const classPackFilename =
    unitNumber && localClassNumber && globalClassNumber
      ? `unit-${pad2(unitNumber)}-local-class-${pad2(localClassNumber)}-global-class-${pad2(globalClassNumber)}-class-pack-unit-${pad2(unitNumber)}-class-${pad2(globalClassNumber)}.md`
      : "";

  const bookPagesKey = bookPages ? `BOOK_PAGES_${normalizeRangeKey(bookPages)}` : "";
  const pdfPagesKey = pdfPages ? `PDF_PAGES_${normalizeRangeKey(pdfPages)}` : "";

  return [
    {
      role: "system",
      content: `
${ENGLISH_OS_COACH_BEHAVIOR_PROMPT}

${PASSAGES_TEACHER_STYLE_GUIDANCE}

You are now teaching with Passages file_search.

Critical source rule:
- Search first for the exact requested class-pack filename and ID.
- Use the exact class pack as the primary source of truth.
- Do not substitute content from another class.
- Ignore retrieved results from other units, other classes, unrelated book pages, or the general PDF if they conflict with the exact class pack.
- If the first retrieved result is the correct exact class pack, do not say the content is missing.
- Do not produce a retrieval report.
- Do not ask the learner to send page images when the exact class pack is retrieved.
- Do not invent content that is not supported by the retrieved class pack.
- Do not advance the learner automatically.

Teacher response format for “Dame la clase”:
1. Warm opening.
2. Compact class identity line.
3. Main focus.
4. Warm-up.
5. Teacher explanation of key grammar / key language.
6. Controlled practice with 4 to 6 frames.
7. Vocabulary with simple definitions.
8. Speaking practice with 2 to 3 questions.
9. One model answer.
10. End with “Now you answer: ...”.

Do not stop after only one question when the learner asks for the class.
      `.trim(),
    },
    {
      role: "user",
      content: `
Learner request:
${params.message}

Exact class-pack retrieval query:
${classPackFilename}
${classPackId}
${localClassPackAlias}
GLOBAL_CLASS_${globalClassNumber || "unknown"}
${bookPagesKey || ""}
${pdfPagesKey || ""}

Requested class coordinates:
- Unit: ${requestedUnit || "unknown"}
- Local class inside unit: ${localClassNumber || "unknown"}
- Global English OS class: ${requestedClass || "unknown"}
- Book pages: ${bookPages || "unknown"}
- PDF pages: ${pdfPages || "unknown"}

Structured Course Class Index / Book Content Index context:
${JSON.stringify(params.classContent, null, 2).slice(0, 5000)}

Recent conversation history:
${JSON.stringify(params.conversationHistory || []).slice(0, 2500)}

Instructions:
1. Use file_search to retrieve the exact class pack using the filename and ID above.
2. If you retrieve ${classPackFilename || "the exact class pack"}, teach from it directly.
3. Do not use content from adjacent classes unless the exact class pack explicitly references it.
4. If other retrieved results mention unrelated topics, ignore them.
5. Deliver the full teacher-led class requested by the learner.
      `.trim(),
    },
  ];
}

export async function createPassagesKnowledgeResponse(params: {
  model: string;
  input: any[];
  maxOutputTokens: number;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  if (!OPENAI_PASSAGES_VECTOR_STORE_ID) {
    throw new Error("Missing OPENAI_PASSAGES_VECTOR_STORE_ID.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      input: params.input,
      max_output_tokens: Math.max(params.maxOutputTokens, 1400),
      tools: [
        {
          type: "file_search",
          vector_store_ids: [OPENAI_PASSAGES_VECTOR_STORE_ID],
          max_num_results: 12,
        },
      ],
      include: ["file_search_call.results"],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI Passages file_search request failed.");
  }

  return data;
}
