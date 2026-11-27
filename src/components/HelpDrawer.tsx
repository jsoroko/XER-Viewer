import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCalendarDays,
  LuChevronRight,
  LuChevronsUpDown,
  LuColumns3,
  LuCrosshair,
  LuDownload,
  LuFilter,
  LuFolderOpen,
  LuGitCompare,
  LuInfo,
  LuKeyboard,
  LuLayoutDashboard,
  LuLightbulb,
  LuListTree,
  LuMaximize,
  LuMinus,
  LuPlus,
  LuPrinter,
  LuRoute,
  LuRows3,
  LuSearch,
  LuSettings,
  LuTable,
  LuTarget,
  LuToggleRight,
  LuX,
  LuZoomIn,
} from "react-icons/lu";
import {
  HELP_VIEWS,
  HELP_VIEW_LABEL,
  articleById,
  articlesFor,
  nextArticle,
  parseHelpText,
  searchHelp,
  type HelpArticle,
  type HelpIconId,
  type HelpView,
} from "../lib/helpArticles";
import { SHORTCUTS, formatShortcut, modalOpen } from "../lib/shortcuts";
import type { Tab } from "./TopBar";
import { Kbd, buttonClass, iconButtonClass, inputClass } from "./ui";
import { useWindowKeys } from "./useWindowKeys";

const ICONS: Record<HelpIconId, IconType> = {
  start: LuFolderOpen,
  settings: LuSettings,
  keyboard: LuKeyboard,
  overview: LuLayoutDashboard,
  search: LuSearch,
  filter: LuFilter,
  calendar: LuCalendarDays,
  groups: LuChevronsUpDown,
  wbs: LuListTree,
  columns: LuColumns3,
  trace: LuRoute,
  compare: LuGitCompare,
  switches: LuToggleRight,
  legend: LuInfo,
  zoom: LuZoomIn,
  fit: LuMaximize,
  minus: LuMinus,
  plus: LuPlus,
  target: LuTarget,
  print: LuPrinter,
  rows: LuRows3,
  table: LuTable,
  download: LuDownload,
};

