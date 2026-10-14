"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import {
  Annotation,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  Direction,
  EditorView,
  drawSelection,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import {
  caretOffset,
  editingText,
  editorMarks,
  markOffsets,
  type EditRange,
  type TextSelection,
} from "@/lib/editor-model";
import {
  documentLines,
  styleClass,
  type Action,
  type Document,
  type Mode,
} from "@/lib/writing";
import { fitsPaper } from "@/lib/paper-capacity";
import { isJoiningGlyph, lineDirections } from "@/lib/direction";
import {
  DECKLE_CLIPBOARD,
  planPaste,
  readPayload,
  rememberCopy,
  rememberedCopy,
  lastCopy,
  selectionPayload,
  type PastePlan,
} from "@/lib/clipboard";
export type FormatCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "red"
  | "h1"
  | "h2"
  | "dinkus";
/** Keyboard shortcuts for the selection bar's styles, shown in its hints. */
export const FORMAT_KEYS: Partial<Record<FormatCommand, string>> = {
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  strike: "Mod-Shift-x",
  code: "Mod-e",
};

export type PaperMetrics = {
  height: number;
  lineHeight: number;
  headTop: number;
  headColumn: number;
  headX: number;
  printOrigin: number;
  strikeY: number;
  charWidth: number;
  rows: number;
  /** The caret's line runs right to left; the next cell is to its left. */
  rtl: boolean;
};
export type EditorHandle = {
  clearHistory: () => void;
  focus: () => void;
  moveCarriage: (clientX: number) => void;
  stepCarriage: (direction: "left" | "right" | "start" | "end") => void;
  insert: (text: string) => void;
  format: (command: FormatCommand) => void;
  /** Swap the last outside paste between clipping and typed text. Returns the
   * new form, or null when something has been written since. */
  repaste: () => "typed" | "clipping" | null;
  /** Where the last paste's first line sits now, and the text column around
   * it, in viewport pixels. The paper may have fed since the paste. */
  pasteAnchor: () => PasteAnchor | null;
  /** The current selection's extent in viewport pixels, or null if empty
   * (unless `caret`, which measures a bare caret as a zero-width box). */
  selectionBox: (caret?: boolean) => SelectionBox | null;
  /** Run the browser's cut or copy on the paper, through our handlers. */
  clipboard: (action: "cut" | "copy") => void;
  /** Paste the system clipboard over the selection, as ⌘V would. The
   * browser may refuse to let a button read the clipboard. */
  paste: () => Promise<"pasted" | "empty" | "refused">;
  /** Paste what this page last cut or copied, without asking the browser
   * for the clipboard: the strip in hand. */
  pasteHeld: () => boolean;
};
export type SelectionBox = {
  top: number;
  bottom: number;
  /** Where the selection's first and last lines start and end. */
  startX: number;
  endX: number;
  /** The end the caret is on (where a mouse drag finished). */
  headX: number;
  headTop: number;
  headBottom: number;
  singleLine: boolean;
};
export type PasteAnchor = {
  top: number;
  bottom: number;
  columnLeft: number;
  columnRight: number;
  rtl: boolean;
};
/** Why an edit happened when it wasn't a keystroke: the desk voices these
 * itself (scissors, tape, the machine retyping a fragment). */
