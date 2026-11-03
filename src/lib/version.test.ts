import { describe, expect, test } from "bun:test";
import { formatVersion, nextVersion, parseVersion } from "./version";

describe("parseVersion and formatVersion", () => {
  test("round-trip YY.MAJOR.MINOR", () => {
    expect(parseVersion("26.2.10")).toEqual({ year: 26, major: 2, minor: 10 });
    expect(formatVersion({ year: 26, major: 2, minor: 10 })).toBe("26.2.10");
    expect(formatVersion({ year: 5, major: 1, minor: 0 })).toBe("05.1.0");
  });

  test("anything else is not a version", () => {
    for (const bad of ["", "0.1.0", "2026.1.0", "26.1", "26.1.0.1", "v26.1.0", "26.a.0"]) expect(parseVersion(bad)).toBeNull();
  });
});

describe("nextVersion", () => {
  const v = (year: number, major: number, minor: number) => ({ year, major, minor });

  test("minor adds one to minor", () => {
    expect(nextVersion(v(26, 2, 3), "minor", 2026)).toEqual(v(26, 2, 4));
  });

  test("major adds one to major and restarts minor", () => {
    expect(nextVersion(v(26, 2, 3), "major", 2026)).toEqual(v(26, 3, 0));
  });

  test("a new year restarts at YY.1.0, whichever kind it is", () => {
    expect(nextVersion(v(26, 4, 7), "minor", 2027)).toEqual(v(27, 1, 0));
    expect(nextVersion(v(26, 4, 7), "major", 2027)).toEqual(v(27, 1, 0));
  });

  test("a year that has not changed does not restart", () => {
    expect(nextVersion(v(27, 1, 0), "minor", 2027)).toEqual(v(27, 1, 1));
  });
});
