import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearLastFile,
  clearRecentFiles,
  describeStorageError,
  listRecentFiles,
  loadLastFile,
  loadRecentFile,
  recentKey,
  saveLastFile,
  saveRecentFile,
  type StoredFile,
} from "./fileStore";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const file = (name: string, text: string): StoredFile => ({ name, size: text.length, savedAt: 1_700_000_000_000, buffer: bytes(text) });

beforeEach(async () => {
  await clearLastFile();
});

describe("fileStore", () => {
  test("returns null when nothing has been saved", async () => {
    expect(await loadLastFile()).toBeNull();
  });

  test("round-trips the name, size, timestamp and exact bytes", async () => {
    await saveLastFile(file("plan.xer", "ERMHDR\t8.4\r\n%E"));
    const back = (await loadLastFile())!;
    expect(back.name).toBe("plan.xer");
    expect(back.size).toBe(14);
    expect(back.savedAt).toBe(1_700_000_000_000);
    expect(new TextDecoder().decode(back.buffer)).toBe("ERMHDR\t8.4\r\n%E");
  });

  test("keeps non-UTF-8 bytes untouched so encoding detection still works on restore", async () => {
    const cp1252 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer as ArrayBuffer; // "café"
    await saveLastFile({ name: "old.xer", size: 4, savedAt: 1, buffer: cp1252 });
    expect([...new Uint8Array((await loadLastFile())!.buffer)]).toEqual([0x63, 0x61, 0x66, 0xe9]);
  });

  test("only the most recent file is kept", async () => {
    await saveLastFile(file("first.xer", "one"));
    await saveLastFile(file("second.xer", "two"));
    expect((await loadLastFile())!.name).toBe("second.xer");
  });

  test("clearing forgets the file, and clearing twice is harmless", async () => {
    await saveLastFile(file("plan.xer", "data"));
    await clearLastFile();
    expect(await loadLastFile()).toBeNull();
    await clearLastFile();
    expect(await loadLastFile()).toBeNull();
  });

  test("handles a file far larger than localStorage allows", async () => {
    const big = new Uint8Array(20 * 1024 * 1024).fill(65).buffer as ArrayBuffer;
    await saveLastFile({ name: "big.xer", size: big.byteLength, savedAt: 1, buffer: big });
    expect((await loadLastFile())!.buffer.byteLength).toBe(20 * 1024 * 1024);
  });
});

describe("describeStorageError", () => {
  test("explains a full quota in plain language", () => {
    expect(describeStorageError(new DOMException("full", "QuotaExceededError"))).toMatch(/not enough browser storage/i);
  });
  test("falls back to the error message, then a generic one", () => {
    expect(describeStorageError(new Error("boom"))).toBe("boom");
    expect(describeStorageError("weird")).toBe("Couldn't remember this file.");
  });
});

describe("recently opened files", () => {
  const recent = (name: string, savedAt: number, size = 10) => ({ key: recentKey(name, size), name, size, savedAt, dataDate: null });

  beforeEach(async () => {
    await clearRecentFiles();
  });

  test("lists files newest first, with their bytes available separately", async () => {
    await saveRecentFile(recent("old.xer", 1), bytes("old"));
    await saveRecentFile(recent("new.xer", 2), bytes("new"));
    expect((await listRecentFiles()).map((f) => f.name)).toEqual(["new.xer", "old.xer"]);
    expect(new TextDecoder().decode((await loadRecentFile(recentKey("old.xer", 10)))!)).toBe("old");
    expect(await loadRecentFile("nothing")).toBeNull();
  });

  test("opening the same file again replaces its entry instead of adding a second one", async () => {
    await saveRecentFile(recent("plan.xer", 1), bytes("one"));
    await saveRecentFile(recent("plan.xer", 5), bytes("two"));
    const list = await listRecentFiles();
    expect(list).toHaveLength(1);
    expect(list[0]!.savedAt).toBe(5);
    expect(new TextDecoder().decode((await loadRecentFile(list[0]!.key))!)).toBe("two");
  });

  test("keeps only the five newest, and forgets the bytes of the rest", async () => {
    for (let i = 1; i <= 7; i++) await saveRecentFile(recent(`f${i}.xer`, i), bytes(`n${i}`));
    expect((await listRecentFiles()).map((f) => f.name)).toEqual(["f7.xer", "f6.xer", "f5.xer", "f4.xer", "f3.xer"]);
    expect(await loadRecentFile(recentKey("f1.xer", 10))).toBeNull();
  });

  test("drops older files once the total gets too large, but always keeps the newest", async () => {
    const mb = 1024 * 1024;
    await saveRecentFile(recent("a.xer", 1, 100 * mb), bytes("a"));
    await saveRecentFile(recent("b.xer", 2, 100 * mb), bytes("b"));
    await saveRecentFile(recent("c.xer", 3, 100 * mb), bytes("c"));
    expect((await listRecentFiles()).map((f) => f.name)).toEqual(["c.xer", "b.xer"]);
    await saveRecentFile(recent("huge.xer", 4, 400 * mb), bytes("h"));
    expect((await listRecentFiles()).map((f) => f.name)).toEqual(["huge.xer"]);
  });

  test("does not disturb the remembered last file", async () => {
    await saveLastFile(file("last.xer", "last"));
    await saveRecentFile(recent("x.xer", 1), bytes("x"));
    await clearRecentFiles();
    expect((await loadLastFile())!.name).toBe("last.xer");
  });
});
