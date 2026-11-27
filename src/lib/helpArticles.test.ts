import { describe, expect, test } from "bun:test";
import { HELP_ARTICLES, HELP_ICON_IDS, HELP_VIEWS, articleById, articlesFor, nextArticle, parseHelpText, plainHelpText, searchHelp } from "./helpArticles";
import { SHORTCUTS } from "./shortcuts";

const textsOf = (a: (typeof HELP_ARTICLES)[number]) => [a.summary, ...a.steps, a.tip ?? ""];

describe("the articles", () => {
  test("have unique ids", () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("only point at articles that exist", () => {
    for (const a of HELP_ARTICLES) for (const id of a.see ?? []) expect(articleById(id), `${a.id} -> ${id}`).toBeDefined();
  });

  test("only use markers that mean something", () => {
    for (const a of HELP_ARTICLES)
      for (const text of [...textsOf(a), a.title]) {
        for (const p of parseHelpText(text)) {
          if (p.kind === "icon") expect(HELP_ICON_IDS as readonly string[], `${a.id}: ${p.id}`).toContain(p.id);
          if (p.kind === "key") expect(SHORTCUTS, `${a.id}: ${p.id}`).toHaveProperty(p.id);
        }
        expect(plainHelpText(text), `${a.id}: a marker was not understood`).not.toMatch(/[{}]|\*\*/);
      }
  });

  test("name real shortcuts and have at least one step", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.steps.length, a.id).toBeGreaterThan(0);
      for (const k of a.keys ?? []) expect(SHORTCUTS, `${a.id}: ${k}`).toHaveProperty(k);
    }
  });

  test("every view has something, and the tools have something for Show me to ring", () => {
    for (const v of HELP_VIEWS) expect(articlesFor(v.id).length, v.id).toBeGreaterThan(0);
    for (const a of HELP_ARTICLES.filter((x) => x.strip)) expect(a.target?.length ?? 0, a.id).toBeGreaterThan(0);
  });
});

describe("nextArticle", () => {
  test("follows the order of the view and stops at its end", () => {
    const schedule = articlesFor("schedule");
    expect(nextArticle(schedule[0]!.id)).toBe(schedule[1]!);
    expect(nextArticle(schedule[schedule.length - 1]!.id)).toBeUndefined();
    expect(nextArticle("nonsense")).toBeUndefined();
  });
});

describe("parseHelpText", () => {
  test("splits text, bold, icons, shortcuts and keys", () => {
    expect(parseHelpText("Press {icon:trace} or {key:print}, then **Done**, then {kbd:Esc}.")).toEqual([
      { kind: "text", text: "Press " },
      { kind: "icon", id: "trace" },
      { kind: "text", text: " or " },
      { kind: "key", id: "print" },
      { kind: "text", text: ", then " },
      { kind: "bold", text: "Done" },
      { kind: "text", text: ", then " },
      { kind: "kbd", text: "Esc" },
      { kind: "text", text: "." },
    ]);
  });
  test("leaves plain text alone", () => {
    expect(parseHelpText("Nothing special")).toEqual([{ kind: "text", text: "Nothing special" }]);
    expect(parseHelpText("")).toEqual([]);
  });
  test("plain text drops the icons and spells out the shortcuts", () => {
    expect(plainHelpText("Press {icon:trace} to **trace** ({key:print}) {kbd:Esc}")).toBe(`Press  to trace (${SHORTCUTS.print.label}) Esc`);
  });
});

describe("searchHelp", () => {
  test("finds by a word in the title, a step or the summary", () => {
    expect(searchHelp("trace").map((a) => a.id)[0]).toBe("trace");
    expect(searchHelp("weekends").map((a) => a.id)).toContain("switches");
    expect(searchHelp("csv").map((a) => a.id)).toEqual(expect.arrayContaining(["tables-export", "trace"]));
  });
  test("matches the start of a word, and ignores case", () => {
    expect(searchHelp("COL").map((a) => a.id)).toContain("columns");
  });
  test("needs every word", () => {
    expect(searchHelp("zoom nonsenseword")).toEqual([]);
    expect(searchHelp("zoom fit").map((a) => a.id)).toContain("zoom");
  });
  test("puts title matches first, and finds nothing for nothing", () => {
    const ids = searchHelp("print").map((a) => a.id);
    expect(ids[0]).toBe("print");
    expect(searchHelp("   ")).toEqual([]);
  });
});
