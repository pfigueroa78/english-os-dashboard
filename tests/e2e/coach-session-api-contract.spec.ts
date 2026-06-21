import { expect, test } from "@playwright/test";
import { createCoachSessionContract } from "../../src/modules/coach-session/contract";
import { toCoachStudyPanelModel, toCoachTopBarModel } from "../../src/modules/coach-session/viewModels";

test("coach session view models expose only component-specific display data", async () => {
  const session = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 4",
    savedLesson: "Business advice speaking practice: expanding advice with contrast",
    activeUnit: "Unit 5",
    activeClassNumber: 1,
    lessonTitle: "Making conversation",
    resourcesUnit: "Unit 5",
    source: "contract_probe",
  });

  expect(toCoachTopBarModel(session, "3/4")).toEqual({
    modeLabel: "Clase",
    locationLabel: "Unit 5 · Class 1",
    progressLabel: "3/4",
    detailLabel: "Clase · Unit 5 · Class 1",
  });

  expect(toCoachStudyPanelModel({
    session,
    currentUnitLabel: "Unit 4",
    contextLoading: false,
    studyUnitValue: "Unit 5",
    loading: false,
  })).toEqual({
    title: "Unit 5 · Class 1",
    modeLabel: "Clase",
    savedPositionLabel: "Unit 4",
    resourcesLabel: "Unit 5",
    studyUnitValue: "Unit 5",
    studyUnitPlaceholder: "Unit 4",
    canUseSavedPosition: true,
    canStartClass: true,
  });
});

test("coach study panel view model disables actions from state without leaking API fields", async () => {
  const session = createCoachSessionContract({
    mode: "review",
    savedUnit: "Unit 4",
    activeUnit: "Unit 4",
    activeClassNumber: 7,
    resourcesUnit: "Unit 4",
    source: "contract_probe",
  });

  expect(toCoachStudyPanelModel({
    session,
    currentUnitLabel: "",
    contextLoading: true,
    studyUnitValue: "",
    loading: true,
  })).toEqual({
    title: "Unit 4",
    modeLabel: "Repaso",
    savedPositionLabel: "Cargando…",
    resourcesLabel: "Unit 4",
    studyUnitValue: "",
    studyUnitPlaceholder: "",
    canUseSavedPosition: false,
    canStartClass: false,
  });
});

test("coach session contract API preserves class coordinates and legacy compatibility", async ({ request }) => {
  const response = await request.post("/api/english-os/coach-session-contract", {
    data: {
      mode: "class",
      savedUnit: "Unit 4",
      savedLesson: "Business advice speaking practice: expanding advice with contrast",
      activeUnit: 5,
      activeClassNumber: "1",
      lessonTitle: "Making conversation",
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  expect(body).toMatchObject({
    ok: true,
    activeUnit: 5,
    activeClass: 1,
    session: {
      mode: "class",
      savedUnit: "Unit 4",
      savedLesson: "Business advice speaking practice: expanding advice with contrast",
      activeUnit: "Unit 5",
      activeClassNumber: 1,
      lessonTitle: "Making conversation",
      resourcesUnit: "Unit 5",
      source: "contract_probe",
    },
  });
});

test("coach session contract API clears class number outside class mode", async ({ request }) => {
  const response = await request.post("/api/english-os/coach-session-contract", {
    data: {
      mode: "review",
      savedUnit: "Unit 4",
      activeUnit: "Unit 4",
      activeClassNumber: 7,
      resourcesUnit: "Unit 4",
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  expect(body.activeUnit).toBe(4);
  expect(body.activeClass).toBeNull();
  expect(body.session).toMatchObject({
    mode: "review",
    activeUnit: "Unit 4",
    activeClassNumber: null,
    resourcesUnit: "Unit 4",
  });
});

test("coach session contract API keeps resourcesUnit explicit when provided", async ({ request }) => {
  const response = await request.post("/api/english-os/coach-session-contract", {
    data: {
      mode: "guide",
      savedUnit: "Unit 1",
      activeUnit: "Unit 2",
      resourcesUnit: "Unit 3",
      lessonTitle: "Vocabulary guide",
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  expect(body.session).toMatchObject({
    mode: "guide",
    savedUnit: "Unit 1",
    activeUnit: "Unit 2",
    activeClassNumber: null,
    lessonTitle: "Vocabulary guide",
    resourcesUnit: "Unit 3",
  });
});
