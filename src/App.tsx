import { useCallback, useEffect, useMemo, useState } from "react";
import { Overview } from "./components/Overview";
import { Schedule } from "./components/Schedule";
import { TablesView } from "./components/TablesView";
import { TopBar, type Tab } from "./components/TopBar";
import { Welcome } from "./components/Welcome";
import { buildSchedule, listProjects } from "./lib/xer/model";
import { useTheme } from "./state/useTheme";
import { useXerFile } from "./state/useXerFile";

export function App() {
  const { state, restoring, storageNotice, loadFile, loadSample, reset } = useXerFile();
  const { theme, toggle } = useTheme();
  const dragging = useFileDrop(loadFile);

  return (
    <div className="flex h-full flex-col">
      {state.status === "ready" ? (
        <Viewer
          key={state.name + state.parseMs}
          state={state}
          onOpen={loadFile}
          onClose={reset}
          storageNotice={storageNotice}
          theme={theme}
          onToggleTheme={toggle}
        />
      ) : (
        <Welcome
          loading={restoring ? "restoring" : state.status === "loading" ? "parsing" : null}
          error={state.status === "error" ? { name: state.name, message: state.message } : null}
          onFile={loadFile}
          onSample={loadSample}
        />
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-600/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-blue-500 bg-white px-8 py-6 text-lg font-medium shadow-lg dark:bg-slate-900">
            Drop to open
          </div>
        </div>
      )}
    </div>
  );
}

function Viewer({
  state,
  onOpen,
  onClose,
  storageNotice,
  theme,
  onToggleTheme,
}: {
  state: Extract<ReturnType<typeof useXerFile>["state"], { status: "ready" }>;
  onOpen: (file: File) => void;
  onClose: () => void;
  storageNotice: string | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const { xer } = state;
  const projects = useMemo(() => listProjects(xer), [xer]);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableRequest, setTableRequest] = useState<{ name: string; nonce: number } | null>(null);

  const schedule = useMemo(() => (projectId ? buildSchedule(xer, projectId) : null), [xer, projectId]);

  const changeProject = useCallback((id: string) => {
    setProjectId(id);
    setSelectedId(null);
  }, []);

  const openActivity = useCallback((id: string) => {
    setSelectedId(id);
    setTab("schedule");
  }, []);

  const openTable = useCallback((name: string) => {
    setTableRequest((r) => ({ name, nonce: (r?.nonce ?? 0) + 1 }));
    setTab("tables");
  }, []);

  return (
    <>
      <TopBar
        fileName={state.name}
        fileSize={state.size}
        projects={projects}
        projectId={projectId}
        onProject={changeProject}
        tab={tab}
        onTab={setTab}
        onOpen={onOpen}
        onClose={onClose}
        storageNotice={storageNotice}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="min-h-0 flex-1">
        {/* All views stay mounted so scroll position and filters survive tab switches. */}
        <div className="h-full" hidden={tab !== "overview"}>
          {schedule ? (
            <Overview xer={xer} schedule={schedule} parseMs={state.parseMs} onOpenActivity={openActivity} onOpenTable={openTable} />
          ) : (
            <NoProject onOpenTable={openTable} />
          )}
        </div>
        <div className="h-full" hidden={tab !== "schedule"}>
          {schedule ? (
            <Schedule schedule={schedule} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <NoProject onOpenTable={openTable} />
          )}
        </div>
        <div className="h-full" hidden={tab !== "tables"}>
          <TablesView xer={xer} requested={tableRequest} />
        </div>
      </main>
    </>
  );
}

function NoProject({ onOpenTable }: { onOpenTable: (name: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-600 dark:text-slate-400">
      <p>This file has no PROJECT table, so there is no schedule to draw.</p>
      <button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={() => onOpenTable("")}>
        Browse the raw tables instead
      </button>
    </div>
  );
}

/** Window-wide drag & drop; returns true while a file is being dragged over the page. */
function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [onFile]);

  return dragging;
}
