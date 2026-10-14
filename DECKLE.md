# Deckle

**A writing machine that never existed.**

> *deckle edge*: the rough, feathered edge of handmade paper, left where the sheet met the frame. On this machine, every piece you finish ends with one, because you tear it off.

This is the product brief for whoever builds Deckle. It covers what the app is, how it should feel, and enough technical direction to start. Where I've made a call that's easy to change later, I say so.

---

## 1. Why this exists

AI makes text cheap, and the internet is full of words nobody chose. Most people have stopped writing for themselves. They prompt, paste, or scroll instead.

Writing used to be physical. You pressed a key and something hit paper, so every word took a small amount of effort and left a mark. That bit of resistance helped people slow down and think about what they were putting down.

Deckle brings that resistance back on purpose. It gives a person one object, one strip of paper, and the sound of their own hands working. Nothing in it writes for you.

**What success looks like:** someone opens Deckle meaning to write a quick note, and twenty minutes later they've filled a long strip of paper and they feel good about it.

---

## 2. The big idea (and how it differs from Platen)

Platen and similar apps are nostalgic. They put a cute, customizable typewriter on your phone.

**Deckle isn't a typewriter.** It's a writing instrument that was never manufactured, designed as if Dieter Rams, Olivetti's 1960s design studio and Teenage Engineering had made one object together. It's built from real materials (bead-blasted aluminum, bakelite, felt, brass, paper), so it feels photographically real. Because no such machine ever existed, it reads as a new object, not a copy of an old one.

Here's how it works:

- **Paper comes off a roll.** A continuous strip feeds up out of a slot in the machine as you type. You don't get pages. You get one long strip per piece, like a telex or a receipt for your thoughts.
- **The print head is the cursor.** A small carriage rides a rail across the slot and strikes each letter onto the paper. Nothing blinks.
- **You finish a piece by tearing it off.** You drag the paper against the serrated tear bar, it rips with a deckle edge, and the strip goes into the drawer.
- **Every control is physical.** There's no settings screen, no toolbar, no hamburger menu. Anything you can change is a knob, a switch, a lever, or a page in the small printed manual on the desk.

The tone is **minimal and quiet, never cute.** It should feel like a beautiful instrument on a well-lit desk, not a toy.

---

## 3. Principles

These settle disagreements. When a decision is unclear, check it against this list.

1. **Nothing writes for you.** No AI, autocomplete, suggestions, or "rewrite this." Never. This is the product's position, not a gap in the feature list.
2. **Every mark is earned.** Text gets onto the paper through keystrokes. Pasted text is allowed, but it shows up as a taped-on clipping (see §6.6) so it never passes as your own typing.
3. **Physical honesty.** If something moves, it moves like a mechanism: fast acceleration, a firm stop, a small settle. No floaty springs, no fades where a real object would slide.
4. **Sound is half the product.** A keystroke that sounds wrong is a bug as serious as a crash.
5. **One object, done perfectly.** No themes marketplace and no 40 color options. We give people one machine, one desk and two kinds of light, and spend all the effort making them perfect.
6. **No nagging.** No streaks, badges, notifications, or "you haven't written today." The machine waits.
7. **Your words are yours.** Local-first, plain-text exportable, no account needed.

---

## 4. Platform (decision — confirm before building)

**v1: macOS and iPadOS, one SwiftUI multiplatform codebase, with Metal for shaders.**

Why: both have real keyboards, and a real key under the finger is the most honest tactile feedback available. The app's job is to make that press *sound* and *look* consequential. The desk scene also needs room, which a phone screen doesn't give.

- **Mac:** primary target. Hardware keyboard. Force Touch trackpad haptics (`NSHapticFeedbackManager`) for knob detents and the tear.
- **iPad:** hardware keyboard primary. Offer the on-screen keyboard too, but its tactile story is weak because iPad has no haptic engine. Don't over-invest there in v1.
- **iPhone: later.** It's the one device with real haptics (Core Haptics), so it may eventually get a custom on-screen keyboard with per-key haptic texture. For now it's out of scope.

