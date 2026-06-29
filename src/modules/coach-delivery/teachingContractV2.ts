import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";

export type PedagogicalRole =
  | "student-book-block"
  | "grammar-plus"
  | "listening"
  | "role-play"
  | "writing"
  | "video"
  | "checkpoint"
  | "discussion";

export type LessonLanguageFamily =
  | "time-clauses"
  | "condition-clauses"
  | "stress-advice"
  | "dream-speculation"
  | "small-talk"
  | "social-behavior"
  | "writing"
  | "general";

export type TeachingContractV2 = {
  bookAnchor: {
    lessonTitle: string;
    sections: string[];
    skillFocus: string;
  };
  pedagogicalRole: PedagogicalRole;
  languageFamily: LessonLanguageFamily;
  coreConcept: string;
  targetLanguage: {
    grammar: string[];
    vocabulary: string[];
    functions: string[];
    patterns: string[];
  };
  spanishSupport: string[];
  controlledPractice: string[];
  guidedProduction: string;
  evaluationCriteria: string[];
  commonMistakes: string[];
};

export function splitTeachingItems(value: string, limit = 24) {
  const text = String(value || "");
  const separator = text.includes(";") ? /;/ : /,/;
  return text
    .split(separator)
    .map((item) => learnerSafeTeachingCue(item))
    .filter(Boolean)
    .slice(0, limit);
}

export function learnerSafeTeachingCue(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/\b(recycle confirmed|confirmed unit|indexed unit|indexed .*context|student book|do not invent|unverified|learner-safe|target structures confirmed|from indexed|based only on)\b/i.test(text)) {
    return "";
  }
  return text.replace(/\s+/g, " ").trim();
}

export function buildTeachingContractV2(identity: ClassIdentity): TeachingContractV2 {
  const sections = String(identity.sections || "")
    .split("+")
    .map((section) => learnerSafeTeachingCue(section))
    .filter(Boolean);
  const grammar = splitTeachingItems(identity.grammarFocus, 12);
  const vocabulary = splitTeachingItems(identity.vocabularyFocus, 24);
  const functions = splitTeachingItems(identity.functions || identity.skillFocus, 12);
  const patterns = splitTeachingItems(identity.targetStructures || identity.grammarFocus, 16);
  const role = pedagogicalRoleFor(identity, sections);
  const family = languageFamilyFor(identity, sections, grammar, vocabulary, functions, patterns);
  const source = [...grammar, ...vocabulary, ...functions, ...patterns, identity.lessonTitle, identity.expectedProduction].join(" ").toLowerCase();

  return {
    bookAnchor: {
      lessonTitle: learnerSafeTeachingCue(identity.lessonTitle) || sections[0] || "Class session",
      sections,
      skillFocus: learnerSafeTeachingCue(identity.skillFocus),
    },
    pedagogicalRole: role,
    languageFamily: family,
    coreConcept: coreConceptFor(family, functions, identity.lessonTitle),
    targetLanguage: {
      grammar,
      vocabulary,
      functions,
      patterns,
    },
    spanishSupport: spanishSupportFor(family),
    controlledPractice: controlledPracticeFor(family, role),
    guidedProduction: guidedProductionFor(family, role, identity.expectedProduction),
    evaluationCriteria: evaluationCriteriaFor(family, source),
    commonMistakes: commonMistakesFor(family, source),
  };
}

function pedagogicalRoleFor(identity: ClassIdentity, sections: string[]): PedagogicalRole {
  const sectionText = sections.join(" ").toLowerCase();
  const source = [identity.lessonTitle, identity.sections, identity.skillFocus, identity.expectedProduction].join(" ").toLowerCase();
  const firstSection = sections[0]?.toLowerCase() || "";

  if (/checkpoint|unit review|review class/.test(source)) return "checkpoint";
  if (/video|before watching|while watching|after watching/.test(sectionText)) return "video";
  if (/grammar plus|practice lab/.test(sectionText) || /grammar consolidation|grammar plus/.test(source)) return "grammar-plus";
  if (/listening|audio|while listening/.test(firstSection)) return "listening";
  if (/role play|role-play/.test(firstSection) || /role-play|role play/.test(source)) return "role-play";
  if (/writing|paragraph|outline/.test(firstSection) || /writing|paragraph|outline/.test(source)) return "writing";
  if (/discussion/.test(firstSection)) return "discussion";
  return "student-book-block";
}

