import { expect, test } from "@playwright/test";
import { resolveCoachClassTarget } from "../../src/modules/coach-target/application";

test("coach target application honors explicit class coordinates without current-class lookup", async () => {
  let lookupCount = 0;

  const result = await resolveCoachClassTarget({
    message: "Dame la clase 1 de la unidad 5",
    currentUnit: "Unit 4",
    context: {
      recommendedCurrentPosition: {
        currentUnit: "Unit 4",
        classNumber: 28,
      },
    },
    readCurrentClassContent: async () => {
      lookupCount += 1;
      return {};
    },
  });

  expect(lookupCount).toBe(0);
  expect(result.kind).toBe("resolved");
  if (result.kind === "resolved") {
    expect(result.target).toMatchObject({
      unit: 5,
      localClass: 1,
      globalClass: 29,
      displayClass: 1,
      explicitClassRequest: true,
    });
  }
});

test("coach target application canonicalizes equivalent active-class starters through English OS lookup", async () => {
  const activeClassRequests = [
    "Empieza con la clase",
    "arranquemo con la clase por favor",
    "continuemos la clase",
    "Dame la clase",
  ];

  for (const message of activeClassRequests) {
    let lookupCount = 0;
    const result = await resolveCoachClassTarget({
      message,
      currentUnit: "Unit 4",
      context: {
        recommendedCurrentPosition: {
          currentUnit: "Unit 4",
          classNumber: 22,
        },
      },
      readCurrentClassContent: async () => {
        lookupCount += 1;
        return {
          context: {
            currentClassIndex: {
              currentUnit: "Unit 4",
              globalClass: 28,
            },
          },
        };
      },
    });

    expect(lookupCount, message).toBe(1);
    expect(result.kind, message).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.target, message).toMatchObject({
        unit: 4,
        localClass: 7,
        globalClass: 28,
        displayClass: 28,
        explicitClassRequest: false,
      });
    }
  }
});

test("coach target application falls back to saved active class if canonical lookup is unavailable", async () => {
  const result = await resolveCoachClassTarget({
    message: "Empieza con la clase",
    currentUnit: "Unit 4",
    context: {
      recommendedCurrentPosition: {
        currentUnit: "Unit 4",
        classNumber: 28,
      },
    },
    readCurrentClassContent: async () => {
      throw new Error("English OS temporarily unavailable");
    },
  });

  expect(result.kind).toBe("resolved");
  if (result.kind === "resolved") {
    expect(result.target).toMatchObject({
      unit: 4,
      localClass: 7,
      globalClass: 28,
      displayClass: 28,
      explicitClassRequest: false,
    });
  }
});

test("coach target application enriches ambiguous requests from English OS current-class payload", async () => {
  const result = await resolveCoachClassTarget({
    message: "Dame la clase",
    currentUnit: "Unit 4",
    context: {},
    readCurrentClassContent: async () => ({
      context: {
        currentClassIndex: {
          currentUnit: "Unit 4",
          globalClass: 23,
        },
      },
    }),
  });

  expect(result.kind).toBe("resolved");
  if (result.kind === "resolved") {
    expect(result.target).toMatchObject({
      unit: 4,
      localClass: 2,
      globalClass: 23,
      displayClass: 23,
      explicitClassRequest: false,
    });
    expect(result.activeClassContent).toMatchObject({
      context: {
        currentClassIndex: {
          globalClass: 23,
        },
      },
    });
  }
});

test("coach target application returns learner-safe clarification when the active class is unavailable", async () => {
  const result = await resolveCoachClassTarget({
    message: "Dame la clase",
    currentUnit: "Unit 4",
    context: {},
    readCurrentClassContent: async () => {
      throw new Error("English OS unavailable");
    },
  });

  expect(result.kind).toBe("needs_clarification");
  if (result.kind === "needs_clarification") {
    expect(result.reply).toContain("no tengo un numero de clase activo confiable");
    expect(result.reply).toContain("Dame la clase 2 de la unidad 4");
    expect(result.reply).not.toContain("viewing_current_class");
    expect(result.reply).not.toContain("Extract exact");
  }
});