This is easy to change early and painful to change late. Confirm it with Farzin before writing real code.

---

## 5. The scene

One fixed scene with a single camera. Nothing navigates away from the desk.

```
 ┌──────────────────────────────────────────────────────────┐
 │                 (paper strip continues up,               │
 │                  curling slightly at the top)            │
 │           ┌────────────────────────────────┐             │
 │           │  the morning was quiet and I   │             │
 │           │  didn't know yet what I wanted │             │
 │           │  to say, so I started here.    │             │
 │           │                                │             │
 │           │  Then the kettle_              │             │
 │  ┌──────┐ ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← tear bar  │
 │  │manual│ │▓▓▓▓▓▓▓▓[■]▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← print head│
 │  └──────┘ │   THE MACHINE          ◎  0 1 2 4│    on rail  │
 │           │  ink/draft ⊸     feed knob ◉     │             │
 │           └────────────────────────────────┘     ⟟ lamp    │
 │  ═════════════════ drawer (closed) ══════════════════════ │
 └──────────────────────────────────────────────────────────┘
```

- **Camera:** top-down, tilted roughly 15–20° toward the writer, so the text on the paper reads comfortably and the machine has visible depth. The camera stays still. It never pans or zooms in v1.
- **The desk:** dark oiled walnut with real grain and a few honest wear marks. That's the only desk in v1.
- **The machine:** lower-center, low and wide, about the footprint of a closed laptop. Warm-grey bead-blasted aluminum body, bone-colored bakelite controls, one accent color (vermilion) used only on the tear bar's edge and the ink-mode switch flag.
- **The paper:** comes out of the slot and runs up and off the top of the screen. It casts a soft shadow on the desk and curls slightly where it leaves the machine. Warm off-white with visible fiber, not flat beige.
- **The manual:** a small stapled booklet on the left. Tapping it opens it (page-turn), and it holds the few preferences that exist (§8).
- **The lamp:** only its base and pull-chain are in frame on the right. Its light is what you see.
- **The drawer:** the desk's front edge is a drawer. Pull it open to see finished pieces (§7).

### Light

Light is what makes this look real rather than illustrated. There are two states in v1:

- **Day:** cool, soft window light from the upper left. Long, gentle shadows.
- **Lamp:** warm tungsten pool from the right. Most of the desk falls off into darkness, the paper glows, and the machine's metal picks up warm highlights.

It follows the system clock by default (lamp after local sunset). Pulling the lamp chain overrides it. The change takes about 600 ms with a slight filament warm-up flicker. Every material has to respond correctly to both lights: paper fibers catch raking light, ink sits slightly *on* the paper, and the aluminum has anisotropic sheen.

---

## 6. The machine and what each part does

Every part has to earn its place. If a part has no job, it isn't on the machine.

### 6.1 Keys → print head → paper

