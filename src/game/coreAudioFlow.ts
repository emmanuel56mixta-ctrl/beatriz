import { BPM, type MixState, type PieceId, type Production, type VisualClock } from "./types";

export type SkinStage = 0 | 1 | 2 | 3 | 4;
export type SectionVariant = "A" | "A′" | "B";
export type TensionState = "CALM" | "PRESSURE" | "BUILD" | "TENSE";
type LiftLevel = 0 | 1 | 2;
type PendingSkin = { stage: SkinStage; variant: SectionVariant; at: number };

type Harmony = { root: number; triad: [number, number, number] };

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const SKIN_NAMES = ["SKELETON", "HATS", "BASS", "OPEN", "FULL"] as const;
const LEVEL_FORM: SectionVariant[] = ["A", "A′", "B", "A′"];

// City Of Dreams is closest to G# minor in the source analysis. The entire
// synthetic instrument therefore stays in one learnable harmonic world:
// G#m -> E -> B -> F#. Player gestures use the current chord too.
const HARMONY: Harmony[] = [
  { root: 32, triad: [56, 59, 63] }, // G#m: G# B D#
  { root: 28, triad: [52, 56, 59] }, // E:   E G# B
  { root: 35, triad: [59, 63, 66] }, // B:   B D# F#
  { root: 30, triad: [54, 58, 61] }, // F#:  F# A# C#
];

function midiHz(n: number) { return 440 * Math.pow(2, (n - 69) / 12); }

/**
 * Beatris v0.20.2 — cumulative musical flow.
 *
 * Action -> gesture.
 * Board -> tension.
 * Clears/level -> persistent arrangement.
 * Clear quality -> cumulative MOMENTUM.
 *
 * Momentum accumulates as musical state, not simultaneous layers. Crossing
 * milestones earns finite breaths/lifts; the harmonic progression never changes
 * key, so excitement can grow without turning into mud.
 */
export class CoreAudio {
  ctx: AudioContext | null = null;
  onStep: ((step: number, time: number) => void) | null = null;

  private master: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private noise: AudioBuffer | null = null;

  private rewardVocal: AudioBuffer | null = null;
  private rewardSource: AudioBufferSourceNode | null = null;
  private chopSource: AudioBufferSourceNode | null = null;

  private scheduler: number | null = null;
  private nextStepTime = 0;
  private absStep = 0;
  private startAt = 0;
  private userVolume = 0.72;
  private muted = false;
  private running = false;
  private paused = false;

  skinStage: SkinStage = 0;
  sectionVariant: SectionVariant = "A";
  tensionState: TensionState = "CALM";
  stackHeight = 0;
  lineCount = 0;
  lastGesture = "READY";
  momentum = 0;

  private pendingSkin: PendingSkin | null = null;
  private milestones = { double: false, triple: false, tetris: false };
  private lastMomentumBucket = 0;
  private lastLevel = 1;

  // Board pressure: context only.
  private dangerLatched = false;
  private dangerBuildStartBar = 0;
  private releaseLaunchBar = -1;

  // Earned finite energy windows. They replace one another; they do not stack.
  private liftLevel: LiftLevel = 0;
  private liftStartBar = -1;
  private liftUntilBar = -1;
  private earnedBreathBar = -1;
  private earnedBreathFromStep = 16;
  private earnedLaunchBar = -1;

  // TETRIS reward: one bar of air -> ten vocal bars (~19.35 s at 124 BPM).
  private rewardBreakBar = -1;
  private rewardVocalStartBar = -1;
  private rewardVocalEndBar = -1;
  private rewardStartedBar = -1;

  get bpm() { return BPM; }
  get energy() { return clamp(this.stackHeight / 20); }
  get nextMomentumMilestone() { return (Math.floor(this.momentum / 4) + 1) * 4; }
  private get beatDuration() { return 60 / BPM; }
  private get stepDuration() { return this.beatDuration / 4; }
  private get barDuration() { return this.beatDuration * 4; }

