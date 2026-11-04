import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHANGE_FIELDS,
  classify,
  DEFAULT_FIELDS,
  matchSchedules,
  orderByDataDate,
  type ChangeField,
  type Comparison,
  type CompareFields,
  type Matched,
} from "../lib/compare";
import { buildSchedule, listProjects, type Activity, type Project, type Schedule } from "../lib/xer/model";
import { readXerBuffer, type XerFile } from "../lib/xer/parse";
import { listRecentFiles, loadRecentFile, recentKey, type RecentFile } from "./fileStore";
import { rememberRecent } from "./recentFiles";
import { usePersistedBoolean } from "./usePersistedBoolean";
import { usePersistedStrings } from "./usePersistedStrings";

/** The kinds of change that can be switched on and off in the strip under the toolbar. */
export type ChipKind = "added" | "removed" | "modified";

export interface CompareSide {
  name: string;
  dataDate: number | null;
  schedule: Schedule;
}

interface OtherFile {
  name: string;
  size: number;
  xer: XerFile;
  projects: Project[];
}

export interface CompareApi {
  /** A second file is loaded and the schedule is showing the differences. */
  active: boolean;
  /** The file added for comparison, before it has been put in order. */
  file: Pick<OtherFile, "name" | "size" | "projects"> | null;
  projectId: string;
  onProject: (id: string) => void;
  /** Name of the file being read, if one is. */
  loading: string | null;
  error: string | null;
  recent: RecentFile[];
  openFile: (file: File) => void;
  openRecent: (file: RecentFile) => void;
  baseline: CompareSide | null;
  current: CompareSide | null;
  /** Which of the two is the file that was added for comparison (the other is the one open in the viewer). */
  addedSide: "baseline" | "current" | null;
  swap: () => void;
  matched: Matched | null;
  comparison: Comparison | null;
  /** The two files describe different projects, so few activities will pair up. */
  differentProject: boolean;
  fields: CompareFields;
  toggleField: (key: ChangeField) => void;
  chips: Record<ChipKind, boolean>;
  toggleChip: (kind: ChipKind) => void;
  showBaseline: boolean;
  setShowBaseline: (on: boolean) => void;
  showUnchanged: boolean;
  setShowUnchanged: (on: boolean) => void;
  /** Which activities the strip's chips leave in view; null when they leave everything. */
  visible: ((a: Activity) => boolean) | null;
  exit: () => void;
}

const ALL_CHIPS: Record<ChipKind, boolean> = { added: true, removed: true, modified: true };

/** A file with several projects is compared on the one that matches the open project, else the first. */
export function pickProject(projects: Project[], own: Pick<Project, "shortName" | "name"> | undefined): string {
  const match = own && (projects.find((p) => p.shortName === own.shortName) ?? projects.find((p) => p.name === own.name));
  return (match ?? projects[0])?.id ?? "";
}

/**
 * Comparing the open programme with another file. `own` is the schedule of the file that is open; the other file is added
 * from the Compare tools menu. Nothing is uploaded: the file is read and parsed here, like the first one.
 */
