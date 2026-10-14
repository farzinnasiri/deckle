"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  Play,
  Printer,
  Download,
  FileUp,
  MoreHorizontal,
  Search,
  Trash2,
  X,
  Share2,
} from "lucide-react";
import {
  title,
  exportMarkdown,
  WASTEBASKET_CAPACITY,
  type Piece,
} from "@/lib/writing";
import { download } from "@/lib/storage";
import { useDeskStorage } from "./desk-storage-provider";
import { machineAudio } from "@/lib/audio";
import { stocks } from "@/lib/materials";
import { tossIntoBin } from "./toss";
import { DeskBin } from "./wastebasket";
import { ArchiveDrawerScene } from "./archive-drawer-scene";
import {
  ArchivePaperPreview,
  type ArchivePreviewActions,
} from "./archive-paper-preview";

export type PaperArchiveDossierProps = {
  pieces: Piece[];
  waste: boolean;
  onWasteChange: (waste: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onOpen: (piece: Piece) => Promise<void>;
  onDiscard: (piece: Piece) => void;
  onRestore: (piece: Piece) => void;
  onClose: () => void;
  onClosed?: () => void;
  closing: boolean;
  onBackup: () => void;
  onImport: (file: File) => Promise<void>;
  onShred?: (id: string) => void;
  onShare?: (piece: Piece) => void;
  reducedMotion?: boolean;
};

export function PaperArchiveDossier({
  pieces,
  waste,
  onWasteChange,
  search,
  setSearch,
  searchRef,
  onOpen,
  onDiscard,
  onRestore,
  onClose,
  onClosed,
  closing,
  onBackup,
  onImport,
  onShred,
  onShare,
  reducedMotion = false,
}: PaperArchiveDossierProps) {
  const root = useRef<HTMLDivElement>(null);
  const binMouth = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const preview = useRef<ArchivePreviewActions>(null);
  const { searchPapers } = useDeskStorage();
  const [lifted, setLifted] = useState(waste);
  const [returning, setReturning] = useState(false);
  const [previewInstant, setPreviewInstant] = useState(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const keep = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(Boolean(search));
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [importing, setImporting] = useState(false);
  const [tossing, setTossing] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const returningToWriter = useRef(false);
  const focusPending = useRef(false);
  const ignoreDragClick = useRef(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [message, setMessage] = useState("");
  const [shredding, setShredding] = useState<Piece[] | null>(null);
  const [shredIndex, setShredIndex] = useState(0);
  const shredTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const onShredRef = useRef(onShred);
  onShredRef.current = onShred;
  const fileDrag = useRef<{
    piece: Piece;
    ghost: HTMLDivElement;
    x: number;
    y: number;
    startX: number;
    startY: number;
    time: number;
    vx: number;
    vy: number;
  } | null>(null);
  const wasteCount = pieces.filter((p) => p.discardedAt).length;
  const emptyOnOpen = useRef(
    !waste && pieces.every((piece) => piece.discardedAt),
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (
      root.current?.querySelector<HTMLElement>(".archive-open") ||
      root.current?.querySelector<HTMLElement>(
        '.archive-drawer-hit[aria-current="true"]',
      ) ||
      root.current?.querySelector<HTMLElement>(".archive-drawer-canvas") ||
      root.current?.querySelector<HTMLElement>(".archive-close")
    )?.focus();
    void machineAudio
      .unlock()
      .then(() => machineAudio.drawerOpen(emptyOnOpen.current));
    return () => {
      clearTimeout(shredTimer.current);
      clearTimeout(returnTimer.current);
      fileDrag.current?.ghost.remove();
      fileDrag.current = null;
      if (!returningToWriter.current) previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (closing) clearTimeout(shredTimer.current);
  }, [closing]);
  useEffect(() => {
    if (confirmEmpty) keep.current?.focus();
  }, [confirmEmpty]);
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching, searchRef]);

  useEffect(() => {
    let alive = true;
    if (!search.trim()) {
      setMatches(null);
      return;
    }
    const timer = setTimeout(() => {
      void searchPapers(search)
        .then((result) => {
          if (alive) setMatches(result);
        })
        .catch(() => {
          if (alive)
            setMatches(
              new Set(
                pieces
                  .filter((p) =>
                    (
                      title(p) +
                      " " +
                      p.document.marks.map((m) => m.text).join("")
                    )
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                  )
                  .map((p) => p.id),
              ),
            );
        });
    }, 80);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, pieces]);

  const displayed = useMemo(
    () =>
      pieces
        .filter((p) => Boolean(p.discardedAt) === waste)
        .filter((p) => (matches ? matches.has(p.id) : true))
        .sort((a, b) => (b.torn || b.created) - (a.torn || a.created)),
    [pieces, waste, matches],
  );
  const selectedIndex = Math.max(
    0,
    displayed.findIndex((p) => p.id === selectedId),
  );
  const selected = displayed[selectedIndex];
  useEffect(() => {
    if (
      !returning &&
      (focusPending.current || document.activeElement === document.body)
    ) {
      focusPending.current = false;
      (
        root.current?.querySelector<HTMLElement>(".archive-open") ||
        root.current?.querySelector<HTMLElement>(
          '.archive-drawer-hit[aria-current="true"]',
        ) ||
        root.current?.querySelector<HTMLElement>(".archive-drawer-canvas") ||
        root.current?.querySelector<HTMLElement>(".archive-close")
      )?.focus();
    }
  }, [selected?.id, waste, lifted, returning]);

  function select(index: number, lift = true, instant = false) {
    const piece = displayed[index];
    if (!piece || tossing || shredding || opening) return;
    // The drawer becomes inert before the browser clears its focused tab.
    // Request preview focus explicitly instead of waiting to observe BODY.
    focusPending.current = waste || lift;
    clearTimeout(returnTimer.current);
    setReturning(false);
    setPreviewInstant(instant);
    setSelectedId(piece.id);
    setLifted(waste || lift);
    menu.current?.removeAttribute("open");
    if (!waste && !lift) machineAudio.folderSlide();
    else if (!waste) machineAudio.folderLift();
    else machineAudio.paperShuffle();
  }
  function putBack(instant = false) {
    preview.current?.pause();
    clearTimeout(returnTimer.current);
    focusPending.current = true;
    const animate =
      !instant &&
      !reducedMotion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReturning(animate);
    setPreviewInstant(!animate);
    setLifted(false);
    if (animate)
      returnTimer.current = setTimeout(() => {
        setReturning(false);
      }, 260);
    machineAudio.folderReturn();
  }
  function changeView(next: boolean) {
    if (shredding || tossing || opening) return;
    focusPending.current = false;
    clearTimeout(returnTimer.current);
    setReturning(false);
    setConfirmEmpty(false);
    setMessage("");
    setSearch("");
    setSearching(false);
    setLifted(next);
    menu.current?.removeAttribute("open");
    onWasteChange(next);
    machineAudio.paperShuffle();
  }
  function throwAway(
    piece: Piece,
    paper: HTMLElement | null,
    cleanup = () => {},
  ) {
    if (tossing || shredding) {
      cleanup();
      return;
    }
    if (wasteCount >= WASTEBASKET_CAPACITY) {
      setMessage("Wastebasket full. Empty it to discard another paper.");
      cleanup();
      return;
    }
    setTossing(true);
    setDiscardingId(piece.id);
    setMessage("");
    tossIntoBin(paper, binMouth.current, reducedMotion, () => {
      cleanup();
      setTossing(false);
      setDiscardingId(null);
      onDiscard(piece);
      setLifted(false);
    });
  }
  function basketBounds() {
    return binMouth.current?.closest(".desk-bin")?.getBoundingClientRect();
  }
  function overBasket(x: number, y: number) {
    const bounds = basketBounds();
    return (
      !!bounds &&
      x >= bounds.left - 18 &&
      x <= bounds.right + 18 &&
      y >= bounds.top - 24 &&
      y <= bounds.bottom + 12
    );
  }
  function startFileDrag(index: number, x: number, y: number) {
    if (tossing || opening || shredding) return;
    const piece = displayed[index];
    if (!piece) return;
    fileDrag.current?.ghost.remove();
    const ghost = document.createElement("div");
    ghost.className = "archive-drag-file";
    ghost.setAttribute("aria-hidden", "true");
    const heading = document.createElement("strong");
    heading.textContent = title(piece);
    const excerpt = document.createElement("p");
    excerpt.textContent =
      piece.searchText ||
      piece.document.marks.map((mark) => mark.text).join("");
    ghost.append(heading, excerpt);
    ghost.style.left = `${x - 90}px`;
    ghost.style.top = `${y - 28}px`;
    document.body.append(ghost);
    fileDrag.current = {
      piece,
      ghost,
      x,
      y,
      startX: x,
      startY: y,
      time: performance.now(),
      vx: 0,
      vy: 0,
    };
  }
  function moveFileDrag(x: number, y: number) {
    const drag = fileDrag.current;
    if (!drag) return;
    const now = performance.now();
    const elapsed = Math.max(8, now - drag.time);
    if (x !== drag.x || y !== drag.y) {
      drag.vx = (x - drag.x) / elapsed;
      drag.vy = (y - drag.y) / elapsed;
      drag.time = now;
    }
    drag.x = x;
    drag.y = y;
    drag.ghost.style.transform = `translate(${x - drag.startX}px, ${y - drag.startY}px) rotate(${reducedMotion ? 0 : Math.max(-8, Math.min(8, drag.vx * 3))}deg)`;
    binMouth.current
      ?.closest(".archive-basket")
      ?.classList.toggle("is-drop-target", overBasket(x, y));
  }
  function endFileDrag(cancelled = false) {
    const drag = fileDrag.current;
    if (!drag) return;
    fileDrag.current = null;
    ignoreDragClick.current = true;
    binMouth.current
      ?.closest(".archive-basket")
      ?.classList.remove("is-drop-target");
    // A throw counts only when its recent trajectory intersects the basket.
    const fresh = performance.now() - drag.time < 100;
    let thrown = false;
    if (fresh && Math.hypot(drag.vx, drag.vy) > 0.6) {
      for (let ms = 20; ms <= 240; ms += 20) {
        if (overBasket(drag.x + drag.vx * ms, drag.y + drag.vy * ms)) {
          thrown = true;
          break;
        }
      }
    }
    if (!cancelled && (overBasket(drag.x, drag.y) || thrown)) {
      preview.current?.pause();
      throwAway(drag.piece, drag.ghost, () => drag.ghost.remove());
    } else if (!cancelled && !reducedMotion) {
      const animation = drag.ghost.animate(
        [
          { transform: drag.ghost.style.transform, opacity: 1 },
          { transform: "translate(0, 0) scale(.94)", opacity: 0 },
        ],
        { duration: 220, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" },
      );
      animation.onfinish = () => drag.ghost.remove();
    } else drag.ghost.remove();
  }
  function shredAll() {
    const binned = pieces.filter((p) => p.discardedAt);
    setConfirmEmpty(false);
    if (!binned.length || !onShred || shredding) return;
    setShredding(binned);
    setShredIndex(0);
    setMessage("");
    const duration = reducedMotion ? 120 : 1400;
    const next = (index: number) => {
      if (!reducedMotion) machineAudio.shred(duration / 1000);
      shredTimer.current = setTimeout(() => {
        onShredRef.current?.(binned[index].id);
        if (index + 1 < binned.length) {
          setShredIndex(index + 1);
          next(index + 1);
        } else {
          setShredding(null);
          setMessage("Wastebasket emptied.");
        }
      }, duration);
    };
    next(0);
  }

  function keydown(e: KeyboardEvent) {
    ignoreDragClick.current = false;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (opening || tossing) return;
      const details =
        root.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (confirmEmpty) {
        setConfirmEmpty(false);
        root.current?.querySelector<HTMLElement>(".archive-empty-bin")?.focus();
      } else if (details) {
        details.open = false;
        details.querySelector<HTMLElement>("summary")?.focus();
      } else if (searching) {
        setSearching(false);
        setSearch("");
        root.current
          ?.querySelector<HTMLElement>(".archive-search-toggle")
          ?.focus();
      } else if (lifted && !waste) putBack(true);
      else onClose();
    }
    if (e.key === "Tab") {
      const scope = confirmEmpty
        ? root.current?.querySelector(".archive-confirm")
        : root.current;
      const items = [
        ...(scope?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, summary, [tabindex="0"]',
        ) || []),
      ].filter((el) => el.getClientRects().length && !el.closest("[inert]"));
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
    if (
      opening ||
      confirmEmpty ||
      shredding ||
      tossing ||
      (e.target as HTMLElement).matches("input")
    )
      return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      select(
        Math.max(
          0,
          Math.min(
            displayed.length - 1,
            selectedIndex + (e.key === "ArrowLeft" ? -1 : 1),
          ),
        ),
        lifted || waste,
        true,
      );
    }
  }

  return (
    <div
      ref={root}
      className={`archive archive-deck-view archive-folder-view ${lifted ? "is-reading" : ""} ${waste ? "is-waste" : ""} ${closing ? "is-closing" : "is-opening"} ${shredding ? "is-shredding" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={waste ? "Wastebasket" : "Filed papers"}
      onKeyDown={keydown}
      onPointerDownCapture={() => {
        ignoreDragClick.current = false;
      }}
      onClickCapture={(event) => {
        if (ignoreDragClick.current && event.detail > 0) {
          // Releasing a pull must not click through into the newly opened preview.
          ignoreDragClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div
        className="archive-veil"
        onClick={() => {
          if (!tossing && !opening) onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="archive-shell"
        onAnimationEnd={(event) => {
          if (
            closing &&
            event.target === event.currentTarget &&
            ["drawer-depart", "archive-fade-out"].includes(event.animationName)
          )
            onClosed?.();
        }}
      >
        <header className="archive-deck-bar" inert={confirmEmpty || undefined}>
          {waste ? (
            <button
              type="button"
              className="archive-back"
              onClick={() => changeView(false)}
              disabled={!!shredding}
            >
              <ArrowLeft size={16} /> Papers
            </button>
          ) : (
            <span className="archive-view-label">Archive</span>
          )}
          <div
            className={`archive-search-field ${searching ? "is-expanded" : ""}`}
          >
            <button
              type="button"
              className="archive-icon archive-search-toggle"
              aria-label={searching ? "Close search" : "Search papers"}
              title="Search papers"
              aria-expanded={searching}
              onClick={() => {
                setSearching(!searching);
                if (searching) setSearch("");
              }}
            >
              <Search size={18} />
            </button>
            {searching && (
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLifted(waste);
                }}
                placeholder="Search papers"
                aria-label="Search papers"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </div>
          {!waste && lifted && selected && (
            <button
              type="button"
              className="archive-icon archive-folder-return"
              aria-label="Put folder back"
              title="Put folder back"
              disabled={tossing || opening}
              onClick={(event) => putBack(event.detail === 0)}
            >
              <ArrowDownToLine size={18} />
            </button>
          )}
          {!waste && lifted && selected && (
            <button
              type="button"
              className="archive-icon archive-discard"
              aria-label="Discard paper"
              title="Discard paper"
              disabled={tossing || opening}
              onClick={() => {
                preview.current?.pause();
                throwAway(selected, preview.current?.paper() || null);
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <details className="archive-menu archive-tools" ref={menu}>
            <summary aria-label="More actions" title="More actions">
              <MoreHorizontal size={20} />
            </summary>
            <div className="archive-menu-popover">
              {selected && onShare && (
                <button
                  type="button"
                  disabled={tossing || opening}
                  onClick={() => {
                    preview.current?.pause();
                    menu.current?.removeAttribute("open");
                    onShare(selected);
                  }}
                >
                  <Share2 size={16} /> Share image
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  disabled={tossing || opening}
                  onClick={() => {
                    download(
                      `${
                        title(selected)
                          .replace(/[^\p{L}\p{N} -]/gu, "")
                          .slice(0, 60) || "deckle"
                      }.md`,
                      exportMarkdown(selected),
                    );
                    menu.current?.removeAttribute("open");
                  }}
                >
                  <Download size={16} /> Export Markdown
                </button>
              )}
              {selected && (lifted || waste) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      preview.current?.pause();
                      menu.current?.removeAttribute("open");
                      window.print();
                    }}
                  >
                    <Printer size={16} /> Print / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      menu.current?.removeAttribute("open");
                      void preview.current?.replay();
                    }}
                  >
                    <Play size={16} /> Replay
                  </button>
                </>
              )}
              <div className="archive-menu-separator" />
              <button
                type="button"
                onClick={() => {
                  onBackup();
                  menu.current?.removeAttribute("open");
                }}
              >
                <Download size={16} /> Download backup
              </button>
              <label>
                <FileUp size={16} />{" "}
                {importing ? "Importing…" : "Import backup"}
                <input
                  type="file"
                  accept=".json,application/json"
                  aria-label="Import a Deckle backup"
                  disabled={importing}
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    setImporting(true);
                    try {
                      await onImport(file);
                      menu.current?.removeAttribute("open");
                    } finally {
                      setImporting(false);
                      input.value = "";
                    }
                  }}
                />
              </label>
            </div>
          </details>
          <button
            type="button"
            className="archive-icon archive-close"
            aria-label="Close archive"
            title="Close · Esc"
            disabled={tossing || opening}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div
          className={`archive-deck ${!waste && selected ? "archive-folder-drawer" : ""} ${previewInstant ? "is-instant" : ""}`}
          inert={confirmEmpty || !!shredding || undefined}
          onClick={(event) => {
            // The exposed drawer around the sheet is the way back to browsing.
            if (
              event.target === event.currentTarget &&
              lifted &&
              !waste &&
              !opening &&
              !tossing
            )
              putBack();
          }}
        >
          {!selected ? (
            <>
              {!waste && (
                <div className="archive-drawer-stage is-empty">
                  <ArchiveDrawerScene
                    pieces={[]}
                    initialIndex={0}
                    reducedMotion={reducedMotion}
                    disabled
                    onDragStart={startFileDrag}
                    onDragMove={moveFileDrag}
                    onDragEnd={endFileDrag}
                    onFocus={() => {}}
                    onPreview={() => {}}
                  />
                </div>
              )}
              <div className="archive-empty-note" role="status">
                <p>
                  {search.trim()
                    ? "No matching papers."
                    : waste
                      ? "Wastebasket empty."
                      : "Nothing filed yet."}
                </p>
                <span>
                  {search.trim()
                    ? "Try another word, or clear the search."
                    : waste
                      ? "Papers you discard wait here for 30 days."
                      : "Tear a paper off the roll and it lands here."}
                </span>
              </div>
            </>
          ) : (
            <>
              {!waste && (
                <div
                  className={`archive-drawer-stage ${lifted ? "is-behind-preview" : ""}`}
                  inert={lifted || returning || tossing || closing || undefined}
                  aria-hidden={lifted || returning || undefined}
                >
                  <ArchiveDrawerScene
                    pieces={displayed}
                    initialIndex={selectedIndex}
                    reducedMotion={reducedMotion}
                    discardingId={discardingId}
                    disabled={lifted || returning || tossing || closing}
                    onDragStart={startFileDrag}
                    onDragMove={moveFileDrag}
                    onDragEnd={endFileDrag}
                    onFocus={(index) => select(index, false)}
                    onPreview={(index, instant, fromDrag) => {
                      ignoreDragClick.current = !!fromDrag;
                      select(index, true, instant);
                    }}
                  />
                </div>
              )}
              {(lifted || returning || waste) && (
                <div
                  className={`archive-folder-stage is-lifted ${returning ? "is-returning" : ""}`}
                  inert={returning || undefined}
                  aria-hidden={returning || undefined}
                  id="archive-folder-preview"
                  key={selected.id}
                >
                  {!waste && (
                    <div
                      className="archive-folder-backing"
                      aria-hidden="true"
                    />
                  )}
                  {(lifted || returning || waste) && (
                    <div className="archive-active">
                      <ArchivePaperPreview
                        piece={selected}
                        busy={tossing || opening}
                        actionsRef={preview}
                        onBack={waste ? undefined : () => putBack()}
                        onOpen={async (piece) => {
                          returningToWriter.current = true;
                          setOpening(true);
                          try {
                            await onOpen(piece);
                          } catch (error) {
                            returningToWriter.current = false;
                            setOpening(false);
                            throw error;
                          }
                        }}
                        onRestore={(piece) => {
                          onRestore(piece);
                          setSelectedId(piece.id);
                          changeView(false);
                          setLifted(true);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <footer
          className="archive-deck-footer"
          inert={confirmEmpty || undefined}
        >
          {waste && displayed.length ? (
            <nav className="archive-waste-papers" aria-label="Discarded papers">
              {displayed.map((piece, i) => (
                <button
                  key={piece.id}
                  type="button"
                  className={`archive-waste-thumb ${selected.id === piece.id ? "is-current" : ""}`}
                  aria-label={`Preview discarded ${title(piece)}`}
                  aria-pressed={selected.id === piece.id}
                  title={title(piece)}
                  onClick={() => select(i)}
                  disabled={tossing || !!shredding}
                  style={
                    {
                      "--paper":
                        stocks[piece.document.paper?.stock || "bond"].tint,
                    } as CSSProperties
                  }
                >
                  <span>{title(piece)}</span>
                </button>
              ))}
            </nav>
          ) : (
            <span className="archive-folder-count" aria-live="polite">
              {displayed.length > 1
                ? `${selectedIndex + 1} / ${displayed.length}`
                : ""}
            </span>
          )}
          {waste && wasteCount > 0 && onShred && (
            <button
              type="button"
              className="archive-icon archive-empty-bin"
              aria-label="Empty wastebasket"
              title="Empty wastebasket"
              disabled={!!shredding}
              onClick={() => setConfirmEmpty(true)}
            >
              <Trash2 size={19} />
            </button>
          )}
          <div className={`archive-basket ${waste ? "is-selected" : ""}`}>
            <DeskBin
              count={wasteCount}
              onOpen={() => changeView(!waste)}
              mouthRef={binMouth}
            />
          </div>
        </footer>
        {waste && !shredding && (
          <p className="archive-retention">Kept for 30 days.</p>
        )}
        {message && (
          <p className="archive-message" role="status">
            {message}
          </p>
        )}
        {confirmEmpty && (
          <div
            className="archive-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Empty wastebasket"
          >
            <p>
              Shred{" "}
              {wasteCount === 1 ? "this paper" : `these ${wasteCount} papers`}?
            </p>
            <span>This can't be undone.</span>
            <div>
              <button
                type="button"
                ref={keep}
                onClick={() => {
                  setConfirmEmpty(false);
                  root.current
                    ?.querySelector<HTMLElement>(".archive-empty-bin")
                    ?.focus();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="archive-shred"
                onClick={shredAll}
              >
                Shred
              </button>
            </div>
          </div>
        )}
        {shredding && (
          <div className={`shredder-stage ${reducedMotion ? "is-still" : ""}`}>
            <p className="shred-progress" role="status">
              Shredding {shredIndex + 1} / {shredding.length}
            </p>
            <div className="shredder-feed" aria-hidden="true">
              <div
                className="shred-sheet"
                key={shredding[shredIndex].id}
                style={
                  {
                    "--paper":
                      stocks[
                        shredding[shredIndex].document.paper?.stock || "bond"
                      ].tint,
                  } as CSSProperties
                }
              >
                <b>{title(shredding[shredIndex])}</b>
                <span>
                  {(shredding[shredIndex].searchText || "").slice(0, 180)}
                </span>
              </div>
            </div>
            <img
              className="shredder-object"
              src="/objects/shredder.png"
              width="360"
              height="420"
              alt=""
              draggable={false}
            />
          </div>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {selected ? title(selected) : ""}
      </span>
    </div>
  );
}
