import approvalPolicyConfig from "../../../knowledge/pedagogy/approval-policies/default.json";
import grammarRuleConfig from "../../../knowledge/pedagogy/grammar-rules/default.json";
import courseStructureConfig from "../../../knowledge/course-structure/english-os-course.json";

export type ApprovalCriterionId =
  | "grammar"
  | "vocabulary"
  | "communicativeGoal"
  | "production"
  | "personalConnection";

export type ProductionType =
  | "short-answer"
  | "speaking"
  | "discussion"
  | "dialogue"
  | "paragraph"
  | "checkpoint";

export type ApprovalCriterionConfig = {
  id: ApprovalCriterionId;
  label: string;
  points: number;
  required: boolean;
  evidence: string[];
};

export type ApprovalPolicyConfig = {
  schemaVersion: number;
  policyId: string;
  description: string;
  requiresEvaluationGate: boolean;
  requiresActiveSectionsCompleted: boolean;
  passingScore: number;
  reviewScore: number;
  criteria: ApprovalCriterionConfig[];
  responsePolicies: {
    expectedProductionEvidenceStrategy: "strict-expected-production" | "task-or-target-evidence";
    minimumSentencesByProductionType: Record<ProductionType, number>;
    minimumContentWordsByProductionType: Record<ProductionType, number>;
  };
};

export type GrammarRuleConfig = {
  id: string;
  family: string;
  severity: "blocking" | "warning";
  pattern: string;
  message: string;
};

export type GrammarRuleSetConfig = {
  schemaVersion: number;
  ruleSetId: string;
  description: string;
  rules: GrammarRuleConfig[];
};

export type CourseStructureConfig = {
  schemaVersion: number;
  courseId: string;
  title: string;
  orderedClassIds: string[];
  unitCheckpointLocalClass: number;
};

export type CourseClassCoordinates = {
  unit: number;
  localClass: number;
  globalClass: number;
};

export function getApprovalPolicyConfig(): ApprovalPolicyConfig {
  assertApprovalPolicyConfig(approvalPolicyConfig);
  return approvalPolicyConfig;
}

export function getGrammarRuleSetConfig(): GrammarRuleSetConfig {
  assertGrammarRuleSetConfig(grammarRuleConfig);
  return grammarRuleConfig;
}

export function getCourseStructureConfig(): CourseStructureConfig {
  assertCourseStructureConfig(courseStructureConfig);
  return courseStructureConfig;
}

export function parseCourseClassId(classId: string): Omit<CourseClassCoordinates, "globalClass"> | null {
  const match = String(classId || "").match(/^u(\d{2})-c(\d{2})$/);
  if (!match) return null;
  return {
    unit: Number(match[1]),
    localClass: Number(match[2]),
  };
}

export function courseClassId(unit: number, localClass: number) {
  return `u${String(unit).padStart(2, "0")}-c${String(localClass).padStart(2, "0")}`;
}

export function courseStructureRepository(config: CourseStructureConfig = getCourseStructureConfig()) {
  const ordered = config.orderedClassIds.map((id, index) => {
    const parsed = parseCourseClassId(id);
    if (!parsed) throw new Error(`Invalid course class id: ${id}`);
    return {
      ...parsed,
      globalClass: index + 1,
    };
  });
  const byId = new Map(ordered.map((item) => [courseClassId(item.unit, item.localClass), item]));

  return {
    allClasses: () => ordered.slice(),
    currentClass: (unit: number, localClass: number) => byId.get(courseClassId(unit, localClass)) || null,
    nextClass: (unit: number, localClass: number) => {
      const currentId = courseClassId(unit, localClass);
      const index = config.orderedClassIds.indexOf(currentId);
      if (index < 0) return null;
      const nextId = config.orderedClassIds[index + 1];
      return nextId ? byId.get(nextId) || null : null;
    },
    nextUnit: (unit: number) => ordered.find((item) => item.unit > unit) || null,
    isUnitCheckpoint: (unitOrLocalClass: number, maybeLocalClass?: number) => {
      const localClass = typeof maybeLocalClass === "number" ? maybeLocalClass : unitOrLocalClass;
      return localClass === config.unitCheckpointLocalClass;
    },
  };
}

function assertApprovalPolicyConfig(value: unknown): asserts value is ApprovalPolicyConfig {
  const candidate = value as Partial<ApprovalPolicyConfig>;
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.policyId) {
    throw new Error("Invalid approval policy config.");
  }
  if (!Array.isArray(candidate.criteria) || candidate.criteria.length === 0) {
    throw new Error("Approval policy must define criteria.");
  }
  const requiredMaps = candidate.responsePolicies;
  if (!requiredMaps?.minimumSentencesByProductionType || !requiredMaps.minimumContentWordsByProductionType || !requiredMaps.expectedProductionEvidenceStrategy) {
    throw new Error("Approval policy must define response thresholds.");
  }
}

function assertGrammarRuleSetConfig(value: unknown): asserts value is GrammarRuleSetConfig {
  const candidate = value as Partial<GrammarRuleSetConfig>;
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.ruleSetId) {
    throw new Error("Invalid grammar rule config.");
  }
  if (!Array.isArray(candidate.rules)) throw new Error("Grammar rule config must define rules.");
  for (const rule of candidate.rules) {
    if (!rule.id || !rule.pattern || !rule.message) throw new Error(`Invalid grammar rule: ${rule.id || "unknown"}`);
  }
}

function assertCourseStructureConfig(value: unknown): asserts value is CourseStructureConfig {
  const candidate = value as Partial<CourseStructureConfig>;
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.courseId) {
    throw new Error("Invalid course structure config.");
  }
  if (!Array.isArray(candidate.orderedClassIds) || candidate.orderedClassIds.length === 0) {
    throw new Error("Course structure must define orderedClassIds.");
  }
  candidate.orderedClassIds.forEach((id) => {
    if (!parseCourseClassId(id)) throw new Error(`Invalid orderedClassId: ${id}`);
  });
}
