# Deckle: the next pass

This brief is for whoever builds the next version. It sits alongside `DECKLE.md` (the original product brief, still the authority on intent), `DESIGN.md`, and `README.md` (what exists today and where it lives).

The current build works and people like it. Don't replace it. Extend it one piece at a time.

---

## 0. How to read this

**The direction:** modern writing features folded into an old machine. You get titles, bold, headings, paper stock and light, but each one arrives the way a 1960s writing desk would have offered it: as a lever, a stamp, a different ribbon, a different sheet. It never arrives as a toolbar.

**The rule: simplicity is complicated.** The surface stays as quiet as it is now: one desk, one machine, one strip of paper. The complexity goes under the hood. Every new capability has to pass three checks:

1. **Is it a physical thing?** If there's no plausible object or mechanism for it on this desk, it probably doesn't belong.
2. **Is it invisible until wanted?** Nothing new should be on screen while someone is simply typing.
3. **Does it touch sound and light too?** A new paper stock doesn't only change colour. It changes how the strike sounds and how the tear sounds. That depth is what makes this feel real rather than themed.

**Order of work:** section 13 suggests phases. Fixes come first.

**Code map today:**
- `components/deckle.tsx`: the desk, the machine, the tear, the drawer and reader dialogs.
- `components/paper-editor.tsx`: CodeMirror with ink decorations.
- `lib/audio.ts`: the sound engine.
- `lib/writing.ts` and `lib/editor-model.ts`: the event model, layout and Markdown export.
- `lib/storage.ts`: IndexedDB.
- `components/manual.tsx`: the booklet.
- `app/globals.css`: all styling.

---

## 1. Fixes first

### 1.1 The tear doesn't look real

**Today:** the paper feeds out three lines, a dark jagged line grows across the slot, and the whole strip slides straight up and fades out (`.paper-away` in `globals.css`). It reads as a UI transition, not as paper.

**What a real tear looks like:**
- **The paper is pulled at an angle, not sideways.** As the tear runs across, the torn part hinges around the corner that is still attached. The strip rotates a few degrees (2–5°) around that corner, and the angle grows as the tear progresses.
- **The torn corner lifts off the bar.** Its shadow widens and softens, and the paper near the free corner shows a slight curl: a light highlight band and a darker underside.
- **The tear moves in jerks, not at a constant rate.** Fibres resist and then give, so progress follows the hand with small stalls and snaps. Tie each visual snap to an audio grain so eye and ear agree.
- **The torn edge has fibres.** It needs a feathered, lighter fringe a pixel or two wide, not a hard zig-zag. The existing seeded profile in `lib/deckle-edge.ts` gives the shape; add a soft fringe, for example a second clip with a noisy mask, slightly lighter than the paper.
- **The release.** When the last fibres go, the piece springs free: a tiny recoil toward the hand, then it is lifted up and away with some air in it (a slight flutter in rotation, not a fade). It lands in the tray at the bottom, where the top card visibly drops in with a soft paper slap. That bit already exists; time it to the landing.
- **What stays behind.** A fresh torn edge remains at the bar, matching the piece that left (already implemented). It should be visible for a beat before the new tongue rises.

**Implementation hints:**
- Drive everything from one `progress` value, 0 to 1.
- Clip the strip with a polygon. Its bottom edge follows the tear profile from the starting side up to `progress`, and stays straight (still attached) beyond it.
- Rotate around the attached bottom corner (`transform-origin` at that corner) by `angle = progress * maxAngle`.
- Scale the shadow with lift.
- Keep it on the compositor: only transforms, opacity and a pre-built clip on change.
- Reduced motion: the tear completes in one step, with no rotation.

**Acceptance:** recorded at 60 fps, a frame-by-frame look should show a hinge, a lift and a fibrous edge. Someone watching for the first time should not describe it as "the page slid away".

### 1.2 The tear sound is too high-pitched

**Today:**
- Tear grains play the `tear.mp3` recording at `rate: 0.9 + speed * 0.12`, up to about 1.15 (`lib/audio.ts`, `tearTo`).
- The Draft correction sound reuses the same recording at `rate: 1.5` with a 2.4 kHz high-pass.
- The source recording is already bright, so speeding it up makes it thin and hissy.

