import { version } from "../../package.json";

/** Set by build.ts to when the build was made; not defined under the dev server. */
declare const __BUILD_DATE__: string | undefined;

export const APP_VERSION: string = version;
export const BUILD_DATE: Date | null = typeof __BUILD_DATE__ === "string" ? new Date(__BUILD_DATE__) : null;

/** What the version's tooltip says, e.g. "Version 26.1.0, built 14 Nov 2026". */
export function describeBuild(built: Date | null = BUILD_DATE): string {
  if (!built || Number.isNaN(built.getTime())) return `Version ${APP_VERSION} (development build)`;
  const date = built.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `Version ${APP_VERSION}, built ${date}`;
}