function languageFamilyFor(
  identity: ClassIdentity,
  sections: string[],
  grammar: string[],
  vocabulary: string[],
  functions: string[],
  patterns: string[],
): LessonLanguageFamily {
  const primary = [
    identity.lessonTitle,
    sections.join(" "),
    grammar.join(" "),
    patterns.join(" "),
    identity.expectedProduction,
  ].join(" ").toLowerCase();
  const full = [primary, vocabulary.join(" "), functions.join(" "), identity.skillFocus].join(" ").toLowerCase();

  if (/conversation opener|conversation closer|small talk|how's it going|weather|keep a conversation going|close a conversation/.test(full)) {
    return "small-talk";
  }
  if (/appropriate|inappropriate|rude|bad form|gerund phrase|infinitive phrase|polite to|impolite|offensive|compliment|insult/.test(full)) {
    return "social-behavior";
  }
  if (/reduced time|after finishing|while taking|time clause|as soon as|whenever|ever since|before i|after i|until i/.test(primary)) {
    return "time-clauses";
  }
  if (/even if|considering that|as long as|unless|just in case|only if|provided that|providing that|whether or not|now that/.test(primary)) {
    return "condition-clauses";
  }
  if (/dream|flying|falling|chased|losing teeth|stands for|symbolize/.test(full)) {
    return "dream-speculation";
  }
  if (/stress|fatigue|lack of energy|vent|massage|yoga|hot bath|too many responsibilities|soft advice|advice expression/.test(full)) {
    return "stress-advice";
  }
  if (/writing|paragraph|outline|topic sentence|supporting sentence|concluding sentence/.test(full)) {
    return "writing";
  }
  return "general";
}

function coreConceptFor(family: LessonLanguageFamily, functions: string[], lessonTitle: string) {
  const safeLesson = learnerSafeTeachingCue(lessonTitle);
  if (family === "time-clauses") {
    return "Use time clauses to describe when actions happen in your routine, and reduce clauses only when it sounds natural.";
  }
  if (family === "condition-clauses") {
    return "Explain sleep, energy, and habits with reason and condition clauses.";
  }
  if (family === "stress-advice") {
    return "Identify stress or energy problems and give practical advice politely.";
  }
  if (family === "dream-speculation") {
    return "Describe dreams and speculate about possible meanings without presenting interpretations as facts.";
  }
  if (family === "small-talk") {
    return "Start, continue, and close small talk naturally.";
  }
  if (family === "social-behavior") {
    return "Comment on social behavior using infinitive and gerund phrases.";
  }
  const purpose = functions.find(Boolean);
  return purpose ? `Use this lesson language to ${purpose}.` : `Use the language from ${safeLesson || "this lesson"} in a clear real-life answer.`;
}

function spanishSupportFor(family: LessonLanguageFamily) {
  const support: string[] = [];
  if (family === "time-clauses") {
    support.push("En español solemos decir la idea completa; en inglés puedes acortar after/while/before cuando el sujeto es el mismo.");
    support.push("As soon as, until, whenever y ever since normalmente se mantienen como cláusulas completas.");
  }
  if (family === "condition-clauses") {
    support.push("even if = incluso si / aunque; la condición no cambia el resultado.");
    support.push("as long as = siempre que / con tal de que; expresa una condición necesaria.");
    support.push("unless = a menos que / si no; cuidado con duplicar negativos.");
  }
  if (family === "social-behavior") {
    support.push("It's + adjective + to + verb y Gerund + is + adjective pueden expresar la misma idea con distinto estilo.");
  }
  if (family === "stress-advice") {
    support.push("Para sonar amable, usa You might want to... o It might not be a bad idea to..., no solo You must...");
  }
  return support.slice(0, 3);
}

