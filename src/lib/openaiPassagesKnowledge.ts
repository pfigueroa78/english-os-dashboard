const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PASSAGES_VECTOR_STORE_ID = process.env.OPENAI_PASSAGES_VECTOR_STORE_ID;

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
    learningState.currentUnit ||
    classIndex.unit ||
    params.classContent?.unit ||
    "";

  const requestedClass =
    learningState.currentClass ||
    classIndex.classNumber ||
    params.classContent?.classNumber ||
    "";

  const pdfPages =
    classIndex.pdfInitialPage && classIndex.pdfFinalPage
      ? `${classIndex.pdfInitialPage}-${classIndex.pdfFinalPage}`
      : bookContent?.pdfPages || "";

  const bookPages =
    classIndex.bookInitialPage && classIndex.bookFinalPage
      ? `${classIndex.bookInitialPage}-${classIndex.bookFinalPage}`
      : bookContent?.bookPages || "";

  return [
    {
      role: "system",
      content: `
You are English OS Coach.

Use the Passages Student's Book and Course Class Index available through file_search.
Teach the requested class using retrieved book content, not generic knowledge.
Do not invent sections, page content, exercises, grammar points, or vocabulary.
If file_search cannot retrieve enough content, say exactly what is missing and ask the learner to confirm the page/class.
Do not advance the learner automatically.
Review mode is temporary and must not change the persistent current class.

Response format:
1. Start with the class identity: Unit, Class, book pages, PDF pages.
2. Explain the real class objective from the book.
3. Present vocabulary from the retrieved book content.
4. Present grammar from the retrieved book content.
5. Give a guided speaking practice.
6. Give exercises based on the retrieved book content.
7. End with a short checkpoint and no automatic advancement.
      `.trim(),
    },
    {
      role: "user",
      content: `
Learner request:
${params.message}

Persistent Learning State:
${JSON.stringify(learningState, null, 2)}

Requested class coordinates:
- Unit: ${requestedUnit || "unknown"}
- Class: ${requestedClass || "unknown"}
- Book pages: ${bookPages || "unknown"}
- PDF pages: ${pdfPages || "unknown"}

Structured Course Class Index / Book Content Index context:
${JSON.stringify(params.classContent, null, 2).slice(0, 5000)}

Recent conversation history:
${JSON.stringify(params.conversationHistory || []).slice(0, 2500)}

Instructions:
Retrieve the relevant Passages Student's Book content for the coordinates above.
If pages are provided, search for those pages and their headings.
If the class is Grammar Plus or Video Class, use the index and available retrieved content to teach the appropriate review class.
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
      max_output_tokens: params.maxOutputTokens,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [OPENAI_PASSAGES_VECTOR_STORE_ID],
          max_num_results: 6,
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
