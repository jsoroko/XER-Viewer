import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";
import { clearLastFile, describeStorageError, loadLastFile, saveLastFile, type StoredFile } from "./fileStore";

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