**Fix:**
- Never play paper above `rate` 1.0. Use 0.8–0.95 for tearing, varied by speed downward: a slow pull is lower and grainier.
- Low-pass tear grains at about 4–5 kHz, with a gentle bump around 300 Hz–1.5 kHz. That's where the "body" of a paper rip lives.
- Split the tear into three recorded phases: a stretch crackle at the start, propagating grains, and a release pop plus a little air. One recording scrubbed end to end will always sound like a sample.
- Source a better recording: a slow tear of heavier paper (a CC0 search for "paper tear slow" or "newspaper tear"), or record one. Keep `public/audio/SOURCES.md` up to date.
- Give the correction sound its own source too; it currently borrows the tear.
- Bring the levels back in line with a keystroke. The last measured peaks were about 0.16 for a strike and 0.20 for the tear; keep the tear at or below a strike.

### 1.3 Empty lines are counted

**Today:** `apply()` in `deckle.tsx` adds `after.rows - before.rows` to `linesToday`. Pressing Return on an empty line counts, so holding Return inflates the counter. The screenshot shows 44 lines for a mostly blank page.

**Fix:** count a line once, when it first receives a visible (non-whitespace) glyph.
- Simplest version: count non-empty rows in the layout after the edit minus before, never below zero.
- Deleting text should not decrease today's count. It's a tally of work done, not of what survives.
- Add a test: typing ten Returns adds 0, and typing "a" on a new line adds 1.

---

## 2. Focus mode as a transition

**Today:** the expand toggle swaps a class. The props vanish and the scene jumps to a new scale in one frame.

**Make it a short choreography (about 650 ms), reversed on exit:**
1. Props leave first. The reference card, clock and drawer tray slide a little toward the nearest edge as they fade. The pull cord rises out of frame.
2. The machine sinks. Its face slides down and out of view, as if the machine lowers into the desk, leaving only the rail, head and slot.
3. The camera eases in. The scene scales up to the focus scale and the paper becomes the protagonist. Animate the scale; never jump it.
4. The light narrows. The lamp pool (or the daylight vignette) tightens around the paper.
5. Optional sound: a faint felt/air movement. Nothing mechanical; focus should feel like the room going quiet.

**Notes:**
- Typing must keep working throughout. Never block input during the transition.
- Esc and the shortcut stay as they are.
- Reduced motion: a 150 ms crossfade.

---

## 3. First run: your name, stamped on every paper

**Today:** first run is a dust cover. You lift it and you're writing.

**New:** after the cover lifts, the machine feeds a small owner's card instead of the roll. It's a stiff, cream index card with a printed line:

```
   THIS MACHINE BELONGS TO
   ________________________
```

- The person types their name on the machine itself, with real keystrokes and real sounds. No form field. It's their first act of typing and it teaches the machine in five seconds.
- Return ejects the card, which slides out and settles on the desk next to the machine (a small keepsake prop). The roll then feeds in.
- An empty Return or Esc skips this. The card then reads "A WRITER", and they can set a name later.
- Then a rubber stamp is "cut" for them: a short moment where a stamp presses onto the first paper's header with a soft *thunk*.

**The stamp on every paper:**
- The current violet date stamp becomes a combined name and date stamp, like a library date stamp:

  ```
  ┌──────────────────────────┐
  │  FARZIN · 08 OCT 2026    │
  └──────────────────────────┘
  ```

- It's stamped at the moment of the first keystroke on a fresh paper, not before. Until then, the header is blank.
- Each stamping is slightly different: rotation, ink coverage, position by a pixel or two. The stamp's seed is stored with the paper, so it renders the same forever.
- The stamp and owner's card both come from settings (§7), where the name can be changed. Changing it affects future papers only, because a stamped paper is history.
- Export includes the name in the Markdown front matter and in the PDF header.

---

## 4. A clock

The user wants the time visible. Recommendation: **a small desk clock as a prop**, not text on screen.

