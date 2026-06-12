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

function normalizeMessage(message: string) {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExplicitUnitFromMessage(message: string): number | null {
  const normalized = normalizeMessage(message);
  const match = normalized.match(/(?:unidad|unit)\s+(\d{1,2})/);
  return match?.[1] ? Number(match[1]) : null;
}

function extractRequestedLocalClasses(message: string): number[] {
  const normalized = normalizeMessage(message);
  const classes = new Set<number>();

  const rangeMatches = normalized.matchAll(/(?:clase|clases|class|classes)\s+(\d{1,2})\s*(?:a|al|hasta|to|through|-)\s*(\d{1,2})/g);
  for (const match of rangeMatches) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    for (let value = min; value <= max; value += 1) {
      if (value >= 1 && value <= 7) classes.add(value);
    }
  }

  const listMatches = normalized.matchAll(/(?:clase|clases|class|classes)\s+((?:\d{1,2}\s*(?:y|and|,|&)?\s*)+)/g);
  for (const match of listMatches) {
    const numbers = match[1].match(/\d{1,2}/g) || [];
    for (const number of numbers) {
      const value = Number(number);
      if (value >= 1 && value <= 7) classes.add(value);
    }
  }

  return Array.from(classes).sort((a, b) => a - b);
}

function buildClassPackReference(unit: number, localClass: number) {
  const globalClass = (unit - 1) * 7 + localClass;

  return {
    unit,
    localClass,
    globalClass,
    classPackId: `CLASS_PACK_UNIT_${pad2(unit)}_CLASS_${pad2(globalClass)}`,
    localClassPackAlias: `UNIT_${pad2(unit)}_LOCAL_CLASS_${pad2(localClass)}`,
    globalClassAlias: `GLOBAL_CLASS_${globalClass}`,
    classPackFilename: `unit-${pad2(unit)}-local-class-${pad2(localClass)}-global-class-${pad2(globalClass)}-class-pack-unit-${pad2(unit)}-class-${pad2(globalClass)}.md`,
  };
}

export function hasPassagesKnowledgeBase() {
  return Boolean(OPENAI_API_KEY && OPENAI_PASSAGES_VECTOR_STORE_ID);
}