export type EditOrigin = "cut" | "move" | "paste" | "retype";
export type PasteReport = {
  as: "typed" | "clipping";
  /** From outside your own writing: the paste tag offers the other form. */
  external: boolean;
  text: string;
  /** Viewport point where the pasted words start, for the tape landing. */
  at: { x: number; y: number; bottom: number } | null;
  rtl: boolean;
};
export type CutReport = {
  rects: DOMRect[];
  text: string;
  rtl: boolean;
  style: CSSStyleDeclaration;
};
type Props = {
  document: Document;
  pieceId: string;
  mode: Mode;
  disabled: boolean;
  feedOffset: number;
  layoutKey: string;
  onEdit: (
    action: Action,
    text: string,
    range: EditRange,
    selection: TextSelection,
    origin?: EditOrigin,
  ) => Document;
  onRestore: (doc: Document) => Document;
  onFormat: (command: FormatCommand) => Document;
  onSelection: (selection: TextSelection) => void;
  onMetrics: (metrics: PaperMetrics, reason: MeasureReason) => void;
  onFocus: () => void;
  onStrike: (x: number) => void;
  onLineLimit: () => void;
  onCut?: (cut: CutReport) => void;
  /** The words copied, measured for the duplicate that lifts off them. */
  onCopied?: (copy: CutReport) => void;
  onPasted?: (paste: PasteReport) => void;
  /** Pasted text that cannot fit on this paper. */
  onOverflow?: (text: string) => void;
};
// Why the caret moved, which decides whether the paper moves with it:
// - "edit": a keystroke (typing, Enter, backspace). Writing happens at the
//   print line, so the paper rolls there.
// - "command": something done to text already on the page (style, cut,
//   paste, drop, undo). The words stay under the hand; the paper feeds only
//   if the caret would leave the window.
// - "pointer": a click or drag. The paper stays still.
// - "selection": the keyboard moved the caret. Like a command.
// - "layout": nothing moved by hand; the paper keeps its feed.
export type MeasureReason =
  "edit" | "command" | "selection" | "pointer" | "layout";
const external = Annotation.define<boolean>();
// `fresh` is the caret offset right after a struck glyph, so that one glyph
// can land with a little more ink than the rest.
// `landed` is the range a paste just filled: its ink is wet and its clipping
// lines are being taped down.
const updatePaper = StateEffect.define<{
  doc: Document;
  fresh?: number;
  landed?: EditRange;
}>();
// Independent, stable offsets from a strike's seed.
const part = (seed: number, shift: number) =>
  ((seed >>> shift) % 1000) / 1000 - 0.5;
function inkDecorations(
  doc: Document,
  fresh?: number,
  landed?: EditRange,
): DecorationSet {
  const marks = editorMarks(doc),
    offsets = markOffsets(marks),
    ranges: Range<Decoration>[] = [],
    text = editingText(doc);
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (mark.kind === "seam") {
      ranges.push(
        Decoration.line({
          class: "editor-seam",
          attributes: { "data-label": "continued" },
        }).range(offsets[i + 1]),
      );
      continue;
    }
    if (mark.text === "\n") continue;
    const variance = (mark.seed % 1000) / 1000;
    const joined = isJoiningGlyph(mark.text);
    const classes = [
      "ink-glyph",
      styleClass(mark),
      (fresh === offsets[i + 1] ||
        (landed && offsets[i] >= landed.from && offsets[i] < landed.to)) &&
      mark.text.trim()
        ? "ink-fresh"
        : "",
      mark.crossed ? "ink-crossed" : "",
      mark.clipId ? "quoted-glyph" : "",
      mark.overprints?.length ? "ink-overprint" : "",
    ]
      .filter(Boolean)
      .join(" ");
    ranges.push(
      Decoration.mark({
        class: classes,
        attributes: {
          style: joined
            ? "--ink-density:1;--strike-y:0px;--strike-x:0px"
            : `--ink-density:${Math.min(1, mark.density * (0.9 + variance * 0.1)).toFixed(3)};--strike-y:${(part(mark.seed, 10) * 0.7).toFixed(2)}px;--strike-x:${(part(mark.seed, 20) * 0.5).toFixed(2)}px`,
          ...(mark.overprints?.length ? { "data-underprint": mark.text } : {}),
        },
      }).range(offsets[i], offsets[i + 1]),
    );
    if (mark.clipId && marks[i - 1]?.clipId !== mark.clipId) {
      const lineStart = text.lastIndexOf("\n", offsets[i] - 1) + 1;
      ranges.push(
        Decoration.line({
          class: `editor-clipping clipping-start${landed && offsets[i] >= landed.from && offsets[i] < landed.to ? " clipping-landed" : ""}`,
        }).range(lineStart),
      );
    }
    if (mark.clipId && marks[i + 1]?.clipId !== mark.clipId) {
      const lineStart = text.lastIndexOf("\n", offsets[i] - 1) + 1;
      ranges.push(
        Decoration.line({ class: "editor-clipping clipping-end" }).range(
          lineStart,
        ),
      );
    }
    if (
      mark.clipId &&
      marks[i - 1]?.text === "\n" &&
      marks[i - 1]?.clipId === mark.clipId
    )
      ranges.push(
        Decoration.line({ class: "editor-clipping" }).range(offsets[i]),
      );
  }
  const lines = text.split("\n");
  let lineStart = 0;
  lineDirections(lines).forEach((direction, index) => {
    if (direction === "rtl")
      ranges.push(
        Decoration.line({ attributes: { dir: "rtl" } }).range(lineStart),
      );
    lineStart += lines[index].length + 1;
  });
  for (const line of documentLines(doc)) {
    if (line.block !== "body")
      ranges.push(
        Decoration.line({ class: `block-${line.block}` }).range(line.from),
      );
    if (line.initial && line.marks.length) {
      const first = line.marks.findIndex((m) => m.text.trim());
      if (first >= 0) {
        const start =
          line.from +
          line.marks
            .slice(0, first)
            .reduce((n, m) => n + (m.overprints?.at(-1) ?? m.text).length, 0);
        ranges.push(
          Decoration.mark({ class: "stamped-initial" }).range(
            start,
            start + line.marks[first].text.length,
          ),
        );
      }
    }
    if (line.prefix)
      ranges.push(
        Decoration.mark({ class: "heading-prefix" }).range(
          line.from,
          line.from + line.prefix,
        ),
      );
  }
  return Decoration.set(ranges, true);
}
const paperField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    const effect = transaction.effects.find((e) => e.is(updatePaper));
    return effect
      ? inkDecorations(
          effect.value.doc,
          effect.value.fresh,
          effect.value.landed,
        )
      : value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});
