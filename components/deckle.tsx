"use client";
import { flushSync } from "react-dom";
import {
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowDown, Check, SlidersHorizontal, Type, X } from "lucide-react";
import {
  addedLines,
  defaultPaper,
  paperRuling,
  documentLines,
  indexPiece,
  appendEvent,
  applyEvent,
  cleanStore,
  WASTEBASKET_CAPACITY,
  shredPaper,
  layout,
  localDay,
  makeEvent,
  markdown,
  newPiece,
  title,
  autoTitle,
  type PaperOptions,
  type MarkStyle,
  type Action,
  type Document as WritingDocument,
  type KeyEvent,
  type Mode,
  type Piece,
  pieceNotes,
  type Settings,
  type Store,
  type Owner,
} from "@/lib/writing";
import { download, LOCAL_DESK_ID } from "@/lib/storage";
import { copyPaper } from "@/lib/clipboard";
import {
  fitsPaper,
  paperLineCount,
  PAPER_LINE_LIMIT,
} from "@/lib/paper-capacity";
import { useDeskStorage } from "./desk-storage-provider";
import { useCloudStorage } from "./storage-settings";
import { useLayoutMotion } from "./use-layout-motion";
import { useMobileWorkspace } from "./use-mobile-workspace";
import { DeskFocusGuide, type DeskFocus } from "./desk-focus-guide";
import { visibleControls } from "@/lib/desk-layout";
import { ActivityMeter } from "./activity-meter";
import { PaperCurl } from "./paper-curl";
import { CREST_RADIUS, paperCurlProfile } from "@/lib/paper-curl";
import { RetroCounter } from "./retro-counter";
import { TYPE_SIZES, typeSize } from "@/lib/type-size";
import { inspectorPlacement, sceneRectangle } from "@/lib/desk-scene";
import { SharePaper } from "./share-paper";
import { characterCount, recordWriting, settleActivity } from "@/lib/activity";
import { migrateStore, mergeArchive } from "@/lib/archive";
import { connectDesk } from "@/lib/desk-lock";
import {
  currentLight,
  lightColor,
  lights,
  materialProfile,
  paperVariables,
  stocks,
} from "@/lib/materials";
import { Stamp } from "./stamp";
import {
  Onboarding,
  OnboardingSuggestion,
  type OnboardingConfig,
  type SetupLesson,
} from "./onboarding";
import { DeskClock } from "./desk-clock";
import { DeskLighting } from "./desk-lighting";
import { DeskControls } from "./desk-controls";
import { MachinePaperControls } from "./machine-paper-controls";
import { RailLightFader, RoomWallSwitch } from "./lighting-controls";
import { PaperDrawer } from "./paper-drawer";
import { fileToArchive } from "./file-to-archive";
import { getTypewriterModel, modelVariation } from "@/lib/typewriters";
import { machineAudio } from "@/lib/audio";
import { paperClip, tearProgress } from "@/lib/deckle-edge";
import {
  PaperEditor,
  type EditorHandle,
  type FormatCommand,
  type MeasureReason,
  type PaperMetrics,
  type EditOrigin,
  type CutReport,
} from "./paper-editor";
import { cutStrip, type HeldStrip } from "./scissors";
import { PasteTag, type PasteTagState } from "./paste-tag";
import { CopyHolder } from "./copy-holder";
import { SelectionBar, type SelectionCommand } from "./selection-bar";
import {
  caretOffset,
  editingText,
  editorMarks,
  indexAtOffset,
  type EditRange,
  type TextSelection,
} from "@/lib/editor-model";
import { ReferenceCard, type ReferenceTab } from "./reference-card";
import { PaperTitle } from "./paper-title";
import { Ghostwriter, GHOSTWRITER_MIN_REACH } from "./ghostwriter";
import type { FeatureFlags } from "@/lib/features";

// The roll feeds upward while the typing line stays just above the slot.
const WINDOW_H = 680;
// The desk's camera move for Settings and the copy holder; matches the
// Settings panel's entrance (components/reference-card.tsx).
const CAMERA_MS = 440;
const PRINT_GAP = 17;
const LEAD = 170; // blank paper above the first line of a fresh piece
const PRESENT = 3; // lines fed out before a tear so it misses the writing

type TearPhase = "idle" | "presenting" | "away" | "emerging";
type RollKind = "scroll" | "drag" | "step" | "return";

/** A machine key thocks as it bottoms out, under the finger. The mechanism
 * it trips (lever, element, ratchet) answers on release. */
function keyVoice(pan: number) {
  return {
    onPointerDown: () => {
      void machineAudio.unlock();
      machineAudio.keyDown(pan);
    },
  };
}

