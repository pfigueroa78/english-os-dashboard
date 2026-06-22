import { expect, test } from "@playwright/test";
import {
  DEFAULT_SIDEBAR_WIDTH,
  isCoachTextSize,
  nextCoachTextSize,
  resolveCoachSidebarWidthFromClientX,
} from "../../src/modules/coach-layout/application";

test("layout application exposes stable defaults and text-size transitions", () => {
  expect(DEFAULT_SIDEBAR_WIDTH).toBe(340);
  expect(nextCoachTextSize("normal", 1)).toBe("large");
  expect(nextCoachTextSize("normal", -1)).toBe("compact");
  expect(nextCoachTextSize("large", 1)).toBe("large");
  expect(nextCoachTextSize("compact", -1)).toBe("compact");
});

test("layout application validates text-size preferences", () => {
  expect(isCoachTextSize("compact")).toBe(true);
  expect(isCoachTextSize("normal")).toBe(true);
  expect(isCoachTextSize("large")).toBe(true);
  expect(isCoachTextSize("huge")).toBe(false);
  expect(isCoachTextSize(null)).toBe(false);
});

test("layout application clamps sidebar resize to responsive bounds", () => {
  expect(resolveCoachSidebarWidthFromClientX({ clientX: 120, viewportWidth: 1366 })).toBe(260);
  expect(resolveCoachSidebarWidthFromClientX({ clientX: 420, viewportWidth: 1366 })).toBe(420);
  expect(resolveCoachSidebarWidthFromClientX({ clientX: 900, viewportWidth: 1366 })).toBe(560);
  expect(resolveCoachSidebarWidthFromClientX({ clientX: 500, viewportWidth: 900 })).toBe(340);
});