export function shouldUsePassagesKnowledge(message: string) {
  const normalized = normalizeMessage(message);

  return (
    normalized.includes("dame la clase") ||
    normalized.includes("dame las clases") ||
    normalized.includes("dar la clase") ||
    normalized.includes("dar las clases") ||
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
    normalized.includes("give me class") ||
    normalized.includes("give me classes")
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
    extractExplicitUnitFromMessage(params.message) ||
    Number(classIndex.unit || params.classContent?.unit || bookContent?.unit || learningState.currentUnit || 0) ||
    0;

  const requestedClass =
    Number(classIndex.classNumber || params.classContent?.classNumber || bookContent?.classNumber || learningState.currentClass || 0) ||
    0;

  const unitNumber = Number(requestedUnit || 0);
  const globalClassNumber = Number(requestedClass || 0);
  const fallbackLocalClassNumber =
    unitNumber && globalClassNumber
      ? globalClassNumber - (unitNumber - 1) * 7
      : 0;

  const explicitLocalClasses = extractRequestedLocalClasses(params.message);
  const classReferences =
    unitNumber && explicitLocalClasses.length > 1
      ? explicitLocalClasses.map((localClass) => buildClassPackReference(unitNumber, localClass))
      : unitNumber && (fallbackLocalClassNumber || explicitLocalClasses[0])
        ? [buildClassPackReference(unitNumber, explicitLocalClasses[0] || fallbackLocalClassNumber)]
        : [];

  const primaryReference = classReferences[0];

  const pdfPages =
    classIndex.pdfInitialPage && classIndex.pdfFinalPage
      ? `${classIndex.pdfInitialPage}-${classIndex.pdfFinalPage}`
      : bookContent?.pdfPages || "";

  const bookPages =
    classIndex.bookInitialPage && classIndex.bookFinalPage
      ? `${classIndex.bookInitialPage}-${classIndex.bookFinalPage}`
      : bookContent?.bookPages || "";

  const bookPagesKey = bookPages ? `BOOK_PAGES_${normalizeRangeKey(bookPages)}` : "";
  const pdfPagesKey = pdfPages ? `PDF_PAGES_${normalizeRangeKey(pdfPages)}` : "";
  const multiClassMode = classReferences.length > 1;
  const classReferenceLines = classReferences
    .map((reference, index) => [
      `Class ${index + 1} in requested sequence:`,
      `- Filename: ${reference.classPackFilename}`,
      `- ID: ${reference.classPackId}`,
      `- Local class: ${reference.localClassPackAlias}`,
      `- Global class: ${reference.globalClassAlias}`,
    ].join("\n"))
    .join("\n\n");

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

Style rules:
- Start naturally. Never write labels like “Warm opening:”.
- Use “Lesson B: Every family is different” when that title is retrieved, not generic labels like “Lesson title: Different types of families”.
- Use clean compact Markdown without excessive blank lines.
- Prefer “Grammar focus / Key language” over “Mini explanation” when teaching a real class.
- If a retrieved class pack includes a grammar pattern, teach it explicitly.

Teacher response format for “Dame la clase”:
1. Natural opening sentence.
2. Compact class identity line.
3. Main focus.
4. Warm-up.
5. Grammar focus / key language.
6. Controlled practice with 4 to 6 frames.
7. Vocabulary with simple definitions.
8. Speaking practice with 2 to 3 questions.
9. One model answer.
10. End with “Now you answer: ...”.

Multi-class requests:
- If the learner asks for several classes in one message, retrieve each exact class pack in the requested order.
- Teach the requested classes as a sequence, but keep each class compact.
- After each class, include a short “Practice gate” with 2 or 3 items.
- Make clear that English OS progress will not advance automatically.
- The learner advances only after they complete and approve the practice for each class.
- Do not mark exercises as approved and do not call any advancement action from this response.
      `.trim(),
    },
    {
      role: "user",
      content: `
Learner request:
${params.message}

Exact class-pack retrieval query:
${classReferenceLines || "No exact class-pack reference could be built."}
${bookPagesKey || ""}
${pdfPagesKey || ""}

Requested class coordinates:
- Unit: ${unitNumber || "unknown"}
- Local class inside unit: ${primaryReference?.localClass || fallbackLocalClassNumber || "unknown"}
- Global English OS class: ${primaryReference?.globalClass || requestedClass || "unknown"}
- Multiple classes requested: ${multiClassMode ? "yes" : "no"}
- Requested local classes: ${classReferences.map((reference) => reference.localClass).join(", ") || "unknown"}
- Requested global classes: ${classReferences.map((reference) => reference.globalClass).join(", ") || "unknown"}
- Book pages from initial index row: ${bookPages || "unknown"}
- PDF pages from initial index row: ${pdfPages || "unknown"}

Structured Course Class Index / Book Content Index context:
${JSON.stringify(params.classContent, null, 2).slice(0, 5000)}

Recent conversation history:
${JSON.stringify(params.conversationHistory || []).slice(0, 2500)}

Instructions:
1. Use file_search to retrieve the exact class pack or packs listed above.
2. If several class packs are listed, retrieve and teach all of them in order.
3. If you retrieve ${primaryReference?.classPackFilename || "the exact class pack"}, teach from it directly.
4. Do not use content from adjacent classes unless the exact class pack explicitly references it.
5. If other retrieved results mention unrelated topics, ignore them.
6. Deliver the teacher-led class or class sequence requested by the learner.
7. Remind the learner that progress only advances after practice is approved.
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
      max_output_tokens: Math.max(params.maxOutputTokens, 1800),
      tools: [
        {
          type: "file_search",
          vector_store_ids: [OPENAI_PASSAGES_VECTOR_STORE_ID],
          max_num_results: 18,
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