  async unlock() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio no disponible");

    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.35;
    const bassBus = ctx.createGain();
    bassBus.gain.value = 1;
    bassBus.connect(master);
    master.connect(limiter).connect(analyser).connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.bassBus = bassBus;
    this.analyser = analyser;
    this.analyserData = new Uint8Array(analyser.frequencyBinCount);
    this.noise = this.makeNoiseBuffer(ctx);
    this.applyMaster();
    await ctx.resume();
    void this.loadRewardVocal();
  }

  private async loadRewardVocal() {
    const ctx = this.ctx;
    if (!ctx || this.rewardVocal) return;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/reward-vocal`, { cache: "force-cache" });
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      if (!this.ctx) return;
      this.rewardVocal = await this.ctx.decodeAudioData(bytes);
    } catch (error) {
      console.warn("Beatris vocal reward unavailable", error);
    }
  }

  start() {
    if (!this.ctx || this.running) return;
    this.running = true;
    this.paused = false;
    this.skinStage = 0;
    this.sectionVariant = "A";
    this.tensionState = "CALM";
    this.stackHeight = 0;
    this.lineCount = 0;
    this.lastGesture = "SKELETON";
    this.momentum = 0;
    this.lastMomentumBucket = 0;
    this.lastLevel = 1;
    this.pendingSkin = null;
    this.milestones = { double: false, triple: false, tetris: false };
    this.dangerLatched = false;
    this.dangerBuildStartBar = 0;
    this.releaseLaunchBar = -1;
    this.liftLevel = 0;
    this.liftStartBar = -1;
    this.liftUntilBar = -1;
    this.earnedBreathBar = -1;
    this.earnedBreathFromStep = 16;
    this.earnedLaunchBar = -1;
    this.rewardBreakBar = -1;
    this.rewardVocalStartBar = -1;
    this.rewardVocalEndBar = -1;
    this.rewardStartedBar = -1;
    this.stopRewardSource();
    this.stopChopSource();

    this.absStep = 0;
    this.startAt = this.ctx.currentTime + 0.08;
    this.nextStepTime = this.startAt;
    this.scheduler = window.setInterval(() => this.scheduleAhead(), 25);
    this.scheduleAhead();
  }

  stop() {
    if (this.scheduler != null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    this.running = false;
    this.stopRewardSource();
    this.stopChopSource();
  }

  pause() { this.paused = true; if (this.ctx) void this.ctx.suspend(); }
  resume() { this.paused = false; if (this.ctx) void this.ctx.resume(); }
  dispose() { this.stop(); void this.ctx?.close(); this.ctx = null; }
  setMuted(v: boolean) { this.muted = v; this.applyMaster(); }
  setVolume(v: number) { this.userVolume = clamp(v); this.applyMaster(); }

  private applyMaster() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0.0001 : this.userVolume, this.ctx.currentTime, 0.02);
  }

  private scheduleAhead() {
    const ctx = this.ctx;
    if (!ctx || !this.running || this.paused) return;
    const horizon = ctx.currentTime + 0.12;
    while (this.nextStepTime < horizon) {
      if (this.pendingSkin && this.nextStepTime >= this.pendingSkin.at) {
        this.skinStage = this.pendingSkin.stage;
        this.sectionVariant = this.pendingSkin.variant;
        this.pendingSkin = null;
      }
      this.scheduleStep(this.absStep, this.nextStepTime);
      this.absStep += 1;
      this.nextStepTime += this.stepDuration;
    }
  }

  private scheduleStep(absStep: number, time: number) {
    const step = absStep % 16;
    const bar = Math.floor(absStep / 16);
    const phraseBar = bar % 8;

    if (this.tensionState === "BUILD" && bar - this.dangerBuildStartBar >= 4) {
      this.tensionState = "TENSE";
      this.lastGesture = "DANGER LATCH · TENSE GROOVE";
    }
    if (this.liftLevel > 0 && bar >= this.liftUntilBar) this.liftLevel = 0;

    const rewardBreak = bar === this.rewardBreakBar;
    const rewardVocal = bar >= this.rewardVocalStartBar && bar < this.rewardVocalEndBar;
    const liftActive = this.liftLevel > 0 && bar >= this.liftStartBar && bar < this.liftUntilBar;
    const earnedBreath = bar === this.earnedBreathBar && step >= this.earnedBreathFromStep;

    if (rewardBreak) {
      if ([4, 8, 12].includes(step)) this.rim(time, 0.05, 1350 + step * 70);
      if (step >= 12) this.rim(time, 0.055 + (step - 12) * 0.022, 1800 + (step - 12) * 580);
      if (step === 15) this.sweepNoise(time, 0.18, 0.34);
      this.emitStep(step, time);
      return;
    }

    if (earnedBreath) {
      if (step === this.earnedBreathFromStep) this.rim(time, 0.07, 1700);
      if (step >= 13) this.rim(time, 0.06 + (step - 13) * 0.02, 2050 + (step - 13) * 500);
      if (step === 15) this.sweepNoise(time, 0.1, 0.22);
      this.emitStep(step, time);
      return;
    }

    // Every eight bars the instrument gets a one-beat turnaround. It does not
    // become richer without clears; it simply breathes like a House phrase.
    const autoTurnaround = this.skinStage >= 1 && bar > 0 && phraseBar === 7;
    const skipFourthKick = autoTurnaround && step === 12 && !rewardVocal;

    if (bar === this.rewardVocalStartBar && step === 0 && this.rewardStartedBar !== bar) {
      this.rewardStartedBar = bar;
      this.crash(time, 0.23, 0.5);
      this.kick(time, 1);
      this.chordLift(time + 0.015, 0.075, bar);
      this.startVocalReward(time);
      this.lastGesture = this.rewardVocal ? "TETRIS · VOCAL SPOTLIGHT" : "TETRIS · VOCAL REWARD LOADING";
    } else if (bar === this.earnedLaunchBar && step === 0) {
      this.crash(time, this.liftLevel === 2 ? 0.17 : 0.115, 0.34);
      this.kick(time, 0.93);
      this.chordLift(time + 0.012, this.liftLevel === 2 ? 0.065 : 0.045, bar);
      if (this.liftLevel === 2) this.vocalChop(time + this.beatDuration * 0.75, 0.23, bar);
    } else if (bar === this.releaseLaunchBar && step === 0) {
      this.crash(time, 0.14, 0.3);
      this.kick(time, 0.92);
      this.chordLift(time + 0.015, 0.06, bar);
      this.lastGesture = "RELEASE · PRESSURE DROPPED";
    } else if (phraseBar === 0 && bar > 0 && step === 0 && !rewardVocal) {
      this.crash(time, 0.05, 0.17);
      this.kick(time, 0.8);
    } else if (step % 4 === 0 && !skipFourthKick) {
      const amp = rewardVocal ? 0.86 : this.tensionState === "TENSE" ? 0.82 : 0.78;
      this.kick(time, amp);
    }

    if (step === 4 || step === 12) this.clap(time, rewardVocal ? 0.39 : 0.34);

    this.scheduleSkin(step, time, bar, phraseBar, liftActive, rewardVocal);
    this.scheduleTension(step, time, bar);
    this.scheduleBass(step, time, bar, phraseBar, liftActive, rewardVocal, autoTurnaround);

    // Quiet harmonic skin. All notes come from G# minor -> E -> B -> F#.
    if (this.skinStage >= 3 && !rewardVocal) {
      if ((phraseBar === 2 && step === 6) || (phraseBar === 6 && step === 14)) {
        this.chordLift(time, 0.027 + (this.skinStage - 3) * 0.008, bar);
      }
    }
    if (liftActive && this.liftLevel === 2 && (step === 6 || step === 14)) {
      this.chordLift(time, 0.038, bar);
    }

    if (autoTurnaround && step >= 13) {
      this.rim(time, 0.045 + (step - 13) * 0.018, 1800 + (step - 13) * 520);
      if (step === 15) this.sweepNoise(time, 0.055, 0.16);
    }

    this.emitStep(step, time);
  }

  private scheduleSkin(step: number, time: number, _bar: number, phraseBar: number, liftActive: boolean, rewardVocal: boolean) {
    const stage = this.skinStage;
    if (stage === 0) {
      if (phraseBar === 3 && step === 10) this.hat(time, 0.018, false);
      return;
    }

    if ([2, 6, 10, 14].includes(step)) {
      const open = stage >= 3 && (step === 6 || step === 14) && (phraseBar === 3 || phraseBar === 6 || liftActive);
      this.hat(time, rewardVocal ? 0.055 : stage >= 3 ? 0.074 : 0.052, open);
    }

    if (stage >= 2 && phraseBar === 2 && step === 7) this.ghost(time, 0.033);
    if (stage >= 3 && phraseBar === 4 && (step === 3 || step === 11)) this.ghost(time, 0.042);
    if (stage >= 3 && phraseBar === 6 && (step === 5 || step === 13)) this.rim(time, 0.036, 2700);

    if (stage >= 4) {
      const extras = this.sectionVariant === "B" ? [1, 5, 9, 13] : this.sectionVariant === "A′" ? [7, 15] : [15];
      if (extras.includes(step) && phraseBar % 2 === 1) this.hat(time, 0.025, false);
    }

    if (liftActive) {
      if ((step === 6 || step === 14) && stage < 3) this.hat(time, 0.072, true);
      if (this.liftLevel === 2 && (step === 3 || step === 11)) this.ghost(time, 0.052);
      if (this.liftLevel === 2 && step === 15) this.rim(time, 0.045, 3300);
    }

    if (phraseBar === 6 && stage >= 2 && step === 14) this.hat(time, 0.08, true);
  }

  private scheduleTension(step: number, time: number, bar: number) {
    if (this.tensionState === "PRESSURE") {
      if (step === 15) this.rim(time, 0.035, 3500);
      if (bar % 2 === 1 && step === 7) this.ghost(time, 0.03);
      return;
    }
    if (this.tensionState === "BUILD") {
      const buildBar = Math.max(0, bar - this.dangerBuildStartBar);
      if (step % 2 === 1 && step < 15) this.hat(time, 0.012 + buildBar * 0.009, false);
      if (buildBar >= 1 && (step === 5 || step === 13)) this.rim(time, 0.036 + buildBar * 0.009, 1900);
      if (buildBar === 3 && step >= 12) this.rim(time, 0.045 + (step - 12) * 0.018, 1700 + step * 80);
      return;
    }
    if (this.tensionState === "TENSE") {
      if (step === 7 || step === 15) this.ghost(time, 0.057);
      if (bar % 2 === 1 && step === 13) this.rim(time, 0.04, 2100);
    }
  }

  private scheduleBass(step: number, time: number, bar: number, phraseBar: number, liftActive: boolean, vocalActive: boolean, turnaround: boolean) {
    const chord = HARMONY[bar % HARMONY.length]!;
    const root = chord.root;
    const scale = vocalActive ? 0.76 : liftActive ? 1.06 : 1;
    const stage = this.skinStage;

    if (turnaround && step >= 12) return;

    if (stage <= 1) {
      if (step === 0 || step === 8) this.bass(time + 0.028, midiHz(root + (step === 8 ? 12 : 0)), (stage === 0 ? 0.13 : 0.145) * scale, 0.16);
      return;
    }

    const patterns: Record<SectionVariant, number[]> = {
      A: [0, 3, 6, 8, 11, 14],
      "A′": [0, 2, 6, 8, 10, 14],
      B: [0, 3, 6, 8, 11, 14, 15],
    };
    if (!patterns[this.sectionVariant].includes(step)) return;

    let interval = 0;
    if (step === 6 || step === 14) interval = 7;
    if (step === 11 || step === 10) interval = 12;
    if (step === 15) interval = phraseBar === 6 ? 10 : 7;
    this.bass(time + (step % 4 === 0 ? 0.03 : 0), midiHz(root + interval), (stage >= 4 ? 0.18 : 0.155) * scale, 0.14);
  }

  private harmonyForBar(bar: number) { return HARMONY[((bar % HARMONY.length) + HARMONY.length) % HARMONY.length]!; }

  private makeNoiseBuffer(ctx: AudioContext) {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 0x12345678;
    for (let i = 0; i < d.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      d[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return b;
  }

  private kick(t: number, amp: number) {
    const ctx = this.ctx; if (!ctx || !this.master) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(112, t); osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    g.gain.setValueAtTime(Math.max(0.0001, amp), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(this.master); osc.start(t); osc.stop(t + 0.23);
    const click = ctx.createOscillator(); const cg = ctx.createGain(); click.type = "triangle";
    click.frequency.setValueAtTime(1450, t); click.frequency.exponentialRampToValueAtTime(520, t + 0.025);
    cg.gain.setValueAtTime(0.06, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    click.connect(cg).connect(this.master); click.start(t); click.stop(t + 0.04); this.duckBass(t);
  }

  private clap(t: number, amp: number) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    for (const dt of [0, 0.013, 0.027]) { g.gain.setValueAtTime(amp, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.045); }
    src.connect(hp).connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t + 0.12);
  }

  private hat(t: number, amp: number, open: boolean) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = open ? 6200 : 7600;
    const g = ctx.createGain(); const dur = open ? 0.16 : 0.045;
    g.gain.setValueAtTime(Math.max(0.0001, amp), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.01);
  }

  private ghost(t: number, amp: number) { this.rim(t, amp, 3100); }

  private rim(t: number, amp = 0.12, freq = 2500) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 3.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.max(0.0001, amp), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t + 0.065);
  }

  private bass(t: number, hz: number, amp: number, dur: number) {
    const ctx = this.ctx; if (!ctx || !this.bassBus) return;
    const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = hz;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(this.bassBus); osc.start(t); osc.stop(t + dur + 0.02);
  }

  private duckBass(t: number) {
    const bus = this.bassBus; if (!bus) return;
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(Math.max(0.15, bus.gain.value), t);
    bus.gain.linearRampToValueAtTime(0.24, t + 0.004); bus.gain.exponentialRampToValueAtTime(1, t + 0.085);
  }

  private iGesture(t: number) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noise) return;
    this.duckBass(t);
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(1500, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 0.17); bp.Q.value = 1.5;
    const pan = ctx.createStereoPanner(); pan.pan.value = -0.28;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    src.connect(bp).connect(pan).connect(g).connect(this.master); src.start(t); src.stop(t + 0.2);
  }

  private tGesture(t: number, bar: number) {
    const ctx = this.ctx; if (!ctx || !this.master) return;
    const chord = this.harmonyForBar(bar);
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.25;
    const sum = ctx.createGain(); sum.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    sum.connect(lp).connect(pan).connect(env).connect(this.master);
    for (const note of chord.triad) { const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = midiHz(note); o.connect(sum); o.start(t); o.stop(t + 0.095); }
  }

  private chordLift(t: number, amp: number, bar: number) {
    const ctx = this.ctx; if (!ctx || !this.master) return;
    const chord = this.harmonyForBar(bar);
    const sum = ctx.createGain(); sum.gain.value = amp;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200; lp.Q.value = 0.35;
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 0.025); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    sum.connect(lp).connect(env).connect(this.master);
    for (const note of chord.triad) { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = midiHz(note + 12); o.connect(sum); o.start(t); o.stop(t + 0.58); }
  }

  private sweepNoise(t: number, amp: number, dur: number) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(7000, t); hp.frequency.exponentialRampToValueAtTime(1300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.02);
  }

  private crash(t: number, amp: number, dur: number) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200;
    const g = ctx.createGain(); g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g).connect(this.master); src.start(t); src.stop(t + dur + 0.02);
  }

  lock(piece: PieceId) {
    const ctx = this.ctx; if (!ctx || !this.running) return;
    const t = ctx.currentTime + 0.004;
    const bar = this.musicalPosition(t).bar;
    const velocity = 0.065 + Math.min(0.025, (this.stackHeight / 20) * 0.025);
    this.rim(t, velocity, 3400);
    if (piece === "I") { this.iGesture(t + 0.006); this.lastGesture = "I · SWEEP"; }
    else if (piece === "T") { this.tGesture(t + 0.006, bar); this.lastGesture = "T · HARMONIC STAB"; }
    else this.lastGesture = "LOCK · TICK";
  }

  hardDrop() {
    const ctx = this.ctx; if (!ctx || !this.running) return false;
    const pos = this.musicalPosition(ctx.currentTime);
    const beatInBar = pos.totalBeats % 4;
    const dist = Math.min(beatInBar, 4 - beatInBar);
    const onOne = dist * this.beatDuration <= 0.085;
    const t = ctx.currentTime + 0.002;
    if (onOne) { this.kick(t, 0.64); this.crash(t, 0.17, 0.29); this.chordLift(t + 0.012, 0.035, pos.bar); this.lastGesture = "HARD DROP · ON THE 1"; }
    else { this.rim(t, 0.17, 2200); this.lastGesture = "HARD DROP · OFF GRID"; }
    return onOne;
  }

  clear(lines: number, combo: number, totalLines: number) {
    const ctx = this.ctx; if (!ctx || !this.running || lines <= 0) return;
    const previousLines = this.lineCount;
    const previousLevel = Math.floor(previousLines / 10) + 1;
    this.lineCount = totalLines;
    const newLevel = Math.floor(totalLines / 10) + 1;

    if (lines >= 2) this.milestones.double = true;
    if (lines >= 3 || combo >= 2) this.milestones.triple = true;
    if (lines >= 4) this.milestones.tetris = true;

    const delta = lines === 1 ? 1 : lines === 2 ? 2.5 : lines === 3 ? 4 : 6;
    const comboBonus = Math.min(3, Math.max(0, combo)) * 0.5;
    const oldBucket = Math.floor(this.momentum / 4);
    this.momentum += delta + comboBonus;
    const newBucket = Math.floor(this.momentum / 4);

    const start = this.nextBeatTime(ctx.currentTime);
    let end = start + this.stepDuration;

    if (lines === 1) {
      this.rim(start, 0.14, 2900);
      this.lastGesture = `SINGLE · MOMENTUM ${this.momentum.toFixed(1)}`;
    } else if (lines === 2) {
      for (let i = 0; i < 4; i++) this.rim(start + i * this.stepDuration, 0.08 + i * 0.012, 900 + i * 170);
      end = start + this.beatDuration * 0.5;
      this.armLift(1, false);
      this.lastGesture = `DOUBLE · LIFT · MOMENTUM ${this.momentum.toFixed(1)}`;
    } else if (lines === 3) {
      for (let i = 0; i < 8; i++) if (i % 2 === 0 || i >= 5) this.rim(start + i * this.stepDuration, 0.075 + i * 0.009, 760 + i * 120);
      end = start + this.beatDuration;
      this.armLift(2, true);
      this.lastGesture = `TRIPLE · PEAK · MOMENTUM ${this.momentum.toFixed(1)}`;
    } else {
      this.crash(start, 0.2, 0.36);
      for (let i = 0; i < 12; i++) if (![3, 7].includes(i)) this.rim(start + i * this.stepDuration, 0.07 + i * 0.006, 650 + i * 105);
      this.crash(start + this.beatDuration * 0.75, 0.12, 0.22);
      end = start + this.beatDuration;
      this.armVocalReward();
      this.lastGesture = `TETRIS · AIR → VOCAL · MOMENTUM ${this.momentum.toFixed(1)}`;
    }

    // Crossing cumulative momentum buckets produces additional finite emotion.
    // We never add another permanent layer: higher buckets make the next lift
    // stronger/longer while staying inside the same G# minor harmony.
    if (lines < 4 && newBucket > oldBucket) {
      const strength: LiftLevel = newBucket % 3 === 1 ? 1 : 2;
      this.armLift(strength, strength === 2);
      this.lastMomentumBucket = newBucket;
    }

    if (newLevel > previousLevel) {
      this.lastLevel = newLevel;
      this.armLift(2, true);
    }

    this.pendingSkin = {
      stage: this.stageFor(totalLines),
      variant: this.variantFor(totalLines, this.milestones.tetris),
      at: end,
    };
  }

  private armLift(level: LiftLevel, useVocalChop: boolean) {
    const ctx = this.ctx; if (!ctx || level === 0) return;
    const currentBar = this.musicalPosition(ctx.currentTime).bar;
    if (currentBar >= this.rewardBreakBar && currentBar < this.rewardVocalEndBar) return;
    const breathBar = currentBar + 1;
    this.earnedBreathBar = breathBar;
    this.earnedBreathFromStep = level === 2 ? 8 : 12;
    this.earnedLaunchBar = breathBar + 1;
    this.liftLevel = Math.max(this.liftLevel, level) as LiftLevel;
    this.liftStartBar = this.earnedLaunchBar;
    this.liftUntilBar = this.liftStartBar + (level === 2 ? 4 : 2);
    if (useVocalChop) this.lastGesture = "MOMENTUM · VOCAL CHOP ARMED";
  }

  private armVocalReward() {
    const ctx = this.ctx; if (!ctx) return;
    const currentBar = this.musicalPosition(ctx.currentTime).bar;
    if (currentBar >= this.rewardBreakBar && currentBar < this.rewardVocalEndBar) return;
    this.rewardBreakBar = currentBar + 1;
    this.rewardVocalStartBar = this.rewardBreakBar + 1;
    this.rewardVocalEndBar = this.rewardVocalStartBar + 10;
    this.rewardStartedBar = -1;
  }

  private startVocalReward(time: number) {
    const ctx = this.ctx; const master = this.master; const buffer = this.rewardVocal;
    if (!ctx || !master || !buffer) { void this.loadRewardVocal(); return; }
    this.stopRewardSource(); this.stopChopSource();
    const sourceOffset = 48 * this.barDuration;
    const requested = 10 * this.barDuration;
    const duration = Math.min(requested, Math.max(0.2, buffer.duration - sourceOffset - 0.05));
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 110;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 13500;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, time); gain.gain.linearRampToValueAtTime(0.4, time + 0.08); gain.gain.setValueAtTime(0.4, time + Math.max(0.1, duration - 0.5)); gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(hp).connect(lp).connect(gain).connect(master); source.start(time, sourceOffset, duration);
    source.onended = () => { if (this.rewardSource === source) this.rewardSource = null; };
    this.rewardSource = source;
  }

  private vocalChop(time: number, amp: number, bar: number) {
    const ctx = this.ctx; const master = this.master; const buffer = this.rewardVocal;
    if (!ctx || !master || !buffer || this.rewardSource) return;
    this.stopChopSource();
    const offsets = [92, 104, 116, 128];
    const offset = Math.min(buffer.duration - 0.8, offsets[Math.abs(bar) % offsets.length]!);
    if (offset < 0) return;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 150;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, time); gain.gain.linearRampToValueAtTime(amp, time + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.62);
    source.connect(hp).connect(gain).connect(master); source.start(time, offset, 0.65);
    source.onended = () => { if (this.chopSource === source) this.chopSource = null; };
    this.chopSource = source;
  }

  private stopRewardSource() { if (!this.rewardSource) return; try { this.rewardSource.stop(); } catch {} this.rewardSource = null; }
  private stopChopSource() { if (!this.chopSource) return; try { this.chopSource.stop(); } catch {} this.chopSource = null; }

  private stageFor(lines: number): SkinStage {
    let stage: SkinStage = lines >= 10 ? 4 : lines >= 6 ? 3 : lines >= 3 ? 2 : lines >= 1 ? 1 : 0;
    if (this.milestones.double) stage = Math.max(stage, 2) as SkinStage;
    if (this.milestones.triple) stage = Math.max(stage, 3) as SkinStage;
    if (this.milestones.tetris) stage = 4;
    return stage;
  }

  private variantFor(lines: number, tetris: boolean): SectionVariant {
    if (tetris && lines < 10) return "B";
    const levelIndex = Math.floor(lines / 10);
    return LEVEL_FORM[levelIndex % LEVEL_FORM.length] ?? "A";
  }

  setBoardHeight(rows: number) {
    const ctx = this.ctx;
    this.stackHeight = rows;
    if (!ctx || !this.running) return;

    if (!this.dangerLatched && rows >= 14) {
      this.dangerLatched = true;
      this.tensionState = "BUILD";
      this.dangerBuildStartBar = this.musicalPosition(ctx.currentTime).bar;
      this.lastGesture = "DANGER · 4 BAR BUILD";
    } else if (this.dangerLatched && rows <= 10) {
      this.dangerLatched = false;
      this.tensionState = rows >= 8 ? "PRESSURE" : "CALM";
      this.releaseLaunchBar = this.musicalPosition(ctx.currentTime).bar + 1;
      this.lastGesture = "RELEASE ARMED";
    } else if (!this.dangerLatched) {
      this.tensionState = rows >= 8 ? "PRESSURE" : "CALM";
    }
  }

  setMix(mix: MixState) { this.setBoardHeight(mix.stackHeight); }

  private nextBeatTime(now: number) {
    const pos = this.musicalPosition(now);
    let target = Math.ceil(pos.totalBeats - 1e-5);
    let t = this.startAt + target * this.beatDuration;
    if (t < now + 0.015) { target += 1; t = this.startAt + target * this.beatDuration; }
    return t;
  }

  private musicalPosition(now: number) {
    const elapsed = Math.max(0, now - this.startAt);
    const totalBeats = elapsed / this.beatDuration;
    const totalSteps = totalBeats * 4;
    const step = Math.floor(totalSteps) % 16;
    const frac = totalSteps - Math.floor(totalSteps);
    const bar = Math.floor(totalBeats / 4);
    const beat = Math.floor(totalBeats % 4);
    return { totalBeats, step, frac, bar, beat };
  }

  visual(): VisualClock {
    const p = this.musicalPosition(this.ctx?.currentTime ?? this.startAt);
    const vocalActive = p.bar >= this.rewardVocalStartBar && p.bar < this.rewardVocalEndBar;
    const rewardBreak = p.bar === this.rewardBreakBar;
    const liftActive = this.liftLevel > 0 && p.bar >= this.liftStartBar && p.bar < this.liftUntilBar;
    const dna = {
      bass: clamp(this.skinStage / 4), harmony: clamp(this.momentum / 16), hook: vocalActive ? 1 : liftActive ? 0.45 : 0,
      groove: clamp(this.skinStage / 4), perc: clamp(Math.max(0, this.skinStage - 1) / 3), space: rewardBreak ? 1 : 0,
      drive: this.tensionState === "CALM" ? 0.15 : this.tensionState === "PRESSURE" ? 0.38 : 0.7,
    };
    const production: Production = { gain: this.userVolume, filter: 1, room: 0, delay: 0 };
    const arrangement = rewardBreak ? "break" : this.tensionState === "BUILD" ? "build" : vocalActive ? "drop" : "groove";
    const rewardLabel = rewardBreak ? " · AIR" : vocalActive ? " · VOCAL" : liftActive ? " · LIFT" : "";
    return {
      step: p.step, frac: p.frac, bpm: BPM, bar: p.bar + 1, beat: p.beat + 1, arrangement, energy: this.energy,
      kickPulse: p.step % 4 === 0 ? 1 - p.frac : 0, duck: p.step % 4 === 0 ? 1 - p.frac : 0,
      dna, production, phrase: `${this.sectionVariant} · ${SKIN_NAMES[this.skinStage]}${rewardLabel}`, mood: this.tensionState,
    };
  }

  waveform(): Uint8Array { if (!this.analyser || !this.analyserData) return new Uint8Array(); this.analyser.getByteTimeDomainData(this.analyserData); return this.analyserData; }
  notifyLock(piece: PieceId, _onTheOne: boolean) { this.lock(piece); }
  notifyClear(lines: number, combo: number, _tspin: boolean, _perfect: boolean) { this.clear(lines, combo, this.lineCount + lines); }
  nudge(_piece: PieceId) {}
  requestRemix() {}
  requestDrop() { if (this.ctx) { this.armLift(2, true); this.lastGesture = "POWER · PEAK ARMED"; } }

  tapeStop() {
    if (!this.ctx || !this.master) { this.stop(); return; }
    this.stopRewardSource(); this.stopChopSource();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); window.setTimeout(() => this.stop(), 500);
  }
}