export function useCompare(own: Schedule | null, ownName: string, ownSize: number): CompareApi {
  const [other, setOther] = useState<OtherFile | null>(null);
  const [projectId, setProjectId] = useState("");
  const [swapped, setSwapped] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentAll, setRecentAll] = useState<RecentFile[]>([]);
  const [chips, setChips] = useState(ALL_CHIPS);
  const [enabled, setEnabled] = usePersistedStrings(
    "xerview-compare-fields",
    CHANGE_FIELDS.filter((f) => DEFAULT_FIELDS[f.key]).map((f) => f.key),
  );
  const [showBaseline, setShowBaseline] = usePersistedBoolean("xerview-compare-baseline-bars", true);
  const [showUnchanged, setShowUnchanged] = usePersistedBoolean("xerview-compare-unchanged", true);
  const ticket = useRef(0);
  const ownProject = useRef(own?.project);
  ownProject.current = own?.project;

  const refreshRecent = useCallback(() => {
    listRecentFiles().then(setRecentAll, () => setRecentAll([]));
  }, []);
  useEffect(refreshRecent, [refreshRecent]);

  const accept = useCallback(
    async (name: string, read: () => Promise<ArrayBuffer>, remember: boolean) => {
      const mine = ++ticket.current;
      setLoading(name);
      setError(null);
      try {
        const buffer = await read();
        await new Promise((resolve) => setTimeout(resolve, 0)); // let "Reading…" paint before the parse blocks the thread
        if (mine !== ticket.current) return;
        const xer = readXerBuffer(buffer);
        const projects = listProjects(xer);
        if (projects.length === 0) throw new Error("That file has no project to compare with.");
        setOther({ name, size: buffer.byteLength, xer, projects });
        setProjectId(pickProject(projects, ownProject.current));
        setSwapped(false);
        setChips(ALL_CHIPS);
        if (remember) void rememberRecent(name, buffer, xer).then(refreshRecent);
      } catch (e) {
        if (mine === ticket.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === ticket.current) setLoading(null);
      }
    },
    [refreshRecent],
  );

  const openFile = useCallback((file: File) => void accept(file.name, () => file.arrayBuffer(), true), [accept]);
  const openRecent = useCallback(
    (file: RecentFile) =>
      void accept(
        file.name,
        async () => {
          const buffer = await loadRecentFile(file.key);
          if (!buffer) throw new Error("That file is no longer stored in this browser.");
          return buffer;
        },
        false,
      ),
    [accept],
  );

  const otherSchedule = useMemo(() => {
    if (!other || !projectId) return null;
    try {
      return buildSchedule(other.xer, projectId);
    } catch {
      return null;
    }
  }, [other, projectId]);

  const sides = useMemo(() => {
    if (!own || !other || !otherSchedule) return null;
    const mine: CompareSide = { name: ownName, dataDate: own.project.dataDate, schedule: own };
    const theirs: CompareSide = { name: other.name, dataDate: otherSchedule.project.dataDate, schedule: otherSchedule };
    // The file with the earlier data date is the baseline; "swap" reverses whatever that gave.
    let [older, newer] = orderByDataDate(theirs, mine);
    if (swapped) [older, newer] = [newer, older];
    return { baseline: older, current: newer, added: older === theirs ? ("baseline" as const) : ("current" as const) };
  }, [own, ownName, other, otherSchedule, swapped]);

  const matched = useMemo(() => (sides ? matchSchedules(sides.baseline.schedule, sides.current.schedule) : null), [sides]);

  const fields = useMemo(
    () => Object.fromEntries(CHANGE_FIELDS.map((f) => [f.key, enabled.includes(f.key)])) as CompareFields,
    [enabled],
  );
  const comparison = useMemo(() => (matched ? classify(matched, fields) : null), [matched, fields]);

  const allChips = chips.added && chips.removed && chips.modified;
  const visible = useMemo(() => {
    if (!comparison || (allChips && showUnchanged)) return null;
    const { changes } = comparison;
    return (a: Activity) => {
      const kind = changes.get(a.id)?.kind;
      if (!kind) return true;
      return kind === "unchanged" ? showUnchanged && allChips : chips[kind];
    };
  }, [comparison, allChips, showUnchanged, chips]);

  const toggleChip = useCallback((kind: ChipKind) => {
    setChips((c) => {
      const next = { ...c, [kind]: !c[kind] };
      // Nothing switched on would be an empty schedule; treat it as "show everything" instead.
      return next.added || next.removed || next.modified ? next : ALL_CHIPS;
    });
  }, []);

  const toggleField = useCallback(
    (key: ChangeField) => setEnabled((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])),
    [setEnabled],
  );

  const exit = useCallback(() => {
    ticket.current++;
    setOther(null);
    setSwapped(false);
    setChips(ALL_CHIPS);
    setLoading(null);
    setError(null);
  }, []);

  const recent = useMemo(
    () =>
      recentAll.filter(
        (r) => r.key !== recentKey(ownName, ownSize) && !(other && r.key === recentKey(other.name, other.size)),
      ),
    [recentAll, ownName, ownSize, other],
  );

  return {
    active: matched !== null && comparison !== null,
    file: other,
    projectId,
    onProject: setProjectId,
    loading,
    error,
    recent,
    openFile,
    openRecent,
    baseline: sides?.baseline ?? null,
    current: sides?.current ?? null,
    addedSide: sides?.added ?? null,
    swap: () => setSwapped((s) => !s),
    matched,
    comparison,
    differentProject: sides !== null && sides.baseline.schedule.project.shortName !== sides.current.schedule.project.shortName,
    fields,
    toggleField,
    chips,
    toggleChip,
    showBaseline,
    setShowBaseline,
    showUnchanged,
    setShowUnchanged,
    visible,
    exit,
  };
}
