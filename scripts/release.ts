// Usage: bun run release <major|minor> [--dry-run]
//
// Works out the next version (see src/lib/version.ts), writes it to package.json, adds an entry to CHANGELOG.md listing
// the commits since the last release, then commits and tags it. Commit your changes first: it refuses to run on a
// dirty tree. It never pushes; it prints the command to do that.
import { formatVersion, nextVersion, parseVersion, type ReleaseKind } from "../src/lib/version";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const kind = args.find((a) => a === "major" || a === "minor") as ReleaseKind | undefined;
if (!kind) {
  console.error("Usage: bun run release <major|minor> [--dry-run]");
  process.exit(1);
}

const sh = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
};
const must = (cmd: string[]) => {
  const r = sh(cmd);
  if (!r.ok) {
    console.error(`${cmd.join(" ")} failed: ${r.err}`);
    process.exit(1);
  }
  return r.out;
};

if (!dry && must(["git", "status", "--porcelain"])) {
  console.error("There are uncommitted changes. Commit them first, then release.");
  process.exit(1);
}

const pkgText = await Bun.file("package.json").text();
const current = parseVersion(JSON.parse(pkgText).version);
if (!current) {
  console.error("package.json's version isn't YY.MAJOR.MINOR.");
  process.exit(1);
}
const now = new Date();
const next = formatVersion(nextVersion(current, kind, now.getFullYear()));

const lastTag = sh(["git", "describe", "--tags", "--abbrev=0"]);
const range = lastTag.ok ? `${lastTag.out}..HEAD` : "HEAD";
const subjects = must(["git", "log", range, "--pretty=%s"])
  .split("\n")
  .filter((s) => s && !/^Release \d/.test(s));

const date = now.toISOString().slice(0, 10);
const entry = `## ${next} (${date})\n\n${subjects.length ? subjects.map((s) => `- ${s}`).join("\n") : "- No changes recorded."}\n\n`;

console.log(`${formatVersion(current)} -> ${next}  (${kind})\n\n${entry}`);
if (dry) process.exit(0);

await Bun.write("package.json", pkgText.replace(/("version":\s*)"[^"]*"/, `$1"${next}"`));
const log = (await Bun.file("CHANGELOG.md").exists()) ? await Bun.file("CHANGELOG.md").text() : "# Changelog\n\n";
const at = log.indexOf("\n## ");
await Bun.write("CHANGELOG.md", at < 0 ? `${log.trimEnd()}\n\n${entry}` : `${log.slice(0, at + 1)}${entry}${log.slice(at + 1)}`);

must(["git", "add", "package.json", "CHANGELOG.md"]);
must(["git", "commit", "-m", `Release ${next}`]);
// Annotated, so that `git push --follow-tags` sends it.
must(["git", "tag", "-a", `v${next}`, "-m", `Release ${next}`]);
console.log(`Released ${next}. Push it with:\n  git push origin main --follow-tags`);
