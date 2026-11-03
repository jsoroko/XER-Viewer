/**
 * The app's version is `YY.MAJOR.MINOR`, held in package.json: the two-digit year, then a major and a minor release
 * counter that both start again each January. The first release of a year is always `YY.1.0`.
 *
 * - major: a significant new capability or redesign (minor goes back to 0)
 * - minor: a smaller feature, improvement or fix
 */
export type ReleaseKind = "major" | "minor";

export interface Version {
  year: number;
  major: number;
  minor: number;
}

export function parseVersion(text: string): Version | null {
  const m = /^(\d{2})\.(\d+)\.(\d+)$/.exec(text.trim());
  return m ? { year: Number(m[1]), major: Number(m[2]), minor: Number(m[3]) } : null;
}

export const formatVersion = (v: Version) => `${String(v.year).padStart(2, "0")}.${v.major}.${v.minor}`;

/** The version after `current` for a release made in `year` (a full year, e.g. 2026). A new year restarts at YY.1.0 whatever the kind. */
export function nextVersion(current: Version, kind: ReleaseKind, year: number): Version {
  const yy = year % 100;
  if (current.year !== yy) return { year: yy, major: 1, minor: 0 };
  return kind === "major" ? { year: yy, major: current.major + 1, minor: 0 } : { year: yy, major: current.major, minor: current.minor + 1 };
}