/** Which styles cover the whole selection, for the selection bar's keys. */
function selectionStyles(doc: WritingDocument) {
  const range = doc.selection;
  if (!range || range.anchor === range.head) return {};
  const marks = editorMarks(doc);
  const picked = marks
    .slice(
      indexAtOffset(marks, Math.min(range.anchor, range.head)),
      indexAtOffset(marks, Math.max(range.anchor, range.head)),
    )
    .filter((mark) => mark.text !== "\n");
  const all = (test: (mark: (typeof marks)[number]) => boolean) =>
    picked.length > 0 && picked.every(test);
  return {
    bold: all((m) => m.strike === "double"),
    italic: all((m) => m.element === "italic"),
    underline: all((m) => !!m.underline),
    strike: all((m) => !!m.crossed),
    code: all((m) => !!m.code),
  };
}
export default function Deckle({
  userId,
  features,
}: {
  userId: string | null;
  features: FeatureFlags;
}) {
  const storage = useDeskStorage();
  const { loadStore, saveStore, flushStore, hydratePiece, archiveStore } =
    storage;
  const [store, setStore] = useState<Store | null>(null);
  const [sharing, setSharing] = useState<Piece | null>(null);
  const current = useRef<Store | null>(null);
  const [error, setError] = useState("");
  const reloadSavedDesk = useCallback(async () => {
    const saved = await storage.loadStore();
    current.current = saved;
    setStore(saved);
    deskConnection.current?.changed();
  }, [storage]);
  const cloudStorage = useCloudStorage(storage, userId, reloadSavedDesk);

  const mode: Mode = "draft";
  const [feed, setFeed] = useState(0);
  const feedRef = useRef(0);
  // How the platen is turning, which sets the paper's pace (see "Rolling the
  // platen" in app/paper-tools.css): null for a line space, "scroll" for the
  // wheel, "drag" for a hand on the knob, "step" for one ratchet click, and
  // "return" for a long roll paced by how many lines it travels.
  const [rollKind, setRollKind] = useState<RollKind | null>(null);
  const [rollLines, setRollLines] = useState(3);
  const [manual, setManual] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const deskStage = useRef<HTMLDivElement>(null);
  const deskRoot = useRef<HTMLElement>(null);
  const mobileView = useMobileWorkspace(deskRoot);
  const mobileDesk = useRef<HTMLDivElement>(null);
  const mobileTools = useRef<HTMLDivElement>(null);
  const [deskView, setDeskView] = useState({ scale: 1, x: 0 });
  const { scale: deskScale, x: deskX } = deskView;
  const [sceneView, setSceneView] = useState({ scale: 1, x: 0, y: 0 });
  // The copy holder stands on the left; the desk makes room the same way it
  // does for settings on the right.
  const [holderView, setHolderView] = useState({ scale: 1, x: 0, y: 0 });
  const [holderOpen, setHolderOpen] = useState(false);
  // While the holder is being pulled the desk follows the hand: the camera
  // reads --holder-pull (0 in, 1 out) from the desk. After a pull or a click
  // the desk eases the rest of the way (see aimCamera).
  const [holderDragging, setHolderDragging] = useState(false);
  const cameraMotion = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // The holder's paper is a preference of this browser: desk settings are
  // validated by the cloud backend, which doesn't know this field.
  const [notesStock, setNotesStock] = useState<PaperOptions["stock"]>("bond");
  useEffect(() => {
    setHolderOpen(localStorage.getItem("deckle:copy-holder") === "open");
    const stock = localStorage.getItem("deckle:notes-stock");
    if (stock && stock in stocks) setNotesStock(stock as PaperOptions["stock"]);
  }, []);
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>("Settings");
  const [readOnly, setReadOnly] = useState(true);
  const deskConnection = useRef<ReturnType<typeof connectDesk> | null>(null);
  const waitingText = useRef<string[]>([]);
  const waitingClicks = useRef<HTMLButtonElement[]>([]);
  const pauseDesk = useRef(() => {});
  const deskIsModal = useRef(false);
  const writable = useRef(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const drawerCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(drawerCloseTimer.current), []);
  const [freshStamp, setFreshStamp] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  // Scissors and tape: the strip still in hand after a cut, and the tag under
  // text pasted from outside.
  const heldStrip = useRef<HeldStrip | null>(null);
  const [pasteTag, setPasteTag] = useState<PasteTagState | null>(null);
  const dismissPasteTag = useCallback(() => setPasteTag(null), []);
  const locatePaste = useCallback(
    () => writer.current?.pasteAnchor() ?? null,
    [],
  );
  const [drawer, setDrawer] = useState(false);
  const openedPieceFocus = useRef<string | null>(null);
  const [waste, setWaste] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [tear, setTear] = useState(0);
  const tearRef = useRef(0);
  const [tearFrom, setTearFrom] = useState<"left" | "right">("left");
  const [phase, setPhase] = useState<TearPhase>("idle");
  const phaseRef = useRef<TearPhase>("idle");
  const nextPiece = useRef<Piece | null>(null);
  const [strikes, setStrikes] = useState(0);
  const [typebarStrike, setTypebarStrike] = useState({ id: 0, x: 0 });
  const [strikeActive, setStrikeActive] = useState(false);
  const manualCarriage = useRef(false);
  const [railLight, setRailLight] = useState({
    x: 640,
    y: 520,
    width: 1060,
    lampWidth: 333,
    paperTop: 76,
    paperLeft: 184,
    paperWidth: 912,
    paperHeight: 444,
    machineHeight: 224,
    viewportWidth: 1280,
    viewportHeight: 800,
    stageTop: 76,
  });
  const [carriageDragging, setCarriageDragging] = useState(false);
  const carriageDrag = useRef<{ pointerId: number; offset: number } | null>(
    null,
  );
  const [headReturn, setHeadReturn] = useState(false);
  const [paperWindowHeight, setPaperWindowHeight] = useState(WINDOW_H);
  const windowHeightRef = useRef(WINDOW_H);
  windowHeightRef.current = paperWindowHeight;
  const [metrics, setMetrics] = useState<PaperMetrics>({
    height: 31,
    lineHeight: 31,
    headTop: 0,
    headColumn: 0,
    headX: 0,
    printOrigin: 165,
    strikeY: -26,
    charWidth: 10.8,
    rows: 1,
    rtl: false,
  });
  const metricsRef = useRef(metrics);
  const initializedPiece = useRef("");
  const saveRevision = useRef(0);
  const [clock, setClock] = useState(new Date(2000, 0, 1, 12));
  const [systemReduce, setSystemReduce] = useState(false);
  const [notice, setNotice] = useState("");
  const [lifting, setLifting] = useState(false);
  const [pulled, setPulled] = useState(0);
  const writer = useRef<EditorHandle>(null);
  const [ghostWorking, setGhostWorking] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [ghostReviewLayout, setGhostReviewLayout] = useState({
    visible: false,
    height: 0,
  });
  const reviewLayout = useCallback(
    (next: { visible: boolean; height: number }) => {
      setGhostReviewLayout((old) =>
        old.visible === next.visible && old.height === next.height ? old : next,
      );
    },
    [],
  );
  const lastKey = useRef(0);
  const paperViewport = useRef<HTMLDivElement>(null);
  const archiveTray = useRef<HTMLButtonElement>(null);
  const filingFlight = useRef<(() => void) | null>(null);
  const drag = useRef<{ x: number; at: number; last: number } | null>(null);
  const knob = useRef<{
    y: number;
    feed: number;
    lastY: number;
    at: number;
    velocity: number;
  } | null>(null);
  const coast = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bellRow = useRef(-1);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [setupLesson, setSetupLesson] = useState<SetupLesson>(null);
  const setupLessonRef = useRef<SetupLesson>(null);
  const [practiceDoc, setPracticeDoc] = useState<WritingDocument | null>(null);
  const practice = useRef<WritingDocument | null>(null);
  const practiceFeed = useRef(0);
  const [setupNotesOpen, setSetupNotesOpen] = useState(false);
  const [setupNotes, setSetupNotes] = useState(
    "An idea to come back to.\nA quote, a source, or an outline for this paper.",
  );
  const [setupBatteryOpen, setSetupBatteryOpen] = useState(false);
  const notesLesson = onboardingOpen && setupLesson === "notes";
  const batteryLesson = onboardingOpen && setupLesson === "battery";
  const editingLesson = onboardingOpen && setupLesson === "editing";
  const [setupFocus, setSetupFocus] = useState<DeskFocus>(null);
  const [lampFocus, setLampFocus] = useState<DeskFocus>("lamp");
  const deskFocus: DeskFocus = onboardingOpen
    ? setupFocus
    : manual
      ? (
          {
            Machine: "machine",
            Paper: "paper",
            Light: lampFocus,
            Desk: "desk",
            Layout: "machine",
          } as Record<string, DeskFocus>
        )[referenceTab] || null
      : null;
  const lightInteraction = !!deskFocus && ["lamp", "rail"].includes(deskFocus);
  const onboardingBefore = useRef<Store | null>(null);
  const modal =
    manual || settingsClosing || drawer || onboardingOpen || !!sharing;
  const tearing = phase !== "idle";
  deskIsModal.current = modal;
  pauseDesk.current = () => {
    if (drawer && waste) setDrawer(false);
  };
  const settings = store?.settings;
  const inspecting = manual || onboardingOpen;
  const holderShown =
    (notesLesson ? setupNotesOpen : holderOpen) &&
    !!store &&
    !settings?.immersive &&
    (!modal || notesLesson);
  // While Settings closes over an open holder, the desk heads straight for
  // the holder's view instead of the plain desk and then back again.
  const settingsLeaving =
    settingsClosing && !manual && !drawer && !onboardingOpen && !sharing;
  const holderFramed =
    holderOpen &&
    !!store &&
    !settings?.immersive &&
    (!modal || settingsLeaving);
  // One camera for the desk: settings' view, the copy holder's, or none.
  const camera =
    notesLesson && setupNotesOpen
      ? holderView
      : inspecting
        ? sceneView
        : holderFramed
          ? holderView
          : null;
  const restingScale = deskScale * (settings?.immersive ? 1.12 : 1);
  const restingX = settings?.immersive ? 0 : deskX;
  const sceneScale = camera ? camera.scale : restingScale;
  const holderPulled =
    holderDragging && !inspecting && !settings?.immersive && !modal;
  // The same camera written as CSS, for the desk, the lamp, the cord and
  // the light map. While the holder is pulled it is a function of the pull.
  const cordShift = (view: { x: number; scale: number }) =>
    view.x +
    Math.min(1060, deskStage.current?.offsetWidth ?? 1060) *
      0.43 *
      (view.scale - 1);
  const cameraCss = holderPulled
    ? {
        x: `calc(${deskX}px + var(--holder-pull, 0) * ${holderView.x - deskX}px)`,
        y: `calc(var(--holder-pull, 0) * ${holderView.y}px)`,
        scale: `calc(${deskScale} + var(--holder-pull, 0) * ${holderView.scale - deskScale})`,
        cord: `calc(${cordShift(deskView)}px + var(--holder-pull, 0) * ${cordShift(holderView) - cordShift(deskView)}px)`,
      }
    : camera
      ? {
          x: `${camera.x}px`,
          y: `${camera.y}px`,
          scale: `${camera.scale}`,
          cord: `${cordShift(camera)}px`,
        }
      : {
          x: `${restingX}px`,
          y: "0px",
          scale: `${restingScale}`,
          cord: `${cordShift({ x: restingX, scale: restingScale })}px`,
        };
  const deskTransform = `translate(${cameraCss.x}, ${cameraCss.y}) scale(${cameraCss.scale})`;
  const controls = visibleControls(settings);
  const reduced = Boolean(systemReduce || settings?.reduceMotion);
  useLayoutMotion(
    deskRoot,
    controls.join("/"),
    reduced,
    manual || onboardingOpen,
  );
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const light = currentLight(settings?.light, clock.getHours());
  const roomLight = settings?.roomLight ?? false;
  const isLamp = light === "lamp" || light === "mixed";
  const deskIntensity =
    typeof settings?.deskLightIntensity === "number"
      ? settings.deskLightIntensity
      : isLamp
        ? 0.85
        : 0.0;

  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, reducedRef.current ? 0 : ms));
  }, []);
  const setPhaseValue = useCallback((next: TearPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const commit = useCallback(
    (next: Store, immediate = false) => {
      if (!writable.current) return;
      if (
        next.setupPending &&
        (next.active.document.marks.length ||
          next.active.document.title ||
          pieceNotes(next.active) ||
          next.pieces.length)
      )
        next = { ...next, setupPending: false };
      current.current = next;
      setStore(next);
      const revision = ++saveRevision.current;
      void saveStore(next, immediate)
        .then(() => {
          deskConnection.current?.changed();
          if (revision === saveRevision.current) setError("");
        })
        .catch(() => {
          if (revision === saveRevision.current)
            setError(
              "The browser could not save your paper. Export a copy before closing this tab.",
            );
        });
    },
    [storage],
  );
  useEffect(() => {
    let alive = true;
    const connection = connectDesk(
      {
        load: (readOnly) => loadStore({ readOnly }),
        flush: flushStore,
        beforeYield: async () => {
          // A drag abandoned by switching tabs must not hold the writer forever.
          if (phaseRef.current === "presenting" && drag.current) {
            drag.current = null;
            tearRef.current = 0;
            setTear(0);
            setPhaseValue("idle");
          }
          // Let a tear already in flight land in the archive before handing over.
          while (alive && phaseRef.current !== "idle")
            await new Promise((resolve) => setTimeout(resolve, 20));
        },
        onStore: (s) => {
          if (!alive) return;
          const loaded: Store = {
            ...s,
            tearProgress: 0,
            uncovered: true,
            mode: "draft",
            owner: {
              ...s.owner,
              name: s.owner?.name || "",
              seed: s.owner?.seed || 1971,
              enrolled: true,
            },
          };
          if (
            current.current?.active.id !== loaded.active.id ||
            JSON.stringify(current.current?.active.document.marks) !==
              JSON.stringify(loaded.active.document.marks)
          )
            writer.current?.clearHistory();
          setClock(new Date());
          current.current = loaded;
          setStore(loaded);
        },
        onWritable: (ready) => {
          if (!alive) return;
          writable.current = ready;
          // Enable the editor before replaying keys captured during a handoff.
          flushSync(() => setReadOnly(!ready));
          if (!ready) {
            machineAudio.setMuted(true);
            pauseDesk.current();
            return;
          }
          if (current.current) commit(current.current);
          const text = waitingText.current.join("");
          waitingText.current = [];
          if (text) {
            writer.current?.focus();
            writer.current?.insert(text);
          }
          const clicks = waitingClicks.current;
          waitingClicks.current = [];
          for (const button of clicks) if (button.isConnected) button.click();
        },
        onWaitingKey: (event) => {
          const target = event.target as HTMLElement;
          if (
            !current.current ||
            deskIsModal.current ||
            event.isComposing ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            target.closest?.(
              "input, textarea, select, button, .desk-controls, .reference-card, .desk-clock",
            )
          )
            return;
          if (event.key === "Enter" || Array.from(event.key).length === 1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            waitingText.current.push(event.key === "Enter" ? "\n" : event.key);
          }
        },
        onWaitingClick: (event) => {
          const button = (event.target as Element).closest<HTMLButtonElement>(
            "button",
          );
          if (!button || button.disabled) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          waitingClicks.current.push(button);
        },
        onError: () => {
          if (alive)
            setError(
              "The saved desk could not be synchronized. Your existing paper has not been replaced. Export a recovery copy before reopening the browser.",
            );
        },
      },
      undefined,
      userId ?? LOCAL_DESK_ID,
    );
    deskConnection.current = connection;
    const resize = () => {
      setPaperWindowHeight(
        Math.max(
          64,
          Math.min(
            WINDOW_H,
            window.innerHeight * (window.innerWidth <= 700 ? 0.52 : 0.58),
            window.innerHeight - (window.innerWidth <= 700 ? 450 : 396),
          ),
        ),
      );
    };
    resize();
    window.addEventListener("resize", resize);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduce(media.matches);
    const change = () => setSystemReduce(media.matches);
    media.addEventListener("change", change);
    const timer = setInterval(() => {
      setClock(new Date());
      const s = current.current;
      if (s && s.day !== localDay()) commit(cleanStore(s));
    }, 1000);
    const pending = timers.current;
    return () => {
      alive = false;
      connection.close();
      if (deskConnection.current === connection) deskConnection.current = null;
      writable.current = false;
      window.removeEventListener("resize", resize);
      media.removeEventListener("change", change);
      clearInterval(timer);
      cancelAnimationFrame(coast.current);
      pending.forEach(clearTimeout);
    };
  }, [commit, userId, storage]);
  useEffect(() => {
    // Re-measure once the desk has moved, not in the middle of the move.
    const settled = setTimeout(
      () => window.dispatchEvent(new Event("resize")),
      CAMERA_MS,
    );
    return () => clearTimeout(settled);
  }, [settings?.immersive, manual, onboardingOpen, holderShown]);
  useEffect(() => () => filingFlight.current?.(), []);
  useEffect(() => {
    if (settings) {
      machineAudio.setMuted(!!settings.muted || readOnly);
      machineAudio.setVolume(settings.volume);
      machineAudio.setMaterial(
        materialProfile(
          settings,
          store?.active.document.paper || settings.paper,
        ),
      );
    }
  }, [settings, store?.active.document.paper, readOnly]);
  useEffect(() => {
    const flush = () => {
      void flushStore().catch(() =>
        setError(
          "The browser could not save your paper. Export a recovery copy.",
        ),
      );
    };
    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (
      settings?.ticking &&
      !readOnly &&
      !settings.muted &&
      settings.clock !== false &&
      !settings.immersive &&
      document.visibilityState === "visible"
    )
      machineAudio.clockTick(settings?.clockStyle);
  }, [
    clock,
    settings?.ticking,
    settings?.muted,
    settings?.clock,
    settings?.immersive,
    settings?.clockStyle,
    readOnly,
  ]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const apply = useCallback(
    (event: KeyEvent) => {
      if (practice.current) {
        const next = applyEvent(practice.current, event);
        practice.current = next;
        setPracticeDoc(next);
        return next;
      }
      const s = current.current;
      if (!s || !writable.current) return s?.active.document;
      const candidate = appendEvent(s.active, event);
      if (
        !fitsPaper(
          editingText(s.active.document),
          editingText(candidate.document),
        ) &&
        event.action !== "restore" &&
        event.origin !== "ghost"
      ) {
        setNotice(
          `Paper full · ${PAPER_LINE_LIMIT} lines. Save to archive for a fresh sheet.`,
        );
        return s.active.document;
      }
      const before = layout(s.active.document);
      let stamped = s.active;
      if (
        !s.active.document.stamp &&
        ["type", "paste", "title"].includes(event.action) &&
        event.key.trim()
      ) {
        const stamp = {
          name: s.owner?.name.trim() || "A WRITER",
          seed: event.seed ^ (s.owner?.seed || 0),
          at: event.at,
        };
        stamped = appendEvent(stamped, {
          ...makeEvent("stamp", "", event.mode),
          stamp,
          at: event.at,
        });
        setFreshStamp(true);
        setTimeout(() => setFreshStamp(false), 300);
        machineAudio.physical("stamp");
      }
      const active =
        stamped === s.active ? candidate : appendEvent(stamped, event);
      const after = layout(active.document);
      commit({
        ...s,
        active,
        day: localDay(),
        linesToday:
          (s.day === localDay() ? s.linesToday : 0) +
          (event.origin === "ghost"
            ? 0
            : addedLines(s.active.document, active.document)),
        // Moving your own words, or having a fragment typed in for you, is
        // not new writing for today's count.
        activity:
          ["type", "paste"].includes(event.action) &&
          event.origin !== "move" &&
          event.origin !== "retype" &&
          event.origin !== "ghost"
            ? recordWriting(s.activity, localDay(), event.key)
            : settleActivity(s.activity, localDay()),
      });
      if (["restore", "title", "paper", "stamp"].includes(event.action))
        return active.document;
      if (event.action === "style") {
        machineAudio.physical(event.style?.element ? "element" : "lever");
        return active.document;
      }
      if (event.action === "block") {
        machineAudio.roll(event.block === "dinkus" ? 3 : 1);
        return active.document;
      }
      setStrikes((n) => n + 1);
      // Keystrokes are voiced on keydown. Edits without a key behind them
      // (paste, composition, a touch keyboard) are voiced here instead.
      const voiced = machineAudio.voicedRecently;
      // Scissors, tape and retyping are voiced where they happen.
      if (event.origin) return active.document;
      if (event.action === "paste") machineAudio.rustle({ gain: 0.35 });
      else if (!voiced) {
        if (event.action === "type" && event.key === "\n")
          machineAudio.carriageReturn(before.head.col);
        else if (event.action === "type" && event.key === " ")
          machineAudio.space(after.head.col);
        else if (event.action === "type")
          machineAudio.strike(
            Array.from(event.key).at(-1) || "",
            after.head.col,
          );
        else machineAudio.correction(after.head.col);
      }
      // A word that no longer fits sends the carriage home on its own.
      if (
        event.action === "type" &&
        !event.key.includes("\n") &&
        after.head.row > before.head.row
      )
        machineAudio.carriageReturn(before.head.col, { auto: true });
      if (
        s.settings.bell &&
        event.action === "type" &&
        after.head.col >= 55 &&
        bellRow.current !== after.head.row
      ) {
        machineAudio.bell(after.head.col);
        bellRow.current = after.head.row;
      }
      if (
        event.action === "type" &&
        active.document.typingStyle?.strike === "double"
      )
        setTimeout(
          () =>
            machineAudio.strike(
              Array.from(event.key).at(-1) || "",
              after.head.col,
              { soft: true },
            ),
          38,
        );
      if (
        event.action === "type" &&
        active.document.paper?.initials &&
        addedLines(s.active.document, active.document) &&
        documentLines(active.document).some(
          (line) =>
            line.initial &&
            line.marks.at(-1)?.id ===
              active.document.marks[active.document.cursor - 1]?.id,
        )
      )
        machineAudio.physical("stamp");
      return active.document;
    },
    [commit],
  );
  const edit = useCallback(
    (
      action: Action,
      text: string,
      range: EditRange,
      selection: TextSelection,
      origin?: EditOrigin,
      style?: MarkStyle,
    ) => {
      const s = current.current;
      if (!s) return { marks: [], cursor: 0 };
      void machineAudio.unlock();
      // Writing anything else puts down a strip still in hand and retires the
      // paste tag.
      if (!origin) {
        heldStrip.current?.setAside();
        heldStrip.current = null;
        setPasteTag(null);
      }
      const event = {
        ...makeEvent(
          action,
          text,
          s.mode || "draft",
          Date.now() - lastKey.current,
        ),
        range,
        selection,
        ...(origin ? { origin } : {}),
        ...(style ? { style } : {}),
      };
      lastKey.current = event.at;
      return apply(event) || s.active.document;
    },
    [apply],
  );
  const restoreEditing = useCallback(
    (document: WritingDocument) =>
      apply({
        ...makeEvent("restore", "", current.current?.mode || "draft"),
        snapshot: document,
      }) || document,
    [apply],
  );
  const format = useCallback(
    (command: FormatCommand): WritingDocument => {
      const s = current.current;
      if (!s) return { marks: [], cursor: 0 };
      const doc = practice.current ?? s.active.document,
        selection = doc.selection || {
          anchor: caretOffset(doc),
          head: caretOffset(doc),
        };
      const range = {
        from: Math.min(selection.anchor, selection.head),
        to: Math.max(selection.anchor, selection.head),
      };
      if (
        command === "body" ||
        command === "h1" ||
        command === "h2" ||
        command === "dinkus"
      ) {
        if (command === "dinkus" && range.from === range.to) {
          const text = editingText(doc),
            prefix =
              range.from > 0 && text[range.from - 1] !== "\n" ? "\n" : "";
          return (
            apply({
              ...makeEvent("type", `${prefix}***\n`, s.mode || "draft"),
              range,
              selection,
            }) || doc
          );
        }
        return (
          apply({
            ...makeEvent("block", "", s.mode || "draft"),
            range,
            block: command,
          }) || doc
        );
      }
      // Each command toggles one style: [style key, on value, off value].
      const styles = {
        bold: ["strike", "double", "single"],
        italic: ["element", "italic", "mono"],
        red: ["ribbon", "red", "black"],
        underline: ["underline", true, false],
        strike: ["crossed", true, false],
        code: ["code", true, false],
      } as const;
      const [key, on, off] = styles[command];
      const marks = editorMarks(doc);
      const selected = marks.slice(
        indexAtOffset(marks, range.from),
        indexAtOffset(marks, range.to),
      );
      const enabled =
        range.from === range.to
          ? doc.typingStyle?.[key] === on
          : selected.length > 0 && selected.every((m) => m[key] === on);
      return (
        apply({
          ...makeEvent("style", "", s.mode || "draft"),
          range,
          style: { [key]: enabled ? off : on } as MarkStyle,
        }) || doc
      );
    },
    [apply],
  );
  const rememberSelection = useCallback(
    (selection: TextSelection) => {
      const s = current.current;
      if (!s) return;
      const source = practice.current ?? s.active.document;
      const marks = editorMarks(source);
      const document = {
        ...source,
        cursor: indexAtOffset(marks, selection.head),
        selection,
      };
      // Keep navigation state on the desk; the next edit records its exact range for replay.
      if (practice.current) {
        practice.current = document;
        setPracticeDoc(document);
      } else commit({ ...s, active: { ...s.active, document } });
      setSelecting(selection.anchor !== selection.head);
    },
    [commit],
  );
  // ---- Selection bar ---------------------------------------------------------
  // Shown for a settled selection on the focused paper: not while the mouse
  // is still dragging it out.
  const [selecting, setSelecting] = useState(false);
  const [pointerHeld, setPointerHeld] = useState(false);
  const [paperFocused, setPaperFocused] = useState(false);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest?.(".cm-content")) setPointerHeld(true);
    };
    const up = () => setPointerHeld(false);
    const focus = () =>
      setPaperFocused(!!document.activeElement?.closest(".cm-editor"));
    // Focus settles after focusout; read it on the next turn.
    const blur = () => setTimeout(focus, 0);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
    };
  }, []);
  const locateSelection = useCallback(
    () => writer.current?.selectionBox() ?? null,
    [],
  );
  const locateCaret = useCallback(
    () => writer.current?.selectionBox(true) ?? null,
    [],
  );
  // ---- A strip in hand -------------------------------------------------------
  // Cut or copied words ride by the pointer until they are pasted. Click
  // where they should go and rest there a moment: a Paste key appears at the
  // caret, so no keyboard or context menu is needed. Escape puts the strip
  // aside.
  const [holding, setHolding] = useState(false);
  const [restingPaste, setRestingPaste] = useState(false);
  const heldToken = useRef(0);
  function pickUp(report: CutReport, copy: boolean) {
    heldStrip.current?.setAside();
    setPasteTag(null);
    const token = ++heldToken.current;
    const strip = cutStrip({
      rects: report.rects,
      text: report.text,
      paperStyle: report.style,
      rtl: report.rtl,
      reduced,
      copy,
      onGone: () => {
        if (heldToken.current !== token) return;
        if (heldStrip.current === strip) heldStrip.current = null;
        setHolding(false);
      },
    });
    heldStrip.current = strip;
    setHolding(strip.active);
  }
  function selectionCommand(command: SelectionCommand) {
    if (command === "cut" || command === "copy")
      writer.current?.clipboard(command);
    else if (command === "paste" && heldStrip.current?.active)
      writer.current?.pasteHeld();
    else if (command === "paste")
      void writer.current?.paste().then((result) => {
        if (result === "refused")
          setNotice(
            `The browser kept the clipboard closed to this key. ${/Mac|iP(hone|ad)/.test(navigator.platform) ? "⌘V" : "Ctrl+V"} pastes.`,
          );
        else if (result === "empty")
          setNotice("Nothing to paste: the clipboard has no text.");
      });
    else writer.current?.format(command);
  }
  useEffect(() => {
    setRestingPaste(false);
    if (!holding) return;
    let timer: ReturnType<typeof setTimeout> | undefined,
      rest: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest?.(".selection-bar")) return;
      clearTimeout(timer);
      rest = null;
      setRestingPaste(false);
    };
    const up = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".cm-content")) return;
      rest = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => setRestingPaste(true), 450);
    };
    // Moving on before the key appears means the click wasn't a "here".
    const move = (e: PointerEvent) => {
      if (rest && Math.hypot(e.clientX - rest.x, e.clientY - rest.y) > 8) {
        clearTimeout(timer);
        rest = null;
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") heldStrip.current?.setAside();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [holding]);
  const locatePaperWindow = useCallback(() => {
    const rect = paperViewport.current?.getBoundingClientRect();
    return rect ? { top: rect.top, bottom: rect.bottom } : null;
  }, []);

  // Resizing the desk changes the visible window, not the paper's top margin.
  const paperLead = LEAD;
  const feedLimits = (m: PaperMetrics) => ({
    min: -Math.max(0, Math.round((m.height - m.headTop) / m.lineHeight) - 1),
    max: Math.max(0, Math.ceil((m.headTop + paperLead * 0.7) / m.lineHeight)),
  });
  const setFeedValue = useCallback((value: number) => {
    const { min, max } = feedLimits(metricsRef.current);
    const next = Math.max(min, Math.min(max, value));
    feedRef.current = next;
    setFeed(next);
    return next;
  }, []);
  useEffect(() => {
    if (!typebarStrike.id) return;
    setStrikeActive(true);
    const timer = setTimeout(() => setStrikeActive(false), 105);
    return () => clearTimeout(timer);
  }, [typebarStrike.id]);
  useLayoutEffect(() => {
    const stage = deskStage.current;
    if (!stage) return;
    const measure = () => {
      const machineNode = stage.querySelector<HTMLElement>(".machine");
      const machineWidth = machineNode?.offsetWidth ?? stage.offsetWidth;
      const sideDesktop =
        features.ghostwriter && !mobileView.mobile && window.innerHeight >= 480;
      const sideReach = GHOSTWRITER_MIN_REACH;
      // Reserve the compact drawer and proofreader in the resting frame.
      // Showing suggestions must never change the desk's position or scale.
      const scale = sideDesktop
        ? Math.min(1.1, (window.innerWidth - 48) / (machineWidth + sideReach))
        : 1;
      const x = sideDesktop
        ? -Math.max(
            0,
            (machineWidth / 2 + sideReach) * scale - window.innerWidth / 2 + 24,
          )
        : 0;
      setDeskView((old) =>
        old.scale === scale && old.x === x ? old : { scale, x },
      );
      // Reserve the real height of the selected mechanisms, including wrapped
      // rows, so the inspector never covers a light control on a narrow desk.
      if (machineNode) {
        const desk = stage.closest("main")!;
        const paddingTop = parseFloat(getComputedStyle(desk).paddingTop);
        const archive = desk.querySelector<HTMLElement>(".desk-front");
        const archiveSpace = archive
          ? archive.offsetHeight + parseFloat(getComputedStyle(archive).bottom)
          : 64;
        setPaperWindowHeight(
          mobileView.mobile
            ? Math.max(
                64,
                mobileView.height -
                  machineNode.offsetHeight -
                  paddingTop -
                  ghostReviewLayout.height -
                  (mobileView.keyboard || ghostReviewLayout.height ? 12 : 82),
              )
            : Math.max(
                64,
                Math.min(
                  WINDOW_H,
                  window.innerWidth <= 700
                    ? window.innerHeight * 0.52
                    : WINDOW_H,
                  (window.innerHeight - paddingTop - archiveSpace - 24) /
                    scale -
                    machineNode.offsetHeight,
                ),
              ),
        );
      }
      // Keep the full machine layout. A single camera transform makes room for
      // the inspector; resizing only its width would distort every mechanism.
      const contentHeight =
        paperWindowHeight + (machineNode?.offsetHeight ?? 224);
      const view = inspectorPlacement({
        width: window.innerWidth,
        height: window.innerHeight,
        stageWidth: stage.offsetWidth,
        contentHeight,
        maxScale: scale,
        paddingTop: parseFloat(
          getComputedStyle(stage.closest("main")!).paddingTop,
        ),
      });
      setSceneView((old) =>
        Object.keys(view).every(
          (key) =>
            old[key as keyof typeof view] === view[key as keyof typeof view],
        )
          ? old
          : view,
      );
      const holder = inspectorPlacement({
        width: window.innerWidth,
        height: window.innerHeight,
        stageWidth: stage.offsetWidth,
        contentHeight,
        paddingTop: parseFloat(
          getComputedStyle(stage.closest("main")!).paddingTop,
        ),
        side: "left",
        maxScale: scale,
      });
      setHolderView((old) =>
        old.scale === holder.scale && old.x === holder.x && old.y === holder.y
          ? old
          : holder,
      );
      const stageRect = stage.getBoundingClientRect();
      const style = getComputedStyle(stage);
      const matrix = new DOMMatrixReadOnly(
        style.transform === "none" ? undefined : style.transform,
      );
      const [originX, originY] = style.transformOrigin
        .split(" ")
        .map(parseFloat);
      const camera = {
        scale: matrix.a,
        x: matrix.e,
        y: matrix.f,
        originX,
        originY,
      };
      const measureObject = (selector: string) => {
        const rect = stage.querySelector(selector)?.getBoundingClientRect();
        return rect ? sceneRectangle(rect, stageRect, camera) : undefined;
      };
      const deck = measureObject(".machine-deck");
      const desk = stage.closest("main")?.getBoundingClientRect();
      const paper = measureObject(".paper-window");
      const machine = measureObject(".machine");
      if (deck && desk) {
        const x = deck.left - desk.left + deck.width / 2;
        const y = deck.top - desk.top + 7;
        const width = deck.width;
        const lampWidth =
          stage.closest("main")?.querySelector<HTMLElement>(".pendant-lamp")
            ?.offsetWidth ?? 333;
        const next = {
          x,
          y,
          width,
          lampWidth,
          paperTop: paper ? paper.top - desk.top : 76,
          paperLeft: paper ? paper.left - desk.left : x - width * 0.43,
          paperWidth: paper?.width ?? width * 0.86,
          paperHeight: paper?.height ?? paperWindowHeight,
          machineHeight: machine?.height ?? 224,
          viewportWidth: desk.width,
          viewportHeight: desk.height,
          stageTop:
            stageRect.top - matrix.f - originY * (1 - matrix.a) - desk.top,
        };
        setRailLight((old) =>
          Object.entries(next).every(
            ([key, value]) =>
              Math.abs(old[key as keyof typeof next] - value) < 0.25,
          )
            ? old
            : next,
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const machine = stage.querySelector(".machine");
    if (machine) observer.observe(machine);
    const face = stage.querySelector(".machine-face");
    if (face) observer.observe(face);
    window.addEventListener("resize", measure);
    const settled = setTimeout(measure, 300);
    stage.addEventListener("transitionend", measure);
    return () => {
      clearTimeout(settled);
      stage.removeEventListener("transitionend", measure);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    paperWindowHeight,
    manual,
    onboardingOpen,
    deskFocus,
    controls.join("/"),
    settings?.immersive,
    mobileView.mobile,
    mobileView.height,
    mobileView.keyboard,
    ghostReviewLayout.height,
    features.ghostwriter,
  ]);
  const paperMetrics = useCallback(
    (next: PaperMetrics, reason: MeasureReason) => {
      const old = metricsRef.current;
      metricsRef.current = next;
      if (carriageDrag.current || manualCarriage.current) {
        machineAudio.carriageSlide(next.headX - old.headX, next.headColumn);
        manualCarriage.current = false;
      }
      if (
        Object.keys(next).some(
          (key) =>
            next[key as keyof PaperMetrics] !== old[key as keyof PaperMetrics],
        )
      )
        setMetrics(next);
      // A long move against the writing direction is the carriage returning,
      // not an escapement step. Right-to-left lines return to the right.
      setHeadReturn(
        next.rtl ? next.headX > old.headX + 40 : next.headX < old.headX - 40,
      );
      const newPiece = initializedPiece.current !== current.current?.active.id;
      if (newPiece) initializedPiece.current = current.current?.active.id || "";
      const lineHeight = next.lineHeight || 31;
      // The feed that leaves the paper exactly where it is on the desk.
      const kept = feedRef.current + (next.headTop - old.headTop) / lineHeight;
      // Moving more than a line, the platen turns at a pace you can follow.
      const rollTo = (value: number) => {
        const travel = Math.abs(value - kept);
        if (travel >= 2) {
          setRollLines(Math.round(travel));
          setRollKind("return");
        } else if (travel > 0.01) setRollKind(null);
        setFeedValue(value);
      };
      if (newPiece) setFeedValue(0);
      else if (reason === "pointer") {
        // Clicking or dragging moves the caret, not the paper.
        setFeedValue(kept);
      } else if (reason === "selection" || reason === "command") {
        // Arrowing, styling, cutting, pasting or undoing leaves the words
        // under the hand: the paper stays put while the caret is in the
        // window, and feeds only enough to bring it back into view (a long
        // paste, an undo far away).
        const top = -Math.max(
          0,
          Math.floor(windowHeightRef.current / lineHeight) - 2,
        );
        const view = Math.min(0, Math.max(top, kept));
        if (Math.abs(view - kept) >= 2)
          machineAudio.roll(kept - view, next.headColumn);
        rollTo(view);
      } else if (reason === "edit") {
        // A keystroke writes only at the print line. If the paper was
        // rolled away, it rolls back first.
        if (Math.abs(feedRef.current) >= 1)
          machineAudio.roll(feedRef.current, next.headColumn);
        rollTo(0);
      } else setFeedValue(feedRef.current);
    },
    [setFeedValue],
  );
  function updatePaper(
    patch: Partial<PaperOptions>,
    settingsPatch: Partial<Settings> = {},
  ) {
    const s = current.current;
    if (!s) return;
    const paper = { ...defaultPaper, ...s.active.document.paper, ...patch };
    const active = appendEvent(s.active, {
      ...makeEvent("paper", "", s.mode || "draft"),
      paper,
    });
    commit({
      ...s,
      active,
      settings: { ...s.settings, ...settingsPatch, paper },
    });
    if (patch.ruling) void machineAudio.rulingSwitch();
    else
      machineAudio.physical(
        patch.element ? "element" : patch.ribbon ? "lever" : "card",
      );
  }
  // ---- Copy holder: notes kept with the active paper ------------------------
  function setNotes(notes: string) {
    const s = current.current;
    if (!s || !writable.current) return;
    commit({ ...s, active: { ...s.active, notes, sources: undefined } });
  }
  // ---- The camera's moves ----------------------------------------------------
  // Opening Settings or the copy holder moves the whole desk aside. React's
  // render for those can take a while (Settings mounts a whole panel), and a
  // move that waits for it starts late and stutters. So the new transforms
  // are written straight away: the compositor is already easing the desk
  // while React catches up and writes the same values. data-camera-moving
  // (an attribute React doesn't manage) holds the move's longer timing and
  // keeps the desk on its own layer until it lands (app/paper-tools.css).
  function cameraMoves() {
    const root = deskRoot.current;
    if (!root) return;
    root.dataset.cameraMoving = "";
    clearTimeout(cameraMotion.current);
    cameraMotion.current = setTimeout(
      () => delete root.dataset.cameraMoving,
      CAMERA_MS + 80,
    );
  }
  function aimCamera(view: { x: number; y: number; scale: number } | null) {
    const root = deskRoot.current,
      stage = deskStage.current;
    if (!root || !stage) return;
    cameraMoves();
    const target = view ?? { x: restingX, y: 0, scale: restingScale };
    const transform = `translate(${target.x}px, ${target.y}px) scale(${target.scale})`;
    stage.style.transform = transform;
    root
      .querySelectorAll<HTMLElement>(".desk-light-map")
      .forEach((map) => (map.style.transform = transform));
    const lamp = root.querySelector<HTMLElement>(".pendant-lamp");
    if (lamp)
      lamp.style.transform = `translateX(-50%) translateX(${target.x}px) scale(${target.scale})`;
    const cord = root.querySelector<HTMLElement>(".pull-cord");
    if (cord && !settings?.immersive)
      cord.style.translate = `${cordShift(target)}px 0`;
  }
  // React applies a click's state at once, in the same task, so a heavy
  // render would still hold the first frame of the move. The state follows
  // one frame later, after the compositor has started the move.
  const afterFirstFrame = (run: () => void) =>
    requestAnimationFrame(() => setTimeout(run, 0));
  function toggleHolder(open = !holderOpen, pulled = false) {
    const change = () => {
      if (open) setGhostOpen(false);
      setHolderOpen(open);
    };
    if (!inspecting && !mobileView.mobile)
      aimCamera(open && !settings?.immersive && !modal ? holderView : null);
    // The drawer leaves with the desk; React writes the same class after.
    document.querySelector(".copy-holder")?.classList.toggle("is-open", open);
    if (mobileView.mobile) {
      // The phone sheet opens immediately. Enable its input before moving
      // focus, within the same tap that is allowed to open the keyboard.
      flushSync(change);
      const notes =
        document.querySelector<HTMLTextAreaElement>(".copy-holder-text");
      if (open) notes?.focus({ preventScroll: true });
      else notes?.blur();
    } else afterFirstFrame(change);
    localStorage.setItem("deckle:copy-holder", open ? "open" : "closed");
    void machineAudio.unlock().then(() => {
      // A pulled drawer is already mostly out: only the latch is left.
      if (!pulled || !open) machineAudio.panel(open, -0.5);
      // Fully out, the drawer latches.
      if (open) setTimeout(() => machineAudio.clipSnap(), pulled ? 200 : 460);
    });
    if (!open && !mobileView.mobile)
      setTimeout(() => writer.current?.focus(), 0);
  }
  const pullHolder = useCallback((pull: number | null) => {
    if (pull !== null && pull > 0) setGhostOpen(false);
    if (pull === null) {
      setHolderDragging(false);
      cameraMoves();
      return;
    }
    deskRoot.current?.style.setProperty(
      "--holder-pull",
      Math.max(0, Math.min(1, pull)).toFixed(3),
    );
    setHolderDragging(true);
  }, []);
  function updateOwner(name: string) {
    const s = current.current;
    if (s)
      commit({
        ...s,
        owner: {
          name: name.slice(0, 48),
          seed: s.owner?.seed || 1971,
          enrolled: true,
        },
      });
  }
  function openReference(tab: ReferenceTab = "Settings") {
    if (settingsClosing) return;
    if (mobileView.mobile) {
      mobileTools.current?.hidePopover();
      mobileDesk.current?.hidePopover();
    }
    if (!manual && !onboardingOpen) aimCamera(sceneView);
    afterFirstFrame(() => {
      setReferenceTab(tab);
      setManual(true);
    });
    void machineAudio.unlock().then(() => machineAudio.panel(true));
  }
  function closeReference() {
    if (!manual || settingsClosing) return;
    if (!onboardingOpen)
      aimCamera(
        holderOpen && !settings?.immersive && !drawer && !sharing
          ? holderView
          : null,
      );
    afterFirstFrame(() => {
      setSettingsClosing(true);
      setManual(false);
    });
    machineAudio.panel(false);
  }
  function updateSettings(patch: Partial<Settings>) {
    if (patch.muted !== undefined) machineAudio.setMuted(patch.muted);
    if (patch.volume !== undefined) machineAudio.setVolume(patch.volume);
    if (current.current)
      commit({
        ...current.current,
        settings: { ...current.current.settings, ...patch },
      });
  }
  function skipOnboarding() {
    const s = current.current;
    if (!s) return;
    commit({ ...s, setupPending: false }, true);
    writer.current?.focus();
  }
  function startOnboarding() {
    const s = current.current;
    if (!s) return;
    const next = { ...s, setupPending: false };
    onboardingBefore.current = next;
    commit(next, true);
    setManual(false);
    setSettingsClosing(false);
    setOnboardingOpen(true);
  }
  const handleSetupLesson = useCallback((lesson: SetupLesson) => {
    if (setupLessonRef.current === lesson) return;
    const wasEditing = setupLessonRef.current === "editing";
    setupLessonRef.current = lesson;
    setSetupLesson(lesson);
    if (lesson === "notes") setSetupNotesOpen(true);
    if (lesson === "battery") setSetupBatteryOpen(true);
    if (lesson === "editing") {
      practiceFeed.current = feedRef.current;
      const text = "These are your words.\nMake them your own.";
      const doc = applyEvent(
        {
          marks: [],
          cursor: 0,
          paper: current.current?.active.document.paper ?? defaultPaper,
        },
        makeEvent("type", text, "draft"),
      );
      doc.selection = {
        anchor: text.indexOf("your own"),
        head: text.indexOf("your own") + "your own".length,
      };
      practice.current = doc;
      setPracticeDoc(doc);
      setSelecting(true);
      setTimeout(() => writer.current?.focus(), 80);
    } else if (wasEditing) {
      practice.current = null;
      setPracticeDoc(null);
      setSelecting(false);
      feedRef.current = practiceFeed.current;
      setFeed(practiceFeed.current);
    }
  }, []);
  function selectPractice() {
    const doc = practice.current;
    if (!doc) return;
    const text = editingText(doc);
    const start = text.indexOf("your own");
    const next = {
      ...doc,
      selection: {
        anchor: Math.max(0, start),
        head: start < 0 ? text.length : start + "your own".length,
      },
    };
    practice.current = next;
    setPracticeDoc(next);
    setSelecting(true);
    setTimeout(() => writer.current?.focus(), 0);
  }
  const handleOnboardingComplete = useCallback(
    (config: OnboardingConfig) => {
      const s = current.current;
      if (!s) return;
      const paper = {
        ...defaultPaper,
        ...s.active.document.paper,
        stock: config.stock,
      };
      const active = appendEvent(s.active, {
        ...makeEvent("paper", "", s.mode || "draft"),
        paper,
      });
      const nextOwner: Owner = {
        name: config.name.slice(0, 48),
        seed: s.owner?.seed || 1971,
        enrolled: true,
      };
      const nextSettings: Settings = {
        ...s.settings,
        model: config.model,
        variations: config.variations,
        desk: config.desk,
        light: config.light,
        roomLight: s.settings.roomLight,
        deskLightIntensity: s.settings.deskLightIntensity,
        railLightIntensity: s.settings.railLightIntensity,
        layoutPreset: config.layoutPreset,
        visibleControls: config.visibleControls,
        clockStyle: config.clockStyle,
        clock: true,
        clockChosen: true,
        paper,
      };
      commit(
        {
          ...s,
          owner: nextOwner,
          settings: nextSettings,
          active,
        },
        true,
      );
      setOnboardingOpen(false);
      onboardingBefore.current = null;
      machineAudio.physical("card");
      setTimeout(() => writer.current?.focus(), 0);
    },
    [commit, later],
  );

  const handleLivePreview = useCallback(
    (patch?: Partial<Settings>, paperPatch?: Partial<PaperOptions>) => {
      const s = current.current;
      if (!s) return;
      let nextStore = { ...s };
      if (patch) {
        nextStore = {
          ...nextStore,
          settings: { ...nextStore.settings, ...patch },
        };
      }
      if (paperPatch) {
        const paper = {
          ...defaultPaper,
          ...s.active.document.paper,
          ...paperPatch,
        };
        nextStore = {
          ...nextStore,
          active: {
            ...nextStore.active,
            document: {
              ...nextStore.active.document,
              paper,
            },
          },
          settings: {
            ...nextStore.settings,
            paper,
          },
        };
      }
      current.current = nextStore;
      setStore(nextStore);
    },
    [],
  );

  const roll = useCallback(
    (value: number, sound = true) => {
      const before = Math.round(feedRef.current);
      const next = setFeedValue(value);
      if (sound && Math.round(next) !== before)
        machineAudio.tick(
          metricsRef.current.headColumn,
          Math.abs(next - before),
        );
    },
    [setFeedValue],
  );

  // ---- The tear --------------------------------------------------------
  useEffect(() => {
    const viewport = paperViewport.current;
    if (!viewport) return;
    // Wheel and trackpad events don't arrive in step with frames (none in
    // one, two in the next), and turning the platen on each made it judder.
    // They gather into one move per frame, which the paper then chases.
    let target: number | null = null,
      frame = 0;
    function scrollPaper(event: WheelEvent) {
      if (modal || phaseRef.current !== "idle" || event.ctrlKey) return;
      if (!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
      const m = metricsRef.current;
      const pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? m.lineHeight
          : event.deltaMode === 2
            ? viewport!.clientHeight
            : 1);
      const { min, max } = feedLimits(m);
      const from = target ?? feedRef.current;
      const next = Math.max(min, Math.min(max, from - pixels / m.lineHeight));
      // At either end, leave the roll and fixed desk in place.
      if (next === from) return;
      event.preventDefault();
      event.stopPropagation();
      target = next;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (target === null) return;
        setRollKind("scroll");
        roll(target);
        target = null;
      });
    }
    // React's wheel listener is passive; feeding the roll must consume this gesture.
    viewport.addEventListener("wheel", scrollPaper, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("wheel", scrollPaper);
    };
  }, [modal, roll]);

  const present = useCallback(() => {
    const s = current.current;
    if (
      !s ||
      !writable.current ||
      (!s.active.document.marks.length && !s.active.document.title?.trim()) ||
      phaseRef.current !== "idle"
    )
      return false;
    void machineAudio.unlock();
    nextPiece.current = newPiece(s.settings.paper || defaultPaper);
    setPhaseValue("presenting");
    setFeedValue(0);
    machineAudio.roll(PRESENT, 30);
    return true;
  }, [setFeedValue, setPhaseValue]);
  const release = useCallback(() => {
    // Not torn far enough: the paper settles back and nothing is lost.
    tearRef.current = 0;
    setTear(0);
    machineAudio.roll(PRESENT, 30);
    setPhaseValue("idle");
  }, [setPhaseValue]);
  const completeTear = useCallback(() => {
    const s = current.current;
    const fresh =
      nextPiece.current || newPiece(s?.settings.paper || defaultPaper);
    if (!s) return;
    tearRef.current = 1;
    setTear(1);
    machineAudio.finishTear();
    setPhaseValue("away");
    const settleInArchive = () => {
      const latest = current.current!;
      openedPieceFocus.current = fresh.id;
      commit(
        {
          ...latest,
          tearProgress: 0,
          active: fresh,
          pieces: [
            indexPiece({ ...latest.active, torn: Date.now() }),
            ...latest.pieces,
          ],
        },
        true,
      );
      void navigator.storage?.persist?.();
      tearRef.current = 0;
      setTear(0);
      bellRow.current = -1;
      setFeedValue(0);
      machineAudio.settle();
      // Leave the matching torn edge at the bar before feeding the new tongue.
      setPhaseValue("emerging");
      later(180, () => machineAudio.roll(4, 30));
      later(620, () => {
        setPhaseValue("idle");
        nextPiece.current = null;
        setNotice("Saved to archive.");
      });
    };
    filingFlight.current = fileToArchive(
      paperViewport.current,
      archiveTray.current,
      reducedRef.current,
      settleInArchive,
    );
  }, [commit, later, setFeedValue, setPhaseValue]);
  const finish = useCallback(() => {
    if (!present()) return;
    setTearFrom("left");
    machineAudio.beginTear();
    if (reducedRef.current) {
      completeTear();
      return;
    }
    // A steady hand across the bar.
    later(260, () => {
      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / 480);
        const eased = tearProgress(1 - (1 - progress) ** 2);
        tearRef.current = eased;
        setTear(eased);
        machineAudio.tearTo(eased, 1.1);
        if (progress < 1) coast.current = requestAnimationFrame(step);
        else completeTear();
      };
      coast.current = requestAnimationFrame(step);
    });
  }, [present, completeTear, later]);

  const openDrawer = useCallback((wasteView = false) => {
    clearTimeout(drawerCloseTimer.current);
    setManual(false);
    setDrawerClosing(false);
    setDrawer(true);
    setWaste(wasteView);
    setSearch("");
    void flushStore().catch(() => {});
    // The drawer voices its own opening when it mounts.
    void machineAudio.unlock();
  }, []);
  const finishClosingDrawer = useCallback(() => {
    clearTimeout(drawerCloseTimer.current);
    setDrawer(false);
    setDrawerClosing(false);
    writer.current?.focus();
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerClosing(true);
    machineAudio.drawerClose();
    clearTimeout(drawerCloseTimer.current);
    // The animation event owns normal completion. This also closes a hidden
    // tab, where the browser may pause its animation timeline.
    drawerCloseTimer.current = setTimeout(
      finishClosingDrawer,
      reducedRef.current ? 120 : 1000,
    );
  }, [finishClosingDrawer]);
  /** The desk tray opens the archive; its wastebasket lives inside the drawer. */
  const showDrawer = (wasteView: boolean) => {
    if (drawer && !drawerClosing) {
      if (waste === wasteView) closeDrawer();
      else {
        machineAudio.paperShuffle();
        setWaste(wasteView);
        setSearch("");
      }
    } else openDrawer(wasteView);
  };
  const uncover = useCallback(() => {
    const s = current.current;
    if (!s || s.uncovered) return;
    void machineAudio
      .unlock()
      .then(() =>
        machineAudio.rustle({ gain: 0.4, duration: 0.5, lowpass: 1200 }),
      );
    setLifting(true);
    commit({ ...s, uncovered: true });
    later(560, () => setLifting(false));
    setTimeout(() => writer.current?.focus(), 0);
  }, [commit, later]);

  // Every key sounds the moment it goes down, before the edit lands.
  useEffect(() => {
    function voice(e: KeyboardEvent) {
      const s = current.current;
      if (
        e.isComposing ||
        e.metaKey ||
        e.ctrlKey ||
        !s?.uncovered ||
        !s.owner?.enrolled ||
        !writable.current ||
        modal ||
        phaseRef.current !== "idle"
      )
        return;
      const target = e.target as HTMLElement;
      const onPaper = Boolean(target.closest?.(".cm-editor"));
      if (
        !onPaper &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.closest?.(
            "button, select, [role='slider'], [role='switch'], .reference-card, .desk-controls",
          ))
      )
        return;
      void machineAudio.unlock();
      const column = metricsRef.current.headColumn;
      if (e.key === "Enter") {
        if (e.repeat) machineAudio.tick(0, 1);
        else machineAudio.carriageReturn(column);
      } else if (e.key === "Backspace") {
        if ((s.mode || "draft") === "ink" && !e.altKey)
          machineAudio.backspace(column);
        else machineAudio.correction(column);
      } else if (e.key === " ") machineAudio.space(column);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown")
        machineAudio.tick(column, 1);
      else if (Array.from(e.key).length === 1 && !e.altKey)
        machineAudio.strike(e.key, column, { repeat: e.repeat });
    }
    window.addEventListener("keydown", voice, true);
    return () => window.removeEventListener("keydown", voice, true);
  }, [modal]);

  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (e.key === "Escape" && manual) {
        e.preventDefault();
        closeReference();
        return;
      }
      if (modal) return;
      const target = e.target as HTMLElement;
      if (target.closest(".desk-clock, .desk-controls")) return;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return;
      if (
        target.closest(".cm-editor") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.key === "Tab" ||
        e.key === "Escape"
      )
        return;
      if (target.closest("button") && (e.key === " " || e.key === "Enter"))
        return;
      if (Array.from(e.key).length === 1 || e.key === "Enter") {
        e.preventDefault();
        const s = current.current;
        if (!s) return;
        if (!s.uncovered) {
          uncover();
          return;
        }
        writer.current?.focus();
        writer.current?.insert(e.key === "Enter" ? "\n" : e.key);
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [modal, manual, uncover]);

  function continuePiece(piece: Piece) {
    const s = current.current;
    if (!s) return;
    const saved =
      s.active.document.marks.length || s.active.document.title?.trim()
        ? [{ ...s.active, torn: Date.now() }]
        : [];
    const active = appendEvent(
      {
        ...piece,
        torn: null,
        discardedAt: null,
        continuedFrom: [...piece.continuedFrom, piece.torn || Date.now()],
        document: {
          ...piece.document,
          cursor: piece.document.marks.length,
          selection: {
            anchor: editingText(piece.document).length,
            head: editingText(piece.document).length,
          },
        },
      },
      makeEvent("seam", "", mode),
    );
    openedPieceFocus.current = active.id;
    commit({
      ...s,
      active,
      tearProgress: 0,
      pieces: [...saved, ...s.pieces.filter((p) => p.id !== piece.id)],
    });
    setDrawer(false);
    initializedPiece.current = "";
    setFeedValue(0);
    machineAudio.roll(5, 30);
  }
  function discard(piece: Piece) {
    if (current.current) {
      if (
        current.current.pieces.filter((p) => p.discardedAt).length >=
        WASTEBASKET_CAPACITY
      ) {
        setNotice(
          "The wastebasket is full. Empty it before discarding another paper.",
        );
        return;
      }
      commit({
        ...current.current,
        pieces: current.current.pieces.map((p) =>
          p.id === piece.id ? { ...p, discardedAt: Date.now() } : p,
        ),
      });
      setDrawer(true);
    }
  }
  function shredDiscardedPaper(id: string) {
    const s = current.current;
    if (!s) return;
    commit(shredPaper(s, id), true);
  }
  function restore(piece: Piece) {
    if (current.current) {
      commit({
        ...current.current,
        pieces: current.current.pieces.map((p) =>
          p.id === piece.id ? { ...p, discardedAt: null } : p,
        ),
      });
      setNotice("Paper returned to the drawer.");
    }
  }
  async function backup() {
    if (!current.current) return;
    try {
      const archive = await archiveStore(current.current);
      download(
        "deckle-archive-with-replay.json",
        JSON.stringify(archive, null, 2),
        "application/json",
      );
    } catch {
      setError(
        "The archive could not be read. Your papers have not been changed.",
      );
    }
  }
  async function importArchive(file: File) {
    try {
      if (!writable.current) return;
      const incoming = migrateStore(JSON.parse(await file.text()));
      const merged = mergeArchive(current.current!, incoming);
      commit(merged.store, true);
      await flushStore();
      setNotice(
        `${merged.imported} papers imported${merged.skipped ? `; ${merged.skipped} already on this desk` : ""}.`,
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "The archive could not be opened. No papers were changed.",
      );
    }
  }
  async function openPiece(piece: Piece) {
    const full = await hydratePiece(piece);
    if (!writable.current || !current.current) {
      throw new Error("The desk is not ready yet.");
    }
    continuePiece(full);
  }
  function pullCord() {
    void machineAudio.unlock().then(() => {
      machineAudio.cordPull();
    });
    setPulled((n) => n + 1);
    const nextIntensity = deskIntensity > 0.1 ? 0 : 0.85;
    updateSettings({
      deskLightIntensity: nextIntensity,
      light:
        nextIntensity > 0
          ? roomLight
            ? "mixed"
            : "lamp"
          : roomLight
            ? "day"
            : "lamp",
    });
  }

  const writingDoc = practiceDoc ??
    store?.active.document ?? { marks: [], cursor: 0 };
  const caret = caretOffset(writingDoc);
  const currentLine = documentLines(writingDoc).find(
    (line) => line.from <= caret && line.to >= caret,
  );
  const inSection = currentLine?.block === "h1" || currentLine?.block === "h2";
  const paperCounts = useMemo(
    () => ({
      lines: paperLineCount(writingDoc),
      characters: characterCount(editingText(writingDoc)),
    }),
    [writingDoc.marks],
  );
  const hasWriting = writingDoc.marks.length > 0;
  const canArchive = hasWriting || Boolean(writingDoc.title?.trim());
  const lineHeight = metrics.lineHeight || 31;
  const presented = phase === "presenting" || phase === "away";
  // Every line is typed at the slot; the whole continuous roll moves.
  const paperY =
    paperWindowHeight -
    PRINT_GAP -
    lineHeight -
    paperLead -
    metrics.headTop +
    feed * lineHeight -
    (presented ? PRESENT * lineHeight : 0);
  const stripHeight = paperLead + metrics.height + paperWindowHeight + 120;
  const paperCurl = paperCurlProfile(paperY);
  const activeId = practiceDoc
    ? "setup-practice"
    : store?.active.id || "loading";
  useEffect(() => {
    if (
      !drawer &&
      !readOnly &&
      phase === "idle" &&
      openedPieceFocus.current === activeId
    ) {
      openedPieceFocus.current = null;
      writer.current?.focus();
    }
  }, [drawer, readOnly, activeId, phase]);
  const activePaper = writingDoc.paper || settings?.paper || defaultPaper;
  const activeModel = getTypewriterModel(settings?.model || "d01");
  const activeFinish = modelVariation(
    activeModel,
    "finish",
    settings?.variations?.finish,
  );
  const activeKnob = modelVariation(
    activeModel,
    "knob",
    settings?.variations?.knob,
  );
  const activeAccent = modelVariation(
    activeModel,
    "accent",
    settings?.variations?.accent,
  );
  const roughness = stocks[activePaper.stock].roughness;
  const clip = useMemo(
    () =>
      paperClip(
        activeId,
        presented && nextPiece.current
          ? {
              at: paperWindowHeight - paperY - 2,
              seed: nextPiece.current.id,
              progress: tear,
              from: tearFrom,
              roughness,
            }
          : undefined,
      ),
    [activeId, presented, paperY, paperWindowHeight, tear, tearFrom, roughness],
  );
  const headX = Math.max(
    0,
    strikeActive && !carriageDragging && !reduced
      ? typebarStrike.x
      : metrics.headX + (metrics.rtl ? -1 : 1) * (metrics.charWidth / 2),
  );
  const lampTone = settings?.deskLightTone ?? "tungsten";
  const railIntensity = settings?.railLightIntensity ?? 0;
  const railTone = settings?.railLightTone ?? "tungsten";
  const lampsOn = deskIntensity > 0 || railIntensity > 0;
  const feedRange = feedLimits(metrics);

  const filed = store?.pieces.filter((p) => !p.discardedAt) || [];
  const owner = store?.owner || { name: "", seed: 1971, enrolled: false };
  const lightData = lights[light];

  return (
    <main
      ref={deskRoot}
      style={
        {
          "--scene-scale": sceneScale,
          "--type-size": `${TYPE_SIZES[typeSize(settings ?? { largeType: false }) - 1].pixels}px`,
          "--paper-window-height": `${paperWindowHeight}px`,
          "--paper-lead": `${paperLead}px`,
          "--top-light-x": `${railLight.x}px`,
          "--top-light-y": "54px",
          "--rail-light-width": `${railLight.width}px`,
          "--rail-light-x": `${railLight.x}px`,
          "--rail-light-y": `${railLight.y}px`,
          "--lamp-color": lightColor(lampTone, settings?.deskLightColor),
          "--rail-color": lightColor(railTone, settings?.railLightColor),
          "--rail-light-intensity": railIntensity,
          "--rail-shadow-opacity": railIntensity * (1 - deskIntensity * 0.7),
          "--top-paper-spread": `${55 + (settings?.deskLightSpread ?? 0.5) * 45}%`,
          "--top-paper-reach": `${65 + (settings?.deskLightReach ?? 0.5) * 55}%`,
          "--rail-paper-spread": `${65 + (settings?.railLightSpread ?? 0.65) * 35}%`,
          "--rail-paper-reach": `${14 + (settings?.railLightReach ?? 0.55) * 42}%`,
          "--window-opacity": roomLight ? lightData.window : 0.04,
          "--shadow-x": `${roomLight && !lampsOn ? lightData.shadowX : 0}px`,
          "--shadow-y": `${roomLight && !lampsOn ? lightData.shadowY : 18 * deskIntensity - 12 * railIntensity}px`,
          "--room-light-opacity": roomLight ? 1 : 0,
          "--desk-light-intensity": deskIntensity,
        } as CSSProperties
      }
      onPointerDown={() => void machineAudio.unlock()}
      data-customizing={manual ? referenceTab.toLowerCase() : undefined}
      data-desk-focus={deskFocus || undefined}
      data-guided={onboardingOpen || undefined}
      data-mobile={mobileView.mobile || undefined}
      data-ghost-review-docked={!!ghostReviewLayout.height || undefined}
      data-keyboard={mobileView.keyboard || undefined}
      data-setup-lesson={setupLesson || undefined}
      className={`desk desk-refined ${ghostWorking ? "ghostwriter-working" : ""} ${manual || onboardingOpen ? "settings-open" : ""} ${roomLight ? "room-light-on" : "room-light-off"} ${lampsOn ? "lamp-active" : "lamp-off"} ${lampsOn ? "lamplight" : "daylight"} ${railIntensity > 0 ? "rail-light-on" : ""} ${reduced ? "reduce-motion" : ""} ${`surface-${settings?.desk || "cherry"} light-${light}`} ${drawer && !drawerClosing ? "drawer-is-open" : ""}  ${settings?.immersive ? "immersive" : ""} ${holderShown ? "holder-open" : ""} ${holderPulled ? "holder-dragging" : ""}`}
    >
      <svg className="ink-defs" width="0" height="0" aria-hidden="true">
        <filter id="ink-edge" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="7"
            result="fibre"
          />
          <feDisplacementMap in="SourceGraphic" in2="fibre" scale="1.1" />
        </filter>
      </svg>
      <button
        type="button"
        className={`pendant-lamp ${deskIntensity > 0 ? "is-lit" : ""}`}
        style={{
          transform: `translateX(-50%) translateX(${cameraCss.x}) scale(${cameraCss.scale})`,
        }}
        aria-label={
          deskIntensity > 0 ? "Turn off the top lamp" : "Turn on the top lamp"
        }
        aria-pressed={deskIntensity > 0}
        onClick={pullCord}
        disabled={modal && !lightInteraction}
      >
        <img src="/objects/pendant-lamp.png" alt="" draggable={false} />
        <span className="pendant-glare" aria-hidden="true" />
        <span className="pendant-emitter" aria-hidden="true" />
      </button>
      <div className="window-light" aria-hidden="true" />
      <div className="room-ambient-veil" aria-hidden="true" />
      <button
        type="button"
        className="mobile-desk-open mobile-only"
        popoverTarget="mobile-desk"
        disabled={modal || !store?.uncovered}
        aria-label="Open desk controls"
      >
        <SlidersHorizontal size={17} aria-hidden="true" /> Desk
      </button>
      <div
        ref={mobileDesk}
        id="mobile-desk"
        className="mobile-desk-sheet"
        popover={mobileView.mobile && !onboardingOpen ? "auto" : undefined}
        onBeforeToggle={(event) => {
          if (event.newState === "open") {
            (document.activeElement as HTMLElement | null)?.blur();
            if (holderOpen) toggleHolder(false);
          }
        }}
        onClickCapture={(event) => {
          if (
            mobileView.mobile &&
            (event.target as Element).closest("button[data-layout-control]")
          )
            mobileDesk.current?.hidePopover();
        }}
      >
        <header className="mobile-sheet-heading mobile-only">
          <span>The desk</span>
          <button
            type="button"
            popoverTarget="mobile-desk"
            popoverTargetAction="hide"
            aria-label="Close desk controls"
          >
            <X size={20} />
          </button>
        </header>
        {settings && (
          <DeskControls
            settings={settings}
            disabled={modal || !store?.uncovered}
            update={updateSettings}
            onSettings={() => openReference()}
            onShare={() => store && setSharing(store.active)}
            onCopy={() => {
              if (!current.current) return;
              void copyPaper(current.current.active.document)
                .then((result) =>
                  setNotice(
                    result === "formatted"
                      ? "Paper copied with formatting."
                      : "Paper copied as plain text.",
                  ),
                )
                .catch((error) =>
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "The paper could not be copied.",
                  ),
                );
            }}
            onFocus={() => {
              machineAudio.hush(!settings.immersive);
              if (!settings.immersive && holderOpen) toggleHolder(false);
              updateSettings({ immersive: !settings.immersive });
              writer.current?.focus();
            }}
          />
        )}
      </div>
      <div className="mobile-room-controls">
        {store && (
          <RoomWallSwitch
            on={roomLight}
            hidden={!!settings?.immersive || (modal && !lightInteraction)}
            onToggle={() => updateSettings({ roomLight: !roomLight })}
          />
        )}
        {store && (
          <ActivityMeter
            activity={settleActivity(store.activity, localDay())}
            lines={store.linesToday}
            hidden={modal && !batteryLesson}
            guidedOpen={batteryLesson ? setupBatteryOpen : undefined}
            onOpenChange={batteryLesson ? setSetupBatteryOpen : undefined}
            retired={!!settings?.immersive}
            reducedMotion={reduced}
          />
        )}
      </div>
      {sharing && (
        <SharePaper
          piece={sharing}
          onClose={() => {
            setSharing(null);
            writer.current?.focus();
          }}
        />
      )}
      {error && (
        <div className="storage-error" role="alert">
          {error}
          {store && <button onClick={backup}>Export a recovery copy</button>}
        </div>
      )}
      <button
        key={pulled}
        className={`pull-cord ${pulled ? "pulled" : ""}`}
        style={{
          translate: settings?.immersive ? "0 -110%" : `${cameraCss.cord} 0`,
        }}
        inert={settings?.immersive || undefined}
        onClick={pullCord}
        aria-label={`Pull the cord to turn ${deskIntensity > 0 ? "off" : "on"} the top lamp`}
        title={deskIntensity > 0 ? "Top lamp off" : "Top lamp on"}
      >
        <span className="cord" />
        <span className="cord-bead" />
      </button>
      <div
        ref={deskStage}
        className="desk-objects"
        style={{ transform: deskTransform }}
        inert={(modal && !lightInteraction && !editingLesson) || undefined}
      >
        {store && settings?.clock !== false && (
          <DeskClock
            time={clock}
            hidden={!!settings?.immersive}
            style={settings?.clockStyle || "studio"}
            position={settings?.clockPosition}
            onMove={(pos) => updateSettings({ clockPosition: pos })}
            ticking={!!settings?.ticking && !settings?.muted}
            onToggleTicking={() =>
              updateSettings({
                ticking: !(settings?.ticking && !settings?.muted),
                muted: false,
              })
            }
            sceneScale={sceneScale}
          />
        )}
        <section className="instrument" aria-label="Deckle writing machine">
          <div className="paper-window" ref={paperViewport}>
            <div
              style={
                {
                  "--tear-progress": tear,
                  "--tear-angle": `${(tearFrom === "left" ? 1 : -1) * tear * 4}deg`,
                  transformOrigin: `${tearFrom === "left" ? "100%" : "0%"} ${paperWindowHeight}px`,
                } as CSSProperties
              }
              className={`paper-motion ${presented ? "paper-pulling" : ""} ${phase === "away" ? "paper-away" : ""} ${phase === "emerging" ? "paper-emerge" : ""}`}
            >
              <div
                className={`paper-impact ${strikes ? `jolt-${strikes % 2}` : ""}`}
                style={
                  {
                    "--crest-inset": `${(paperCurl.crest / CREST_RADIUS) * 8}%`,
                    "--crest-depth": `${paperCurl.crest * 4}px`,
                  } as CSSProperties
                }
              >
                <div className="paper-flat">
                  <div
                    className="paper-strip"
                    data-roll={rollKind ?? undefined}
                    onTransitionEnd={(e) => {
                      // Only the strip's own travel; the ink and light
                      // inside it have transitions of their own.
                      if (
                        e.target !== e.currentTarget ||
                        e.propertyName !== "transform" ||
                        knob.current
                      )
                        return;
                      setRollKind(null);
                      setRollLines(3);
                    }}
                    style={
                      {
                        "--paper-feed-offset": `${paperY}px`,
                        "--roll-lines": rollLines,
                        height: `${stripHeight}px`,
                        transform: `translate3d(0, ${paperY}px, 0)`,
                      } as CSSProperties
                    }
                    onMouseDown={(e) => {
                      if (
                        !(e.target as HTMLElement).closest(
                          ".cm-content, input, button, [contenteditable]",
                        )
                      ) {
                        e.preventDefault();
                        if (!modal && !tearing) writer.current?.focus();
                      }
                    }}
                  >
                    <div className="paper-shadow" aria-hidden="true" />
                    <div
                      className="tear-fringe"
                      aria-hidden="true"
                      style={
                        {
                          ...paperVariables(activePaper),
                          clipPath: clip,
                        } as CSSProperties
                      }
                    />
                    <div
                      className={`paper-sheet stock-${activePaper.stock}`}
                      style={
                        {
                          ...paperVariables(activePaper),
                          clipPath: clip,
                        } as CSSProperties
                      }
                    >
                      <div className="paper-head">
                        <PaperTitle
                          ref={titleInput}
                          placeholder={autoTitle(writingDoc) || "Add a title"}
                          value={writingDoc.title || ""}
                          disabled={readOnly || modal}
                          onChange={(title) =>
                            apply(makeEvent("title", title, mode))
                          }
                          onDone={() => writer.current?.focus()}
                        />
                        <Stamp stamp={writingDoc.stamp} fresh={freshStamp} />
                      </div>
                      <div
                        className={`paper-writing ruling-${paperRuling(activePaper)}`}
                        style={
                          { "--rule-line": `${lineHeight}px` } as CSSProperties
                        }
                      >
                        <PaperEditor
                          ref={writer}
                          document={writingDoc}
                          pieceId={activeId}
                          mode={mode}
                          disabled={
                            !store ||
                            !store.uncovered ||
                            (modal && !editingLesson) ||
                            tearing ||
                            readOnly
                          }
                          feedOffset={paperY}
                          layoutKey={`${sceneScale}/${activePaper.element}/${activePaper.initials}/${typeSize(settings ?? { largeType: false })}`}
                          onLineLimit={() =>
                            setNotice(
                              `Paper full · ${PAPER_LINE_LIMIT} lines. Save to archive for a fresh sheet.`,
                            )
                          }
                          onCut={(cut) => pickUp(cut, false)}
                          onCopied={(copy) => pickUp(copy, true)}
                          onPasted={(paste) => {
                            const strip = heldStrip.current;
                            heldStrip.current = null;
                            if (!paste.external) {
                              // Your own words: the strip in hand is taped
                              // down where they landed.
                              setPasteTag(null);
                              if (strip?.active && paste.at)
                                strip.land(paste.at);
                              else machineAudio.tape();
                              return;
                            }
                            strip?.setAside();
                            if (paste.as === "clipping") machineAudio.tape();
                            else
                              machineAudio.retype(
                                paste.text,
                                metricsRef.current.headColumn,
                              );
                            setPasteTag({ as: paste.as, id: Date.now() });
                          }}
                          onOverflow={(text) => {
                            if (practice.current) return;
                            // Too long to paste onto the paper: it goes on the
                            // copy holder to write from instead.
                            const notes = store ? pieceNotes(store.active) : "";
                            setNotes(notes ? `${notes}\n\n${text}` : text);
                            if (!holderOpen) toggleHolder(true);
                            machineAudio.clipSnap();
                            setNotice(
                              "Too long for this paper · added to your notes instead.",
                            );
                          }}
                          onFormat={format}
                          onEdit={edit}
                          onRestore={restoreEditing}
                          onSelection={rememberSelection}
                          onMetrics={paperMetrics}
                          onStrike={(x) =>
                            setTypebarStrike((previous) => ({
                              id: previous.id + 1,
                              x,
                            }))
                          }
                          onGhostVoice={(text) => {
                            const column = metricsRef.current.headColumn;
                            if (!text) machineAudio.correction(column);
                            else if (text === "\n")
                              machineAudio.carriageReturn(column);
                            else if (text === " ") machineAudio.space(column);
                            else machineAudio.strike(text, column);
                          }}
                          onFocus={() => {
                            void machineAudio.unlock();
                          }}
                        />
                        {(manual || onboardingOpen) && !hasWriting && (
                          <div
                            className="customization-specimen"
                            aria-hidden="true"
                          >
                            <span
                              className={`ink-glyph element-${activePaper.element}`}
                            >
                              Aa Bb Cc
                            </span>
                            <br />
                            <span
                              className={`ink-glyph element-${activePaper.element}`}
                            >
                              A place for your words.
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="paper-light" aria-hidden="true" />
                      <div className="paper-raking" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                <PaperCurl feedOffset={paperY} paper={activePaper} />
              </div>
            </div>
            <div className="paper-bend" aria-hidden="true" />
            {presented && (
              <div
                className={`tear-line from-${tearFrom}`}
                style={{ "--tear": tear } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="machine-shadow" aria-hidden="true" />
          <div
            className={`machine machine-${activeModel.id} finish-${activeFinish} knob-${activeKnob} accent-${activeAccent}`}
            inert={editingLesson || undefined}
          >
            <div className="machine-deck">
              <button
                className={`element-cover element-${activePaper.element}`}
                onClick={() => openReference("Paper")}
                aria-label={`Change type element. ${activePaper.element} installed`}
                title={`Type element: ${activePaper.element}. Click to change`}
              >
                <span>
                  {activePaper.element === "book"
                    ? "B"
                    : activePaper.element === "italic"
                      ? "I"
                      : "C"}
                </span>
              </button>

              <div className="paper-slot" aria-hidden="true" />
              <div
                className={`tear-bar ${hasWriting ? "" : "is-idle"}`}
                role="slider"
                tabIndex={hasWriting ? 0 : -1}
                aria-label="Tear bar. Drag sideways to tear off the paper, or press Enter."
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(tear * 100)}
                title={hasWriting ? "Drag sideways to tear" : undefined}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    finish();
                  }
                }}
                onPointerDown={(e) => {
                  if (!present()) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    x: e.clientX,
                    at: performance.now(),
                    last: e.clientX,
                  };
                  machineAudio.beginTear();
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || phaseRef.current !== "presenting") return;
                  const dx = (e.clientX - d.x) / sceneScale;
                  if (Math.abs(dx) > 6 && tearRef.current === 0)
                    setTearFrom(dx > 0 ? "left" : "right");
                  const progress = Math.min(
                    1,
                    Math.max(
                      tearRef.current,
                      tearProgress((Math.abs(dx) - 10) / 320),
                    ),
                  );
                  const now = performance.now();
                  const speed =
                    Math.abs(e.clientX - d.last) /
                    sceneScale /
                    Math.max(8, now - d.at);
                  d.at = now;
                  d.last = e.clientX;
                  if (progress > tearRef.current) {
                    machineAudio.tearTo(progress, speed);
                    tearRef.current = progress;
                    setTear(progress);
                  }
                  if (progress >= 1) {
                    drag.current = null;
                    completeTear();
                  }
                }}
                onPointerUp={() => {
                  if (!drag.current) return;
                  drag.current = null;
                  if (tearRef.current > 0.6) completeTear();
                  else release();
                }}
                onPointerCancel={() => {
                  if (!drag.current) return;
                  drag.current = null;
                  release();
                }}
              >
                <span className="tear-teeth" />
              </div>
              <div className="carriage-rail" aria-hidden="true">
                <span className="rail-mount mount-left" />
                <span className="rail-mount mount-right" />
              </div>
              <span className="rail-lamp" aria-hidden="true" />
              <div
                className={`print-head ${headReturn ? "returning" : ""} ${carriageDragging ? "is-dragging" : ""} ${strikeActive ? "is-striking" : ""}`}
                style={
                  {
                    left: `${metrics.printOrigin}px`,
                    "--typebar-reach": `${Math.max(26, Math.min(54, 13 - metrics.strikeY))}px`,
                    transform: `translate3d(${headX}px, 0, 0)`,
                  } as CSSProperties
                }
              >
                <span
                  key={typebarStrike.id}
                  className={`typebar-strike ${strikeActive ? "is-striking" : ""}`}
                  aria-hidden="true"
                >
                  <i className="typebar-arm" />
                  <i className="typebar-slug" />
                </span>
                <button
                  type="button"
                  role="slider"
                  className={`head-body ${strikes ? `struck-${strikes % 2}` : ""}`}
                  aria-label="Carriage position"
                  aria-valuemin={0}
                  aria-valuemax={60}
                  aria-valuenow={metrics.headColumn}
                  aria-valuetext={`Column ${metrics.headColumn + 1}. Drag to move the cursor along this line.`}
                  title="Drag to move the cursor. Arrow keys move one character; Home and End move to the line edges."
                  disabled={
                    !store || !store.uncovered || modal || tearing || readOnly
                  }
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    carriageDrag.current = {
                      pointerId: e.pointerId,
                      offset: e.clientX - (rect.left + rect.width / 2),
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setStrikeActive(false);
                    setCarriageDragging(true);
                    void machineAudio.unlock();
                  }}
                  onPointerMove={(e) => {
                    const drag = carriageDrag.current;
                    if (!drag || drag.pointerId !== e.pointerId) return;
                    writer.current?.moveCarriage(
                      e.clientX -
                        drag.offset -
                        (metrics.charWidth * sceneScale) / 2,
                    );
                  }}
                  onPointerUp={(e) => {
                    if (!carriageDrag.current) return;
                    carriageDrag.current = null;
                    setCarriageDragging(false);
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    writer.current?.focus();
                  }}
                  onLostPointerCapture={() => {
                    carriageDrag.current = null;
                    setCarriageDragging(false);
                  }}
                  onPointerCancel={() => {
                    carriageDrag.current = null;
                    setCarriageDragging(false);
                  }}
                  onKeyDown={(e) => {
                    const direction = {
                      ArrowLeft: "left",
                      ArrowRight: "right",
                      Home: "start",
                      End: "end",
                    }[e.key];
                    if (direction) {
                      e.preventDefault();
                      e.stopPropagation();
                      manualCarriage.current = true;
                      setStrikeActive(false);
                      writer.current?.stepCarriage(
                        direction as "left" | "right" | "start" | "end",
                      );
                    } else if (e.key === "Enter" || e.key === "Escape") {
                      e.preventDefault();
                      writer.current?.focus();
                    }
                  }}
                >
                  <i className="head-guide" />
                  <i className="head-window" />
                </button>
              </div>
            </div>
            <div
              ref={mobileTools}
              id="mobile-writing-tools"
              className="machine-face"
              popover={
                mobileView.mobile && !onboardingOpen ? "auto" : undefined
              }
              inert={settings?.immersive || undefined}
            >
              <header className="mobile-sheet-heading mobile-only">
                <span>Writing tools</span>
                <button
                  type="button"
                  popoverTarget="mobile-writing-tools"
                  popoverTargetAction="hide"
                  aria-label="Close writing tools"
                >
                  <X size={20} />
                </button>
              </header>
              <div className="faceplate" aria-hidden="true" />
              <div
                className="deck-format-controls"
                role="toolbar"
                inert={modal || undefined}
                hidden={
                  !controls.some((id) =>
                    [
                      "bold",
                      "italic",
                      "ribbon",
                      "section",
                      "underline",
                      "typeface",
                      "typeSize",
                      "ruling",
                    ].includes(id),
                  )
                }
                aria-label="Writing format"
              >
                <div
                  className="machine-key-bank"
                  style={
                    {
                      "--format-key-count": controls.filter((id) =>
                        [
                          "bold",
                          "italic",
                          "ribbon",
                          "section",
                          "underline",
                        ].includes(id),
                      ).length,
                    } as CSSProperties
                  }
                  hidden={
                    !controls.some((id) =>
                      [
                        "bold",
                        "italic",
                        "ribbon",
                        "section",
                        "underline",
                      ].includes(id),
                    )
                  }
                >
                  <button
                    type="button"
                    className={`deck-mech-btn ${writingDoc.typingStyle?.strike === "double" ? "is-latched" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    {...keyVoice(-0.3)}
                    onClick={() => writer.current?.format("bold")}
                    title="Double-Strike / Bold"
                    aria-label="Double-strike bold"
                    data-layout-control="bold"
                    hidden={!controls.includes("bold")}
                    aria-pressed={writingDoc.typingStyle?.strike === "double"}
                  >
                    <span className="mech-label">Bold</span>
                  </button>
                  <button
                    type="button"
                    className={`deck-mech-btn ${writingDoc.typingStyle?.element === "italic" ? "is-latched" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    {...keyVoice(-0.15)}
                    onClick={() => writer.current?.format("italic")}
                    title="Italic / Slanted"
                    aria-label="Italic slanted"
                    data-layout-control="italic"
                    hidden={!controls.includes("italic")}
                    aria-pressed={writingDoc.typingStyle?.element === "italic"}
                  >
                    <span className="mech-label">Italic</span>
                  </button>
                  <button
                    type="button"
                    className={`deck-ribbon-rocker ${writingDoc.typingStyle?.ribbon === "red" ? "rocker-red" : "rocker-black"}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={() => void machineAudio.unlock()}
                    onClick={() => writer.current?.format("red")}
                    title="Switch between black and red ribbon"
                    aria-label="Red ribbon ink"
                    data-layout-control="ribbon"
                    hidden={!controls.includes("ribbon")}
                    aria-pressed={writingDoc.typingStyle?.ribbon === "red"}
                  >
                    <span className="rocker-face" aria-hidden="true">
                      <span className="rocker-dot dot-black">Blk</span>
                      <span className="rocker-lever" />
                      <span className="rocker-dot dot-red">Red</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`deck-mech-btn mech-heading ${inSection ? "is-latched" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    {...keyVoice(0.15)}
                    onClick={() =>
                      writer.current?.format(inSection ? "body" : "h1")
                    }
                    title={
                      inSection
                        ? "Return to normal text"
                        : "Section heading (#)"
                    }
                    aria-label={
                      inSection ? "Normal paragraph" : "Section heading"
                    }
                    aria-pressed={inSection}
                    data-layout-control="section"
                    hidden={!controls.includes("section")}
                  >
                    <span className="mech-label">
                      {inSection ? "Paragraph" : "Section"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`deck-mech-btn ${writingDoc.typingStyle?.underline ? "is-latched" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    {...keyVoice(0.3)}
                    onClick={() => writer.current?.format("underline")}
                    title="Underline"
                    aria-label="Underline"
                    data-layout-control="underline"
                    hidden={!controls.includes("underline")}
                    aria-pressed={!!writingDoc.typingStyle?.underline}
                  >
                    <span className="mech-label">Underline</span>
                  </button>
                </div>
                <MachinePaperControls
                  visible={controls}
                  paper={activePaper}
                  size={typeSize(settings ?? { largeType: false })}
                  update={updateSettings}
                  updatePaper={updatePaper}
                />
              </div>

              <div
                className="machine-identity"
                data-layout-control="identity"
                inert={modal || undefined}
              >
                <button
                  type="button"
                  className="brand-plate brand-plate-interactive"
                  onClick={() => openReference("Machine")}
                  title={`Model ${activeModel.badge} · Click to choose typewriter`}
                  aria-label={`Typewriter model: ${activeModel.name}. Open machine reference.`}
                >
                  <span className="machine-brand">{activeModel.brand}</span>
                  <span className="machine-model">
                    {activeModel.code} · {activeModel.name}
                  </span>
                </button>
                <div
                  className="file-counters"
                  hidden={!controls.includes("paperCounters")}
                  role="group"
                  aria-label="Paper counters"
                >
                  <div>
                    <span>LINES</span>
                    <RetroCounter
                      value={paperCounts.lines}
                      label="lines with writing in this paper"
                    />
                  </div>
                  <div>
                    <span>CHARS</span>
                    <RetroCounter
                      value={paperCounts.characters}
                      digits={6}
                      label="characters in this paper, including spaces"
                    />
                  </div>
                </div>
              </div>
              <RailLightFader
                hidden={!controls.includes("light") && !lightInteraction}
                intensity={railIntensity}
                disabled={
                  (modal && !lightInteraction) || readOnly || !store?.uncovered
                }
                onChange={(value) =>
                  updateSettings({ railLightIntensity: value })
                }
              />
              <div
                className="volume-group"
                data-layout-control="volume"
                hidden={!controls.includes("volume")}
                inert={modal || undefined}
              >
                <span className="engraved">VOL</span>
                <span className="wheel-slot">
                  <input
                    aria-label="Volume"
                    className="volume-wheel"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={settings?.muted ? 0 : settings?.volume || 0}
                    style={
                      {
                        "--turn": settings?.muted ? 0 : settings?.volume || 0,
                      } as CSSProperties
                    }
                    onChange={(e) => {
                      void machineAudio.unlock();
                      updateSettings({ volume: +e.target.value, muted: false });
                      machineAudio.tick(40, 1);
                    }}
                  />
                </span>
                <span
                  className={`volume-lamp ${settings?.volume && !settings?.muted ? "on" : ""}`}
                  aria-hidden="true"
                />
              </div>
              <div
                className="feed-control"
                data-layout-control="feed"
                hidden={!controls.includes("feed")}
                inert={modal || undefined}
              >
                <span className="engraved">FEED</span>
                <button
                  className="feed-knob"
                  role="slider"
                  aria-label="Paper feed. Arrow up to read earlier lines, arrow down to return."
                  aria-valuemin={feedRange.min}
                  aria-valuemax={feedRange.max}
                  aria-valuenow={Math.round(feed)}
                  onWheel={(e) => {
                    e.stopPropagation();
                    setRollKind("scroll");
                    roll(feedRef.current + Math.sign(e.deltaY));
                  }}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      e.stopPropagation();
                      setRollKind("step");
                      roll(
                        e.key === "Home"
                          ? feedRange.max
                          : e.key === "End"
                            ? 0
                            : feedRef.current + (e.key === "ArrowUp" ? 1 : -1),
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    cancelAnimationFrame(coast.current);
                    knob.current = {
                      y: e.clientY,
                      feed: feedRef.current,
                      lastY: e.clientY,
                      at: performance.now(),
                      velocity: 0,
                    };
                    setRollKind("drag");
                  }}
                  onPointerMove={(e) => {
                    const k = knob.current;
                    if (!k) return;
                    const now = performance.now();
                    k.velocity =
                      (e.clientY - k.lastY) / Math.max(1, now - k.at);
                    k.lastY = e.clientY;
                    k.at = now;
                    roll(k.feed + (e.clientY - k.y) / sceneScale / 11);
                  }}
                  onPointerUp={() => {
                    const k = knob.current;
                    knob.current = null;
                    if (!k) return;
                    if (reduced) {
                      setRollKind(null);
                      roll(Math.round(feedRef.current));
                      return;
                    }
                    // The rolled paper is heavy: a flick coasts briefly, then
                    // the ratchet catches the nearest line.
                    let velocity = k.velocity * 1.6;
                    let position = feedRef.current;
                    function tick() {
                      velocity *= 0.8;
                      position += velocity;
                      roll(position);
                      if (Math.abs(velocity) > 0.06)
                        coast.current = requestAnimationFrame(tick);
                      else {
                        setRollKind("step");
                        roll(Math.round(feedRef.current), false);
                      }
                    }
                    tick();
                  }}
                  onPointerCancel={() => {
                    knob.current = null;
                    setRollKind(null);
                  }}
                >
                  <span
                    className="knob-knurl"
                    style={{
                      transform: `rotate(${(-paperY / lineHeight) * 15}deg)`,
                    }}
                  >
                    <i />
                  </span>
                  <span className="knob-cap" />
                </button>
              </div>
              <div
                className="tear-control"
                data-layout-control="save"
                hidden={!controls.includes("save")}
                inert={modal || undefined}
              >
                <button
                  className="tear-key"
                  aria-label="Save paper to archive and start a fresh paper"
                  title="Save to archive"
                  disabled={!canArchive || tearing || modal || readOnly}
                  {...(canArchive && !tearing ? keyVoice(0.55) : {})}
                  onClick={finish}
                >
                  <span className="tear-key-mark" aria-hidden="true" />
                  <span className="tear-key-label">Save to archive</span>
                </button>
              </div>
              <span className="screw screw-left" />
              <span className="screw screw-right" />
            </div>
            <div className="mobile-machine-bar">
              <button
                type="button"
                className="mobile-machine-key mobile-only"
                aria-label="Open writing tools"
                disabled={
                  modal ||
                  readOnly ||
                  !store?.uncovered ||
                  !!settings?.immersive
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  (document.activeElement as HTMLElement | null)?.blur();
                  if (holderOpen) toggleHolder(false);
                  mobileTools.current?.showPopover({
                    source: event.currentTarget,
                  });
                  machineAudio.panel(true);
                }}
              >
                <Type size={17} aria-hidden="true" />
                <span>Tools</span>
              </button>
              {features.ghostwriter && (
                <Ghostwriter
                  writer={writer}
                  document={writingDoc}
                  pieceId={activeId}
                  userId={userId}
                  disabled={
                    readOnly ||
                    modal ||
                    tearing ||
                    !store?.uncovered ||
                    !!settings?.immersive
                  }
                  reduced={reduced}
                  machineView={deskView}
                  open={ghostOpen}
                  reviewHidden={holderOpen}
                  onOpenChange={(open) => {
                    setGhostOpen(open);
                    if (open && holderOpen) toggleHolder(false);
                  }}
                  onWorking={setGhostWorking}
                  onReviewLayout={reviewLayout}
                />
              )}
              <button
                type="button"
                className="mobile-machine-key mobile-file-key mobile-only"
                aria-label="File this paper"
                hidden={!controls.includes("save")}
                disabled={!canArchive || tearing || modal || readOnly}
                onClick={finish}
                {...(canArchive && !tearing ? keyVoice(0.55) : {})}
              >
                <i aria-hidden="true" />
                <span>File</span>
              </button>
              <button
                type="button"
                className="mobile-machine-key mobile-done-key mobile-only"
                aria-label="Dismiss keyboard"
                onClick={() =>
                  (document.activeElement as HTMLElement | null)?.blur()
                }
              >
                <Check size={17} aria-hidden="true" />
                <span>Done</span>
              </button>
            </div>
            <div className="machine-front" />
            <div className="machine-foot foot-left" />
            <div className="machine-foot foot-right" />
          </div>
          {store && (!store.uncovered || lifting) && (
            <button
              className={`dust-cover ${lifting ? "lifting" : ""}`}
              onClick={uncover}
              onPointerDown={(e) => {
                drag.current = { x: e.clientY, at: 0, last: 0 };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                if (drag.current && drag.current.x - e.clientY > 30) uncover();
                drag.current = null;
              }}
              aria-label="Lift the dust cover"
            >
              <span className="cover-seam" />
              <span className="cover-card">
                <span>Lift the cover.</span>
                <small>OR PRESS ANY KEY</small>
                <ArrowDown size={18} />
              </span>
            </button>
          )}
        </section>
      </div>
      <p id="writing-help" className="sr-only">
        Select text to edit it. Arrow keys move the cursor.
      </p>
      <div className="desk-front" inert={settings?.immersive || undefined}>
        <button
          ref={archiveTray}
          className="drawer-handle"
          onClick={() => showDrawer(false)}
          aria-label={`Open archive. ${filed.length} finished ${filed.length === 1 ? "paper" : "papers"}.`}
          title="Open archive"
        >
          {/* The stack grows a sheet's edge per filed paper, up to a handful. */}
          <span className="tray-stack" aria-hidden="true">
            {filed.slice(1, 6).map((piece) => (
              <i key={piece.id} />
            ))}
          </span>
          <span key={filed[0]?.id} className="tray-card card-front">
            <span className="tray-title">
              {filed[0] ? title(filed[0]) : "Nothing filed yet."}
            </span>
            {filed[0] && (
              <span className="tray-date">
                {new Date(filed[0].torn || filed[0].created)
                  .toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })
                  .toUpperCase()}
              </span>
            )}
          </span>
          <span className="tray-lip" aria-hidden="true">
            <span className="tray-label">Archive · {filed.length}</span>
          </span>
        </button>
      </div>
      {error ? (
        <span className="local-note save-failed" role="status">
          Paper needs a recovery copy
        </span>
      ) : (
        <span className="sr-only" role="status">
          {cloudStorage.status}
        </span>
      )}
      <div className="sr-only" role="document" aria-label="Current paper">
        {markdown(writingDoc)}
      </div>
      {(manual || settingsClosing) && !onboardingOpen && settings && (
        <ReferenceCard
          cloudStorage={cloudStorage}
          onFocusChange={setLampFocus}
          closing={settingsClosing}
          reducedMotion={reduced}
          onClosed={() => setSettingsClosing(false)}
          tab={referenceTab}
          onTabChange={setReferenceTab}
          settings={settings}
          paper={activePaper}
          owner={owner}
          update={updateSettings}
          updatePaper={updatePaper}
          updateOwner={updateOwner}
          onClose={closeReference}
          onStartOnboarding={startOnboarding}
          notesStock={notesStock}
          onNotesStock={(stock) => {
            setNotesStock(stock);
            localStorage.setItem("deckle:notes-stock", stock);
          }}
        />
      )}
      {store?.setupPending === true &&
        !modal &&
        !readOnly &&
        !settings?.immersive && (
          <OnboardingSuggestion
            onStart={startOnboarding}
            onSkip={skipOnboarding}
          />
        )}
      {onboardingOpen && store && (
        <Onboarding
          onFocusChange={setSetupFocus}
          onTryControl={(target) => {
            setSetupFocus(target);
            setTimeout(
              () =>
                document
                  .querySelector<HTMLElement>(
                    target === "rail" ? ".light-fader-input" : ".pendant-lamp",
                  )
                  ?.focus(),
              0,
            );
          }}
          initialSettings={settings!}
          initialName={owner.name}
          initialModel={settings?.model || "d01"}
          initialVariations={settings?.variations}
          initialDesk={settings?.desk || "cherry"}
          initialLight={settings?.light || "auto"}
          initialStock={activePaper.stock || "bond"}
          initialClockStyle={settings?.clockStyle || "studio"}
          onComplete={handleOnboardingComplete}
          onCancel={() => {
            if (onboardingBefore.current)
              commit(onboardingBefore.current, true);
            onboardingBefore.current = null;
            setOnboardingOpen(false);
            setTimeout(() => writer.current?.focus(), 0);
          }}
          onLivePreview={handleLivePreview}
          onLessonChange={handleSetupLesson}
          notesOpen={setupNotesOpen}
          onToggleNotes={() => {
            setSetupNotesOpen((open) => !open);
            machineAudio.panel(!setupNotesOpen, -0.5);
          }}
          batteryOpen={setupBatteryOpen}
          onToggleBattery={() => setSetupBatteryOpen((open) => !open)}
          onSelectPractice={selectPractice}
        />
      )}
      {store && !settings?.immersive && (
        <CopyHolder
          mobile={mobileView.mobile}
          key={`${store.active.id}${notesLesson ? ":setup-notes" : ""}`}
          open={notesLesson ? setupNotesOpen : holderOpen}
          hidden={modal && !notesLesson}
          notes={notesLesson ? setupNotes : pieceNotes(store.active)}
          stock={notesStock}
          onOpen={
            notesLesson
              ? (open) => {
                  setSetupNotesOpen(open);
                  machineAudio.panel(open, -0.5);
                }
              : toggleHolder
          }
          onPull={notesLesson ? () => {} : pullHolder}
          onNotes={notesLesson ? setSetupNotes : setNotes}
        />
      )}
      {selecting &&
        !ghostWorking &&
        paperFocused &&
        !pointerHeld &&
        (!modal || editingLesson) &&
        store && (
          <SelectionBar
            locate={locateSelection}
            paperWindow={locatePaperWindow}
            active={selectionStyles(writingDoc)}
            only={
              editingLesson
                ? ["bold", "italic", "underline", "strike", "code"]
                : undefined
            }
            onCommand={selectionCommand}
          />
        )}
      {holding &&
        restingPaste &&
        !selecting &&
        paperFocused &&
        !pointerHeld &&
        !modal && (
          <SelectionBar
            locate={locateCaret}
            paperWindow={locatePaperWindow}
            active={{}}
            only={["paste"]}
            onCommand={selectionCommand}
          />
        )}
      {pasteTag && (
        <PasteTag
          tag={pasteTag}
          locate={locatePaste}
          onDismiss={dismissPasteTag}
          onSwap={() => {
            if (!writer.current?.repaste()) setPasteTag(null);
          }}
        />
      )}
      <DeskFocusGuide focus={deskFocus} />
      <div className="desk-notice" role="status">
        {notice}
      </div>
      <DeskLighting
        width={railLight.viewportWidth}
        height={railLight.viewportHeight}
        roomLit={roomLight}
        camera={{
          transform: deskTransform,
          originX: railLight.viewportWidth / 2,
          originY: railLight.stageTop,
        }}
        paper={{
          x: railLight.paperLeft,
          y: railLight.paperTop + Math.max(0, paperY),
          width: railLight.paperWidth,
          height: Math.max(0, railLight.paperHeight - Math.max(0, paperY)),
        }}
        machineHeight={settings?.immersive ? 46 : railLight.machineHeight}
        lamps={[
          {
            source: "overhead",
            x: railLight.x,
            y: 54,
            aperture: railLight.lampWidth * 0.89,
            availableReach: (railLight.viewportHeight - 54) * 1.4,
            spread: settings?.deskLightSpread ?? 0.5,
            reach: settings?.deskLightReach ?? 0.5,
            intensity: deskIntensity,
            colour: lightColor(lampTone, settings?.deskLightColor),
          },
          {
            source: "rail",
            x: railLight.x,
            y: railLight.y,
            aperture: railLight.width * 0.86,
            availableReach: railLight.y * 1.5,
            spread: settings?.railLightSpread ?? 0.65,
            reach: settings?.railLightReach ?? 0.55,
            intensity: railIntensity,
            colour: lightColor(railTone, settings?.railLightColor),
          },
        ]}
      />
      {drawer && (
        <PaperDrawer
          pieces={store?.pieces || []}
          waste={waste}
          search={search}
          setSearch={setSearch}
          searchRef={searchRef}
          onOpen={openPiece}
          onWasteChange={setWaste}
          onDiscard={discard}
          onRestore={restore}
          onClose={closeDrawer}
          closing={drawerClosing}
          onClosed={finishClosingDrawer}
          onBackup={() => void backup()}
          onImport={importArchive}
          onShred={shredDiscardedPaper}
          onShare={setSharing}
          reducedMotion={reduced}
        />
      )}
    </main>
  );
}
