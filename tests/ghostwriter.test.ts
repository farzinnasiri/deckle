import test from "node:test";
import assert from "node:assert/strict";
import {
  ghostEdits,
  ghostRequest,
  minimalGhostEdit,
  ghostHighlight,
  type GhostRequest,
  type GhostEdit,
} from "../lib/ghostwriter";
import { playGhostEdits, type GhostPlayback } from "../lib/ghost-playback";
import { applyEvent, makeEvent, replay } from "../lib/writing";
import { editingText } from "../lib/editor-model";

const input = (text: string): GhostRequest => ({
  text,
  scope: { from: 0, to: text.length },
  options: { grammar: true, wording: true, structure: false },
  protected: [],
});
const suggestion = (before: string, after: string) => ({
  before,
  after,
  kind: "grammar",
  reason: "Fix agreement.",
});
test("plans anchor exact quotations within the selected passage and reject guesses", () => {
  const request = input("He walk. He walk.");
  assert.throws(
    () => ghostEdits(request, { edits: [suggestion("He walk.", "He walks.")] }),
    /exactly/,
  );
  request.scope = { from: 9, to: 17 };
  assert.deepEqual(
    ghostEdits(request, { edits: [suggestion("He walk.", "He walks.")] })[0],
    { ...suggestion("He walk.", "He walks."), from: 9, to: 17 },
  );
  assert.throws(
    () =>
      ghostEdits(request, { edits: [suggestion("He walks.", "He walked.")] }),
    /exactly/,
  );
});
test("plans reject overlapping edits, clippings and disabled categories", () => {
  const request = input("A badly writen line.");
  assert.throws(
    () =>
      ghostEdits(request, {
        edits: [
          suggestion("badly writen", "badly written"),
          suggestion("writen line", "written line"),
        ],
      }),
    /overlap/,
  );
  assert.throws(
    () =>
      ghostEdits(request, {
        edits: [
          {
            ...suggestion("A badly writen line.", "A line, badly written."),
            kind: "structure",
          },
        ],
      }),
    /beyond/,
  );
  request.protected = [{ from: 2, to: 14 }];
  assert.throws(
    () => ghostEdits(request, { edits: [suggestion("writen", "written")] }),
    /clipping/,
  );
  assert.deepEqual(ghostEdits(request, { edits: [] }), []);
  assert.deepEqual(
    ghostEdits(request, { edits: [suggestion("line", "line")] }),
    [],
  );
  assert.throws(
    () =>
      ghostEdits(input("Two lines."), {
        edits: [suggestion("Two lines.", "Two\nlines.")],
      }),
    /without permission/,
  );
});
test("a complete 120-line paper can return a correction on every line", () => {
  const lines = Array.from(
    { length: 120 },
    (_, index) => `Line ${index + 1}: She walk home.`,
  );
  const request = ghostRequest(input(lines.join("\n")));
  const edits = ghostEdits(request, {
    edits: lines.map((line) => suggestion(line, line.replace("walk", "walks"))),
  });
  assert.equal(edits.length, 120);
  for (const [index, edit] of edits.entries()) {
    assert.equal(request.text.slice(edit.from, edit.to), lines[index]);
    assert.equal(edit.after, lines[index].replace("walk", "walks"));
  }
});
test("requests enforce text, scope and explicit editing choices", () => {
  for (const value of [
    null,
    {},
    input(""),
    input("x".repeat(12001)),
    { ...input("a"), scope: { from: -1, to: 1 } },
    {
      ...input("a"),
      options: { grammar: false, wording: false, structure: false },
    },
  ])
    assert.throws(() => ghostRequest(value));
  assert.deepEqual(ghostRequest(input("Hello")), input("Hello"));
});
test("minimal changes preserve identical ink and keep Unicode code points whole", () => {
  const edit: GhostEdit = {
    ...suggestion("A 😁 day", "A 😄 day"),
    kind: "wording",
    from: 5,
    to: 13,
  };
  assert.deepEqual(minimalGhostEdit(edit), {
    ...edit,
    from: 7,
    to: 9,
    before: "😁",
    after: "😄",
  });
});
test("review highlights changed ink and anchors missing text without splitting Unicode", () => {
  const edits = ghostEdits(input("A 😁 day. He walk."), {
    edits: [
      suggestion("A 😁 day.", "A 😁 nice day."),
      suggestion("He walk.", "He walks."),
    ],
  });
  for (const edit of edits) {
    const range = ghostHighlight(edit);
    assert.ok(
      range.from >= edit.from && range.to <= edit.to && range.from < range.to,
    );
    const marked = "A 😁 day. He walk.".slice(range.from, range.to);
    assert.ok(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(marked));
  }
  assert.deepEqual(
    ghostHighlight({
      ...suggestion("😁", "😁!"),
      kind: "grammar",
      from: 0,
      to: 2,
    }),
    { from: 0, to: 2 },
  );
});
function paper(initial: string) {
  let text = initial;
  const operations: { from: number; to: number; text: string }[] = [];
  let onWrite = () => {};
  const adapter: GhostPlayback = {
    text: () => text,
    available: () => true,
    move: () => {},
    voice: () => {},
    write: (from, to, inserted) => {
      text = text.slice(0, from) + inserted + text.slice(to);
      operations.push({ from, to, text: inserted });
      onWrite();
    },
    checkpoint: () => {
      const before = text;
      return () => {
        text = before;
      };
    },
  };
  return {
    adapter,
    operations,
    setOnWrite: (run: () => void) => {
      onWrite = run;
    },
    type: (inserted: string) => {
      text += inserted;
    },
  };
}
test("playback performs local changes backwards, preserving earlier anchors", async () => {
  const request = input("He walk. She go.");
  const edits = ghostEdits(request, {
    edits: [
      suggestion("He walk.", "He walks."),
      suggestion("She go.", "She goes."),
    ],
  });
  const desk = paper(request.text);
  const result = await playGhostEdits(edits, desk.adapter, {
    signal: new AbortController().signal,
    reduced: () => true,
    progress: () => {},
  });
  assert.equal(desk.adapter.text(), "He walks. She goes.");
  assert.equal(result.completed, 2);
  assert.deepEqual(
    desk.operations.map((operation) => operation.from),
    [15, 7],
  );
});
test("reduced-motion batches yield between corrections so a queued stop can take over", async () => {
  const lines = Array.from(
    { length: 80 },
    (_, index) => `Stop ${index + 1}: she wait.`,
  );
  const request = input(lines.join("\n"));
  const edits = ghostEdits(request, {
    edits: lines.map((line) =>
      suggestion(line, line.replace("wait.", "waits.")),
    ),
  });
  const desk = paper(request.text),
    controller = new AbortController();
  desk.setOnWrite(() => {
    if (desk.operations.length === 1) setTimeout(() => controller.abort(), 0);
  });
  const result = await playGhostEdits(edits, desk.adapter, {
    signal: controller.signal,
    reduced: () => true,
    progress: () => {},
  });
  assert.equal(result.completed, 1);
  assert.equal(result.interrupted, true);
  assert.equal(
    desk.adapter.text(),
    [...lines.slice(0, -1), lines.at(-1)!.replace("wait.", "waits.")].join(
      "\n",
    ),
  );
});
test("instant application uses only approved edits and skips carriage, typing and sounds", async () => {
  const request = input("He walk. She go.");
  const edits = ghostEdits(request, {
    edits: [
      suggestion("He walk.", "He walks."),
      suggestion("She go.", "She goes."),
    ],
  });
  const desk = paper(request.text);
  let moves = 0,
    voices = 0;
  desk.adapter.move = () => {
    moves++;
  };
  desk.adapter.voice = () => {
    voices++;
  };
  const result = await playGhostEdits([edits[1]], desk.adapter, {
    signal: new AbortController().signal,
    reduced: () => false,
    instant: true,
    progress: () => {},
  });
  assert.equal(desk.adapter.text(), "He walk. She goes.");
  assert.equal(result.completed, 1);
  assert.equal(moves, 0);
  assert.equal(voices, 0);
  assert.equal(desk.operations.length, 1);
});
test("an invalid instant pass never leaves earlier replacements applied", async () => {
  const request = input("He walk. She go.");
  const edits = ghostEdits(request, {
    edits: [
      suggestion("He walk.", "He walks."),
      suggestion("She go.", "She goes."),
    ],
  });
  const desk = paper("We walk. She go.");
  const result = await playGhostEdits(edits, desk.adapter, {
    signal: new AbortController().signal,
    reduced: () => false,
    instant: true,
    progress: () => {},
  });
  assert.match(result.error ?? "", /paper changed/i);
  assert.equal(desk.operations.length, 0);
  assert.equal(desk.adapter.text(), "We walk. She go.");
});
test("interrupting mid-erasure restores the passage before human input continues", async () => {
  const request = input("badly");
  const edits = ghostEdits(request, { edits: [suggestion("badly", "well")] });
  const desk = paper(request.text),
    controller = new AbortController();
  desk.setOnWrite(() => {
    controller.abort();
    desk.type("!");
  });
  const result = await playGhostEdits(edits, desk.adapter, {
    signal: controller.signal,
    reduced: () => false,
    progress: () => {},
  });
  assert.equal(result.completed, 0);
  assert.equal(result.interrupted, true);
  assert.equal(desk.adapter.text(), "badly!");
});
test("interruption retains completed passages and restores only the active passage", async () => {
  const request = input("bad. bad.");
  const edits: GhostEdit[] = [
    { ...suggestion("bad.", "good."), kind: "wording", from: 0, to: 4 },
    { ...suggestion("bad.", "good."), kind: "wording", from: 5, to: 9 },
  ];
  const desk = paper(request.text),
    controller = new AbortController();
  let passages = 0;
  const result = await playGhostEdits(edits, desk.adapter, {
    signal: controller.signal,
    reduced: () => true,
    progress: () => {
      if (++passages === 2) controller.abort();
    },
  });
  assert.equal(result.completed, 1);
  assert.equal(desk.adapter.text(), "bad. good.");
});
test("playback refuses stale anchors and changes that exceed paper capacity", async () => {
  const desk = paper("now changed");
  const edit: GhostEdit = {
    ...suggestion("old", "new"),
    kind: "wording",
    from: 0,
    to: 3,
  };
  const result = await playGhostEdits([edit], desk.adapter, {
    signal: new AbortController().signal,
    reduced: () => true,
    progress: () => {},
  });
  assert.match(result.error ?? "", /paper changed/i);
  assert.equal(desk.adapter.text(), "now changed");
  const full = paper("x\n".repeat(119) + "x");
  const tooLong = { ...edit, before: "x", after: "x\nx", from: 0, to: 1 };
  const capacity = await playGhostEdits([tooLong], full.adapter, {
    signal: new AbortController().signal,
    reduced: () => true,
    progress: () => {},
  });
  assert.match(capacity.error ?? "", /fill the paper/);
  assert.equal(full.operations.length, 0);
});
test("ghost corrections retain passage formatting without changing the writer's active ribbon", () => {
  const original = replay([
    {
      ...makeEvent("style", "", "draft"),
      style: { ribbon: "red", strike: "double" },
    },
    makeEvent("type", "writen", "draft"),
    {
      ...makeEvent("style", "", "draft"),
      style: { ribbon: "black", strike: "single" },
    },
  ]);
  const event = {
    ...makeEvent("type", "t", "draft"),
    origin: "ghost" as const,
    range: { from: 4, to: 4 },
    style: { ribbon: "red" as const, strike: "double" as const },
  };
  const corrected = applyEvent(original, event);
  assert.equal(editingText(corrected), "written");
  assert.equal(corrected.marks[4].ribbon, "red");
  assert.equal(corrected.marks[4].strike, "double");
  assert.deepEqual(corrected.typingStyle, original.typingStyle);
});
