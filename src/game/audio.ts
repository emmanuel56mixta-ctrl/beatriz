import { BPM, type Arrangement, type MixState, type PieceId, type Production, type VisualClock } from "./types";
import {
  arrangementFor,
  chordOffset,
  composePhrase,
  hookNote,
  layersOn,
  phraseAge,
  type Composition,
} from "./composer";
import { biasFromBoard, decayDna, emptyDna, nudgeDna, scanAccents, type Dna } from "./dna";

const KIT = [
  "kick",
  "clap",
  "hat",
  "ohat",
  "shaker",
  "perc",
  "snare",
  "crash",
  "impact",
  "bass",
  "stab",
  "voxA",
  "voxB",
  "sweep",
] as const;

type SampleName = (typeof KIT)[number];

function midiHz(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function makeNoise(ctx: AudioContext, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: AudioContext, seconds = 1.35, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function driveCurve(amount: number) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return c;
}

export class HouseEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private kickBus!: GainNode;
  private kickFilter!: BiquadFilterNode;
  private drumBus!: GainNode;
  private bassBus!: GainNode;
  private musicBus!: GainNode;
  private fxBus!: GainNode;
  private sidechain!: GainNode;
  private reverbIn!: GainNode;
  private delay!: DelayNode;
  private delayFb!: GainNode;
  private analyser!: AnalyserNode;
  private noise!: AudioBuffer;
  private samples: Partial<Record<SampleName, AudioBuffer>> = {};
  private wave = new Uint8Array(256);

  bpm = BPM;
  step = 0;
  bar = 0;
  arrangement: Arrangement = "intro";
  energy = 0.18;
  muted = false;
  volume = 0.72;
  running = false;
  paused = false;
  dna: Dna = emptyDna();
  composition: Composition | null = null;
  mix: MixState | null = null;
  onStep: ((step: number, time: number) => void) | null = null;

  private nextNote = 0;
  private timer: number | null = null;
  private lastKick = 0;
  private dropUntil = -1;
  private kickDownUntil = -1;
  private pendingRemix = false;
  private pendingDrop = false;
  private remixReason = "AUTO";
  private nextPhraseBar = 2;
  private room = 0.2;
  private delayAmt = 0.16;
  private visFilter = 0.7;
  private visGain = 0.7;

  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C({ latencyHint: "interactive" });
      this.buildGraph();
      void this.loadSamples();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    document.addEventListener("visibilitychange", this.onVis);
  }

  private onVis = () => {
    if (!this.ctx) return;
    if (document.visibilityState === "visible" && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  };

  private buildGraph() {
    const ctx = this.ctx!;
    this.noise = makeNoise(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * this.volume;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 16000;
    this.filter.Q.value = 0.2;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 28;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.42;

    this.master.connect(this.filter);
    this.filter.connect(hp);
    hp.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.kickFilter = ctx.createBiquadFilter();
    this.kickFilter.type = "lowpass";
    this.kickFilter.frequency.value = 18000;
    this.kickBus = ctx.createGain();
    this.kickBus.gain.value = 1;
    this.kickBus.connect(this.kickFilter);
    this.kickFilter.connect(this.master);

    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 0.9;
    const drumDrive = ctx.createWaveShaper();
    drumDrive.curve = driveCurve(4.4);
    drumDrive.oversample = "2x";
    this.drumBus.connect(drumDrive).connect(this.master);

    this.sidechain = ctx.createGain();
    this.sidechain.gain.value = 1;
    this.bassBus = ctx.createGain();
    this.bassBus.gain.value = 0.92;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.7;
    const bassDrive = ctx.createWaveShaper();
    bassDrive.curve = driveCurve(2.8);
    bassDrive.oversample = "2x";
    this.bassBus.connect(bassDrive).connect(this.sidechain);
    this.musicBus.connect(this.sidechain);
    this.sidechain.connect(this.master);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = 0.7;
    this.fxBus.connect(this.master);

    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.2;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    this.reverbIn.connect(verb).connect(this.fxBus);

    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.18;
    this.delay.connect(this.delayFb).connect(this.delay);
    this.delay.connect(this.fxBus);
  }

  private async loadSamples() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      KIT.map(async (name) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}audio/house/${name}.wav`);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          this.samples[name] = await ctx.decodeAudioData(buf.slice(0));
        } catch {
          /* synth fallback */
        }
      }),
    );
  }

  setVolume(v: number) {
    this.volume = v;
    if (!this.master || !this.ctx) return;
    const g = this.muted ? 0.0001 : Math.max(0.0001, v * v);
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.04);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  start() {
    if (!this.ctx) return;
    this.running = true;
    this.paused = false;
    this.step = 0;
    this.bar = 0;
    this.arrangement = "intro";
    this.energy = 0.16;
    this.dna = emptyDna();
    this.composition = null;
    this.dropUntil = -1;
    this.kickDownUntil = -1;
    this.pendingRemix = false;
    this.pendingDrop = false;
    this.nextPhraseBar = 2;
    this.nextNote = this.ctx.currentTime + 0.07;
    this.filter.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.filter.frequency.setValueAtTime(12000, this.ctx.currentTime);
    this.kickFilter.frequency.setValueAtTime(18000, this.ctx.currentTime);
    this.setVolume(this.volume);
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.scheduler(), 20);
  }

  stop() {
    this.running = false;
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.ctx) return;
    this.paused = false;
    this.nextNote = this.ctx.currentTime + 0.04;
  }

  tapeStop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, t);
    this.filter.frequency.exponentialRampToValueAtTime(220, t + 1.2);
    this.master.gain.setTargetAtTime(0.0001, t, 0.32);
    window.setTimeout(() => this.stop(), 1400);
  }

  dispose() {
    this.stop();
    document.removeEventListener("visibilitychange", this.onVis);
    void this.ctx?.close();
    this.ctx = null;
  }

  setMix(mix: MixState) {
    this.mix = mix;
    this.energy = Math.max(this.energy * 0.995, 0.08);
  }

  nudge(piece: PieceId) {
    this.dna = nudgeDna(this.dna, piece, 0.17);
    this.energy = Math.min(1, this.energy + 0.04);
  }

  requestRemix() {
    this.pendingRemix = true;
    this.remixReason = "PLAYER";
    if (this.ctx) this.crash(this.ctx.currentTime + 0.02, 0.1);
  }

  requestDrop() {
    this.pendingDrop = true;
    this.pendingRemix = true;
    this.remixReason = "DROP";
    if (this.ctx) this.riser(this.ctx.currentTime + 0.02, (60 / this.bpm) * 4 * 1.6);
  }

  notifyLock(_piece: PieceId, onTheOne: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (onTheOne) {
      this.crash(t, 0.12);
      this.clap(t, 0.22);
      this.energy = Math.min(1, this.energy + 0.08);
    }
  }

  notifyClear(lines: number, combo: number, tspin: boolean, perfect: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.energy = Math.min(1, this.energy + 0.08 + lines * 0.05 + combo * 0.02);
    if (lines >= 4 || tspin || perfect) {
      this.crash(t, 0.16);
      this.snare(t, 0.12);
      const nextBar = this.bar + 1;
      this.kickDownUntil = Math.max(this.kickDownUntil, nextBar + 1);
    } else if (lines >= 2) {
      this.clap(t, 0.28);
    }
  }

  waveform(): Uint8Array {
    if (this.analyser) this.analyser.getByteTimeDomainData(this.wave);
    return this.wave;
  }

  production(): Production {
    return {
      gain: this.visGain,
      filter: this.visFilter,
      room: this.room,
      delay: this.delayAmt,
    };
  }

  visual(): VisualClock {
    const ctx = this.ctx;
    let frac = 0;
    if (ctx && this.running && !this.paused) {
      const dt = 60 / this.bpm / 4;
      frac = 1 - Math.max(0, Math.min(1, (this.nextNote - ctx.currentTime) / dt));
    }
    const now = ctx?.currentTime ?? 0;
    const age = now - this.lastKick;
    const kp = age < 0.28 ? Math.max(0, 1 - age / 0.28) : 0;
    const duck = age < 0.22 ? Math.max(0, 1 - age / 0.22) : 0;
    const phrase = this.composition
      ? `${this.composition.style} · ${this.composition.mood}`
      : "BEAT ONLY";
    return {
      step: this.step,
      frac,
      bpm: this.bpm,
      bar: Math.max(1, this.bar),
      beat: (this.step >> 2) + 1,
      arrangement: this.arrangement,
      energy: this.energy,
      kickPulse: kp,
      duck,
      dna: { ...this.dna },
      production: this.production(),
      phrase,
      mood: this.composition?.mood ?? "INTRO",
    };
  }

  private scheduler() {
    if (!this.ctx || !this.running || this.paused) return;
    while (this.nextNote < this.ctx.currentTime + 0.12) {
      this.tick(this.step, this.nextNote);
      this.nextNote += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.onBar();
    }
  }

  private onBar() {
    this.bar += 1;
    this.arrangement = arrangementFor(this.bar, this.composition, this.dropUntil, this.kickDownUntil);
    if (this.bar < 2) return;

    const atBoundary = !this.composition || this.bar >= this.nextPhraseBar;
    if (this.pendingDrop) {
      this.dropUntil = this.bar + 5;
      this.pendingDrop = false;
    }
    if (this.pendingRemix || atBoundary) {
      const reason = this.pendingRemix ? this.remixReason : "AUTO";
      this.dna = decayDna(biasFromBoard(this.dna, this.mix ?? {
        stackHeight: 0,
        counts: { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 },
        centroids: { I: null, O: null, T: null, S: null, Z: null, J: null, L: null },
        cells: [],
        falling: null,
        energy: this.energy,
      }));
      this.composition = composePhrase(this.dna, this.composition, this.bar, reason);
      this.nextPhraseBar = this.bar + this.composition.bars;
      this.pendingRemix = false;
      this.remixReason = "AUTO";
      if (this.bar > 2 && this.ctx) this.downlifter(this.ctx.currentTime + 0.02, 0.35);
    }
    this.arrangement = arrangementFor(this.bar, this.composition, this.dropUntil, this.kickDownUntil);
  }

  private tick(s: number, t: number) {
    const beat = s % 4 === 0;
    const offbeat = s % 4 === 2;
    const swing = this.composition?.swing ?? 0.012;

    if (beat) {
      this.kick(t, 0.94);
      this.duck(t);
    }
    if (s === 4 || s === 12) {
      const extra = 0.5 + this.dna.drive * 0.18;
      this.clap(t, extra);
    }
    if (offbeat) this.openHat(t, 0.11 + this.dna.space * 0.04);
    if ([3, 7, 11, 15].includes(s)) this.hat(t + (s % 2 ? swing : 0), 0.05 + this.dna.groove * 0.02);
    if (s % 2 === 1) this.shaker(t + swing, 0.02 + this.dna.groove * 0.015);

    this.shapeProduction(t);

    if (this.composition && this.bar >= 2) this.playComposer(s, t, swing);

    if (this.mix) {
      const accents = scanAccents(this.mix, s, this.bar, this.composition, this.arrangement);
      for (const a of accents) this.playAccent(a, t);
    }

    if (this.onStep) this.onStep(s, t);
  }

  private playComposer(s: number, t: number, swing: number) {
    const c = this.composition!;
    const age = phraseAge(c, this.bar);
    const layers = layersOn(age, this.dna, this.arrangement);
    const root = chordOffset(c, this.bar);

    if (layers.bass && c.bassRhythm.includes(s)) {
      const idx = c.bassRhythm.indexOf(s);
      let midi = 33 + root + c.bassContour[(idx + age) % c.bassContour.length]! + c.bassShift;
      while (midi > 52) midi -= 12;
      while (midi < 29) midi += 12;
      const amp = 0.12 + this.dna.bass * 0.08 + (layers.full ? 0.02 : 0);
      this.houseBass(t + (s % 2 ? swing * 0.25 : 0), midi, amp, s % 4 === 2);
    }

    if (layers.chord && c.chordRhythm.includes(s)) {
      if (c.chordDensity > 1 || s === c.chordRhythm[0] || layers.full) {
        this.houseStab(t, root, 0.09 + c.chordDensity * 0.02 + this.dna.harmony * 0.03, age);
      }
    }

    if (layers.hook && c.hookRhythm.includes(s)) {
      const hi = c.hookRhythm.indexOf(s);
      const allow = this.dna.hook > 0.2 || layers.full || (age >= 4 && hi === 0);
      if (allow) this.voxChop(t, hookNote(c, this.bar, hi), 0.05 + this.dna.hook * 0.04, age);
    }

    if (c.percOn && layers.perc && [3, 6, 11, 14].includes(s)) {
      this.conga(t + (s % 2 ? swing * 0.5 : 0), 0.04 + this.dna.perc * 0.03, s + c.id);
    }

    if (age === 7 && s === 15) {
      this.downlifter(t + 0.015, 0.36);
      if (this.energy > 0.5) this.snare(t, 0.1);
    }
    if (age === 6 && s === 0) this.crash(t, 0.1 + (this.energy > 0.65 ? 0.04 : 0));
  }

  private playAccent(a: ReturnType<typeof scanAccents>[number], t: number) {
    if (a.kind === "bass") this.houseBass(t, a.midi, a.amp, true);
    if (a.kind === "stab") this.houseStab(t, chordOffset(this.composition, this.bar), a.amp, this.bar);
    if (a.kind === "hook") this.voxChop(t, a.midi, a.amp, this.bar);
    if (a.kind === "hat") this.hat(t, a.amp, 0.9);
    if (a.kind === "perc") this.conga(t, a.amp, a.variant);
    if (a.kind === "fx") this.play("impact", t, a.amp, this.fxBus, 1.3);
    if (a.kind === "rim") this.play("perc", t, a.amp, this.drumBus, 1.55);
  }

  private shapeProduction(t: number) {
    const filtered = this.kickDownUntil > this.bar;
    const kickHz = filtered ? 420 : 18000;
    this.kickFilter.frequency.setTargetAtTime(kickHz, t, 0.08);
    this.kickBus.gain.setTargetAtTime(filtered ? 0.35 : 1, t, 0.08);

    const target =
      this.arrangement === "intro"
        ? 9000
        : this.arrangement === "build"
          ? 11000 + this.energy * 4000
          : this.arrangement === "drop"
            ? 17000
            : this.arrangement === "break"
              ? 7000
              : 13000 + this.energy * 4000;
    this.filter.frequency.setTargetAtTime(Math.min(19000, target), t, 0.1);
    this.visFilter = (target - 6000) / 13000;
    this.visGain = 0.45 + this.energy * 0.5;

    this.room = 0.16 + this.dna.space * 0.28;
    this.delayAmt = 0.12 + this.dna.space * 0.2;
    if (this.reverbIn) this.reverbIn.gain.setTargetAtTime(this.room, t, 0.12);
    if (this.delayFb) this.delayFb.gain.setTargetAtTime(this.delayAmt, t, 0.12);
  }

  private duck(t: number) {
    const g = this.sidechain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.42, t + 0.006);
    g.exponentialRampToValueAtTime(1, t + 0.16);
  }

  private play(name: SampleName, t: number, amp: number, bus: AudioNode, rate = 1, lp = 0) {
    const ctx = this.ctx;
    const buf = this.samples[name];
    if (!ctx || !buf || amp <= 0.0001) return false;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate;
    g.gain.value = amp;
    src.connect(g);
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      g.connect(f).connect(bus);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
        f.disconnect();
      };
    } else {
      g.connect(bus);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
      };
    }
    src.start(t);
    return true;
  }

  private kick(t: number, amp: number) {
    this.lastKick = t;
    if (this.play("kick", t, amp, this.kickBus)) return;
    this.synthKick(t, amp);
  }

  private clap(t: number, amp: number) {
    if (this.play("clap", t, amp, this.drumBus)) return;
    this.synthNoise(t, amp, 1800, 0.18, this.drumBus);
  }

  private hat(t: number, amp: number, _bright = 0.7) {
    if (this.play("hat", t, amp, this.drumBus, 0.98)) return;
    this.synthNoise(t, amp, 7000, 0.04, this.drumBus);
  }

  private openHat(t: number, amp: number) {
    if (this.play("ohat", t, amp, this.drumBus)) return;
    this.synthNoise(t, amp, 6200, 0.22, this.drumBus);
  }

  private shaker(t: number, amp: number) {
    if (this.play("shaker", t, amp, this.drumBus)) return;
    this.synthNoise(t, amp * 0.7, 8000, 0.05, this.drumBus);
  }

  private snare(t: number, amp: number) {
    if (this.play("snare", t, amp, this.drumBus)) return;
    this.synthNoise(t, amp, 2400, 0.12, this.drumBus);
  }

  private conga(t: number, amp: number, s = 0) {
    const rate = [0.86, 0.94, 1, 1.08][Math.abs(s) % 4]!;
    if (this.play("perc", t, amp, this.drumBus, rate)) return;
    this.synthNoise(t, amp, 900, 0.08, this.drumBus);
  }

  private crash(t: number, amp: number) {
    if (this.play("crash", t, amp, this.fxBus)) return;
    this.synthNoise(t, amp, 4000, 0.6, this.fxBus);
  }

  private houseBass(t: number, midi: number, amp: number, accent: boolean) {
    const rate = Math.pow(2, (midi - 33) / 12);
    if (this.play("bass", t, amp, this.bassBus, rate, accent ? 1900 : 1450)) return;
    this.synthBass(t, midi, amp);
  }

  private houseStab(t: number, rootOffset: number, amp: number, variant: number) {
    const rate = Math.pow(2, rootOffset / 12);
    if (this.play("stab", t, amp, this.musicBus, rate, variant % 2 ? 4700 : 3600)) {
      this.play("stab", t, amp * 0.18, this.reverbIn, rate, 4200);
      return;
    }
    this.synthStab(t, 57 + rootOffset, amp);
  }

  private voxChop(t: number, m: number, amp: number, variant: number) {
    const name: SampleName = (variant + this.bar) % 2 ? "voxB" : "voxA";
    const rate = Math.pow(2, (m - 69) / 12);
    if (this.play(name, t, amp, this.musicBus, rate, 4200)) {
      this.play(name, t, amp * 0.28, this.delay, rate, 3600);
      return;
    }
    this.synthStab(t, m, amp * 0.8);
  }

  private riser(t: number, d: number) {
    if (!this.ctx) return;
    d = Math.min(d, 8);
    if (this.play("sweep", t, 0.22, this.fxBus, 1)) return;
    const s = this.ctx.createBufferSource();
    const bp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    s.buffer = this.noise;
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(9800, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + d * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(bp).connect(g).connect(this.fxBus);
    s.start(t);
    s.stop(t + d + 0.05);
  }

  private downlifter(t: number, d: number) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    const bp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    s.buffer = this.noise;
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(8200, t);
    bp.frequency.exponentialRampToValueAtTime(520, t + d);
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(bp).connect(g).connect(this.fxBus);
    s.start(t);
    s.stop(t + d + 0.04);
  }

  private synthKick(t: number, amp: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.kickBus);
    o.start(t);
    o.stop(t + 0.36);
  }

  private synthNoise(t: number, amp: number, hp: number, dur: number, bus: AudioNode) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    s.buffer = this.noise;
    f.type = "highpass";
    f.frequency.value = hp;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  private synthBass(t: number, midi: number, amp: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = midiHz(midi);
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 0.18);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(f).connect(g).connect(this.bassBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private synthStab(t: number, midi: number, amp: number) {
    if (!this.ctx) return;
    for (const off of [0, 3, 7]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "square";
      o.frequency.value = midiHz(midi + off);
      g.gain.setValueAtTime(amp * 0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.24);
    }
  }
}
