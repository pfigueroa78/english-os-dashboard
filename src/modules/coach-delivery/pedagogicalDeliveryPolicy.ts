import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";
import { buildTeachingContractV2, type TeachingContractV2 } from "@/modules/coach-delivery/teachingContractV2";

export type OpeningBlockPolicy = {
  kind: "video" | "checkpoint" | "guided_block";
  title: string;
  sections: string[];
  requiredSignals: string[];
  instruction: string;
};

type LessonProfile =
  | "conversation-behavior"
  | "small-talk"
  | "grammar"
  | "vocabulary-speaking"
  | "listening"
  | "role-play"
  | "writing"
  | "discussion"
  | "general";

export function classSections(sectionList: string) {
  return String(sectionList || "")
    .split("+")
    .map((section) => section.trim())
    .filter(Boolean);
}

export function openingBlockPolicy(identity: ClassIdentity, _localClass?: number | null): OpeningBlockPolicy {
  const sections = classSections(identity.sections);
  const first = sections[0] || identity.lessonTitle || "Starting point";
  const isVideo = sections.some((section) => /video|before watching|while watching|after watching/i.test(section));
  const isCheckpoint = sections.some((section) => /checkpoint|review/i.test(section));

  if (isVideo) {
    return {
      kind: "video",
      title: "Video preparation block",
      sections: sections.filter((section) => !/^video class$/i.test(section)).slice(0, 2),
      requiredSignals: ["Video Class", "Before watching", "model", "Your turn"],
      instruction: [
        "OPENING LEARNING BLOCK: Video preparation.",
        "Do not behave like a question-only evaluator.",
        "First explain the video purpose, give useful Unit language, and provide one or two model answers.",
        "Then ask one compact prediction/preparation task.",
        "Do not invent a transcript, scenes, or answer key.",
      ].join(" "),
    };
  }

  if (isCheckpoint) {
    return {
      kind: "checkpoint",
      title: "Unit checkpoint briefing",
      sections: sections.slice(0, 3),
      requiredSignals: ["checkpoint", "rubric", "model", "Your turn"],
      instruction: [
        "OPENING LEARNING BLOCK: Unit checkpoint briefing.",
        "Do not start by asking questions immediately.",
        "First summarize what the checkpoint evaluates, show the approval criteria, and give a compact model.",
        "Then ask one integrated checkpoint response.",
      ].join(" "),
    };
  }

  const primarySections = selectGuidedBlockSections(sections, first);
  return {
    kind: "guided_block",
    title: "Learn & practice block",
    sections: primarySections,
    requiredSignals: ["Warm-up", "Teacher explanation", "Examples", "Controlled practice"],
    instruction: [
      `OPENING LEARNING BLOCK: ${primarySections.join(" + ")}.`,
      "Teach the first learning block, not only the first heading.",
      "Use this rhythm: brief situation -> key language or grammar -> vocabulary/useful chunks -> controlled practice -> one integrated learner task.",
      "Ask only once at the end of the block.",
      "Do not include the final evaluation gate, approval, recap, score, or session log yet.",
    ].join(" "),
  };
}

export function lessonBlockRoadmap(identity: ClassIdentity, localClass?: number | null) {
  const policy = openingBlockPolicy(identity, localClass);
  if (policy.kind === "video") {
    return ["Before watching", "While/After watching", "Speaking", "Evaluation gate"];
  }
  if (policy.kind === "checkpoint") {
    return ["Checkpoint briefing", "Integrated checkpoint", "Evaluation gate"];
  }
  const sections = classSections(identity.sections);
  const hasProduction = sections.some((section) => /speaking|discussion|role play|writing|conversation/i.test(section));
  return hasProduction
    ? ["Learn & practice", "Production", "Evaluation gate"]
    : ["Learn & practice", "Evaluation gate"];
}