/** A tool's icon in a small tile, as it is in the toolbar, so the help and the toolbar can be matched by eye. */
function IconChip({ id, size = 13, inline = true }: { id: HelpIconId; size?: number; inline?: boolean }) {
  const Icon = ICONS[id];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 ${inline ? "mx-0.5 size-5 align-[-5px]" : "size-7"}`}
    >
      <Icon size={size} aria-hidden />
    </span>
  );
}

/** Text with its markers turned into bold, icon tiles and keys (see lib/helpArticles.ts). */
function HelpText({ text }: { text: string }) {
  return (
    <>
      {parseHelpText(text).map((p, i) => {
        switch (p.kind) {
          case "text":
            return <span key={i}>{p.text}</span>;
          case "bold":
            return (
              <strong key={i} className="font-medium text-slate-900 dark:text-slate-100">
                {p.text}
              </strong>
            );
          case "icon":
            return <IconChip key={i} id={p.id} />;
          case "key":
            return <Kbd key={i}>{formatShortcut(SHORTCUTS[p.id])}</Kbd>;
          case "kbd":
            return <Kbd key={i}>{p.text}</Kbd>;
        }
      })}
    </>
  );
}

const caption = "mb-1 mt-4 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40";

function ArticleRow({ article, onOpen, showView = false }: { article: HelpArticle; onOpen: (id: string) => void; showView?: boolean }) {
  return (
    <button
      type="button"
      data-help-item
      onClick={() => onOpen(article.id)}
      className={`flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${focusRing}`}
    >
      <IconChip id={article.icon} size={15} inline={false} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-900 dark:text-slate-100">{article.title}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {showView && `${HELP_VIEW_LABEL[article.view]} · `}
          {article.summary}
        </span>
      </span>
      <LuChevronRight size={14} aria-hidden className="shrink-0 text-slate-400" />
    </button>
  );
}

type Page = { kind: "home" } | { kind: "article"; id: string };
/** The view whose tools the home page lists, when it is not the one you are in; it is forgotten when you change view. */
type Picked = { tab: Tab; view: HelpView } | null;

interface Props {
  /** The view showing behind the panel: help opens on its tools. */
  tab: Tab;
  onTab: (tab: Tab) => void;
  onClose: () => void;
  /** Opens the list of keyboard shortcuts. */
  onShortcuts: () => void;
}

/**
 * Help, in a panel at the right of the page that leaves the chart in view. It opens on the tools of the view you are in,
 * with a strip of their icons, a search box, and one article per tool (lib/helpArticles.ts). An article's "Show me" button
 * steps the panel aside and rings the real control until you press Back or Esc.
 */
export function HelpDrawer({ tab, onTab, onClose, onShortcuts }: Props) {
  const [page, setPage] = useState<Page>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked>(null);
  const [showing, setShowing] = useState<HelpArticle | null>(null);

  // Focus goes back to where it was when Help closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);

  const show = (article: HelpArticle) => {
    if (article.view !== "general" && article.view !== tab) onTab(article.view);
    setShowing(article);
  };

  if (showing) return <ShowMe article={showing} onBack={() => setShowing(null)} />;
  return (
    <HelpPanel
      tab={tab}
      page={page}
      setPage={setPage}
      query={query}
      setQuery={setQuery}
      picked={picked}
      setPicked={setPicked}
      onClose={onClose}
      onShow={show}
      onShortcuts={onShortcuts}
    />
  );
}

function HelpPanel({
  tab,
  page,
  setPage,
  query,
  setQuery,
  picked,
  setPicked,
  onClose,
  onShow,
  onShortcuts,
}: {
  tab: Tab;
  page: Page;
  setPage: (p: Page) => void;
  query: string;
  setQuery: (q: string) => void;
  picked: Picked;
  setPicked: (p: Picked) => void;
  onClose: () => void;
  onShow: (a: HelpArticle) => void;
  onShortcuts: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const article = page.kind === "article" ? articleById(page.id) : undefined;

  // The panel opens with the cursor in the search box; an article takes the focus to its title, so a screen reader starts there.
  useEffect(() => {
    if (article) titleRef.current?.focus();
    else searchRef.current?.focus();
  }, [article]);

  const open = (id: string) => setPage({ kind: "article", id });

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (e.target === searchRef.current && query) setQuery("");
      else onClose();
      return;
    }
    // Arrow keys step between the search box and the list.
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-help-item]"));
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (document.activeElement === searchRef.current ? e.key === "ArrowDown" && items.length > 0 : at >= 0) {
        e.preventDefault();
        const next = at + (e.key === "ArrowDown" ? 1 : -1);
        if (next < 0) searchRef.current?.focus();
        else items[Math.min(next, items.length - 1)]?.focus();
      }
    }
  };

  return (
    <aside
      aria-label="Help"
      onKeyDown={onKeyDown}
      className="flex min-h-0 w-80 shrink-0 flex-col border-l border-slate-200 bg-white max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-12 max-md:z-40 max-md:w-auto dark:border-slate-800 dark:bg-slate-900"
    >
      {article ? (
        <ArticleView article={article} titleRef={titleRef} onHome={() => setPage({ kind: "home" })} onOpen={open} onClose={onClose} onShow={onShow} onShortcuts={onShortcuts} />
      ) : (
        <Home tab={tab} query={query} setQuery={setQuery} picked={picked} setPicked={setPicked} searchRef={searchRef} onOpen={open} onClose={onClose} />
      )}
    </aside>
  );
}

function Header({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
      {children}
      <button type="button" className={`${iconButtonClass} ml-auto h-7 w-7`} aria-label="Close Help" title="Close Help (Esc)" onClick={onClose}>
        <LuX size={15} aria-hidden />
      </button>
    </div>
  );
}

function Home({
  tab,
  query,
  setQuery,
  picked,
  setPicked,
  searchRef,
  onOpen,
  onClose,
}: {
  tab: Tab;
  query: string;
  setQuery: (q: string) => void;
  picked: Picked;
  setPicked: (p: Picked) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  // The view whose tools are listed follows the tab you are in, until you pick another one here.
  const view: HelpView = picked && picked.tab === tab ? picked.view : tab;
  const tools = useMemo(() => articlesFor(view), [view]);
  const strip = tools.filter((a) => a.strip);
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim() !== "";

  return (
    <>
      <Header onClose={onClose}>
        <h2 className="text-sm font-semibold">Help</h2>
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        <div className="relative">
          <LuSearch size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search Help"
            placeholder="Search Help…"
            className={`${inputClass} w-full pl-8 [&::-webkit-search-cancel-button]:appearance-none`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0] && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onOpen(results[0].id);
              }
            }}
          />
        </div>

        {searching ? (
          <>
            <p className={caption} aria-live="polite">
              {results.length === 0 ? "No match" : `${results.length} ${results.length === 1 ? "topic" : "topics"}`}
            </p>
            {results.length === 0 ? (
              <p className="px-1 text-sm text-slate-500 dark:text-slate-400">Nothing in Help mentions “{query.trim()}”. Try a shorter word, such as the name of a button.</p>
            ) : (
              results.map((a) => <ArticleRow key={a.id} article={a} onOpen={onOpen} showView />)
            )}
          </>
        ) : (
          <>
            <div role="group" aria-label="Show Help for" className="mt-3 flex overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-600">
              {HELP_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  onClick={() => setPicked({ tab, view: v.id })}
                  className={`flex-1 border-l border-slate-300 py-1 first:border-l-0 dark:border-slate-600 ${focusRing} focus-visible:ring-inset ${
                    view === v.id ? "bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400">{view === tab ? `You are in ${HELP_VIEW_LABEL[tab]}.` : `Not the view you are in (${HELP_VIEW_LABEL[tab]}).`}</p>

            {strip.length >= 3 && (
              <>
                <p className={caption}>The toolbar at a glance</p>
                <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
                  {strip.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      data-help-item
                      title={a.title}
                      aria-label={a.title}
                      onClick={() => onOpen(a.id)}
                      className={`flex size-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${focusRing}`}
                    >
                      {(() => {
                        const Icon = ICONS[a.icon];
                        return <Icon size={17} aria-hidden />;
                      })()}
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className={caption}>{HELP_VIEW_LABEL[view]}</p>
            {tools.map((a) => (
              <ArticleRow key={a.id} article={a} onOpen={onOpen} />
            ))}

            <p className={caption}>General</p>
            {articlesFor("general").map((a) => (
              <ArticleRow key={a.id} article={a} onOpen={onOpen} />
            ))}
          </>
        )}
      </div>
      <div className="shrink-0 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Open or close Help anywhere with <Kbd>{formatShortcut(SHORTCUTS.help)}</Kbd>
      </div>
    </>
  );
}

function ArticleView({
  article,
  titleRef,
  onHome,
  onOpen,
  onClose,
  onShow,
  onShortcuts,
}: {
  article: HelpArticle;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onHome: () => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  onShow: (a: HelpArticle) => void;
  onShortcuts: () => void;
}) {
  const next = nextArticle(article.id);
  const related = (article.see ?? []).map((id) => articleById(id)).filter((a): a is HelpArticle => a !== undefined);
  return (
    <>
      <Header onClose={onClose}>
        <button type="button" className={`${iconButtonClass} h-7 w-7`} aria-label="Back to all topics" title="Back to all topics" onClick={onHome}>
          <LuArrowLeft size={15} aria-hidden />
        </button>
        <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">Help / {HELP_VIEW_LABEL[article.view]}</span>
      </Header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <h2 ref={titleRef} tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none dark:text-slate-100">
          {article.title}
        </h2>
        <p className="mt-0.5 text-slate-500 dark:text-slate-400">{article.summary}</p>

        <ol className="mt-3 space-y-2.5">
          {article.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-medium text-accent-700 dark:bg-accent-950 dark:text-accent-300">
                {i + 1}
              </span>
              <span className="min-w-0">
                <HelpText text={s} />
              </span>
            </li>
          ))}
        </ol>

        {article.tip && (
          <p className="mt-3 flex gap-2 rounded-md bg-slate-100 px-2.5 py-2 text-xs dark:bg-slate-800">
            <LuLightbulb size={14} aria-hidden className="mt-px shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <HelpText text={article.tip} />
            </span>
          </p>
        )}

        {article.keys && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-xs">
            {article.keys.map((k) => (
              <div key={k} className="contents">
                <dt>
                  <Kbd>{formatShortcut(SHORTCUTS[k])}</Kbd>
                </dt>
                <dd>{SHORTCUTS[k].label}</dd>
              </div>
            ))}
          </dl>
        )}

        {(article.target || article.action) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {article.target && (
              <button
                type="button"
                onClick={() => onShow(article)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              >
                <LuCrosshair size={14} aria-hidden />
                Show me
              </button>
            )}
            {article.action === "shortcuts" && (
              <button type="button" className={buttonClass} onClick={onShortcuts}>
                <LuKeyboard size={14} aria-hidden />
                Open the shortcut list
              </button>
            )}
          </div>
        )}

        {related.length > 0 && (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            See also:{" "}
            {related.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <button type="button" onClick={() => onOpen(a.id)} className={`rounded text-accent-700 hover:underline dark:text-accent-400 ${focusRing}`}>
                  {a.title}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
        <button type="button" onClick={onHome} className={`rounded text-slate-600 hover:underline dark:text-slate-300 ${focusRing}`}>
          All topics
        </button>
        {next && (
          <button type="button" onClick={() => onOpen(next.id)} className={`inline-flex min-w-0 items-center gap-1 rounded text-accent-700 hover:underline dark:text-accent-400 ${focusRing}`}>
            <span className="truncate">Next: {next.title}</span>
            <LuArrowRight size={13} aria-hidden className="shrink-0" />
          </button>
        )}
      </div>
    </>
  );
}

// ---- Show me ---------------------------------------------------------------------------------------------------------

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The controls with these `data-help` ids that are on screen (the hidden views stay mounted, so they are skipped). */
function visibleTargets(ids: readonly string[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const id of ids) for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-help="${id}"]`))) if (el.getClientRects().length > 0) found.push(el);
  return found;
}

function boxAround(els: readonly HTMLElement[]): Box | null {
  let box: Box | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    box = box
      ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return box;
}

const sameBox = (a: Box | null, b: Box | null) => (a === null || b === null ? a === b : a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom);

/**
 * "Show me": the panel is gone, the control is ringed with its name beside it, and a small bar says how to go back (its
 * button, or Esc). The ring is followed on every frame while this shows, because closing the panel gives the page its
 * width back and the toolbar can re-wrap under it.
 */
function ShowMe({ article, onBack }: { article: HelpArticle; onBack: () => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const back = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    let frame = 0;
    let last: Box | null = null;
    let scrolled = false;
    const track = () => {
      const els = visibleTargets(article.target ?? []);
      if (!scrolled && els[0]) {
        scrolled = true;
        els[0].scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
      const now = boxAround(els);
      if (!sameBox(now, last)) {
        last = now;
        setBox(now);
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [article]);

  useEffect(() => back.current?.focus(), []);
  // Esc from anywhere goes back, unless it has been used already (to close a menu opened meanwhile) or a dialog is open.
  useWindowKeys(null, (e) => {
    if (e.key !== "Escape" || modalOpen()) return;
    e.preventDefault();
    onBack();
  });

  // One shortcut belongs on the label; with several (Zoom, Fit) the article lists them.
  const key = article.keys?.length === 1 ? article.keys[0] : undefined;
  const label = key ? `${article.title} (${formatShortcut(SHORTCUTS[key])})` : article.title;
  const labelBelow = box ? box.bottom + 40 < window.innerHeight : true;

  return (
    <>
      {box && (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed z-40 rounded-lg bg-accent-500/10 ring-2 ring-accent-500 shadow-[0_0_0_4px_rgb(59_130_246/0.25)]"
            style={{ left: box.left - 4, top: box.top - 4, width: box.right - box.left + 8, height: box.bottom - box.top + 8 }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed z-40 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
            style={{ left: Math.max(4, Math.min(box.left, window.innerWidth - 300)), ...(labelBelow ? { top: box.bottom + 10 } : { top: box.top - 36 }) }}
          >
            {label}
          </div>
        </>
      )}
      <div role="status" className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <span className="min-w-0">
          <span className="text-slate-500 dark:text-slate-400">Showing</span> {article.title}
          {!box && <span className="block text-xs text-amber-700 dark:text-amber-400">That control isn't on screen right now.</span>}
        </span>
        <button ref={back} type="button" className={buttonClass} onClick={onBack}>
          <LuArrowLeft size={14} aria-hidden />
          Back to Help
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">or press Esc</span>
      </div>
    </>
  );
}