function controlledPracticeFor(family: LessonLanguageFamily, role: PedagogicalRole) {
  if (family === "time-clauses" && role === "grammar-plus") {
    return [
      "Can this clause be reduced? After I finish work, I check my messages.",
      "Can this clause be reduced? As soon as I wake up, I check my calendar.",
      "Rewrite only if natural: While I am waiting for the meeting, I review my notes.",
    ];
  }
  if (family === "time-clauses") {
    return [
      "Rewrite: After I finish work, I check my messages. → After finishing work, I check my messages.",
      "Complete: As soon as I ______, I ______.",
      "Complete: Whenever I ______, I ______.",
    ];
  }
  if (family === "condition-clauses") {
    return [
      "Complete: I can stay productive as long as ______.",
      "Complete: I feel exhausted even if ______.",
      "Complete: I do not sleep well unless ______.",
    ];
  }
  if (family === "stress-advice") {
    return [
      "Cause: I feel stressed because I have too many responsibilities.",
      "Advice: You might want to ______.",
      "Soft advice: It might not be a bad idea to ______.",
    ];
  }
  if (family === "dream-speculation") {
    return [
      "The main idea is ______.",
      "One detail is ______.",
      "I think the dream might mean ______.",
    ];
  }
  if (family === "small-talk") {
    return [
      "Opener: Hi, how's it going?",
      "Follow-up: Do you know many people here?",
      "Closer: It was great to meet you. I should get going.",
    ];
  }
  if (role === "role-play") {
    return [
      "A: ______",
      "B: ______",
      "A: ______",
      "B: ______",
    ];
  }
  return [
    "Write one sentence with the target pattern.",
    "Add one useful word or chunk from the lesson.",
    "Give one short personal example.",
  ];
}

function guidedProductionFor(family: LessonLanguageFamily, role: PedagogicalRole, expectedProduction: string) {
  const expected = learnerSafeTeachingCue(expectedProduction);
  if (family === "time-clauses" && role === "grammar-plus") {
    return "Write 5 short items: decide which clauses you can reduce, rewrite two reduced clauses, keep one full time clause, and explain one choice.";
  }
  if (family === "stress-advice") {
    return "Write a 4-6 line advice dialogue. Include one cause of stress, one soft advice expression, and one practical solution.";
  }
  if (family === "dream-speculation") {
    return "Write 3-4 sentences: predict the listening topic, mention two dream words, and speculate with might / could / sounds like.";
  }
  if (family === "time-clauses") {
    return "Write 4-5 sentences about your routine: two reduced time clauses, one full time clause, and one energy-pattern vocabulary chunk.";
  }
  if (family === "condition-clauses") {
    return "Write 4 sentences about your sleep or energy habits using two vocabulary chunks and two reason/condition clauses.";
  }
  if (family === "small-talk" || role === "role-play") {
    return "Write a 4-6 line dialogue. Include one opener, one follow-up question, one short answer, and one natural closing.";
  }
  if (family === "writing" || role === "writing") {
    return "Write one short paragraph of 4-5 sentences. Include one clear topic sentence and one supporting example.";
  }
  return expected || "Write 3-5 sentences using the target language, useful vocabulary, and one personal example.";
}

function evaluationCriteriaFor(family: LessonLanguageFamily, source: string) {
  const criteria = [
    "2 pts - uses the target language accurately",
    "2 pts - uses vocabulary or chunks from the class",
    "2 pts - gives complete answers with a clear idea",
    "2 pts - sounds natural for B1/B2 communication",
  ];
  if (family === "small-talk" || /professional|work|meeting|productivity|schedule|responsibilities/.test(source)) {
    criteria.push("2 pts - connects the answer to a realistic social, work, or daily-life situation");
  } else {
    criteria.push("2 pts - includes one personal example");
  }
  criteria.push("Pass: 8/10. Review: 6-7/10. Repeat: below 6/10.");
  return criteria;
}

function commonMistakesFor(family: LessonLanguageFamily, source: string) {
  const mistakes: string[] = [];
  if (family === "time-clauses" || /as soon as|when|before|after|until|whenever/.test(source)) {
    mistakes.push("Do not use will after time linkers: As soon as I get up, not As soon as I will get up.");
  }
  if (family === "time-clauses" || /reduced time|after finishing|while taking/.test(source)) {
    mistakes.push("Do not reduce every time clause. As soon as I wake up is natural; As soon as waking up is not.");
  }
  if (family === "condition-clauses" || /unless/.test(source)) mistakes.push("Do not combine unless with not unless you really need a negative meaning.");
  if (/should|ought to|might want to/.test(source)) mistakes.push("After should / could / might, use the base verb: should rest, not should to rest.");
  if (/gerund|infinitive/.test(source)) mistakes.push("After prefer for habits, prefer + -ing is often natural: I prefer working early.");
  return mistakes.slice(0, 3);
}