export function hasSufficientOpeningBlock(reply: string, identity: ClassIdentity, localClass?: number | null) {
  const text = String(reply || "");
  if (!hasSingleClearLearnerTask(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 110) return false;

  const policy = openingBlockPolicy(identity, localClass);
  const normalized = text.toLowerCase();
  const signalHits = policy.requiredSignals.filter((signal) => normalized.includes(signal.toLowerCase())).length;

  if (policy.kind === "video") return signalHits >= 2 && /before watching|prediction|video/i.test(text);
  if (policy.kind === "checkpoint") return signalHits >= 2 && /criteria|rubric|approve|checkpoint/i.test(text);

  const hasLanguageFocus = /teacher explanation|grammar|language focus|meaning|structure|pattern/i.test(text);
  const hasVocabulary = /vocabulary|useful chunks|useful expressions|key vocabulary/i.test(text);
  const hasPractice = /controlled practice|rewrite|complete|try|speaking practice|write/i.test(text);
  return signalHits >= 2 && hasLanguageFocus && hasVocabulary && hasPractice;
}

export function guidedOpeningFallback(reply: string, identity: ClassIdentity, localClass?: number | null) {
  if (hasSufficientOpeningBlock(reply, identity, localClass)) return String(reply || "").trim();
  const policy = openingBlockPolicy(identity, localClass);
  if (policy.kind === "video") return videoOpeningFallback(identity);
  if (policy.kind === "checkpoint") return checkpointOpeningFallback(identity);
  return classOpeningFallback(identity);
}

export function openingLearningBlockInstruction(identity: ClassIdentity, localClass?: number | null) {
  return openingBlockPolicy(identity, localClass).instruction;
}

function selectGuidedBlockSections(sections: string[], fallback: string) {
  const selected: string[] = [];
  for (const section of sections) {
    selected.push(section);
    if (selected.length >= 3) break;
    if (/writing|role play|discussion|speaking/i.test(section) && selected.length >= 2) break;
  }
  return selected.length ? selected : [fallback];
}

function hasSingleClearLearnerTask(text: string) {
  const matches = String(text || "").match(/\b(your turn|now your turn|answer in english|write|complete|try)\b/gi) || [];
  return matches.length >= 1 && matches.length <= 4;
}

function listItems(value: string, limit: number) {
  return String(value || "")
    .split(/;|,/)
    .map((item) => learnerSafeCue(item))
    .filter(Boolean)
    .slice(0, limit);
}

function learnerSafeCue(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/\b(recycle confirmed|confirmed unit|indexed unit|indexed .*context|student book|do not invent|unverified|learner-safe|target structures confirmed)\b/i.test(text)) {
    return "";
  }
  return text
    .replace(/\bbased only on\b.*$/i, "")
    .replace(/\bfrom indexed\b.*$/i, "")
    .replace(/\busing confirmed\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classOpeningFallback(identity: ClassIdentity) {
  const teaching = buildTeachingContractV2(identity);
  const structures = listItems(identity.targetStructures || identity.grammarFocus, 6);
  const vocabulary = listItems(identity.vocabularyFocus, 10);
  const fullVocabulary = listItems(identity.vocabularyFocus, 24);
  const functions = listItems(identity.functions || identity.skillFocus, 3);
  const cleanGrammarFocus = learnerSafeCue(identity.grammarFocus);
  const grammarTitle = cleanGrammarFocus && !/not grammar-centered/i.test(cleanGrammarFocus)
    ? cleanGrammarFocus
    : "Useful language";

  const profile = lessonProfile(identity);
  if (profile === "conversation-behavior") return conversationBehaviorOpening(identity, fullVocabulary, structures, functions, grammarTitle, teaching);
  if (profile === "small-talk") return smallTalkOpening(identity, fullVocabulary, structures, functions, teaching);
  if (profile === "grammar") return grammarOpening(identity, fullVocabulary, structures, functions, grammarTitle, teaching);
  if (profile === "vocabulary-speaking") return vocabularySpeakingOpening(identity, fullVocabulary, structures, functions, teaching);
  if (profile === "listening") return listeningOpening(identity, fullVocabulary, structures, functions, teaching);
  if (profile === "role-play") return rolePlayOpening(identity, fullVocabulary, structures, functions, teaching);
  if (profile === "writing") return writingOpening(identity, fullVocabulary, structures, functions, teaching);
  if (profile === "discussion") return discussionOpening(identity, fullVocabulary, structures, functions, teaching);

  return [
    "## Warm-up: real communication situation",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "We will follow a simple teaching path: first notice the language, then practice it safely, and finally use it in your own answer.",
    "",
    "## Key vocabulary",
    "",
    ...(vocabulary.length ? vocabulary.map((item) => `- **${item}**`) : ["- **useful chunks from this class**"]),
    "",
    `## Teacher explanation: ${grammarTitle}`,
    "",
    "Use the target language to describe the situation clearly and naturally.",
    "",
    "Useful patterns:",
    "",
    ...(structures.length ? structures.map((item) => `- **${item}**`) : ["- Use one clear sentence pattern from this class."]),
    "",
    "Model examples:",
    "",
    ...modelExamplesFor(structures, vocabulary, functions),
    "",
    "## Controlled practice",
    "",
    "Complete one sentence with your own idea:",
    "",
    ...controlledPracticeFor(structures, vocabulary, functions),
    ...contractControlledPractice(teaching),
    "",
    "## Speaking practice",
    "",
    learnerTask(teaching.guidedProduction, productionTaskFor(structures, vocabulary, functions)),
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function lessonProfile(identity: ClassIdentity): LessonProfile {
  const source = [
    identity.lessonTitle,
    identity.sections,
    identity.grammarFocus,
    identity.vocabularyFocus,
    identity.functions,
    identity.targetStructures,
    identity.expectedProduction,
  ].join(" ").toLowerCase();

  if (/conversation opener|conversation closer|small talk|party talk|keep a conversation going|close a conversation/.test(source)) {
    return "small-talk";
  }

  const firstSection = classSections(identity.sections)[0]?.toLowerCase() || "";
  if (/listening|audio|while listening/.test(firstSection)) return "listening";
  if (/role play|role-play/.test(firstSection)) return "role-play";
  if (/writing/.test(firstSection)) return "writing";
  if (/grammar|practice lab/.test(firstSection)) return "grammar";
  if (/vocabulary/.test(firstSection)) return "vocabulary-speaking";
  if (/discussion/.test(firstSection)) return "discussion";

  if (/role play|role-play|dialogue|conversation role|act out/.test(source)) {
    return "role-play";
  }
  if (/listening|listen|gist|details|audio|who is speaking|closing phrase/.test(source)) {
    return "listening";
  }
  if (/writing|paragraph|outline|topic sentence|supporting sentence|concluding sentence|essay|email/.test(source)) {
    return "writing";
  }
  if (/infinitive and gerund phrases|comment on behavior|appropriate|inappropriate|rude|polite|bad form/.test(source)) {
    return "conversation-behavior";
  }
  if (/grammar|grammar plus|practice lab|target structures|structure|clauses|modals|gerund|infinitive|passive|adjective clause/.test(source)) {
    return "grammar";
  }
  if (/vocabulary|speaking|useful expressions|chunks|collocation|word power/.test(source) && !/not grammar-centered.*writing/.test(source)) {
    return "vocabulary-speaking";
  }
  if (/discussion|discuss|opinion|express opinions|pair work|group work|debate/.test(source)) {
    return "discussion";
  }
  return "general";
}

function firstOr(value: string[], fallback: string) {
  return value.find(Boolean) || fallback;
}

function targetPattern(structures: string[]) {
  return firstOr(structures, "one clear target pattern from this class");
}

function readableFunction(functions: string[], fallback: string) {
  const text = firstOr(functions, fallback)
    .replace(/^the class is (not )?grammar-centered;?\s*/i, "")
    .replace(/^it (combines|focuses on)\s*/i, "")
    .replace(/\.$/, "")
    .trim();
  return text || fallback;
}

function communicationPurposeLine(functions: string[], lessonTitle: string) {
  const purpose = readableFunction(functions, "use this language in a clear real-life situation");
  const lesson = learnerSafeCue(lessonTitle);
  return lesson
    ? `This lesson is about **${lesson}**. The communication goal is to ${purpose}.`
    : `The communication goal is to ${purpose}.`;
}

function teachingPurposeLine(teaching: TeachingContractV2, functions: string[], lessonTitle: string) {
  const purpose = communicationPurposeLine(functions, lessonTitle);
  return `${purpose}\n\n**Core idea:** ${teaching.coreConcept}`;
}

function spanishSupportBlock(teaching: TeachingContractV2) {
  if (!teaching.spanishSupport.length) return [];
  return [
    "",
    "Spanish support:",
    "",
    ...teaching.spanishSupport.map((item) => `- ${item}`),
  ];
}

function contractControlledPractice(teaching: TeachingContractV2) {
  const practice = teaching.controlledPractice.filter(Boolean).slice(0, 3);
  if (!practice.length) return [];
  return ["", "Book-anchored practice:", "", ...practice.map((item, index) => `${index + 1}. ${item}`)];
}

function contractEvaluationPreview(teaching: TeachingContractV2) {
  if (!teaching.evaluationCriteria.length) return [];
  return [
    "",
    "To approve this class later, your final answer should:",
    "",
    ...teaching.evaluationCriteria.slice(0, 4).map((item) => `- ${item}`),
  ];
}

function learnerTask(value: string, fallback: string) {
  const task = String(value || fallback || "").trim();
  if (!task) return "Your turn: write 3-5 sentences in English using the target language.";
  return /^your turn\b/i.test(task) ? task : `Your turn: ${task.replace(/^write\b/i, "write")}`;
}

function usefulWordList(vocabulary: string[], limit = 8) {
  const selected = vocabulary.slice(0, limit);
  return selected.length ? selected.map((item) => `- **${item}**`) : ["- **useful language from this class**"];
}

function lessonLanguageSource(structures: string[], vocabulary: string[], functions: string[]) {
  return [...structures, ...vocabulary, ...functions].join(" ").toLowerCase();
}

function modelExamplesFor(structures: string[], vocabulary: string[], functions: string[]) {
  const source = lessonLanguageSource(structures, vocabulary, functions);

  if (/as soon as|whenever|ever since|before|after|until|while|time clause/.test(source)) {
    return [
      "> As soon as I wake up, I check my schedule and decide what needs the most attention.",
      "> Whenever I feel tired in the afternoon, I take a short break before I continue working.",
    ];
  }

  if (/even if|considering that|as long as|unless|just in case|only if|reason|condition/.test(source)) {
    return [
      "> Even if I am tired, I try not to check my phone right before bed.",
      "> Unless I get enough sleep, I find it difficult to stay focused the next morning.",
    ];
  }

  if (/must have|might have|could have|may have|modals? of certainty|certainty|mystery/.test(source)) {
    return [
      "> He must have planned it carefully because nobody saw him arrive.",
      "> It might have been a mistake, but nobody is completely sure.",
    ];
  }

  if (/should|ought to|might want to|advice|suggest|recommend/.test(source)) {
    return [
      "> You might want to take a short walk after lunch, but keep it short so you do not lose momentum.",
      "> It might not be a bad idea to call a friend when you need to vent your feelings.",
    ];
  }

  if (/dream|flying|falling|chased|embraced|losing teeth|stands for/.test(source)) {
    return [
      "> I think a dream about falling might mean that someone feels out of control.",
      "> A dream about flying could stand for freedom or confidence.",
    ];
  }

  if (/conversation|small talk|polite|rude|appropriate|inappropriate/.test(source)) {
    return [
      "> It's polite to ask a simple follow-up question when you meet someone new.",
      "> Interrupting people is rude because it makes the conversation uncomfortable.",
    ];
  }

  const firstWord = firstOr(vocabulary, "the topic");
  return [
    `> I usually connect **${firstWord}** with a real situation, so the sentence has a clear meaning.`,
    "> A strong answer gives one idea, one reason, and one simple example.",
  ];
}

function controlledPracticeFor(structures: string[], vocabulary: string[], functions: string[]) {
  const source = lessonLanguageSource(structures, vocabulary, functions);

  if (/as soon as|whenever|ever since|before|after|until|while|time clause/.test(source)) {
    return [
      "1. **As soon as I ______, I ______.**",
      "2. **Whenever I ______, I ______.**",
      "3. **Before I ______, I ______.**",
    ];
  }

  if (/even if|considering that|as long as|unless|just in case|only if|reason|condition/.test(source)) {
    return [
      "1. **Even if I ______, I ______.**",
      "2. **Unless I ______, I ______.**",
      "3. **As long as I ______, I ______.**",
    ];
  }

  if (/must have|might have|could have|may have|modals? of certainty|certainty|mystery/.test(source)) {
    return [
      "1. **He must have ______ because ______.**",
      "2. **It might have ______, but ______.**",
      "3. **Nobody is sure, but it could have ______.**",
    ];
  }

  if (/should|ought to|might want to|advice|suggest|recommend/.test(source)) {
    return [
      "1. **You might want to ______ because ______.**",
      "2. **It might not be a bad idea to ______.**",
      "3. **The way I see it, you ought to ______.**",
    ];
  }

  if (/conversation|small talk|polite|rude|appropriate|inappropriate/.test(source)) {
    return [
      "1. **It's polite to ______.**",
      "2. **______ is rude because ______.**",
      "3. **It's inappropriate to ______ when ______.**",
    ];
  }

  const firstStructure = targetPattern(structures);
  const firstWord = firstOr(vocabulary, "one useful word");
  return [
    `1. Use **${firstStructure}** to write one clear sentence.`,
    `2. Use **${firstWord}** in a sentence with a real reason.`,
  ];
}

function productionTaskFor(structures: string[], vocabulary: string[], functions: string[]) {
  const source = lessonLanguageSource(structures, vocabulary, functions);
  if (/listening|gist|details|audio/.test(source)) {
    return "Your turn: write 2-3 sentences in English. Predict the main idea and include two useful words from the lesson.";
  }
  if (/role play|dialogue|small talk|conversation opener|conversation closer/.test(source)) {
    return "Your turn: write a short 4-6 line dialogue. Use one opening line, one follow-up, and one natural closing.";
  }
  if (/writing|paragraph|outline|topic sentence/.test(source)) {
    return "Your turn: write a short paragraph of 4-5 sentences with one clear topic sentence and one supporting example.";
  }
  return "Your turn: write 3-5 sentences in English. Use one target pattern, two useful words or chunks, and one personal example.";
}

function listeningModelAnswers(vocabulary: string[], structures: string[], functions: string[]) {
  const source = lessonLanguageSource(structures, vocabulary, functions);

  if (/stress|fatigue|lack of energy|massage|yoga|hot bath|vent/.test(source)) {
    return [
      "> The main idea is that the speaker feels stressed and needs a practical way to relax.",
      "> One detail is that simple actions, like calling a friend or listening to music, can help reduce stress.",
    ];
  }

  if (/dream|flying|falling|chased|embraced|losing teeth|stands for/.test(source)) {
    return [
      "> The main idea is that different dreams may express different feelings or worries.",
      "> One detail is that a dream about falling might connect to fear, while being chased might connect to stress or pressure.",
    ];
  }

  if (/conversation|small talk|closings|party|weather|jacket/.test(source)) {
    return [
      "> The main idea is that people use light topics to start and end conversations politely.",
      "> One detail is that a closing phrase, like “I should get going,” helps the conversation end naturally.",
    ];
  }

  return [
    "> The main idea is the speaker's problem, opinion, or experience.",
    "> One important detail is the reason or example that supports the main idea.",
  ];
}

function listeningInputFor(vocabulary: string[], structures: string[], functions: string[]) {
  const source = lessonLanguageSource(structures, vocabulary, functions);

  if (/stress|fatigue|lack of energy|massage|yoga|hot bath|vent|too many responsibilities/.test(source)) {
    return [
      "Teacher-created listening input:",
      "",
      "> A: I feel exhausted because I have too many responsibilities this week.",
      "> B: That sounds stressful. Have you ever thought of calling a friend and venting your feelings?",
      "> A: Maybe. I also need something to help me relax before bed.",
      "> B: It might not be a bad idea to take a hot bath and listen to music tonight.",
      "",
    ];
  }

  if (/dream|flying|falling|chased|embraced|losing teeth|stands for/.test(source)) {
    return [
      "Teacher-created listening input:",
      "",
      "> A: I had the wildest dream last night. I was falling, and then suddenly I was flying.",
      "> B: That sounds intense. Maybe falling stands for fear, and flying might symbolize freedom.",
      "",
    ];
  }

  return [];
}

function rolePlayModelDialogue(vocabulary: string[], structures: string[], functions: string[]) {
  const source = lessonLanguageSource(structures, vocabulary, functions);

  if (/stress|fatigue|lack of energy|massage|yoga|hot bath|vent|too little time|too many responsibilities/.test(source)) {
    return [
      "> A: I feel exhausted because I have too many responsibilities this week.",
      "> B: That sounds stressful. Have you ever thought of calling a friend and venting your feelings?",
      "> A: Maybe. I also need something to help me relax before bed.",
      "> B: It might not be a bad idea to take a hot bath and listen to music tonight.",
    ];
  }

  if (/small talk|weather|jacket|many people here|see you|got to run|great to meet/.test(source)) {
    return [
      "> A: Hi. How's it going?",
      "> B: Pretty good. Do you know many people here?",
      "> A: Not really. Can you believe this weather?",
      "> B: I know. It's awful. Anyway, it was great to meet you.",
    ];
  }

  if (/advice|should|ought to|might want to|recommend/.test(source)) {
    return [
      "> A: I am having trouble deciding what to do.",
      "> B: You might want to start with the most urgent problem.",
      "> A: That makes sense, but I also need time to think.",
      "> B: The way I see it, you ought to choose one small next step.",
    ];
  }

  return [
    "> A: Can I ask you something about this situation?",
    "> B: Sure. What happened?",
    "> A: I need to explain my idea clearly.",
    "> B: Then start with the main point and add one useful detail.",
  ];
}

function grammarOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  grammarTitle: string,
  teaching: TeachingContractV2,
) {
  return [
    "## Warm-up: notice the language",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "Before producing a full answer, notice the pattern, the meaning, and the situation where a speaker would use it.",
    ...spanishSupportBlock(teaching),
    "",
    "## Key language",
    "",
    ...(usefulWordList(vocabulary, 6)),
    "",
    `## Teacher explanation: ${grammarTitle}`,
    "",
    "A good grammar answer is not only correct; it also communicates a real idea.",
    "",
    "Useful patterns:",
    "",
    ...(structures.length ? structures.slice(0, 5).map((item) => `- **${item}**`) : ["- **target structure + clear meaning**"]),
    "",
    "Model examples:",
    "",
    ...modelExamplesFor(structures, vocabulary, functions),
    "",
    "## Controlled practice",
    "",
    "Complete these with your own ideas using the target pattern:",
    "",
    ...controlledPracticeFor(structures, vocabulary, functions),
    ...contractControlledPractice(teaching),
    "",
    "## Speaking practice",
    "",
    learnerTask(teaching.guidedProduction, productionTaskFor(structures, vocabulary, functions)),
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function vocabularySpeakingOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  teaching: TeachingContractV2,
) {
  return [
    "## Warm-up: activate the topic",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "First, build useful chunks. Then use them to say something true about your own experience.",
    ...spanishSupportBlock(teaching),
    "",
    "## Key vocabulary and chunks",
    "",
    ...usefulWordList(vocabulary, 10),
    "",
    "## Teacher explanation: how to use the language",
    "",
    "Do not memorize isolated words only. Use them in chunks and short examples.",
    "",
    "Useful patterns:",
    "",
    ...(structures.length ? structures.slice(0, 4).map((item) => `- **${item}**`) : ["- **I think... because...**", "- **In my experience,...**"]),
    "",
    "Model answers:",
    "",
    ...modelExamplesFor(structures, vocabulary, functions),
    "",
    "## Controlled practice",
    "",
    "Complete two short sentences:",
    "",
    ...controlledPracticeFor(structures, vocabulary, functions),
    ...contractControlledPractice(teaching),
    "",
    "## Speaking practice",
    "",
    learnerTask(teaching.guidedProduction, productionTaskFor(structures, vocabulary, functions)),
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function listeningOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  teaching: TeachingContractV2,
) {
  return [
    "## Warm-up: listening purpose",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "Before listening, prepare what you expect to hear. This helps you listen with a purpose.",
    ...spanishSupportBlock(teaching),
    "",
    "## Key vocabulary before listening",
    "",
    ...usefulWordList(vocabulary, 8),
    "",
    "## Teacher explanation: gist and details",
    "",
    "**Gist** means the general idea. **Details** are the specific information that supports it.",
    "If exact audio is not available, we use a teacher-created listening simulation and clearly treat it as practice.",
    "",
    "Useful listening frames:",
    "",
    "- **The main idea is...**",
    "- **The speaker mentions...**",
    "- **One important detail is...**",
    ...(structures.length ? structures.slice(0, 3).map((item) => `- **${item}**`) : []),
    "",
    ...listeningInputFor(vocabulary, structures, functions),
    "Model answers:",
    "",
    ...listeningModelAnswers(vocabulary, structures, functions),
    "",
    "## Controlled practice",
    "",
    "Before listening, predict:",
    "",
    "1. What topic do you expect to hear?",
    "2. Which two words or chunks from this class might appear?",
    "",
    "## Listening task",
    "",
    learnerTask(teaching.guidedProduction, "write 2-3 sentences in English with one prediction and two useful words from the list."),
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function rolePlayOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  teaching: TeachingContractV2,
) {
  return [
    "## Warm-up: role-play situation",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "A good role play has a clear situation, useful language, and a natural ending.",
    ...spanishSupportBlock(teaching),
    "",
    "## Useful language",
    "",
    ...usefulWordList(vocabulary, 10),
    "",
    "## Teacher explanation: conversation moves",
    "",
    "Use three moves:",
    "",
    "1. **Start** with a clear opening.",
    "2. **Respond** with one useful detail or follow-up.",
    "3. **Close or continue** naturally.",
    "",
    "Useful patterns:",
    "",
    ...(structures.length ? structures.slice(0, 4).map((item) => `- **${item}**`) : ["- **A: ... / B: ...**", "- **follow-up question + short answer**"]),
    "",
    "Model dialogue:",
    "",
    ...rolePlayModelDialogue(vocabulary, structures, functions),
    "",
    "## Controlled practice",
    "",
    "Complete this mini-dialogue:",
    "",
    "A: ______",
    "B: ______",
    "A: ______",
    "",
    "## Speaking practice",
    "",
    learnerTask(teaching.guidedProduction, "write a 4-6 line dialogue. Use at least two useful chunks from this class."),
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function writingOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  teaching: TeachingContractV2,
) {
  return [
    "## Warm-up: writing purpose",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "Good writing starts with one main idea and supporting details.",
    ...spanishSupportBlock(teaching),
    "",
    "## Key vocabulary and writing support",
    "",
    ...usefulWordList(vocabulary, 10),
    "",
    "## Teacher explanation: organize before writing",
    "",
    "Use this simple structure:",
    "",
    "1. **Topic sentence**: say the main idea.",
    "2. **Supporting detail**: explain or give an example.",
    "3. **Concluding sentence**: close the idea clearly.",
    "",
    "Useful patterns:",
    "",
    ...(structures.length ? structures.slice(0, 4).map((item) => `- **${item}**`) : ["- **My main point is...**", "- **For example,...**", "- **Because of that,...**"]),
    "",
    "Model paragraph:",
    "",
    "> A clear answer usually starts with one main idea. Then it gives a reason or example. This helps the reader understand the message quickly.",
    "",
    "## Controlled practice",
    "",
    "Plan your answer:",
    "",
    "1. Topic sentence: ______.",
    "2. Supporting detail: ______.",
    "3. Concluding sentence: ______.",
    "",
    "## Writing practice",
    "",
    learnerTask(teaching.guidedProduction, "write one short paragraph of 4-5 sentences. Use one topic sentence and one supporting example."),
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function discussionOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  teaching: TeachingContractV2,
) {
  return [
    "## Warm-up: opinion and reason",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "A strong discussion answer has an opinion, a reason, and one example.",
    ...spanishSupportBlock(teaching),
    "",
    "## Useful vocabulary",
    "",
    ...usefulWordList(vocabulary, 8),
    "",
    "## Teacher explanation: build a discussion answer",
    "",
    "Use this shape:",
    "",
    "1. **Opinion**: I think...",
    "2. **Reason**: because...",
    "3. **Example**: For example,...",
    "",
    "Useful patterns:",
    "",
    ...(structures.length ? structures.slice(0, 4).map((item) => `- **${item}**`) : ["- **I think... because...**", "- **In my opinion,...**", "- **For example,...**"]),
    "",
    "Model answers:",
    "",
    ...modelExamplesFor(structures, vocabulary, functions),
    "",
    "## Controlled practice",
    "",
    "Complete these:",
    "",
    "1. I think ______ because ______.",
    "2. For example, ______.",
    "",
    "## Speaking practice",
    "",
    "Your turn: write 3-5 sentences in English. Give your opinion, one reason, and one example.",
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function conversationBehaviorOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  grammarTitle: string,
  teaching: TeachingContractV2,
) {
  const positiveWords = vocabulary.filter((word) => /appropriate|polite|normal|typical|compliment/i.test(word));
  const negativeWords = vocabulary.filter((word) => /inappropriate|rude|offensive|bad form|insult|strange|unusual/i.test(word));

  return [
    "## Warm-up: types of conversationalists",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "Think about people you meet in social, school, work, or daily situations:",
    ...spanishSupportBlock(teaching),
    "",
    "- a person who talks too much",
    "- a person who interrupts",
    "- a person who does not listen carefully",
    "- a person who asks good follow-up questions",
    "- a person who changes the topic too quickly",
    "- a person who makes others feel comfortable",
    "",
    "## Key vocabulary",
    "",
    "Positive or acceptable:",
    "",
    ...(positiveWords.length ? positiveWords.slice(0, 5).map((item) => `- **${item}**`) : ["- **appropriate**", "- **polite**", "- **normal**"]),
    "",
    "Negative or unacceptable:",
    "",
    ...(negativeWords.length ? negativeWords.slice(0, 7).map((item) => `- **${item}**`) : ["- **inappropriate**", "- **rude**", "- **offensive**"]),
    "",
    `## Teacher explanation: ${grammarTitle}`,
    "",
    "Use these patterns to comment on behavior:",
    "",
    ...(structures.length ? structures.map((item) => `- **${item}**`) : ["- **It's + adjective + to + verb**", "- **Gerund phrase + is + adjective**"]),
    "",
    "Two equivalent patterns:",
    "",
    "> It's rude to ignore your conversation partner.",
    "> Ignoring your conversation partner is rude.",
    "",
    "> It's a good idea to try different topics.",
    "> Trying different topics is a good idea.",
    "",
    "In Spanish, both patterns can mean: “Es grosero interrumpir” / “Interrumpir es grosero.”",
    "",
    "## Controlled practice",
    "",
    "Rewrite these sentences with a gerund phrase:",
    "",
    "1. It's inappropriate to talk about politics at work or school.",
    "2. It's polite to thank people after a conversation.",
    "3. It's a good idea to ask follow-up questions.",
    "4. It's bad form to ignore your conversation partner.",
    "",
    "## Speaking practice",
    "",
    "Your turn: first rewrite the four sentences. Then answer in 2-3 sentences:",
    "",
    "**What kind of conversationalist are you, and what behavior do you consider rude or appropriate?**",
    "",
    "Use one model if it helps:",
    "",
    "> I think I'm the kind of person who listens carefully because I like understanding people before giving my opinion.",
    "> In my opinion, interrupting people is rude because it makes the conversation uncomfortable.",
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function smallTalkOpening(
  identity: ClassIdentity,
  vocabulary: string[],
  structures: string[],
  functions: string[],
  teaching: TeachingContractV2,
) {
  const openers = vocabulary.filter((item) => /\?$|how's it going|weather|jacket|many people here/i.test(item)).slice(0, 6);
  const closers = vocabulary.filter((item) => /see you|got to run|talk to you|great to meet|should get going|call you later/i.test(item)).slice(0, 6);
  const writingWords = vocabulary.filter((item) => /outline|topic sentence|supporting|concluding|paragraph/i.test(item)).slice(0, 5);

  return [
    "## Warm-up: making small talk",
    "",
    teachingPurposeLine(teaching, functions, identity.lessonTitle),
    "Small talk is light conversation, usually with people you do not know very well.",
    ...spanishSupportBlock(teaching),
    "",
    "Good first topics are usually simple: weather, events, weekend plans, travel, work in general, or shared interests.",
    "Avoid very personal or sensitive topics at first, such as salary, religion, private family problems, or confidential information.",
    "",
    "## Key vocabulary and chunks",
    "",
    "Conversation openers:",
    "",
    ...(openers.length ? openers.map((item) => `- **${item}**`) : ["- **How's it going?**", "- **Can you believe this weather?**", "- **Do you know many people here?**"]),
    "",
    "Conversation closers:",
    "",
    ...(closers.length ? closers.map((item) => `- **${item}**`) : ["- **See you later.**", "- **Sorry, I've got to run.**", "- **It was great to meet you.**"]),
    "",
    ...(writingWords.length ? ["Writing support:", "", ...writingWords.map((item) => `- **${item}**`), ""] : []),
    "## Teacher explanation: useful language",
    "",
    "A natural short conversation usually has three moves:",
    "",
    "1. **Open** the conversation with a friendly topic.",
    "2. **Keep it going** with one follow-up question.",
    "3. **Close** politely when you need to leave.",
    "",
    "Model dialogue:",
    "",
    "> A: Hi. How's it going?",
    "> B: Pretty good. Do you know many people here?",
    "> A: Not really. Can you believe this weather?",
    "> B: I know. It's awful.",
    "> A: Well, it was great to meet you. I should get going.",
    "",
    ...(structures.length ? ["Useful class patterns:", "", ...structures.slice(0, 4).map((item) => `- **${item}**`), ""] : []),
    "## Controlled practice",
    "",
    "Complete these sentences:",
    "",
    "1. It's appropriate to talk about ______ during small talk.",
    "2. It's inappropriate to ask about ______ when you meet someone for the first time.",
    "3. Asking follow-up questions is ______.",
    "4. Ending a conversation politely is important because ______.",
    "",
    "## Speaking practice",
    "",
    "Your turn: write one short dialogue of 4-6 lines. Include:",
    "",
    "- one opener",
    "- one follow-up question",
    "- one short answer",
    "- one polite closer",
    ...contractEvaluationPreview(teaching),
  ].join("\n");
}

function videoOpeningFallback(identity: ClassIdentity) {
  const vocabulary = listItems(identity.vocabularyFocus, 6);
  const structures = listItems(identity.targetStructures || identity.grammarFocus, 3);
  return [
    "## Video Class - Before watching",
    "",
    "First, we prepare your mind for the video. We will not invent the video transcript.",
    "",
    "Useful language for your prediction:",
    "",
    ...(vocabulary.length ? vocabulary.map((item) => `- **${item}**`) : ["- **main idea**", "- **routine**", "- **opinion**"]),
    ...(structures.length ? structures.map((item) => `- **${item}**`) : []),
    "",
    "Model answers:",
    "",
    "> I think the video will compare two different habits and explain why they matter.",
    "> I expect to use one useful chunk from the unit and one sentence about my own routine.",
    "",
    "Your turn: write 2-3 sentences in English. Predict the main idea and include one useful word, chunk, or structure from this class.",
  ].join("\n");
}

function checkpointOpeningFallback(identity: ClassIdentity) {
  const vocabulary = listItems(identity.vocabularyFocus, 6);
  const structures = listItems(identity.targetStructures || identity.grammarFocus, 4);
  return [
    "## Unit checkpoint briefing",
    "",
    "This checkpoint checks whether you can use the unit language in a real answer, not just recognize it.",
    "",
    "Approval criteria:",
    "",
    "- clear main idea",
    "- accurate target structure",
    "- useful vocabulary from the unit",
    "- one personal or professional example",
    "",
    "Useful language to include:",
    "",
    ...(structures.length ? structures.map((item) => `- **${item}**`) : []),
    ...(vocabulary.length ? vocabulary.map((item) => `- **${item}**`) : []),
    "",
    "Model answer:",
    "",
    "> I can explain the topic clearly, give one example from my routine, and use the target language naturally.",
    "",
    "Your turn: write 4-6 short sentences in English. Show the grammar, vocabulary, and communication skill from this unit.",
  ].join("\n");
}
