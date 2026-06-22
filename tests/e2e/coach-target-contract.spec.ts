import { test, expect } from "@playwright/test";
import {
  localClassFromAnyClassNumber,
  mergeClassTargetWithPayload,
  resolveClassCoordinatesFromPayload,
  resolveClassTargetFromMessage,
  resolveUnitTarget,
} from "../../src/modules/coach-target/resolve";

test("coach target resolver honors explicit unit/class requests over saved position", async () => {
  const context = {
    user: {
      "Current Unit": "Unit 4",
      "Current Class": "7",
    },
  };

  const target = resolveClassTargetFromMessage("Dame la clase 1 de la unidad 5", "Unit 4", context);

  expect(target).toMatchObject({
    unit: 5,
    localClass: 1,
    globalClass: 29,
    explicitClassRequest: true,
    needsCurrentClassLookup: false,
  });
});

test("coach target resolver uses saved class as fallback but still requests canonical active-class lookup", async () => {
  const context = {
    recommendedCurrentPosition: {
      currentUnit: "Unit 4",
      classNumber: 27,
    },
  };

  const target = resolveClassTargetFromMessage("Empecemos clase", "Unit 4", context);

  expect(target).toMatchObject({
    unit: 4,
    localClass: 6,
    globalClass: 27,
    explicitClassRequest: false,
    needsCurrentClassLookup: true,
  });
});

test("coach target resolver requests English OS lookup when active class is not reliable", async () => {
  const target = resolveClassTargetFromMessage("Dame la clase", "Unit 4", {});

  expect(target).toMatchObject({
    unit: 4,
    localClass: null,
    globalClass: null,
    explicitClassRequest: false,
    needsCurrentClassLookup: true,
  });
});

test("coach target resolver merges English OS current-class payload without leaking payload shape", async () => {
  const target = resolveClassTargetFromMessage("Dame la clase", "Unit 4", {});
  const merged = mergeClassTargetWithPayload(target, {
    context: {
      currentClassIndex: {
        currentUnit: "Unit 4",
        globalClass: 23,
      },
    },
  });

  expect(merged).toMatchObject({
    unit: 4,
    localClass: 2,
    globalClass: 23,
    needsCurrentClassLookup: false,
  });
});

test("coach target resolver reads nested class coordinates and converts global to local", async () => {
  expect(localClassFromAnyClassNumber(23, 4)).toBe(2);
  expect(resolveClassCoordinatesFromPayload({ classContent: { currentClassIndex: { unit: "Unit 2", classNumber: 10 } } })).toEqual({
    unit: 2,
    localClass: 3,
    globalClass: 10,
  });
});

test("coach target resolver falls back to saved unit for review and guide targets", async () => {
  expect(resolveUnitTarget("Hazme un repaso", "Unit 3")).toBe(3);
  expect(resolveUnitTarget("Dame una guía de vocabulario de Unit 5", "Unit 3")).toBe(5);
});