function changesBetween(before: string, after: string) {
  let from = 0,
    endBefore = before.length,
    endAfter = after.length;
  while (from < endBefore && from < endAfter && before[from] === after[from])
    from++;
  while (
    endBefore > from &&
    endAfter > from &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  return { from, to: endBefore, insert: after.slice(from, endAfter) };
}

export const PaperEditor = forwardRef<EditorHandle, Props>(
  function PaperEditor(props, ref) {
    const mount = useRef<HTMLDivElement>(null),
      viewRef = useRef<EditorView | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const currentDoc = useRef(props.document),
      undo = useRef<Document[]>([]),
      redo = useRef<Document[]>([]);
    const previousPiece = useRef(props.pieceId);
    const formatRef = useRef<(command: FormatCommand) => void>(() => {});
    const repasteRef = useRef<() => "typed" | "clipping" | null>(() => null);
    const anchorRef = useRef<() => PasteAnchor | null>(() => null);
    const insertRef = useRef<
      (plan: PastePlan, from: number, to: number) => void
    >(() => {});
    const pasteRef = useRef<() => Promise<"pasted" | "empty" | "refused">>(
      async () => "refused",
    );
    const measureRef = useRef<(reason: MeasureReason) => void>(() => {});
    useImperativeHandle(
      ref,
      () => ({
        clearHistory: () => {
          undo.current = [];
          redo.current = [];
        },
        focus: () => viewRef.current?.focus(),
        moveCarriage: (clientX) => {
          const view = viewRef.current;
          if (!view || latest.current.disabled) return;
          const coords = view.coordsAtPos(view.state.selection.main.head);
          if (!coords) return;
          const bounds = view.contentDOM.getBoundingClientRect();
          const pos = view.posAtCoords({
            x: Math.max(bounds.left + 1, Math.min(bounds.right - 1, clientX)),
            y: (coords.top + coords.bottom) / 2,
          });
          if (pos !== null)
            view.dispatch({
              selection: { anchor: pos },
              userEvent: "select.pointer",
            });
        },
        stepCarriage: (direction) => {
          const view = viewRef.current;
          if (!view || latest.current.disabled) return;
          const focused = document.activeElement;
          const range = view.state.selection.main;
          const selection =
            direction === "start" || direction === "end"
              ? view.moveToLineBoundary(range, direction === "end")
              : view.moveByChar(range, direction === "right");
          view.dispatch({ selection, userEvent: "select.pointer" });
          // CodeMirror restores its DOM selection during the next view update.
          // Keep keyboard navigation on the physical slider until Enter is used.
          requestAnimationFrame(() => {
            if (focused instanceof HTMLElement && focused.isConnected)
              focused.focus({ preventScroll: true });
          });
        },
        format: (command) => formatRef.current(command),
        repaste: () => repasteRef.current(),
        pasteAnchor: () => anchorRef.current(),
        selectionBox: (caret = false) => {
          const view = viewRef.current;
          const range = view?.state.selection.main;
          if (!view || !range || (range.empty && !caret)) return null;
          const start = view.coordsAtPos(range.from, 1),
            end = view.coordsAtPos(range.to, -1),
            head = view.coordsAtPos(
              range.head,
              range.head === range.to ? -1 : 1,
            );
          if (!start || !end || !head) return null;
          return {
            top: Math.min(start.top, end.top),
            bottom: Math.max(start.bottom, end.bottom),
            startX: start.left,
            endX: end.left,
            headX: head.left,
            headTop: head.top,
            headBottom: head.bottom,
            singleLine: Math.abs(start.top - end.top) < 2,
          };
        },
        clipboard: (action) => {
          viewRef.current?.focus();
          document.execCommand(action);
        },
        paste: () => pasteRef.current(),
        pasteHeld: () => {
          const view = viewRef.current,
            held = lastCopy();
          if (!view || !held || latest.current.disabled) return false;
          const range = view.state.selection.main;
          view.focus();
          insertRef.current(
            planPaste(held.text, held, false),
            range.from,
            range.to,
          );
          return true;
        },
        insert: (text) => {
          const view = viewRef.current;
          if (view && !latest.current.disabled)
            view.dispatch(view.state.replaceSelection(text), {
              userEvent: "input.type",
            });
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      const initial = latest.current;
      const restore = (back: boolean) => {
        if (latest.current.mode === "ink" || latest.current.disabled)
          return true;
        const source = back ? undo : redo,
          destination = back ? redo : undo;
        const doc = source.current.pop();
        if (!doc) return true;
        destination.current.push(currentDoc.current);
        currentDoc.current = latest.current.onRestore(doc);
        sync(currentDoc.current, "command");
        return true;
      };
      const view = new EditorView({
        parent: mount.current!,
        state: EditorState.create({
          doc: editingText(initial.document),
          selection: EditorSelection.cursor(
            Math.min(
              editingText(initial.document).length,
              caretOffset(initial.document),
            ),
          ),
          extensions: [
            paperField,
            EditorState.transactionFilter.of((transaction) => {
              if (transaction.annotation(external) || !transaction.docChanged)
                return transaction;
              if (
                !fitsPaper(
                  transaction.startState.doc.toString(),
                  transaction.newDoc.toString(),
                )
              ) {
                latest.current.onLineLimit();
                return [];
              }
              return transaction;
            }),
            drawSelection({ cursorBlinkRate: 0 }),
            EditorView.lineWrapping,
            EditorView.perLineTextDirection.of(true),
            EditorState.allowMultipleSelections.of(false),
            keymap.of([
              ...Object.entries(FORMAT_KEYS).map(([command, key]) => ({
                key,
                preventDefault: true,
                run: () => {
                  formatRef.current(command as FormatCommand);
                  return true;
                },
              })),
              { key: "Mod-z", run: () => restore(true) },
              { key: "Mod-Shift-z", run: () => restore(false) },
              { key: "Mod-y", run: () => restore(false) },
              ...defaultKeymap,
            ]),
            EditorView.contentAttributes.of({
              "aria-label": "Write on the paper",
              "aria-describedby": "writing-help",
              spellcheck: "false",
              autocapitalize: "off",
              autocomplete: "off",
              autocorrect: "off",
            }),
            EditorView.scrollHandler.of(() => true),
            EditorView.domEventHandlers({
              focus: () => {
                latest.current.onFocus();
                return false;
              },
              keydown: (e) => {
                // ⌘⇧V asks for outside text to be typed in rather than taped.
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v")
                  typedRequest = e.shiftKey;
                if (
                  latest.current.disabled &&
                  !["Tab", "Escape"].includes(e.key)
                ) {
                  e.preventDefault();
                  return true;
                }
                return false;
              },
              copy: (e, editor) => clipboard(e, editor, false),
              cut: (e, editor) => clipboard(e, editor, true),
              paste: (e, editor) => {
                if (latest.current.disabled) {
                  e.preventDefault();
                  return true;
                }
                const raw = e.clipboardData?.getData("text/plain") ?? "";
                const typed = typedRequest;
                typedRequest = false;
                if (!raw) return false;
                e.preventDefault();
                const range = editor.state.selection.main;
                insertPlan(
                  planPaste(
                    raw,
                    readPayload(e.clipboardData) ?? rememberedCopy(raw),
                    typed,
                  ),
                  range.from,
                  range.to,
                );
                return true;
              },
              dragstart: (e, editor) => {
                const range = editor.state.selection.main;
                if (range.empty) return false;
                draggingOwn = true;
                e.dataTransfer?.setData(
                  DECKLE_CLIPBOARD,
                  JSON.stringify(
                    selectionPayload(
                      editorMarks(currentDoc.current),
                      range.from,
                      range.to,
                    ),
                  ),
                );
                return false;
              },
              dragend: () => {
                draggingOwn = false;
                return false;
              },
              drop: (e, editor) => {
                // Moving words within the page is CodeMirror's own drag;
                // anything dropped from outside lands like a paste. Text only.
                if (draggingOwn) {
                  draggingOwn = false;
                  return false;
                }
                e.preventDefault();
                const raw = e.dataTransfer?.getData("text/plain") ?? "";
                if (!raw || latest.current.disabled) return true;
                const at =
                  editor.posAtCoords({ x: e.clientX, y: e.clientY }) ??
                  editor.state.selection.main.head;
                insertPlan(
                  planPaste(raw, readPayload(e.dataTransfer), e.shiftKey),
                  at,
                  at,
                );
                return true;
              },
            }),
          ],
        }),
        dispatchTransactions(transactions, editor) {
          for (const transaction of transactions) {
            if (!transaction.docChanged || transaction.annotation(external)) {
              editor.update([transaction]);
              if (transaction.selection && !transaction.annotation(external)) {
                const selection = transaction.state.selection.main;
                latest.current.onSelection({
                  anchor: selection.anchor,
                  head: selection.head,
                });
                measureRef.current(
                  transaction.isUserEvent("select.pointer")
                    ? "pointer"
                    : "selection",
                );
              }
              continue;
            }
            if (latest.current.disabled) continue;
            // A paste made of several runs is one step to undo.
            if (!pasting) {
              undo.current.push(currentDoc.current);
              if (undo.current.length > 200) undo.current.shift();
              redo.current = [];
            }
            const selection = transaction.startState.selection.main;
            const changes: { from: number; to: number; text: string }[] = [];
            const typed = transaction.isUserEvent("input.type");
            transaction.changes.iterChanges((from, to, _a, _b, inserted) =>
              changes.push({ from, to, text: inserted.toString() }),
            );
            for (const change of changes.reverse()) {
              const action: Action = pasting
                ? pasting.as === "clipping"
                  ? "paste"
                  : "type"
                : transaction.isUserEvent("input.paste")
                  ? "paste"
                  : change.text
                    ? "type"
                    : transaction.isUserEvent("delete.forward")
                      ? "delete"
                      : "backspace";
              currentDoc.current = latest.current.onEdit(
                action,
                change.text,
                { from: change.from, to: change.to },
                { anchor: selection.anchor, head: selection.head },
                pasting?.origin ??
                  (transaction.isUserEvent("delete.cut")
                    ? "cut"
                    : transaction.isUserEvent("move.drop")
                      ? "move"
                      : undefined),
              );
            }
            // Cutting, pasting and dropping act on words already in place;
            // everything else here came from a key at the print line.
            const command =
              !!pasting ||
              transaction.isUserEvent("delete.cut") ||
              transaction.isUserEvent("input.paste") ||
              transaction.isUserEvent("input.drop") ||
              transaction.isUserEvent("move");
            sync(currentDoc.current, command ? "command" : "edit", typed);
            const struck =
              typed && changes.find((change) => change.text.trim());
            if (struck) {
              // Measure the inserted cell after CodeMirror has reconciled the
              // browser's input DOM, including a wrap at the end of a line.
              const at = Math.min(struck.from, editor.state.doc.length);
              const glyph =
                at < editor.state.doc.length ? editor.coordsForChar(at) : null;
              const coords = glyph ?? editor.coordsAtPos(at);
              const bounds = editor.contentDOM.getBoundingClientRect();
              if (coords)
                latest.current.onStrike(
                  ((glyph
                    ? (glyph.left + glyph.right) / 2
                    : coords.left + editor.defaultCharacterWidth / 2) -
                    bounds.left) /
                    (editor.scaleX || 1),
                );
            }
          }
        },
      });
      viewRef.current = view;
      formatRef.current = (command) => {
        if (latest.current.disabled) return;
        undo.current.push(currentDoc.current);
        redo.current = [];
        currentDoc.current = latest.current.onFormat(command);
        sync(currentDoc.current, "command");
        view.focus();
      };
      // ---- Clipboard ---------------------------------------------------
      let typedRequest = false,
        draggingOwn = false;
      let pasting: { as: "typed" | "clipping"; origin: EditOrigin } | null =
        null;
      let lastPaste: {
        before: Document;
        after: Document;
        from: number;
        to: number;
        plan: PastePlan;
      } | null = null;
      function clipboard(e: ClipboardEvent, editor: EditorView, cut: boolean) {
        const range = editor.state.selection.main;
        if (range.empty || !e.clipboardData) return false;
        if (cut && latest.current.disabled) {
          e.preventDefault();
          return true;
        }
        const payload = selectionPayload(
          editorMarks(currentDoc.current),
          range.from,
          range.to,
        );
        e.clipboardData.setData("text/plain", payload.text);
        e.clipboardData.setData(DECKLE_CLIPBOARD, JSON.stringify(payload));
        rememberCopy(payload);
        e.preventDefault();
        // Measure the words (before they leave the line, for a cut).
        const rects: DOMRect[] = [];
        try {
          const start = editor.domAtPos(range.from),
            end = editor.domAtPos(range.to),
            dom = document.createRange();
          dom.setStart(start.node, start.offset);
          dom.setEnd(end.node, end.offset);
          rects.push(...Array.from(dom.getClientRects()));
        } catch {
          /* The strip is decoration; the cut itself still happens. */
        }
        const report = {
          rects,
          text: payload.text,
          rtl: editor.textDirectionAt(range.from) === Direction.RTL,
          style: getComputedStyle(editor.contentDOM),
        };
        if (!cut) {
          latest.current.onCopied?.(report);
          return true;
        }
        latest.current.onCut?.(report);
        editor.dispatch({
          changes: { from: range.from, to: range.to },
          selection: { anchor: range.from },
          userEvent: "delete.cut",
        });
        return true;
      }
      pasteRef.current = async () => {
        if (latest.current.disabled) return "refused";
        let raw = "";
        try {
          raw = await navigator.clipboard.readText();
        } catch {
          return "refused";
        }
        if (!raw) return "empty";
        if (latest.current.disabled || viewRef.current !== view)
          return "refused";
        // Only the text is readable here, so provenance comes from what
        // this page last copied.
        const range = view.state.selection.main;
        insertPlan(
          planPaste(raw, rememberedCopy(raw), false),
          range.from,
          range.to,
        );
        view.focus();
        return "pasted";
      };
      insertRef.current = (plan, from, to) => insertPlan(plan, from, to);
      function insertPlan(plan: PastePlan, from: number, to: number) {
        if (!plan.runs.length || latest.current.disabled) return;
        const beforeText = view.state.doc.toString();
        const inserted = plan.runs
          .map((run) => (run.as === "clipping" ? `\n${run.text}\n` : run.text))
          .join("");
        if (
          !fitsPaper(
            beforeText,
            beforeText.slice(0, from) + inserted + beforeText.slice(to),
          )
        ) {
          latest.current.onOverflow?.(
            plan.runs.map((run) => run.text).join("\n\n"),
          );
          return;
        }
        const before = currentDoc.current;
        undo.current.push(before);
        if (undo.current.length > 200) undo.current.shift();
        redo.current = [];
        let start = from,
          end = to;
        try {
          for (const run of plan.runs) {
            pasting = {
              as: run.as,
              origin: !plan.external
                ? "move"
                : run.as === "typed"
                  ? "retype"
                  : "paste",
            };
            view.dispatch({
              changes: { from: start, to: end, insert: run.text },
              selection: { anchor: start + run.text.length },
              userEvent: "input.paste",
            });
            start = end = view.state.selection.main.head;
          }
        } finally {
          pasting = null;
        }
        sync(currentDoc.current, "command", false, { from, to: start });
        lastPaste = { before, after: currentDoc.current, from, to, plan };
        const text = view.state.doc.toString();
        let first = from;
        while (first < start && text[first] === "\n") first++;
        const glyph = first < text.length ? view.coordsForChar(first) : null;
        const rtl = view.textDirectionAt(first) === Direction.RTL;
        latest.current.onPasted?.({
          as: plan.runs.some((run) => run.as === "clipping")
            ? "clipping"
            : "typed",
          external: plan.external,
          text: plan.runs.map((run) => run.text).join(""),
          at: glyph
            ? {
                x: rtl ? glyph.right : glyph.left,
                y: glyph.top,
                bottom: glyph.bottom,
              }
            : null,
          rtl,
        });
      }
      // The desk re-saves the document after every edit (caret, selection), so
      // compare the words, not the object.
      const unchangedSince = (paste: { after: Document }) =>
        paste.after === currentDoc.current ||
        editingText(paste.after) === editingText(currentDoc.current);
      anchorRef.current = () => {
        const last = lastPaste;
        if (!last || !unchangedSince(last)) return null;
        const text = view.state.doc.toString();
        let first = last.from;
        while (first < text.length && text[first] === "\n") first++;
        const glyph = first < text.length ? view.coordsForChar(first) : null;
        if (!glyph) return null;
        const column = view.contentDOM.getBoundingClientRect();
        return {
          top: glyph.top,
          bottom: glyph.bottom,
          columnLeft: column.left,
          columnRight: column.right,
          rtl: view.textDirectionAt(first) === Direction.RTL,
        };
      };
      repasteRef.current = () => {
        const last = lastPaste;
        if (!last || !last.plan.external || !unchangedSince(last)) return null;
        const flipped: PastePlan = {
          ...last.plan,
          runs: last.plan.runs.map((run) => ({
            ...run,
            as: run.as === "typed" ? "clipping" : "typed",
          })),
        };
        // Back to the page as it was before the paste, then paste again in
        // the other form. The undo step still leads to the original page.
        currentDoc.current = latest.current.onRestore(last.before);
        sync(currentDoc.current, "command");
        undo.current.pop();
        insertPlan(flipped, last.from, last.to);
        return flipped.runs[0]?.as ?? null;
      };
      function sync(
        doc: Document,
        reason: MeasureReason,
        typed = false,
        landed?: EditRange,
      ) {
        const text = editingText(doc),
          before = view.state.doc.toString();
        const selection = doc.selection || {
          anchor: caretOffset(doc),
          head: caretOffset(doc),
        };
        view.update([
          view.state.update({
            changes: changesBetween(before, text),
            selection: {
              anchor: Math.min(text.length, selection.anchor),
              head: Math.min(text.length, selection.head),
            },
            effects: updatePaper.of({
              doc,
              fresh: typed ? selection.head : undefined,
              landed,
            }),
            annotations: external.of(true),
          }),
        ]);
        measureRef.current(reason);
      }
      // Requests in one frame share a key and the last one wins, so carry the
      // strongest reason through: a click must not be overruled by the
      // re-render that follows it (that made the paper jump to the clicked
      // line). Typing beats a command, a command beats a click, a click beats
      // keyboard movement, and all of them beat a plain re-layout.
      const rank: Record<MeasureReason, number> = {
        layout: 0,
        selection: 1,
        pointer: 2,
        command: 3,
        edit: 4,
      };
      let pending: MeasureReason | null = null;
      measureRef.current = (reason) => {
        if (!pending || rank[reason] > rank[pending]) pending = reason;
        view.requestMeasure({
          key: measureRef,
          read: () => {
            const pos = view.state.selection.main.head,
              block = view.lineBlockAt(pos),
              coords = view.coordsAtPos(pos);
            const rect = view.contentDOM.getBoundingClientRect();
            // Measure the settled print point, not an intermediate frame of
            // the paper-feed transition. Horizontal positions are unaffected.
            const strip = view.dom.closest(".paper-strip");
            const feedTransform = strip
              ? new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42
              : latest.current.feedOffset;
            const pendingFeed = latest.current.feedOffset - feedTransform;
            const deck = view.dom
              .closest(".instrument")
              ?.querySelector(".machine-deck")
              ?.getBoundingClientRect();
            // CodeMirror measures in screen pixels; the desk scales as a whole.
            // Feed distances must stay in the paper's unscaled coordinates.
            const scaleY = view.scaleY || 1,
              lineHeight =
                parseFloat(getComputedStyle(view.contentDOM).lineHeight) ||
                view.defaultLineHeight / scaleY;
            const height = view.contentDOM.offsetHeight;
            const line = view.state.doc.lineAt(pos),
              fallbackColumn = pos - line.from;
            const headTop = coords
              ? (coords.top - rect.top) / scaleY
              : block.top / scaleY +
                Math.floor(fallbackColumn / 60) * lineHeight;
            const headColumn = coords
              ? Math.round(
                  (coords.left - rect.left) / view.defaultCharacterWidth,
                )
              : fallbackColumn % 60;
            return {
              height,
              lineHeight,
              headTop,
              printOrigin: deck
                ? (rect.left - deck.left) / (view.scaleX || 1)
                : 0,
              strikeY:
                deck && coords
                  ? ((coords.top + coords.bottom) / 2 - deck.top) / scaleY +
                    pendingFeed
                  : -26,
              headColumn: Math.max(0, Math.min(60, headColumn)),
              headX: coords
                ? (coords.left - rect.left) / (view.scaleX || 1)
                : ((fallbackColumn % 60) * view.defaultCharacterWidth) /
                  (view.scaleX || 1),
              charWidth: view.defaultCharacterWidth / (view.scaleX || 1),
              rows: Math.max(1, Math.round(height / lineHeight)),
              rtl: view.textDirectionAt(pos) === Direction.RTL,
            };
          },
          write: (metrics) => {
            const strongest = pending ?? reason;
            pending = null;
            latest.current.onMetrics(metrics, strongest);
          },
        });
      };
      view.dispatch({
        effects: updatePaper.of({ doc: initial.document }),
        annotations: external.of(true),
      });
      measureRef.current("layout");
      const resize = new ResizeObserver(() => measureRef.current("layout"));
      resize.observe(view.contentDOM);
      return () => {
        resize.disconnect();
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const changedPiece = previousPiece.current !== props.pieceId;
      if (changedPiece) {
        undo.current = [];
        redo.current = [];
        previousPiece.current = props.pieceId;
      }
      currentDoc.current = props.document;
      const text = editingText(props.document);
      const selection = props.document.selection || {
        anchor: caretOffset(props.document),
        head: caretOffset(props.document),
      };
      if (changedPiece || props.document !== undefined) {
        view.dispatch({
          changes: changesBetween(view.state.doc.toString(), text),
          selection: {
            anchor: Math.min(text.length, selection.anchor),
            head: Math.min(text.length, selection.head),
          },
          effects: updatePaper.of({ doc: props.document }),
          annotations: external.of(true),
        });
        measureRef.current("layout");
      }
    }, [props.document, props.pieceId]);
    useEffect(() => {
      measureRef.current("layout");
    }, [props.feedOffset]);
    useEffect(() => {
      measureRef.current("layout");
    }, [props.layoutKey]);
    return (
      <div ref={mount} className="paper-editor" aria-busy={props.disabled} />
    );
  },
);
