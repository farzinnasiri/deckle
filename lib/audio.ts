import type { Settings } from "./writing";
// The machine's voice. Every keystroke is a real recording of a Hermes
// Precisa 305 (see public/audio/SOURCES.md), chosen by the weight of the
// glyph, never repeated back to back, placed in stereo where the head is, and
// played through a small, dry study.

type Strike = { start: number; duration: number; tone: number };
type Bank = { buffer: AudioBuffer; strikes: Strike[] };
const FILES = [
  "space",
  "feed",
  "bell",
  "drawer",
  "tear",
  "tear-stretch",
  "tear-grains",
  "tear-release",
  "correction",
  "card",
  "tab",
  "stamp",
  "unroll",
  "crumple",
  "folder-slide",
  "ruling-switch",
] as const;
type File = (typeof FILES)[number];

// Glyph weight decides which strikes are eligible. Thin marks reach for the
// bright, light recordings; broad capitals for the dark, full ones.
const LIGHT = /[.,:;'`’‘"!|il1\-]/;
const HEAVY = /[WMQ@#&%BDGNOH08mw]/;
function toneFor(char: string) {
  if (LIGHT.test(char)) return [0.62, 1] as const;
  if (HEAVY.test(char)) return [0, 0.42] as const;
  return [0.18, 0.82] as const;
}
const COLUMNS = 60;
const panAt = (column: number) =>
  Math.max(-1, Math.min(1, (column / COLUMNS - 0.5) * 0.7));

class MachineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private bank: Bank | null = null;
  private buffers = new Map<File, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private recent: number[] = [];
  private lastStrike = 0;
  private lastVoice = 0;
  private lastTick = 0;
  private lastSlide = 0;
  private lastFolderSlide = -Infinity;
  private tearHead = 0;
  private wet: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private material = {
    gain: 1,
    tone: 6500,
    tear: 0.9,
    room: 0.12,
    thump: 1,
    desk: "cherry" as NonNullable<Settings["desk"]>,
  };
  volume = 0.35;
  muted = false;
  setMaterial(profile: typeof this.material) {
    this.material = profile;
    if (this.wet && this.ctx)
      this.wet.gain.setTargetAtTime(profile.room, this.ctx.currentTime, 0.06);
  }

  /** Creates the audio graph on the first user gesture and loads recordings. */
  async unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      // Overlapping strikes at speed must never clip or pump.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 6;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.09;
      // A gentle presence dip keeps hours of typing from getting tiring.
      const tame = ctx.createBiquadFilter();
      tame.type = "peaking";
      tame.frequency.value = 3200;
      tame.Q.value = 0.9;
      tame.gain.value = -2.5;
      const warmth = ctx.createBiquadFilter();
      warmth.type = "lowshelf";
      warmth.frequency.value = 180;
      warmth.gain.value = 2;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * 0.9;
      this.bus = ctx.createGain();
      const room = ctx.createConvolver();
      room.buffer = this.studyResponse(ctx);
      const wet = ctx.createGain();
      this.wet = wet;
      wet.gain.value = this.material.room;
      this.bus.connect(warmth);
      warmth.connect(tame);
      tame.connect(this.master);
      this.bus.connect(room);
      room.connect(wet);
      wet.connect(this.master);
      this.master.connect(limiter);
      limiter.connect(ctx.destination);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 32768;
      limiter.connect(this.analyser);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.loading ??= this.load();
    await this.loading;
  }

  private async load() {
    const ctx = this.ctx!;
    const fetchBuffer = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(url);
      return ctx.decodeAudioData(await response.arrayBuffer());
    };
    await Promise.all([
      (async () => {
        try {
          const [buffer, manifest] = await Promise.all([
            fetchBuffer("/audio/strikes.wav"),
            fetch("/audio/strikes.json").then((r) => r.json()),
          ]);
          this.bank = { buffer, strikes: manifest.strikes };
        } catch {
          /* Writing works when audio is unavailable. */
        }
      })(),
      ...FILES.map(async (name) => {
        try {
          const ext =
            name === "space" || name === "ruling-switch" ? "wav" : "mp3";
          this.buffers.set(name, await fetchBuffer(`/audio/${name}.${ext}`));
        } catch {
          /* Missing recordings stay silent. */
        }
      }),
    ]);
  }

  // A small furnished study: short, darkened early reflections, no tail
  // long enough to notice as reverb.
  private studyResponse(ctx: AudioContext) {
    const length = Math.round(ctx.sampleRate * 0.42);
    const response = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = response.getChannelData(channel);
      let seed = 9137 + channel * 7919,
        low = 0;
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = seed / 2147483648 - 1;
        low += (noise - low) * 0.22; // soft furnishings swallow the highs
        const t = i / ctx.sampleRate;
        const predelay = t < 0.007 ? 0 : 1;
        data[i] = low * Math.exp(-t / 0.075) * predelay * 0.9;
      }
      for (const [at, gain] of [
        [0.009, 0.5],
        [0.014, -0.34],
        [0.021, 0.26],
        [0.031, -0.18],
      ])
        data[Math.round((at + channel * 0.0013) * ctx.sampleRate)] += gain;
    }
    return response;
  }

  private get ready() {
    return (
      !!this.ctx &&
      !!this.bus &&
      this.volume > 0 &&
      !this.muted &&
      this.ctx.state === "running"
    );
  }

  setVolume(volume: number) {
    this.volume = volume;
    this.updateGain();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.updateGain();
  }

  private updateGain() {
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume * 0.9,
        this.ctx.currentTime,
        0.02,
      );
  }

  /** Whether a keystroke voice already sounded for the current key. */
  get voicedRecently() {
    return performance.now() - this.lastVoice < 90;
  }

  private voice(
    buffer: AudioBuffer,
    {
      offset = 0,
      duration = buffer.duration - offset,
      rate = 1,
      gain = 1,
      pan = 0,
      when = 0,
      lowpass = 0,
      highpass = 0,
      fade = 0.012,
      panTo,
    }: {
      offset?: number;
      duration?: number;
      rate?: number;
      gain?: number;
      pan?: number;
      when?: number;
      lowpass?: number;
      highpass?: number;
      fade?: number;
      panTo?: number;
    },
  ) {
    const ctx = this.ctx!;
    const start = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = ctx.createGain();
    const length = duration / rate;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.setValueAtTime(gain, start + Math.max(0, length - fade));
    amp.gain.linearRampToValueAtTime(0, start + length);
    let node: AudioNode = source;
    const filters: AudioNode[] = [];
    for (const [type, frequency] of [
      ["lowpass", lowpass],
      ["highpass", highpass],
    ] as const) {
      if (!frequency) continue;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      node.connect(filter);
      node = filter;
      filters.push(filter);
    }
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, start);
    if (panTo !== undefined)
      panner.pan.linearRampToValueAtTime(panTo, start + length * 0.85);
    node.connect(amp);
    amp.connect(panner);
    panner.connect(this.bus!);
    source.start(start, Math.max(0, offset), duration);
    source.onended = () => {
      source.disconnect();
      filters.forEach((f) => f.disconnect());
      amp.disconnect();
      panner.disconnect();
    };
  }

  // ---- Synthesised objects ------------------------------------------------
  // Paper, wood and the typewriter itself are recordings. Everything else on
  // the desk (a clock set down, a switch, a steel basket) is built from what
  // such things actually do when touched: a short noise transient where the
  // surfaces meet, then the object's own resonances ringing down.
  private noise: AudioBuffer | null = null;

  /** A burst of filtered noise: the instant two surfaces meet. */
  private burst({
    when = 0,
    dur = 0.005,
    band,
    lowpass = 0,
    highpass = 0,
    gain = 0.3,
    pan = 0,
  }: {
    when?: number;
    dur?: number;
    /** Centre frequency and Q of a band-pass. */
    band?: [number, number];
    lowpass?: number;
    highpass?: number;
    gain?: number;
    pan?: number;
  }) {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const chain: AudioNode[] = [];
    let node: AudioNode = source;
    const add = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      node.connect(f);
      node = f;
      chain.push(f);
    };
    if (band) add("bandpass", band[0], band[1]);
    if (lowpass) add("lowpass", lowpass);
    if (highpass) add("highpass", highpass);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    node.connect(amp);
    amp.connect(panner);
    panner.connect(this.bus!);
    source.start(t, Math.random() * 0.3, dur + 0.01);
    source.onended = () => {
      source.disconnect();
      chain.forEach((f) => f.disconnect());
      amp.disconnect();
      panner.disconnect();
    };
  }

  /** Two surfaces dragged across each other: noise whose band sweeps from
   * one frequency to another under a soft attack and release. */
  private slide({
    when = 0,
    dur = 0.2,
    from,
    to,
    q = 1.1,
    gain = 0.08,
    pan = 0,
  }: {
    when?: number;
    dur?: number;
    from: number;
    to: number;
    q?: number;
    gain?: number;
    pan?: number;
  }) {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = q;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    amp.gain.linearRampToValueAtTime(gain * 0.7, t + dur * 0.75);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(band);
    band.connect(amp);
    amp.connect(panner);
    panner.connect(this.bus!);
    source.start(t, Math.random() * 0.3);
    source.stop(t + dur + 0.02);
    source.onended = () => {
      source.disconnect();
      band.disconnect();
      amp.disconnect();
      panner.disconnect();
    };
  }

  /** One resonance of an object, struck: a sine that rings and dies away. */
  private ring({
    when = 0,
    f,
    to,
    decay,
    gain,
    pan = 0,
  }: {
    when?: number;
    f: number;
    /** Optional pitch the resonance settles to (a soft body sags in pitch). */
    to?: number;
    /** Seconds to fall 60 dB. */
    decay: number;
    gain: number;
    pan?: number;
  }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(f, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + decay * 0.5);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.0015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(amp);
    amp.connect(panner);
    panner.connect(this.bus!);
    osc.start(t);
    osc.stop(t + decay + 0.02);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
      panner.disconnect();
    };
  }

  /** Something set down on the wooden desk. `weight` 0–1 is how much it
   * weighs; `hard` 0–1 how hard its underside is (felt 0.2, plastic 0.6,
   * metal 0.9). Weight is the thud through the board, hardness the click. */
  private onDesk(weight: number, hard: number, pan = 0, when = 0) {
    const g = 0.3; // kept well under a keystroke's level
    this.burst({
      when,
      dur: 0.004 + 0.006 * (1 - hard),
      band: [900 + 2200 * hard, 0.8],
      gain: g * (0.1 + 0.55 * hard * (0.4 + weight)),
      pan,
    });
    // The board itself: a low, quickly damped body and two higher modes.
    this.ring({
      when,
      f: 170,
      to: 105,
      decay: 0.07 + 0.08 * weight,
      gain: g * (0.25 + 0.9 * weight),
      pan,
    });
    this.ring({
      when,
      f: 335,
      decay: 0.05 + 0.04 * weight,
      gain: g * (0.14 + 0.35 * weight),
      pan,
    });
    this.ring({
      when,
      f: 690,
      decay: 0.03,
      gain: g * (0.05 + 0.2 * hard * weight),
      pan,
    });
  }

  /** A small switch or latch: a hard click and the body of the part it hits. */
  private click({
    when = 0,
    f = 2900,
    body = 820,
    gain = 0.5,
    pan = 0,
  }: {
    when?: number;
    f?: number;
    body?: number;
    gain?: number;
    pan?: number;
  }) {
    this.burst({ when, dur: 0.004, band: [f, 4], gain: gain * 0.9, pan });
    this.ring({ when, f, decay: 0.014, gain: gain * 0.35, pan });
    this.ring({ when, f: body, decay: 0.035, gain: gain * 0.5, pan });
  }

  /** One key: travel, typebar hit and escapement, from a real recording. */
  strike(char: string, column: number, { soft = false, repeat = false } = {}) {
    if (!this.ready || !this.bank) return;
    const now = performance.now();
    const interval = now - this.lastStrike;
    this.lastStrike = now;
    this.lastVoice = now;
    const [low, high] = toneFor(char);
    const strikes = this.bank.strikes;
    let choices = strikes
      .map((s, i) => [s, i] as const)
      .filter(
        ([s, i]) => s.tone >= low && s.tone <= high && !this.recent.includes(i),
      );
    if (!choices.length) choices = strikes.map((s, i) => [s, i] as const);
    const [pick, index] = choices[Math.floor(Math.random() * choices.length)];
    this.recent = [index, ...this.recent].slice(0, 6);
    // Fluent bursts get lighter and shorter so they read as typing, not a
    // machine gun. A deliberate pause lands a touch fuller.
    const fast = interval < 85 || repeat;
    const deliberate = interval > 700;
    const weight = LIGHT.test(char) ? 0.74 : HEAVY.test(char) ? 1.08 : 1;
    const gain =
      weight *
      (fast ? 0.7 : deliberate ? 1.05 : 0.9) *
      (soft ? 0.55 : 1) *
      (0.9 + Math.random() * 0.12);
    this.voice(this.bank.buffer, {
      offset: pick.start,
      duration: fast ? pick.duration * 0.6 : pick.duration,
      rate: 0.975 + Math.random() * 0.05 + (soft ? 0.04 : 0),
      gain: gain * this.material.gain,
      lowpass: this.material.tone,
      pan: panAt(column),
      fade: fast ? 0.03 : 0.04,
    });
    // The platen's low body changes with the material beneath the machine.
    this.voice(this.bank.buffer, {
      offset: pick.start,
      duration: 0.09,
      gain: 0.1 * this.material.thump,
      lowpass: 240,
      pan: panAt(column),
      fade: 0.05,
    });
  }

  /** The space bar: a broad, hollow bar with no typebar behind it. */
  space(column: number) {
    const buffer = this.buffers.get("space");
    if (!this.ready) return;
    this.lastVoice = performance.now();
    this.lastStrike = this.lastVoice;
    if (!buffer) return this.strike(" ", column, { soft: true });
    this.voice(buffer, {
      rate: 0.96 + Math.random() * 0.06,
      gain: 0.95 + Math.random() * 0.1,
      pan: panAt(column) * 0.6,
    });
  }

  /** Return: the key, the line-space ratchet and the carriage sliding home. */
  carriageReturn(fromColumn: number, { auto = false } = {}) {
    const feed = this.buffers.get("feed");
    if (!this.ready) return;
    this.lastVoice = performance.now();
    if (!auto) this.strike("n", fromColumn, { soft: true });
    if (!feed) return;
    const travel = Math.min(1, fromColumn / COLUMNS);
    this.voice(feed, {
      when: auto ? 0 : 0.035,
      rate: 0.78 + Math.random() * 0.05,
      gain: 1.4 + travel * 0.9,
      pan: panAt(fromColumn),
      panTo: panAt(0),
      lowpass: 6500,
      fade: 0.05,
    });
  }

  /** A short rail glide, emitted only when the hand actually moves the carriage.
   * No looping source: releasing the capsule leaves at most a 65 ms tail. */
  carriageSlide(distance: number, column: number) {
    if (!this.ready || Math.abs(distance) < 0.5) return;
    const now = performance.now();
    if (now - this.lastSlide < 32) return;
    this.lastSlide = now;
    const speed = Math.min(1, Math.abs(distance) / 48);
    const pan = panAt(column);
    const feed = this.buffers.get("feed");
    if (feed)
      this.voice(feed, {
        offset: 0.075,
        duration: 0.065,
        rate: 0.75 + speed * 0.3,
        gain: 0.35 + speed * 0.55,
        pan,
        highpass: 400,
        lowpass: 4200,
        fade: 0.022,
      });
    this.burst({
      dur: 0.018 + speed * 0.025,
      band: [1500 + speed * 650, 0.7],
      gain: 0.055 + speed * 0.06,
      pan,
    });
  }

  /** One detent of the platen ratchet, as heard when rolling the paper. */
  tick(column = 30, lines = 1) {
    const feed = this.buffers.get("feed");
    if (!this.ready || !feed) return;
    const now = performance.now();
    if (now - this.lastTick < 34) return;
    this.lastTick = now;
    this.voice(feed, {
      offset: 0.02 + Math.random() * 0.2,
      duration: 0.045,
      rate: 0.9 + Math.random() * 0.08,
      gain: Math.min(1.6, 1.2 + lines * 0.08),
      pan: panAt(column) * 0.4,
      highpass: 900,
      fade: 0.02,
    });
  }

  /** A run of detents for a longer roll, spaced like a hand on the knob. */
  roll(lines: number, column = 30) {
    if (!this.ready) return;
    const count = Math.min(8, Math.abs(Math.round(lines)));
    for (let i = 0; i < count; i++)
      setTimeout(() => {
        this.lastTick = 0;
        this.tick(column, 1);
      }, i * 38);
  }

  /** Draft correction: the key, then the ribbon lifting the letter. */
  correction(column: number) {
    if (!this.ready) return;
    this.strike(",", column, { soft: true });
    const correction = this.buffers.get("correction");
    if (correction)
      this.voice(correction, {
        when: 0.03,
        rate: 0.9,
        gain: 0.45,
        pan: panAt(column),
        lowpass: 3800,
        fade: 0.04,
      });
  }

  /** Ink backspace: only the escapement stepping back. */
  backspace(column: number) {
    if (!this.ready) return;
    this.strike(".", column, { soft: true });
  }

  bell(column = 56) {
    const bell = this.buffers.get("bell");
    if (!this.ready || !bell) return;
    this.voice(bell, {
      when: 0.02,
      gain: 0.45,
      pan: panAt(column),
      rate: 1 + Math.random() * 0.01,
      fade: 0.4,
    });
  }

  /** A short metallic snap for toggles, levers and the pull cord. */
  snap(pan = 0, { pitch = 1.25, gain = 0.5 } = {}) {
    if (!this.ready || !this.bank) return;
    const bright = this.bank.strikes.filter((s) => s.tone > 0.7);
    const pick = bright[Math.floor(Math.random() * bright.length)];
    this.voice(this.bank.buffer, {
      offset: pick.start + 0.012,
      duration: 0.07,
      rate: pitch,
      gain,
      pan,
      highpass: 700,
      fade: 0.03,
    });
  }

  /** A machine key travelling onto its stop: a plastic keycap bottoming out,
   * voiced on pointer-down so it lands with the finger. */
  keyDown(pan = 0) {
    if (!this.ready) return;
    this.click({ f: 1700, body: 380, gain: 0.55, pan });
  }

  /** The archive opens: the tray is pulled out on its runners (the recorded
   * wooden drawer), with a knock as it reaches its stop and folders shifting
   * inside. An empty drawer has nothing to rustle and sounds hollower. */
  drawerOpen(empty = false) {
    if (!this.ready) return;
    const drawer = this.buffers.get("drawer");
    if (drawer)
      this.voice(drawer, {
        offset: 0,
        duration: 0.62,
        rate: 0.94,
        gain: 0.5,
        lowpass: 3400,
        fade: 0.2,
      });
    this.onDesk(empty ? 0.5 : 0.38, 0.25, 0, 0.5);
    if (empty) return;
    const folder = this.buffers.get("folder-slide");
    if (folder)
      this.voice(folder, {
        when: 0.46,
        rate: 0.9,
        gain: 0.16,
        fade: 0.1,
      });
  }

  /** ...and pushed home: the runners again, then the thud of wood on wood. */
  drawerClose() {
    if (!this.ready) return;
    const drawer = this.buffers.get("drawer");
    if (drawer)
      this.voice(drawer, {
        offset: 0.5,
        duration: 0.5,
        rate: 1.04,
        gain: 0.42,
        lowpass: 3000,
        fade: 0.16,
      });
    this.onDesk(0.5, 0.3, 0, 0.3);
  }

  /** A folder is chosen and its paper slides up out of it. */
  folderLift() {
    if (!this.ready) return;
    const card = this.buffers.get("card");
    if (card)
      this.voice(card, {
        offset: 0.03,
        duration: 0.45,
        rate: 1.08,
        gain: 0.24,
        lowpass: 5200,
        fade: 0.2,
      });
    this.slide({ dur: 0.22, from: 1200, to: 2800, gain: 0.05 });
  }

  /** The paper slid back into its folder, and the folder settling. */
  folderReturn() {
    if (!this.ready) return;
    const card = this.buffers.get("card");
    if (card)
      this.voice(card, {
        offset: 0.1,
        duration: 0.34,
        rate: 0.92,
        gain: 0.2,
        lowpass: 4200,
        fade: 0.16,
      });
    this.onDesk(0.14, 0.1, 0, 0.22);
  }

  /** Scissors through paper: two closing blades, each a bright metallic
   * click over a short tearing hiss of fibres. */
  scissors(pan = 0) {
    if (!this.ready) return;
    const grains = this.buffers.get("tear-grains");
    for (const [when, pitch] of [
      [0, 1],
      [0.13, 1.08],
    ] as const) {
      this.click({ when, f: 4200 * pitch, body: 1900, gain: 0.26, pan });
      this.ring({ when, f: 6100 * pitch, decay: 0.03, gain: 0.03, pan });
      if (grains)
        this.voice(grains, {
          when: when + 0.004,
          offset: Math.random() * Math.max(0.01, grains.duration - 0.12),
          duration: 0.07,
          rate: 1.25,
          gain: 0.2,
          highpass: 1500,
          pan,
          fade: 0.03,
        });
    }
  }

  /** A strip of tape pulled off and pressed down with a thumb. */
  tape(pan = 0) {
    if (!this.ready) return;
    const stretch = this.buffers.get("tear-stretch");
    if (stretch)
      this.voice(stretch, {
        offset: 0.05,
        duration: 0.16,
        rate: 1.6,
        gain: 0.16,
        highpass: 900,
        pan,
        fade: 0.06,
      });
    this.slide({
      when: 0.02,
      dur: 0.12,
      from: 2600,
      to: 4200,
      gain: 0.04,
      pan,
    });
    this.onDesk(0.12, 0.08, pan, 0.17);
  }

  /** The copy holder's spring clip closing on a new sheet. */
  clipSnap() {
    if (!this.ready) return;
    const pan = -0.5;
    this.click({ f: 2600, body: 700, gain: 0.32, pan });
    this.ring({ f: 3900, decay: 0.09, gain: 0.03, pan });
    this.click({ when: 0.045, f: 1700, body: 480, gain: 0.24, pan });
  }

  /** A pencil on the notes: a short dry scratch, far quieter than a key. */
  pencil() {
    if (!this.ready) return;
    this.burst({
      dur: 0.025 + Math.random() * 0.02,
      band: [3800 + Math.random() * 1400, 1.4],
      gain: 0.035,
      pan: -0.5,
    });
  }

  /** The notes drawer drawn along its runner while you pull it. */
  drawerRun(speed: number) {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastFolderSlide < 0.09) return;
    this.lastFolderSlide = now;
    this.slide({
      dur: 0.1,
      from: 900 + speed * 400,
      to: 1300 + speed * 600,
      gain: Math.min(0.05, 0.015 + speed * 0.02),
      pan: -0.6,
    });
  }

  /** Copying: a carbon sheet slipped behind the page, barely there. */
  carbon() {
    if (!this.ready) return;
    this.slide({ dur: 0.14, from: 1800, to: 900, gain: 0.03 });
  }

  /** The machine types a pasted fragment in for you: a quick, even run. */
  retype(text: string, column = 30) {
    if (!this.ready) return;
    const chars = Array.from(text)
      .filter((c) => c.trim())
      .slice(0, 14);
    chars.forEach((char, i) =>
      setTimeout(
        () =>
          this.strike(char, Math.min(60, column + i), { soft: i % 3 === 1 }),
        i * 34,
      ),
    );
  }

  /** The battery's brass plate: released with a relay click, drawn out on its
   * rails, then arriving on its stop. */
  meterOpen() {
    if (!this.ready) return;
    const pan = -0.55;
    this.click({ f: 2300, body: 620, gain: 0.34, pan });
    this.slide({ when: 0.03, dur: 0.2, from: 1300, to: 2500, gain: 0.07, pan });
    this.click({ when: 0.245, f: 1500, body: 460, gain: 0.28, pan });
    this.ring({ when: 0.245, f: 3100, decay: 0.05, gain: 0.04, pan });
  }

  /** ...and slid back home, a little quieter. */
  meterClose() {
    if (!this.ready) return;
    const pan = -0.55;
    this.slide({ dur: 0.16, from: 2400, to: 1200, gain: 0.05, pan });
    this.click({ when: 0.17, f: 1800, body: 520, gain: 0.22, pan });
  }

  /** The charge cells lighting one after another, each a faint, rising tick. */
  meterCharge(cells: number) {
    if (!this.ready) return;
    for (let cell = 0; cell < cells; cell++) {
      const when = 0.12 + cell * 0.065;
      this.burst({ when, dur: 0.004, band: [3600, 3], gain: 0.07, pan: -0.55 });
      this.ring({
        when,
        f: 1040 * 2 ** (cell / 12),
        decay: 0.06,
        gain: 0.035,
        pan: -0.55,
      });
    }
  }

  /** Mechanical counter drums turning to their figures. */
  counterRoll(ticks = 7) {
    if (!this.ready) return;
    // Drums start turning as the plate lands on its stop.
    let when = 0.26;
    for (let i = 0; i < ticks; i++) {
      this.burst({
        when,
        dur: 0.004,
        band: [3300 + (i % 2) * 500, 2.5],
        gain: 0.09,
        pan: -0.55,
      });
      when += 0.05 + 0.035 * (i / ticks);
    }
  }

  /** The settings inspector: a card drawn out from the desk's edge, then
   * laid down against it. Closing lifts it away with a lighter hand. */
  panel(open: boolean, pan = 0.45) {
    if (!this.ready) return;
    const card = this.buffers.get("card");
    if (card)
      this.voice(card, {
        offset: 0,
        duration: open ? 0.6 : 0.5,
        rate: open ? 0.74 : 0.86,
        gain: open ? 0.3 : 0.24,
        lowpass: open ? 3200 : 2800,
        pan,
        fade: 0.25,
      });
    this.slide({
      dur: 0.28,
      from: open ? 700 : 1500,
      to: open ? 1500 : 600,
      gain: 0.04,
      pan,
    });
    this.onDesk(open ? 0.42 : 0.26, 0.28, pan, open ? 0.3 : 0.24);
  }

  /** A crumpled ball dropping into the steel basket: a hollow ring from the
   * can, and the ball itself landing soft. */
  toss() {
    if (!this.ready) return;
    const pan = 0.6;
    this.burst({ dur: 0.006, band: [1100, 1.2], gain: 0.22, pan });
    this.ring({ f: 410, decay: 0.24, gain: 0.2, pan });
    this.ring({ f: 965, decay: 0.15, gain: 0.11, pan });
    this.ring({ f: 1720, decay: 0.08, gain: 0.06, pan });
    const crumple = this.buffers.get("crumple");
    if (crumple)
      this.voice(crumple, {
        offset: 0.1,
        duration: 0.18,
        rate: 1.05,
        gain: 0.12,
        lowpass: 2400,
        pan,
        fade: 0.1,
      });
  }

  /** The shredder: a low motor under recorded paper grains, chopped fast. */
  shred(seconds: number) {
    const grains = this.buffers.get("tear-grains");
    if (!this.ready || !grains) return;
    const ctx = this.ctx!;
    const start = ctx.currentTime;
    const motor = ctx.createOscillator();
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(92, start);
    motor.frequency.linearRampToValueAtTime(104, start + 0.25);
    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = 360;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, start);
    level.gain.linearRampToValueAtTime(0.1, start + 0.18);
    level.gain.setValueAtTime(0.1, start + seconds - 0.25);
    level.gain.linearRampToValueAtTime(0, start + seconds);
    motor.connect(body);
    body.connect(level);
    level.connect(this.bus!);
    motor.start(start);
    motor.stop(start + seconds + 0.05);
    motor.onended = () => {
      motor.disconnect();
      body.disconnect();
      level.disconnect();
    };
    const span = Math.max(0.01, grains.duration - 0.08);
    for (let at = 0.12; at < seconds - 0.2; at += 0.045 + Math.random() * 0.02)
      this.voice(grains, {
        when: at,
        offset: Math.random() * span,
        duration: 0.06,
        rate: 0.88 + Math.random() * 0.1,
        gain: 0.38 + Math.random() * 0.12,
        lowpass: 4200,
        fade: 0.025,
      });
  }

  /** Focus: nothing mechanical, just the room's air settling. */
  hush(entering: boolean) {
    if (!this.ready) return;
    this.burst({
      dur: 0.45,
      band: [entering ? 420 : 640, 0.6],
      gain: 0.15,
    });
  }

  /** Soft cloth or paper movement: the cover, the manual, a page. */
  rustle({ gain = 0.22, duration = 0.32, lowpass = 1800 } = {}) {
    const tear = this.buffers.get("tear");
    if (!this.ready || !tear) return;
    this.voice(tear, {
      offset: 0.3 + Math.random() * 0.3,
      duration,
      rate: 0.6,
      gain,
      lowpass,
      fade: duration * 0.6,
    });
  }

  drawer({ gain = 0.6 } = {}) {
    const drawer = this.buffers.get("drawer");
    if (!this.ready || !drawer) return;
    this.voice(drawer, { gain, rate: 0.98 + Math.random() * 0.04 });
  }

  /** A paper landing in the tray. */
  settle() {
    const drawer = this.buffers.get("drawer");
    if (!this.ready || !drawer) return;
    this.voice(drawer, {
      offset: 0.74,
      duration: 0.25,
      gain: 0.35,
      lowpass: 1400,
      fade: 0.12,
    });
  }

  /** The page-line selector's recorded switch snap and short spring tail. */
  async rulingSwitch() {
    await this.unlock();
    const buffer = this.buffers.get("ruling-switch");
    if (!this.ready || !buffer) return;
    this.voice(buffer, {
      gain: 0.48,
      rate: 0.985 + Math.random() * 0.03,
      pan: 0.32,
      fade: 0.025,
    });
  }

  physical(
    action:
      "stamp" | "card" | "tab" | "unroll" | "crumple" | "element" | "lever",
  ) {
    if (!this.ready) return;
    if (action === "element") {
      this.snap(-0.2, { pitch: 0.88, gain: 0.2 });
      setTimeout(() => this.tick(20, 1), 70);
      setTimeout(() => this.snap(-0.2, { pitch: 1.1, gain: 0.3 }), 140);
      return;
    }
    if (action === "lever") {
      this.click({ f: 2000, body: 600, gain: 0.4, pan: 0.2 });
      return;
    }
    const buffer = this.buffers.get(action);
    if (buffer)
      this.voice(buffer, {
        rate: 0.92,
        gain: action === "stamp" ? 0.32 : action === "crumple" ? 0.27 : 0.2,
        lowpass: 4200,
        fade: 0.05,
      });
  }
  /** One beat of the clock's movement, alternating tick and tock. */
  private tock = false;
  clockTick(style?: string) {
    if (!this.ready) return;
    const lo = (this.tock = !this.tock) ? 0.86 : 1;
    const pan = 0.35;
    if (style === "flip") {
      // A card falling onto the one below.
      this.burst({ dur: 0.02, band: [1500 * lo, 1.5], gain: 0.4, pan });
      this.ring({ f: 600 * lo, decay: 0.035, gain: 0.2, pan });
    } else if (style === "bauhaus") {
      this.burst({ dur: 0.004, band: [4200 * lo, 4], gain: 0.24, pan });
    } else if (style === "deco") {
      this.burst({ dur: 0.008, band: [1200 * lo, 1.5], gain: 0.2, pan });
      this.ring({ f: 520 * lo, decay: 0.035, gain: 0.14, pan });
    } else if (style === "chronometer") {
      this.burst({ dur: 0.007, band: [2400 * lo, 3], gain: 0.4, pan });
      this.ring({ f: 1500 * lo, decay: 0.035, gain: 0.18, pan });
      this.ring({ f: 3300 * lo, decay: 0.02, gain: 0.08, pan });
    } else if (style === "digital") {
      this.burst({ dur: 0.003, band: [5200, 6], gain: 0.16, pan });
    } else {
      this.burst({ dur: 0.006, band: [3200 * lo, 3], gain: 0.34, pan });
      this.ring({ f: 1800 * lo, decay: 0.012, gain: 0.1, pan });
    }
  }
  /** Lifted off the desk: a faint drag of its feet and a small knock. */
  clockLift() {
    if (!this.ready) return;
    this.burst({ dur: 0.08, band: [1100, 0.8], gain: 0.04, pan: 0.3 });
    this.onDesk(0.1, 0.3, 0.3, 0.05);
  }
  /** Feet make contact first; the desk and case settle with a short, dry knock. */
  clockPlace() {
    if (!this.ready) return;
    const wood =
      this.material.desk === "maple"
        ? "oak"
        : this.material.desk === "cherry" || this.material.desk === "rosewood"
          ? "walnut"
          : this.material.desk;
    const surface = {
      walnut: { tone: 820, body: 145, decay: 0.065, gain: 0.24, hardness: 0.6 },
      oak: { tone: 1350, body: 205, decay: 0.05, gain: 0.23, hardness: 0.75 },
      leather: {
        tone: 420,
        body: 115,
        decay: 0.035,
        gain: 0.16,
        hardness: 0.18,
      },
      linen: { tone: 650, body: 155, decay: 0.025, gain: 0.14, hardness: 0.12 },
      slate: { tone: 2700, body: 480, decay: 0.045, gain: 0.22, hardness: 1 },
    }[wood];
    const variation = 0.96 + Math.random() * 0.08;
    // Noise excites broad resonances instead of a pitched, bouncing sine tone.
    this.burst({
      dur: 0.018,
      lowpass: surface.tone * variation,
      highpass: 70,
      gain: surface.gain,
      pan: 0.3,
    });
    this.burst({
      dur: surface.decay,
      band: [surface.body * variation, 0.8],
      gain: surface.gain * 0.8,
      pan: 0.3,
    });
    this.burst({
      when: 0.009,
      dur: 0.007,
      band: [surface.tone * 1.7, 1],
      gain: 0.09 * surface.hardness,
      pan: 0.3,
    });
    this.burst({
      when: 0.026,
      dur: 0.012,
      lowpass: surface.tone,
      gain: surface.gain * 0.16,
      pan: 0.3,
    });
  }
  /** The clock's own button. */
  clockButton(active = true) {
    if (!this.ready) return;
    this.click({ f: active ? 3000 : 2400, body: 700, gain: 0.4, pan: 0.35 });
  }
  /** A stiff folder rubbing against its neighbours in the drawer. */
  folderSlide() {
    if (!this.ready) return;
    const folder = this.buffers.get("folder-slide");
    if (!folder) return;
    const now = this.ctx!.currentTime;
    // Fast scrolling should sound like movement, without piling up voices.
    if (now - this.lastFolderSlide < 0.12) return;
    this.lastFolderSlide = now;
    this.voice(folder, {
      rate: 0.96 + Math.random() * 0.08,
      gain: 0.24,
      fade: 0.055,
    });
  }
  /** A loose sheet sliding into or out of its folder. */
  paperShuffle() {
    if (!this.ready) return;
    const card = this.buffers.get("card") || this.buffers.get("unroll");
    if (card) {
      this.voice(card, {
        rate: 0.95 + Math.random() * 0.2,
        gain: 0.22,
        fade: 0.06,
      });
    }
  }
  /** Choosing something in a menu: one small, light click. */
  pick() {
    if (!this.ready) return;
    this.click({ f: 2300, body: 640, gain: 0.2 });
  }
  /** A bakelite toggle flicked: the lever, then the stop it hits. */
  wallSwitch(on = true) {
    if (!this.ready) return;
    this.click({ f: on ? 2700 : 2300, body: 900, gain: 0.55, pan: -0.55 });
    this.click({ when: 0.03, f: 1800, body: 500, gain: 0.35, pan: -0.55 });
  }
  /** A rotary dimmer: a fine detent per step, a harder click at off. */
  dimmerTick(intensity = 0.5, isSwitch = false) {
    if (!this.ready) return;
    if (isSwitch) {
      this.click({ f: 2600, body: 800, gain: 0.45, pan: 0.6 });
      this.click({ when: 0.02, f: 3600, body: 1400, gain: 0.2, pan: 0.6 });
    } else {
      const level = Math.min(1, Math.max(0, intensity));
      this.click({ f: 3300 + level * 800, body: 1500, gain: 0.22, pan: 0.6 });
    }
  }
  /** The lamp's ball chain: the pull, and the switch letting go. */
  cordPull() {
    if (!this.ready) return;
    this.click({ f: 3600, body: 1200, gain: 0.4, pan: 0.6 });
    this.click({ when: 0.07, f: 3000, body: 900, gain: 0.3, pan: 0.6 });
  }
  /** Separate recorded stretch, propagation and release voices. */
  beginTear() {
    this.tearHead = 0;
    const stretch = this.buffers.get("tear-stretch");
    if (this.ready && stretch)
      this.voice(stretch, { rate: 0.8, gain: 0.22, lowpass: 4000 });
  }
  tearTo(progress: number, speed: number) {
    const tear = this.buffers.get("tear-grains");
    if (!this.ready || !tear || progress - this.tearHead < 1 / 24) return;
    const offset =
      (Math.floor(progress * 24) * 0.137) %
      Math.max(0.01, tear.duration - 0.15);
    this.voice(tear, {
      offset,
      duration: 0.1,
      gain: Math.min(0.23, 0.12 + speed * 0.04) * this.material.gain,
      rate: Math.min(
        0.95,
        Math.max(0.8, this.material.tear - 0.08 + Math.min(0.13, speed * 0.07)),
      ),
      lowpass: 4600,
      pan: (progress - 0.5) * 0.8,
      fade: 0.045,
    });
    this.tearHead = progress;
  }
  finishTear() {
    const tear = this.buffers.get("tear-release");
    if (this.ready && tear)
      this.voice(tear, {
        rate: 0.88,
        gain: 0.25,
        lowpass: 4200,
        pan: 0.3,
        fade: 0.12,
      });
    this.tearHead = 0;
  }
  /** Development measurement: tap the output, including room and limiter. */
  async measure(voice: string) {
    await this.unlock();
    const analyser = this.analyser!;
    const samples = new Float32Array(analyser.fftSize);
    // Allow the preceding voice and analyser window to drain.
    await new Promise((resolve) => setTimeout(resolve, 850));
    let peak = 0;
    const started = performance.now();
    const capture = new Promise<number>((resolve) => {
      const sample = () => {
        analyser.getFloatTimeDomainData(samples);
        for (const n of samples) peak = Math.max(peak, Math.abs(n));
        if (performance.now() - started < 1800) requestAnimationFrame(sample);
        else resolve(peak);
      };
      sample();
    });
    if (voice === "strike") this.strike("W", 30);
    else if (voice === "carriageSlide") this.carriageSlide(36, 30);
    else if (voice === "correction") this.correction(30);
    else if (voice === "tear") {
      this.beginTear();
      for (let i = 1; i <= 24; i++)
        setTimeout(() => this.tearTo(i / 24, 1), i * 30);
      setTimeout(() => this.finishTear(), 750);
    } else if (voice === "drawer") this.drawer();
    else if (voice === "drawerOpen") this.drawerOpen();
    else if (voice === "drawerClose") this.drawerClose();
    else if (voice === "folderSlide") this.folderSlide();
    else if (voice === "folderLift") this.folderLift();
    else if (voice === "folderReturn") this.folderReturn();
    else if (voice === "meterOpen") this.meterOpen();
    else if (voice === "scissors") this.scissors();
    else if (voice === "tape") this.tape();
    else if (voice === "carbon") this.carbon();
    else if (voice === "meterClose") this.meterClose();
    else if (voice === "panelOpen") this.panel(true);
    else if (voice === "panelClose") this.panel(false);
    else if (voice === "rulingSwitch") await this.rulingSwitch();
    else if (voice === "keyDown") this.keyDown();
    else if (voice === "toss") this.toss();
    else if (voice === "clockPlace") this.clockPlace();
    else if (voice === "clockLift") this.clockLift();
    else if (voice === "clockTick") this.clockTick();
    else if (voice === "wallSwitch") this.wallSwitch();
    else if (voice === "dimmerTick") this.dimmerTick(0.5);
    else if (voice === "cordPull") this.cordPull();
    else if (voice === "shred") this.shred(1.4);
    else if (voice === "bell") this.bell();
    else if (
      [
        "stamp",
        "card",
        "tab",
        "unroll",
        "crumple",
        "element",
        "lever",
      ].includes(voice)
    )
      this.physical(voice as "stamp");
    return { voice, peak: await capture, volume: this.volume };
  }
}
export const machineAudio = new MachineAudio();
if (typeof window !== "undefined" && process.env.NODE_ENV === "development")
  Object.assign(window, { __deckleAudio: machineAudio });