- Each keystroke makes the print head **strike**. It dips toward the paper for about 40 ms and returns, then the head steps one character to the right along its rail.
- The glyph appears **at the moment of impact**, not when the key goes down. That ~25 ms delay is deliberate and it's what makes typing feel like cause and effect. Tune it by feel, keep it under 35 ms, and make sure it never feels laggy.
- **Each strike is slightly imperfect**, the way real impact printing is:
  - baseline offset ±0.3 pt, rotation ±0.4°, ink density ±6%
  - fast typing strikes a touch lighter, and a deliberate pause before a key gives a slightly darker strike (inter-key interval stands in for force, since keyboards don't report pressure)
  - ink sits *on* the fiber, with a faint bleed and tiny gaps where the paper texture is high
- **Imperfections are seeded per keystroke and stored**, so a page always re-renders exactly the same. Never re-randomize on redraw.
- **Line length is fixed** (about 60 characters, like a real machine). Words wrap automatically, but the head visibly slides back to the left and the paper advances one line with its own sound.

### 6.2 Return

Return advances the paper and sends the head home. The paper rises by one line with a quick, firm mechanical motion and a tiny settle. Holding Return feeds blank paper continuously at a steady ratchet rate, which is how you leave space.

### 6.3 Margin bell

Four characters before the end of a line, a small bell rings once, quietly. It's the most beloved sound of the old machines and it's useful: it tells you a line is about to wrap without you looking. It can be turned off in the manual.

### 6.4 Ink / Draft switch

A small two-position toggle with a vermilion flag. It sets what Backspace does.

- **Draft (default):** Backspace lifts the last letter off the paper, like a correctable ribbon. You hear a short *tock-shhk*, the glyph fades from the paper over about 120 ms, and a ghost of it remains for a moment before vanishing.
- **Ink:** Backspace can't remove anything. It moves the head back one space, and typing over a letter strikes on top of it (an `x` over a letter crosses it out the way people actually did it). Word-level strikethrough uses `Option+Backspace` / `Alt+Backspace`, which draws a typed line through the previous word. **What you wrote stays visible.** It's for journaling and first drafts where you want to keep moving.

The switch has a satisfying over-center snap, both visually and in sound. Flipping it mid-piece is allowed and affects only what comes after.

### 6.5 Feed knob

A large knurled knob on the right side of the machine. It's the only way to scroll.

- Drag it (or scroll with the trackpad or mouse wheel) to roll the paper back down and read what you wrote, then roll it forward again.
- Detents at every line: a soft tick sound plus a trackpad haptic on Mac.
- Real inertia and friction. A flick spins it and it coasts to a stop, but the rolled paper is heavy, so the coast is short and damped. It doesn't drift like an iOS scroll view.
- The knob's knurling visibly rotates in step with the paper. If those two disagree by a single pixel, it looks fake.
- Typing while scrolled back snaps the paper to the print line first, with a quick roll and a ratchet sound. You can only type at the print head, like a real machine.

### 6.6 Pasting: the clipping

Paste is allowed, but the paper treats it as foreign material. The pasted text appears as a **separate scrap of paper taped onto the strip**, set in a different typeface (a newsprint serif), with a strip of slightly translucent tape across the top and a faint shadow. A short tape-tear sound plays. In exports, clippings are marked as quotes.

This keeps pasting honest without being preachy. You can quote things, and it's visually clear which words you didn't type.

### 6.7 Line counter

A small mechanical odometer on the machine's face with four rolling digits. It counts **lines written today**, not words. Lines are a more physical unit, and the number is small enough to feel humble. The digits roll over with a tiny clicking sound. It isn't a goal or a streak, just an honest tally that resets at midnight.

### 6.8 Volume wheel

A small knurled thumbwheel next to the counter. It's the master volume for the machine, and rolling it all the way down clicks it into a detent marked *off*. People write in libraries and on trains, so silent mode has to be one gesture away.

### 6.9 The tear

This is how a piece ends, and it should be the most satisfying moment in the app.

- Grab the paper above the tear bar and drag it sideways, either way. Resistance builds for the first few millimeters, then the tear propagates across the bar following the drag speed. It makes a real paper-tearing sound that's scrubbed with the gesture, so a slow drag gives a slow tear.
- If you let go halfway, it stays half-torn. Drag back and it does **not** heal. Finish the tear to complete it.
- Once torn, the strip lifts free, rolls itself loosely, and drops into the drawer, which opens a crack to catch it and closes again. Fresh paper waits at the slot with its own clean deckle edge at the top.
- Asking a piece for a title isn't part of this. The first line is the title, as on a manuscript.
- Keyboard alternative: `Cmd+Return` performs a clean, quick tear with no confirmation. It's reversible from the drawer, so it doesn't need a dialog.

---

## 7. The drawer (library)

Pull the desk's front edge down (drag, or `Cmd+O`) and the drawer slides open with a wood-on-wood glide and a soft stop. The scene shifts up to look into it.

- Finished pieces lie inside as **loosely rolled strips**, most recent on top. Each shows its first line typed on the outside of the roll and the date stamped in small grey ink, as if by a date stamp.
- Longer pieces make visibly fatter rolls. You can see how much you've written without seeing a number.
- Tap a roll to unroll it onto the desk for reading. The unrolled strip scrolls with the same feed physics.
- **Continue writing:** feeds a piece back into the machine. The tear line stays visible as a seam, so the piece remembers it was finished once.
- **Replay:** see §9.
- **Throw away:** crumple. The roll crushes into a ball with the sound to match, and goes into a wastebasket at the drawer's corner. The wastebasket holds discarded pieces for 30 days, and you can fish one back out.
- Search: `Cmd+F` while the drawer is open, as a small typed index card. Plain text match, nothing smart.

No folders, tags, or sorting in v1. Chronological is enough until people show us otherwise.

---

## 8. The manual (the only "settings")

A small, stapled, slightly worn booklet with typeset pages. It opens with a page-turn and closes on tap-outside or Esc. Every page has a real heading and a short paragraph written in the voice of a 1960s equipment manual, a little dry and a little warm. Options are set with small inline controls drawn as printed check boxes, which get a pencil mark when you tick them.

Contents:

1. **On writing with this machine:** a short page explaining the ideas above in plain language. It's the only onboarding.
2. **Sound:** volume (mirrors the wheel), margin bell on/off, room (Study / Library / Attic, see §10).
3. **Light:** follow the sun / always day / always lamp.
4. **Typeface:** two options at most (§11).
5. **Your papers:** export all, show the folder on disk.
6. **Care:** reduce motion, sound off, larger type (raises paper scale, keeps line length).

Nothing else. If something new needs a preference, first ask whether it should be a physical control or not exist.

---

## 9. Replay: how a page remembers being written

**This is the anti-slop centerpiece, so it's worth building carefully.**

Every piece stores its keystroke log: each key, its timestamp, and its strike seed. From that, any piece in the drawer can **replay**. The paper resets to blank and retypes itself at the writer's real speed, with all the sounds, the pauses, the hesitations, the deletions, and the bell.

Why it matters: in a world of generated text, a replay is quiet proof that a person sat here and made this, one key at a time. It's also very moving to watch your own hesitation from last Tuesday.

- Speed control is a small lever: 1× / 4× / 16×. Long pauses (more than 5 s) are compressed to 2 s with a soft clock-tick so the replay doesn't stall.
- **v1:** replay inside the app only.
- **Later:** export a replay as a self-contained web page or video that someone else can watch. Design the log format now so this is possible later (§13).

Privacy: keystroke logs stay local and are deleted with their piece. Exporting text never includes the log unless the user explicitly exports a replay.

---

## 10. Sound design

Sound is half the product. Budget for it like a feature, not polish.

### Sources

- **Use real recordings, not synthesis.** Record real mechanisms close-miked in a quiet room at 96 kHz/24-bit, then edit down. Good sources: an IBM Selectric (strike and correctable-ribbon lift), an Olivetti Lettera (key travel, carriage), a vintage telex (paper feed ratchet), a brass desk bell, good paper (tearing at several speeds), a wooden drawer, a lamp pull-chain, a knurled radio knob (detents), Scotch tape.
- For prototyping, CC0 recordings from freesound.org are fine, but **they get replaced before launch.** The difference is audible.

### The sound of one keystroke

One keystroke is a short stack of layered samples, not a single sample:

| Layer | When | Notes |
|---|---|---|
| key-down | key press | soft plastic travel; varies by key class (letter / space / modifier) |
| strike | ~25 ms later, at glyph impact | the main sound. **Weight depends on the glyph**: `.` and `,` are light ticks, `W`, `M` and `@` are fuller. 3 weight classes × 8 round-robin variations minimum |
| platen | with strike | low felt *thup* under the strike, gives body |
| head step | ~15 ms after strike | tiny metallic ratchet as the head moves one character |
| key-up | key release | quieter and higher than key-down |

- **Space bar:** deeper key-down with a slight stabilizer rattle, no strike, just the head step.
- **Return:** key-down, then a feed ratchet (one detent per line), then the head's return slide, which is longer and pans right to left.
- **Never play the same sample twice in a row.** Use round-robin plus ±3% pitch and ±1.5 dB gain randomization on every layer.
- **Fast typing:** when the inter-key interval is under 80 ms, drop strike gain slightly and shorten tails so bursts sound like fluent typing, not a machine gun.

### Space

- **Stereo position follows the head.** The strike pans from left to right across the line (±35% width, not hard-panned). This one detail makes the machine feel physically present.
- **Rooms:** convolution reverb with real impulse responses. *Study* (default, small and dry), *Library* (larger, soft), *Attic* (wooden, a little boxy). The wet mix stays subtle, around 8–12%.
- **Room tone:** a near-silent bed of the chosen room at about −60 dBFS so the silence between keystrokes feels like a place, not digital zero. No rain, café, or fireplace. Those belong to a different app.

### The other sounds

Margin bell, ink/draft switch snap, correction lift (*tock-shhk*), feed knob detent ticks, odometer roll, tear (scrubbed with the gesture, multiple speed layers crossfaded), roll dropping into the drawer, drawer glide and stop, crumple, tape, page turn, lamp chain plus filament hum (very faint, lamp mode only).

### Hard requirements

- **Keystroke-to-sound latency under 10 ms**, measured. Preload all buffers, use AVAudioEngine with the smallest stable IO buffer, and never allocate on the audio thread.
- **Mix ceiling:** typing at a normal pace should sit at about −20 LUFS. It should be pleasant under headphones for an hour. The test is to actually write for an hour and check that nothing becomes irritating; the most frequent sounds are where fatigue comes from.
- Respect system mute and a muted output device. Sound must never surprise anyone in a quiet room.

---

## 11. Visual craft

### Rendering approach (recommended)

**2.5D: pre-rendered PBR layers, lit live.**

- Model the machine, desk, lamp base, and drawer in Blender with real materials. Render each moving part as its own layer (machine body, print head, feed knob in N rotation steps or as a rotatable cylinder texture, switch states, odometer digits, drawer) with **albedo + normal + roughness maps.**
- Composite in SwiftUI/Metal and light them in a shader using the two light rigs (§5). This gets photoreal materials, live lighting changes, and smooth 120 fps animation without a full 3D engine.
- Render the paper fully in Metal: fiber texture, subtle curl near the slot, contact shadow, and ink compositing.
- Why not real-time 3D (RealityKit/SceneKit)? The camera never moves, so a full 3D engine buys little and costs a lot in realism-per-hour. Revisit only if we want camera movement.

### Type

- Text is set with Core Text from a **monospace slab serif**, not a distressed "typewriter" font. The ink shader adds the physical character, so the base font should be clean. Prototype with **Courier Prime**. Before launch, consider commissioning or licensing a custom face drawn for this machine. Distinctive type is worth paying for here.
- An optional second face: a proportional book serif for people who want a "letterpress" feel. Line length and the machine's behavior stay the same.
- Clippings (§6.6) use a narrow newsprint serif.

### Motion rules

- **Mechanisms move mechanically:** high acceleration, firm stop, at most one small settle (≤2 px overshoot). No springy wobble, no ease-in-out fades on things that slide.
- **Paper moves like paper:** it has weight. It lags the feed by a frame or two at the curl and settles gently.
- **Light changes slowly** (600 ms, filament flicker on lamp-on).
- **No UI chrome animates in or out,** because there is no UI chrome.
- **Reduce Motion:** the print head teleports instead of sliding, the drawer cuts instead of gliding, and the tear completes instantly on threshold. Sounds still play.
- **Target 120 fps on ProMotion devices with no dropped frames while typing at 150 wpm.** Measure it with Instruments.

---

## 12. First run

No onboarding screens, no account, no permissions prompt.

1. The app opens on the desk in the right light for the time of day. **The machine is under a grey felt dust cover.** A small typed card sits on it: *Lift the cover.*
2. Drag the cover up (or press any key). It slides off with a soft felt sound and the machine is revealed. A fresh roll is already threaded, the head is at the left margin, and the counter reads 0000.
3. That's the whole introduction. The first keystroke tells you everything else. The manual is on the desk for the curious.

On later launches, the cover is gone. The machine is where you left it, the paper is scrolled to the print line, and the head sits at the exact column where you stopped. If you were mid-piece, it's still in the machine.

---

## 13. Data

- **Local-first.** Pieces live as files in the app's documents folder. iCloud Drive sync is a later addition; keep the format file-based so it's straightforward.
- One piece = one package (folder) or one file, implementer's choice, containing:
  - `text.md`: the plain text as it currently reads. Struck-through words in Ink mode become `~~word~~`, clippings become `> quote` blocks. Human-readable and portable on its own.
  - `strikes`: per-glyph render data (seed, density, ink mode). Compact binary or JSON.
  - `keylog`: append-only keystroke log for replay (timestamp in ms, key, action, seed). Version this format from day one.
  - `meta`: created, torn (finished) date, continued-from, discarded-at.
- Save continuously. There's no save button and no "unsaved changes" state. A crash loses at most the last second.
- **Export:** plain text / Markdown (always), and PDF rendered to look like the strip, torn edge included.

---

## 14. Scope

### v1: the machine, done perfectly

- [ ] Desk scene, day and lamp light, follow-the-sun
- [ ] Machine: keys → print head → strike → paper, with per-glyph imperfection
- [ ] Fixed line length, word wrap, return, holding return to feed
- [ ] Margin bell
- [ ] Ink / Draft switch with both backspace behaviors
- [ ] Feed knob scrolling with detents, inertia, trackpad haptics
- [ ] Paste as taped clipping
- [ ] Line counter, volume wheel
- [ ] The tear, gesture-driven and scrubbed
- [ ] Drawer: rolls, unroll to read, continue writing, crumple + wastebasket, search
- [ ] Manual (settings)
- [ ] Replay in-app
- [ ] Full sound design per §10, including latency and mix requirements
- [ ] First-run dust cover
- [ ] Local storage, Markdown + PDF export
- [ ] Accessibility: VoiceOver reads the paper as a text document and the controls as labeled controls; Reduce Motion; sound-off mode; larger type

### Later (only if people ask for it or use shows it's missing)

- iPhone, with Core Haptics and a custom on-screen keyboard with per-key haptic texture
- Bichrome ribbon: a lever for red ink, for marginal notes and emphasis
- Shareable replays (web page / video)
- iCloud sync
- A second desk or a second machine finish
- A daily prompt card under the machine: hand-written by a human, never generated, one per day, easy to ignore

### Never

AI writing features of any kind, social feeds, streaks, notifications, or an account wall.

---

## 15. How we'll know it feels right

Checklists don't capture feel, so these are the tests that matter:

1. **The one-hour test:** write for an hour with headphones on. Nothing gets irritating, and nothing breaks the illusion.
2. **The latency test:** measure keystroke-to-sound and keystroke-to-glyph. Sound under 10 ms after impact time, frames never dropped.
3. **The screenshot test:** show a still of the desk to someone who hasn't seen the app. Their first question should be "what is that machine?" and not "what app is this?"
4. **The tear test:** people tear slowly the first time, on purpose, to hear it.
5. **The replay test:** watch a replay of something you wrote last week. It should feel a bit personal.

---

## 16. Open questions for Farzin

1. **Platform** (§4): Mac + iPad for v1, iPhone later. Is that right?
2. **Business model:** free with a one-time unlock? Paid upfront? This affects nothing in v1's design, but we should decide before shipping.
3. **Custom typeface and real sound recordings** both cost money and time. Are we budgeting for them before launch? I think both are worth it, since they're most of what makes this feel real.
4. **Name:** *Deckle* is a working name. It's short, it means something, and the tear produces one.
