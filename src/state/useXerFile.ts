import { useCallback, useEffect, useRef, useState } from "react";
import { decodeXer, parseXer, XerParseError, type XerFile } from "../lib/xer/parse";
import { clearLastFile, describeStorageError, loadLastFile, saveLastFile, type StoredFile } from "./fileStore";

export type LoadState =
  | { status: "idle" }
  | { status: "loading"; name: string }
  | { status: "error"; name: string; message: string }
  | { status: "ready"; name: string; size: number; xer: XerFile; parseMs: number };

type Source = { buffer: ArrayBuffer } | { text: string };
type Outcome = "ok" | "error" | "superseded";

// Let the browser paint the "Parsing…" state before the synchronous parse blocks the thread.
// requestAnimationFrame never fires in a hidden tab, so a timer backs it up rather than leaving the load hanging.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 100);
  });

export function useXerFile() {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  /** True until we know whether there is a remembered file to reopen. */
  const [restoring, setRestoring] = useState(true);
  /** Set when the file opened fine but couldn't be remembered. */
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  // Every load and reset takes a ticket; a slower operation whose ticket has been overtaken drops its result.
  const ticket = useRef(0);

  const load = useCallback(async (name: string, read: () => Promise<Source>, remember = false): Promise<Outcome> => {
    const mine = ++ticket.current;
    setState({ status: "loading", name });
    setStorageNotice(null);
    try {
      const source = await read();
      await nextFrame();
      if (mine !== ticket.current) return "superseded";

      const t0 = performance.now();
      const text = "text" in source ? source.text : decodeXer(source.buffer);
      const xer = parseXer(text);
      if (!xer.tables.has("TASK") && !xer.tables.has("PROJECT")) {
        throw new XerParseError("The file has an XER header but contains no PROJECT or TASK data.");
      }
      const size = "text" in source ? new Blob([text]).size : source.buffer.byteLength;
      setState({ status: "ready", name, size, xer, parseMs: performance.now() - t0 });

      if (remember && "buffer" in source) {
        saveLastFile({ name, size, savedAt: Date.now(), buffer: source.buffer }).catch(async (e) => {
          // A failed write leaves the previous record in place; drop it so a reload can't bring back the wrong file.
          await clearLastFile().catch(() => {});
          if (mine === ticket.current) setStorageNotice(describeStorageError(e));
        });
      }
      return "ok";
    } catch (e) {
      if (mine !== ticket.current) return "superseded";
      setState({ status: "error", name, message: e instanceof Error ? e.message : String(e) });
      return "error";
    }
  }, []);

  // Reopen the remembered file on first load.
  const restoreStarted = useRef(false);
  useEffect(() => {
    if (restoreStarted.current) return; // StrictMode runs effects twice in development
    restoreStarted.current = true;
    const before = ticket.current;
    (async () => {
      let stored: StoredFile | null = null;
      try {
        stored = await loadLastFile();
      } catch {
        // Storage unavailable (private mode, blocked): just start empty.
      }
      // If the user already opened something while we were reading storage, theirs wins.
      if (stored && ticket.current === before) {
        const { name, buffer } = stored;
        const outcome = await load(name, async () => ({ buffer }));
        if (outcome === "error") await clearLastFile().catch(() => {}); // don't retry a file that can't be read
      }
      setRestoring(false);
    })();
  }, [load]);

  const loadFile = useCallback(
    (file: File) => load(file.name, async () => ({ buffer: await file.arrayBuffer() }), true),
    [load],
  );

  // The bundled sample is never remembered; a reload goes back to your last real file.
  const loadSample = useCallback(
    () =>
      load("sample.xer", async () => {
        const { default: text } = await import("../sample/sample.xer", { with: { type: "text" } });
        return { text };
      }),
    [load],
  );

  /** Closes the file and forgets it on this device. */
  const reset = useCallback(() => {
    ticket.current++;
    setState({ status: "idle" });
    setStorageNotice(null);
    clearLastFile().catch(() => {});
  }, []);

  return { state, restoring, storageNotice, loadFile, loadSample, reset };
}
