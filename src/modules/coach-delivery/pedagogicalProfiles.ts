import rolesConfig from "../../../knowledge/pedagogy/roles/default.json";
import profilesConfig from "../../../knowledge/pedagogy/profiles/default.json";

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
  | "certainty-modals"
  | "dream-speculation"
  | "small-talk"
  | "social-behavior"
  | "writing"
  | "vocabulary-speaking"
  | "general";

export type PedagogicalRoleProfile = {
  role: PedagogicalRole;
  priority: number;
  signals: string[];
  firstSectionSignals?: string[];
};

export type LanguageFamilyProfile = {
  family: LessonLanguageFamily;
  priority: number;
  primarySignals?: string[];
  fullSignals?: string[];
  coreConcept: string;
  warmupHeading?: string;
  explanationHeading?: string;
  productionHeading?: string;
  spanishSupport?: string[];
  modelExamples?: string[];
  controlledPractice?: string[];
  grammarPlusPractice?: string[];
  guidedProduction: string;
  grammarPlusProduction?: string;
  commonMistakes?: string[];
};

export const PEDAGOGICAL_ROLE_PROFILES: readonly PedagogicalRoleProfile[] = loadRoleProfiles();
export const LANGUAGE_FAMILY_PROFILES: readonly LanguageFamilyProfile[] = loadLanguageFamilyProfiles();

function loadRoleProfiles() {
  const value = rolesConfig as { schemaVersion?: number; roles?: PedagogicalRoleProfile[] };
  if (value.schemaVersion !== 1 || !Array.isArray(value.roles)) {
    throw new Error("Invalid pedagogical role profile configuration.");
  }
  value.roles.forEach((profile) => {
    if (!profile.role || typeof profile.priority !== "number" || !Array.isArray(profile.signals)) {
      throw new Error(`Invalid pedagogical role profile: ${profile.role || "unknown"}`);
    }
  });
  return value.roles;
}

function loadLanguageFamilyProfiles() {
  const value = profilesConfig as { schemaVersion?: number; profiles?: LanguageFamilyProfile[] };
  if (value.schemaVersion !== 1 || !Array.isArray(value.profiles)) {
    throw new Error("Invalid language family profile configuration.");
  }
  value.profiles.forEach((profile) => {
    if (!profile.family || typeof profile.priority !== "number" || !profile.coreConcept || !profile.guidedProduction) {
      throw new Error(`Invalid language family profile: ${profile.family || "unknown"}`);
    }
  });
  return value.profiles;
}