- A Braun-style travel alarm clock: matte, square, small, in the lower right of the desk.
- Smooth-sweeping hour and minute hands, no seconds hand by default.
- It casts a shadow and takes the light like everything else. At night under the lamp it's half in shadow, which is right.
- **No ticking by default.** A tick is a strong rhythmic sound that will fight with typing. Offer it in settings ("a ticking clock") for people who like it; when on, it's very quiet and in the room's reverb.
- Click it to flip it face-down (time hidden), or tuck it away entirely in settings.
- It disappears in focus mode, like the other props.

**Also:** the time joins the stamp when a paper is torn. The drawer shows "08 OCT 2026 · 21:40". The paper already stores `created` and `torn` timestamps.

Rejected alternatives:
- A clock in the machine face: too busy, and the face is already full.
- Text in a corner: breaks the illusion.

---

## 5. The manual becomes a reference card

**Feedback:** the booklet on the desk is a distraction, but the way it opens is liked.

**New:** remove the booklet from the desk. In its place, a **pull-out reference card** lives under the machine, like the pull-out quick-reference shelf on old keyboards and office machines.

- A small tab protrudes from under the machine's left edge with an engraved "≡" or a tiny printed "REF".
- Click or drag the tab and a stiff card slides out from under the machine toward the writer, with a soft slide sound and real friction (a slow start, then smooth).
- The card has **index tabs along its top edge**, like card dividers: **Paper · Light · Desk · Sound · You · Keys**.
  - **Paper:** stock, ribbon, type element (§6, §7).
  - **Light:** lighting (§7).
  - **Desk:** surface, props on or off (clock, owner's card).
  - **Sound:** volume, bell, room, ticking clock.
  - **You:** name, export and backup.
  - **Keys:** shortcuts and a short "how this machine works", replacing the manual's first page.
- Choosing an option feels physical: a small punched hole, a pencil tick, a sliding marker.
- Changes apply live, so the paper and light change behind the card as you choose.
- Push the card back in, press Esc, or click the desk to close it.
- The current manual's content and voice (dry, warm, 1960s equipment manual) move onto the card.

This keeps the desk empty, keeps the delight of opening something, and gives customization a home.

---

## 6. The paper as a page: title, emphasis, typefaces, initials, sections

These are modern editing features. Each one gets a period mechanism, and none of them gets a toolbar.

### 6.1 Title

- Every paper has a **title slot** in its header, above the first line and left of the stamp. It's empty and invisible until hovered, then it shows a faint ruled line.
- Click it, or use `⌘/Ctrl + Shift + T`, to type the title. It's set in the title style: centred, letter-spaced capitals, slightly larger, a touch more ink (like a heading struck twice).
- If no title is set, the drawer keeps using the first line, as it does today.
- The title is part of the document model, recorded as an event for replay, and exported as `# Title`.

### 6.2 Emphasis, the typewriter way

| Modern | On this machine | Shortcut | How it renders | Markdown |
|---|---|---|---|---|
| Bold | **Double strike** | ⌘B | Each glyph struck twice with a ~0.4 px offset, heavier ink; the strike sound plays twice, a hair apart | `**…**` |
| Italic | **Italic type element** (§6.3) | ⌘I | Glyphs set in the italic element | `*…*` |
| Underline | **Underscore overstrike** | ⌘U | A typed underline, slightly uneven, under each glyph | `<u>…</u>` |
| Annotation / emphasis colour | **Red half of a bichrome ribbon** | ⌘⇧R, or a ribbon lever on the machine | Red ink with its own density and slight misregistration | `<mark>…</mark>`, or keep as a span with a class |

**How they're applied:**
- **Selecting text** and pressing the shortcut applies the style to that text.
- **With no selection,** the shortcut toggles the mode for what you type next, and a tiny indicator on the machine shows it. Example: the ribbon lever visibly flips to red.
- **A selection card.** When text is selected, a small metal type-guide card can rise above the selection with four marks: **B · I · U · red**. It appears only on selection, never while typing, and has no icons from icon libraries: engraved letters only.
- **Ink mode stays honest.** Emphasis can be added to existing text, because overstriking is a real thing you could do. It can't be removed: the extra marks stay, the same way crossings do today. Draft mode can add and remove freely.

### 6.3 Type elements (changing font)

On an IBM Selectric you changed the typeface by swapping the golf-ball element. Do the same here.

- A small **element cover** on the machine deck, near the head, shows which element is installed.
- Offer three or four curated elements, all OFL-licensed. For example:
  - Courier Prime (current default)
  - Courier Prime Italic (the italic element)
  - A proportional book face for "letterpress" (current "Book" option)
  - Possibly one more with character, such as a typewriter sans like Letter Gothic
- Choose the element per paper (on the reference card) or per selection (italic).
- Switching the element plays a short mechanical sequence: a lift, a click, a tiny rotation of the element cover. Under the hood each element can carry its own strike-sound tone bias, so the book face strikes a touch softer.

### 6.4 The initial (drop cap)

- Old books opened chapters with a large initial. Offer **"Initials"** as a paper option on the reference card. It's off by default.
- When on, the first letter of the paper, and of each section (§6.5), is set as a **large stamped or woodcut-style initial** spanning three lines, with the text wrapping around it.
- It's rendered as a stamp: slightly uneven ink, a touch of colour from the ribbon (black or red), and a heavier *thunk* sound when it lands.
- It's purely typographic. The underlying text is still just the letter, and export emits it normally.

### 6.5 Sections and headings

- **Section heading:** a line typed as `# ` followed by text, or set with `⌘/Ctrl + 1`, becomes a heading in the typewriter manuscript convention: centred, spaced capitals, underscored.
- **Subheading:** `## ` or `⌘/Ctrl + 2`. Left-aligned, underlined.
- **Section break:** a line with `***`, or `⌘/Ctrl + Return` with Shift, becomes a centred dinkus (`*  *  *`) with a little extra paper fed before and after. The carriage sound includes the extra line feeds.
- Headings appear in the drawer as an outline when a paper is opened for reading. That's a quiet table of contents.
- Export: `#`, `##`, `---` or `***`.

### 6.6 Data model and replay

All of this needs **document model v2**. Today a mark has text, seed, density, mode, crossed and overprints.

- **Per mark:** `strike` (single or double), `element`, `underline`, `ribbon` (black or red).
- **Per line:** a block type (title, heading 1, heading 2, dinkus, body), plus an initial flag.
- **Events:** every style change is an event (`style`, `block`, `title`), so replay reproduces formatting in order.
- **Migration:** v1 papers load unchanged. Missing fields mean defaults. Write a migration test with a real v1 store fixture.
- **Markdown round trip:** test export for every style. Import isn't required.

---

## 7. Customization: paper, desk, light, ribbon

Curated, not infinite. Each option is a real material with its own **look, sound and light response**. That's the complexity under the hood.

### 7.1 Paper stocks

| Stock | Look | Under the hood |
|---|---|---|
| **Bond (cream)**, today's default | warm cream, soft fibres | current |
| **Bright white laid** | cool white, faint laid lines (fine parallel lines + chain lines) | slightly brighter strike; crisp tear |
| **Onionskin** | thin, faintly translucent; the desk grain shows through a little | lighter, thinner strike and tear; ink a touch sharper |
| **Manila / kraft** | warm tan with visible fibre | duller strike; slower, fibrous tear; ink sinks in more |
| **Ledger (ruled)** | pale green-grey with faint ruled lines aligned to the line height | as bond |
| **Grey recycled** | soft grey, visible flecks | as kraft |

Generate paper textures procedurally in `scripts/textures.mjs` (one per stock), as today. Each stock defines: texture, tint, ink absorption (mask strength and density), tear profile roughness, and sound bias (gain, tone, tear grain).

### 7.2 Desk surfaces

| Surface | Under the hood |
|---|---|
| Walnut (current) | current |
| Pale oak | lighter, warmer room; slightly brighter reflections |
| Green leather blotter on walnut | softer, damped strikes (felt absorbs); shorter room |
| Linen / bookcloth | dry and soft |
| Slate / dark stone | harder, a touch more ring in the room |

The surface changes the room response and the low "thump" layer of each strike. The machine sits on it, so this is honest.

### 7.3 Light

| Light | Look | Notes |
|---|---|---|
| **Daylight**, north window | cool, soft, shadows right | current day |
| **Tungsten lamp** | warm pool, dark edges | current lamp |
| **Fluorescent office** | flat, slightly green-white, even, low contrast, weak shadows | optional faint 100/120 Hz hum, off by default; a one-time flicker when switched on |
| **Mixed**: late afternoon window plus lamp | warm pool inside a cool room | two shadows, faint and different directions; the most beautiful one, worth the effort |
| **Candle**, maybe | very warm, small pool, slight flicker | gentle and slow; must never strobe; respect reduced motion |
| **Follow the day** | moves through daylight → mixed → lamp by local time | current auto, extended |

- The pull cord cycles through on/off for the lamp. The full choice lives on the reference card.
- Implement lights as data: pool shape, colour stops, shadow direction(s), window light amount, ambient hum. The existing `.light-pool` multiply layer becomes data-driven.

### 7.4 Ribbon

Black (current), blue-black, sepia, and black/red bichrome (enables the red half, §6.2). It's a colour plus a density curve, chosen on the card.

### 7.5 Presets

Offer four or five named combinations so nobody has to design their own desk. They live as the first row of the Paper tab:
- **The study:** bond, walnut, tungsten.
- **The office, 1971:** ledger, slate, fluorescent.
- **Kitchen table, Sunday:** white laid, oak, daylight.
- **Correspondence:** onionskin, leather blotter, mixed light.

Everything remains individually adjustable.

---

## 8. The drawer becomes a place

**Feedback:** the drawer is cool, but it just opens a dialog box.

**New: the drawer actually opens.**
- Click the tray, or press `⌘O`. The whole desk view slides up (the machine and paper move up and partly out of frame, as if you leaned back). The desk's front edge slides toward you as a real drawer, and you look down into it.
- **Inside:** a shallow wooden drawer, lined with felt, with **month dividers** (tabbed cards, e.g. "OCTOBER 2026") standing up between groups.
- **Papers are rolled strips**, tied loosely or held with a paper clip, title and stamp visible on the outer turn. Their thickness reflects their length, as today.
- **Hover** lifts a roll slightly. **Click** picks it up: it unrolls across the desk where the paper normally sits, and you read it with the same paper rendering, the same knob and the same wheel.
- The reading paper has three engraved controls on a small brass plate: **Replay · Continue · File back**. Export, print and discard are in a small corner fold, like a dog-ear you lift.
- **Search:** an index card in the drawer's front compartment. Type a phrase; rolls that don't match dim and sink, and rolls that do lift a little.
- **Wastebasket:** a wire basket at the drawer's right end. Drag a roll into it to discard, with a crumple sound and animation. Click the basket to look inside; papers stay for 30 days, as today.
- **Close:** push the drawer shut (click its front edge, Esc, or scroll down). The desk slides back with a wooden thud.

Under the hood:
- Virtualize the rolls if there are hundreds.
- Month dividers are generated from torn dates.
- Search uses an index in the database (§9), not a scan of every paper's Markdown on each keystroke, as it does today.

---

## 9. Storage (the browser database)

**Already in place:** papers are stored in IndexedDB (`deckle-v1`, object store `desk`, key `state`). Today it's one record holding the entire desk, written on every keystroke.

That won't scale with formatting, stamps and long histories. Restructure it:
- **Stores:**
  - `papers`: one record per paper, keyed by id, indexed by `torn` date and `discardedAt`.
  - `events`: per-paper keystroke logs, kept separate so the drawer can list papers without loading every log.
  - `settings`: one record.
  - `owner`: name and stamp seed.
- **Write cadence:** coalesce writes, at most every 250 ms while typing and immediately on tear or blur. Never lose more than about a second of typing.
- **Migration:** move `deckle-v1/state` into the new stores on first load. Keep the old record until the new write is verified, then mark it migrated; never delete user data in the same step.
- **Search index:** a lowercase word index per paper, updated on tear.
- **Export:** export everything (Markdown and archive), plus a new import of the archive, which `README.md` lists as missing today.
- **Persistence:** request `navigator.storage.persist()` on first tear. Mention it on the reference card's "You" tab so people understand the browser might otherwise clear it.
- **Tabs:** detect a second open tab (BroadcastChannel) and show a gentle note on the paper ("This desk is open in another tab"), rather than letting two tabs overwrite each other.

---

## 10. More ideas in the same spirit

Each is small, physical, and invisible until wanted. Take what fits and park the rest.

- **The owner's card stays on the desk.** After first run it sits by the machine, slightly askew. It's a quiet personal object, and clicking it opens the "You" tab of the reference card.
- **Carbon copy:** an option for a faint blue carbon duplicate. On tear, a carbon of the paper slides into the drawer alongside it. Mostly delight; under the hood it's just an export to a second "copy" format. Park unless someone asks.
- **Photograph a paper:** "Share" produces a PNG of the paper lying on the desk in the current light, with torn edges and stamp. People will want to share what they wrote without leaving the illusion. This is the friendliest export.
- **End of the day:** at local midnight, or the first open of a new day, the counter rolls over with a visible, audible spin of all four drums back to 0000. It's tiny, satisfying, and explains why the number reset.
- **Margin bell variety:** the bell timbre follows the machine: a crisper bell on the bright-white preset, a duller one on the leather desk.
- **Line spacing lever:** single, 1.5 or double line spacing, set with a real lever on the deck with a ratchet sound. Double spacing is how people drafted for editing, and it fits the Draft mode story.

**Rejected on purpose** (written here so nobody reintroduces them):
- Streaks, goals and word-count targets.
- AI anything.
- Ambient soundscapes such as rain or café.
- A toolbar.
- Emoji.
- Themes beyond the curated materials.

---

## 11. Sound notes for the whole pass

- Every new physical action needs a recorded sound. Synthesised sound is acceptable only for tiny ticks.
- **New sounds needed:**
  - Stamp thunk
  - Card slide out and in
  - Card tab flip
  - Drawer open and close (longer than today)
  - Roll pick-up and unroll
  - Crumple
  - Element change
  - Ribbon lever
  - Line-spacing lever
  - Clock tick (optional)
  - Fluorescent hum (optional)
  - Better tear (§1.2)
- Keep every sound under a keystroke's loudness unless it's a deliberate, rare event, such as the tear or the drawer.
- Materials change sound: paper stock (§7.1) and desk surface (§7.2) feed small changes into the strike voice and room. Implement this as a small "material profile" passed to the engine, not as separate sample sets.
- Measure as the last pass did: tap the master bus with an analyser and record peak per voice. Keep a table in `README.md`.

---

## 12. Acceptance checks

- **Typing is never blocked:** not by focus transitions, the stamp, the card or the drawer animations.
- **60 fps on a mid-range laptop** while typing quickly, with the lamp, the mixed light and a long paper.
- **Reduced motion:** every animation has an instant or crossfade alternative.
- **Keyboard and screen reader:** every new control is reachable and labelled, the selection card is reachable by keyboard, and the drawer is navigable without a mouse.
- **Replay:** reproduces titles, styles, headings and stamps.
- **Migration:** a v1 desk, with its pieces, settings and logs, loads into the new storage intact.
- **Tests added:**
  - line counting (§1.3)
  - style events and Markdown export (§6.6)
  - storage migration (§9)
  - stamp determinism (§3)

---

## 13. Suggested order

1. **Fixes:** the tear animation, the tear sound, line counting.
2. **Storage v2 and model v2.** The foundation for everything after it.
3. **Paper typography:** title, emphasis, type elements, sections, initials.
4. **First run:** owner's card, name stamp, clock.
5. **Reference card:** replaces the manual, and is the home for customization.
6. **Materials:** paper stocks, desks, lights, ribbons, presets.
7. **Focus transition and the new drawer.**

Each step should ship on its own and leave the app working. Check with Farzin before starting anything in §10.
