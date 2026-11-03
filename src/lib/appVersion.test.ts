import { describe, expect, test } from "bun:test";
import { parseVersion } from "./version";
import { APP_VERSION, describeBuild } from "./appVersion";

describe("describeBuild", () => {
  test("the app's version comes from package.json and is a valid YY.MAJOR.MINOR", () => {
    expect(parseVersion(APP_VERSION)).not.toBeNull();
  });

  test("says when it was built", () => {
    expect(describeBuild(new Date(2026, 10, 14, 12))).toBe(`Version ${APP_VERSION}, built 14 Nov 2026`);
  });

  test("a build with no date (the dev server) says so", () => {
    expect(describeBuild(null)).toBe(`Version ${APP_VERSION} (development build)`);
    expect(describeBuild(new Date("nonsense"))).toBe(`Version ${APP_VERSION} (development build)`);
  });
});
