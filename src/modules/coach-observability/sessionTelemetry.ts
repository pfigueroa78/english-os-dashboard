import type { CoachSessionState, CoachSessionTelemetryEvent } from "@/modules/coach-session/types";

export type CoachSessionTelemetryRecord = {
  id: string;
  at: string;
  requestKind: string;
  source: string;
  learnerKey: string;
  session: {
    mode: CoachSessionState["mode"];
    activeUnit: string | null;
    activeClassNumber: number | null;
    resourcesUnit: string | null;
    source: CoachSessionState["source"];
  };
  events: Array<{
    type: CoachSessionTelemetryEvent["type"];
    reason?: string;
    unit?: string | null;
    policy?: string;
  }>;
};

type SessionTelemetryStore = {
  records: CoachSessionTelemetryRecord[];
};

const MAX_SESSION_TELEMETRY_RECORDS = 50;

function store(): SessionTelemetryStore {
  const globalStore = globalThis as typeof globalThis & {
    __englishOsCoachSessionTelemetry?: SessionTelemetryStore;
  };
  if (!globalStore.__englishOsCoachSessionTelemetry) {
    globalStore.__englishOsCoachSessionTelemetry = { records: [] };
  }
  return globalStore.__englishOsCoachSessionTelemetry;
}

function stableLearnerKey(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "anonymous";
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }
  return `learner-${Math.abs(hash).toString(36)}`;
}

function compactEvents(events: CoachSessionTelemetryEvent[]) {
  return events.map((event) => {
    if (event.type === "resources_unit_resolved") {
      return {
        type: event.type,
        unit: event.unit,
        policy: event.policy,
      };
    }

    return {
      type: event.type,
      reason: "reason" in event ? event.reason : undefined,
    };
  });
}

export function recordCoachSessionTelemetry(input: {
  learnerEmail: string;
  requestKind: string;
  source: string;
  session: CoachSessionState;
  events: CoachSessionTelemetryEvent[];
  now?: Date;
}) {
  const telemetryStore = store();
  const now = input.now || new Date();
  const record: CoachSessionTelemetryRecord = {
    id: `${now.getTime().toString(36)}-${telemetryStore.records.length.toString(36)}`,
    at: now.toISOString(),
    requestKind: input.requestKind,
    source: input.source,
    learnerKey: stableLearnerKey(input.learnerEmail),
    session: {
      mode: input.session.mode,
      activeUnit: input.session.activeUnit,
      activeClassNumber: input.session.activeClassNumber,
      resourcesUnit: input.session.resourcesUnit,
      source: input.session.source,
    },
    events: compactEvents(input.events),
  };

  telemetryStore.records = [record, ...telemetryStore.records].slice(0, MAX_SESSION_TELEMETRY_RECORDS);
  return record;
}

export function readCoachSessionTelemetry(limit = 10) {
  return store().records.slice(0, Math.max(0, Math.min(limit, MAX_SESSION_TELEMETRY_RECORDS)));
}

export function clearCoachSessionTelemetry() {
  store().records = [];
}
