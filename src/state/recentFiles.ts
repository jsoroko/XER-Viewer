import { listProjects } from "../lib/xer/model";
import type { XerFile } from "../lib/xer/parse";
import { recentKey, saveRecentFile } from "./fileStore";

/** Adds a file that has just been read to the recently opened list. Never throws: the list is a convenience. */
export async function rememberRecent(name: string, buffer: ArrayBuffer, xer: XerFile): Promise<void> {
  try {
    await saveRecentFile(
      {
        key: recentKey(name, buffer.byteLength),
        name,
        size: buffer.byteLength,
        savedAt: Date.now(),
        dataDate: listProjects(xer)[0]?.dataDate ?? null,
      },
      buffer,
    );
  } catch {
    // storage unavailable or full: the file just won't be in the list
  }
}
