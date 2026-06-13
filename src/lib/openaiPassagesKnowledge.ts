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

function clipJson(value: any, max = 1200) {
  if (!value) return "";

  try {
    return JSON.stringify(value, null, 2).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

function summarizeLearnerPersonalizationContext(learnerContext: any) {
  const user = learnerContext?.user || {};
  const missionControl = learnerContext?.missionControl || {};
  const learningState = learnerContext?.learningState || {};

  const learnerName =
    user.Name ||
    user["Name"] ||
    learnerContext?.name ||
    "the learner";

  const currentCEFR =
    user["Current CEFR"] ||
    learnerContext?.currentCEFR ||
    missionControl.currentCEFR ||
    "B1/B2";

  const currentUnit =
    user["Current Unit"] ||
    learnerContext?.currentUnit ||
    missionControl.currentUnit ||
    learningState.currentUnit ||
    "";

  const currentLesson =
    user["Current Lesson"] ||
    learnerContext?.currentLesson ||
    missionControl.currentLesson ||
    learningState.currentClass ||
    "";

  const nextRecommendedAction =
    learnerContext?.nextRecommendedAction ||
    missionControl?.nextRecommendedAction ||
    user["Next Recommended Action"] ||
    "";

  const recentDailyLogs =
    learnerContext?.recentDailyLogs ||
    learnerContext?.dailyLogs ||
    [];

  const recurringMistakes =
    learnerContext?.recurringMistakes ||
    learnerContext?.mistakes ||
    [];

  const vocabulary =
    learnerContext?.vocabulary ||
    learnerContext?.vocabularyIntelligence ||
    learnerContext?.newVocabulary ||
    [];

  return `
Learner personalization context:
- Learner name: ${learnerName}
- CEFR level: ${currentCEFR}
- Current English OS unit: ${currentUnit || "not specified"}
- Current English OS lesson/class: ${currentLesson || "not specified"}
- Next recommended action: ${typeof nextRecommendedAction === "string" ? nextRecommendedAction : clipJson(nextRecommendedAction, 500) || "not specified"}
- Professional context to prioritize when useful: consulting, enterprise architecture, software architecture, AI, digital transformation, business meetings, executive communication.

Recent learning evidence to adapt the class:
- Recent daily logs: ${clipJson(recentDailyLogs, 1400) || "not available"}
- Recurring mistakes / weak patterns: ${clipJson(recurringMistakes, 1400) || "not available"}
- Vocabulary intelligence / weak vocabulary / new chunks: ${clipJson(vocabulary, 1400) || "not available"}

Personalization instructions:
- Adapt the class to the learner's CEFR level.
- Use the learner's recurring mistakes to choose the common mistake and the quick correction.
- Use weak vocabulary and recent chunks when selecting examples and practice frames.
- Connect examples to the learner's professional context only when it feels natural.
- Do not expose raw logs or say "your logs show". Turn the context into helpful teaching choices.
`.trim();
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
  const allClassReferences =
    unitNumber && explicitLocalClasses.length > 1
      ? explicitLocalClasses.map((localClass) => buildClassPackReference(unitNumber, localClass))
      : unitNumber && (fallbackLocalClassNumber || explicitLocalClasses[0])
        ? [buildClassPackReference(unitNumber, explicitLocalClasses[0] || fallbackLocalClassNumber)]
        : [];

  const multiClassMode = allClassReferences.length > 1;
  const activeClassReferences = multiClassMode ? allClassReferences.slice(0, 1) : allClassReferences;
  const primaryReference = activeClassReferences[0] || allClassReferences[0];
  const remainingClassReferences = multiClassMode ? allClassReferences.slice(1) : [];

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
  const classReferenceLines = activeClassReferences
    .map((reference, index) => [
      `Active class ${index + 1}:`,
      `- Filename: ${reference.classPackFilename}`,
      `- ID: ${reference.classPackId}`,
      `- Local class: ${reference.localClassPackAlias}`,
      `- Global class: ${reference.globalClassAlias}`,
    ].join("\n"))
    .join("\n\n");

  const sequenceLines = allClassReferences
    .map((reference) => `- Unit ${reference.unit}, local class ${reference.localClass}, global class ${reference.globalClass}: ${reference.classPackId}`)
    .join("\n");

  const remainingLines = remainingClassReferences
    .map((reference) => `- Unit ${reference.unit}, local class ${reference.localClass}, global class ${reference.globalClass}`)
    .join("\n");

  const learnerPersonalizationContext = summarizeLearnerPersonalizationContext(params.learnerContext);

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

Identity rule:
- In the learner-visible header, always show the local class and global class separately.
- Generic header format: "Unit [unit] — Class [local class]" on one line and "Global Class [global class]" on the next line.
- Never replace the local class with the global class in the unit header.
- Do not mention internal filenames, class packs, retrieval keys, vector stores, or file_search in the learner-visible response.

Personalization rule:
- The class content must come from the requested Passages class pack.
- The teaching choices must adapt to the learner context.
- Adapt difficulty, examples, common mistakes, vocabulary emphasis, and production tasks to the learner's CEFR level, recurring mistakes, weak vocabulary, recent daily logs, and professional context.
- If the learner has recurring mistakes related to the target structure, make that the common mistake.
- If the learner is preparing for professional fluency, include one natural consulting/business/architecture example when it fits.
- Do not expose private logs or say "your logs show". Say "Personal focus" only if it helps the class.

Learning objective rule:
- Every class must include a learning objective after the identity header.
- Use this wording: "After this class, you should be able to..."
- The objective must describe an observable skill, not a topic.

Pedagogy rules:
- Do not just describe what the lesson contains; actually teach it.
- Do not say "this lesson is about" or "in this lesson".
- Use a short real-life story or scenario to make the class understandable.
- The story must fit the lesson topic and should help the learner see the communication need.
- For each grammar pattern or useful phrase, include: meaning, structure, examples, one common mistake, and one learner transformation task.
- Use teacher moves: explain, model, check, let the learner try.
- Include short examples before asking the learner to produce language.
- For vocabulary, include a simple definition and a learner-level example.
- Add a professional/work example only when it sounds natural.
- End with a concrete task that the learner can answer now.

Style rules:
- Start naturally. Never write labels like “Warm opening:”.
- Do not write meta phrases such as “the retrieved content says”, “class pack”, “exact class pack”, “the book asks”, “the page asks”, “based on the file”, “content available”, or “using the retrieved content”.
- Use clean compact Markdown.
- If a retrieved class pack includes a grammar point or repeated language pattern, teach it explicitly.

Multi-class requests:
- If the learner asks for several classes in one message, do NOT teach all classes fully in one response.
- Present the requested sequence briefly, then teach only the first class in full.
- After the first class, include a Practice Gate with 3 items.
- Explain that the next class will be taught after the learner completes and approves the practice.
- Do not mark exercises as approved and do not call any advancement action from this response.
      `.trim(),
    },
    {
      role: "user",
      content: `
Learner request:
${params.message}

Exact class-pack retrieval query for the active class only:
${classReferenceLines || "No exact class-pack reference could be built."}
${bookPagesKey || ""}
${pdfPagesKey || ""}

Requested sequence:
${sequenceLines || "No sequence detected."}

Classes to keep pending after this response:
${remainingLines || "None."}

Requested class coordinates for active class:
- Unit: ${unitNumber || "unknown"}
- Local class inside unit: ${primaryReference?.localClass || fallbackLocalClassNumber || "unknown"}
- Global English OS class: ${primaryReference?.globalClass || requestedClass || "unknown"}
- Multiple classes requested: ${multiClassMode ? "yes" : "no"}
- Book pages from initial index row: ${bookPages || "unknown"}
- PDF pages from initial index row: ${pdfPages || "unknown"}

${learnerPersonalizationContext}

Structured Course Class Index / Book Content Index context:
${JSON.stringify(params.classContent, null, 2).slice(0, 5000)}

Recent conversation history:
${JSON.stringify(params.conversationHistory || []).slice(0, 2500)}

Instructions:
1. Use file_search to retrieve the exact class pack listed for the active class.
2. Teach only the active class fully.
3. If several classes were requested, list the remaining classes as pending and explain they require practice approval before continuing.
4. Do not use content from adjacent classes unless the active class pack explicitly references it.
5. If other retrieved results mention unrelated topics, ignore them.
6. Deliver a teacher-led lesson with examples, explanation, guided practice, and one production task.
7. Include a learning objective using "After this class, you should be able to...".
8. Use the learner personalization context to adapt examples, common mistakes, vocabulary, and speaking task.
9. Use a short real-life story or scenario before explaining patterns.
10. Remind the learner that progress only advances after practice is approved.
11. Keep the response compact with no excessive blank lines.
12. Do not mention class packs, retrieval, internal source names, vector stores, or file search in the learner-visible response.
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
          max_num_results: 10,
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
