import type { Arrangement, LayerGains, MusicClock, PowerKind } from "../types";
import { heightToLevel, MUSIC_LEVEL_NAMES } from "../types";
import { TRACKS, trackById, type SceneId, type StemRole, type Track } from "./library";

const ROLES: StemRole[] = ["drums", "bass", "vocals"];
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
type StemNode = { source: AudioBufferSourceNode; gain: GainNode };
type ClipGroup = { sceneId: SceneId; nodes: StemNode[]; endAt: number };
type Pending = { kind: PowerKind; label: string };
type SceneTransition = { sceneId: SceneId; when: number };

const SCENE_BY_LEVEL: SceneId[] = ["foundation", "tension", "drop"];

export class StemEngine {
  ctx: AudioContext | null = null;
  track: Track = TRACKS[0]!;
  onStep: ((step: number) => void) | null = null;
  musicLevel = 0;
  boardHeight = 0;
  arrangement: Arrangement = "intro";

  private master: GainNode | null = null;
  private sceneBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private groups: ClipGroup[] = [];
  private timer: number | null = null;
  private started = false;
  private paused = false;
  private startAt = 0;
  private userVolume = 0.70;
  private muted = false;
  private initPromise: Promise<void> | null = null;
  private currentScene: SceneId = "foundation";
  private transition: SceneTransition | null = null;
  private nextCycleAt = 0;
  private pending: Pending | null = null;

  async unlock() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.init();
    return this.initPromise;
  }

  private async init() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio no disponible");

    this.ctx = new Ctor({ latencyHint: "interactive" });
    this.sceneBus = this.ctx.createGain();
    this.master = this.ctx.createGain();

    // Peak limiter only. The previous -12 dB compressor was constantly working
    // and made mids/pumping more aggressive.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

    this.sceneBus.connect(this.master).connect(limiter).connect(this.analyser).connect(this.ctx.destination);
    this.sceneBus.gain.value = 1;
    this.applyMaster();
    await this.ctx.resume();
  }

  async loadTrack(id: string) {
    await this.unlock();
    this.stop();
    this.track = trackById(id);
    this.buffers.clear();
    const ctx = this.ctx!;

    // The A/B intentionally does NOT load OTHER. The external audit found the
    // persistent 258/522 Hz drone there, so this test isolates architecture first.
    for (const role of ROLES) {
      const url = this.track.stems[role];
      if (!url) continue;
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`No pude cargar ${role}: HTTP ${response.status}`);
      try {
        this.buffers.set(url, await ctx.decodeAudioData(await response.arrayBuffer()));
      } catch (error) {
        throw new Error(`No pude decodificar el stem ${role}`, { cause: error });
      }
    }
  }

  private clipSeconds() { return 8 * 4 * 60 / this.track.bpm; }
  private barSeconds() { return 4 * 60 / this.track.bpm; }
  private sceneOffset(sceneId: SceneId) {
    return this.track.beatOffset + this.track.scenes[sceneId].sourcePhrase * this.clipSeconds();
  }

  start() {
    if (!this.ctx || this.started) return;
    this.started = true;
    this.paused = false;
    this.musicLevel = 0;
    this.boardHeight = 0;
    this.arrangement = "intro";
    this.currentScene = "foundation";
    this.transition = null;
    this.pending = null;

    const when = this.ctx.currentTime + 0.14;
    this.startAt = when;
    this.scheduleClip("foundation", when, 0.035);
    this.nextCycleAt = when + this.clipSeconds();
    this.timer = window.setInterval(() => this.tick(), 20);
  }

  private scheduleClip(sceneId: SceneId, when: number, fadeIn = 0.025) {
    const ctx = this.ctx!;
    const bus = this.sceneBus!;
    const spec = this.track.scenes[sceneId];
    const offset = this.sceneOffset(sceneId);
    const requested = this.clipSeconds();
    const nodes: StemNode[] = [];
    let groupEnd = when + requested;

    for (const role of ROLES) {
      const target = spec.gains[role] ?? 0;
      const url = this.track.stems[role];
      if (!url || target <= 0) continue;
      const buffer = this.buffers.get(url);
      if (!buffer) continue;

      const available = Math.max(0, buffer.duration - offset - 0.03);
      const duration = Math.min(requested, available);
      if (duration < 0.5) continue;
      groupEnd = Math.min(groupEnd, when + duration);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      source.connect(gain).connect(bus);

      const end = when + duration;
      const fadeOut = Math.min(0.035, duration / 4);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(target, when + Math.min(fadeIn, duration / 4));
      gain.gain.setValueAtTime(target, Math.max(when + fadeIn, end - fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, end);

      source.start(when, offset, duration);
      try { source.stop(end + 0.01); } catch {}
      nodes.push({ source, gain });
    }

    this.groups.push({ sceneId, nodes, endAt: groupEnd + 0.02 });
  }

  private fadeOutExisting(when: number) {
    for (const group of this.groups) {
      if (group.endAt <= when) continue;
      for (const node of group.nodes) {
        node.gain.gain.cancelScheduledValues(when);
        node.gain.gain.setTargetAtTime(0.0001, when, 0.018);
        try { node.source.stop(when + 0.09); } catch {}
      }
      group.endAt = Math.min(group.endAt, when + 0.10);
    }
  }

  private stopNodes() {
    for (const group of this.groups) for (const node of group.nodes) {
      try { node.source.stop(); } catch {}
    }
    this.groups = [];
  }

  stop() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    this.stopNodes();
    this.started = false;
    this.paused = false;
    this.transition = null;
    this.pending = null;
  }

  pause() {
    if (!this.ctx || !this.started || this.paused) return;
    this.paused = true;
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    void this.ctx.suspend();
  }

  resume() {
    if (!this.ctx || !this.started || !this.paused) return;
    this.paused = false;
    void this.ctx.resume().then(() => { this.timer = window.setInterval(() => this.tick(), 20); });
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.initPromise = null;
    this.buffers.clear();
  }

  setVolume(v: number) { this.userVolume = clamp(v); this.applyMaster(); }
  setMuted(v: boolean) { this.muted = v; this.applyMaster(); }
  private applyMaster() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0.0001 : this.userVolume * 0.72;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.025);
  }

  private nextBarTime() {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now < this.startAt) return this.startAt;
    const bar = this.barSeconds();
    const elapsed = now - this.startAt;
    const nextBar = Math.floor(elapsed / bar) + 1;
    return this.startAt + nextBar * bar;
  }

  private requestScene(sceneId: SceneId, reason: string) {
    if (!this.ctx || !this.started) return false;
    if (sceneId === this.currentScene && !this.transition) return true;
    if (this.transition) return true;

    const when = this.nextBarTime();
    this.fadeOutExisting(when);
    this.scheduleClip(sceneId, when, 0.060);
    this.nextCycleAt = when + this.clipSeconds();
    this.transition = { sceneId, when };
    this.pending = { kind: sceneId === "drop" ? "drop" : "switch", label: `${reason} · NEXT BAR` };
    return true;
  }

  private clearPulse(amount: number) {
    if (!this.ctx || !this.sceneBus || !this.started) return;
    const now = this.ctx.currentTime;
    const low = amount >= 4 ? 0.22 : amount >= 2 ? 0.42 : 0.62;
    const g = this.sceneBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.2, g.value), now);
    g.linearRampToValueAtTime(low, now + 0.035);
    g.exponentialRampToValueAtTime(1, now + 0.24);
  }

  setBoardHeight(rows: number) {
    const previous = this.boardHeight;
    const nextPct = clamp(rows / 20, 0, 1) * 100;
    this.boardHeight = nextPct;

    // A clear that materially lowers the stack now has immediate audible feedback,
    // even when it does not cross a scene threshold.
    if (this.started && nextPct < previous - 3) this.clearPulse(previous - nextPct > 12 ? 4 : 1);

    const nextLevel = heightToLevel(nextPct);
    if (nextLevel === this.musicLevel) return;
    this.musicLevel = nextLevel;
    const scene = SCENE_BY_LEVEL[nextLevel] ?? "drop";
    this.requestScene(scene, `BOARD → ${MUSIC_LEVEL_NAMES[nextLevel] ?? scene.toUpperCase()}`);
  }

  request(kind: PowerKind) {
    if (!this.started) return false;
    if (kind === "drop") return this.requestScene("drop", "POWER DROP");
    if (kind === "boost") return this.requestScene("tension", "POWER TENSION");
    if (kind === "switch") return this.requestScene("foundation", "POWER RESET");
    // FILTER is deliberately no longer a 700 Hz low-pass: that isolated the
    // exact 517–565 Hz region called out by the audit. FLASH/FILTER are now
    // short rhythmic gates with no resonant tonal emphasis.
    this.clearPulse(kind === "filter" ? 2 : 1);
    return true;
  }

  private tick() {
    if (!this.ctx || !this.started || this.paused) return;
    const now = this.ctx.currentTime;
    const p = this.position();
    this.onStep?.(p.step);

    if (this.transition && now >= this.transition.when) {
      this.currentScene = this.transition.sceneId;
      this.arrangement = this.currentScene === "foundation" ? "intro" : this.currentScene === "tension" ? "build" : "drop";
      this.transition = null;
      this.pending = null;
    }

    // Repeat the currently selected scene as discrete finite clips. There is no
    // AudioBufferSourceNode.loop and therefore no raw loopStart/loopEnd click.
    if (!this.transition && now + 0.22 >= this.nextCycleAt) {
      this.scheduleClip(this.currentScene, this.nextCycleAt, 0.025);
      this.nextCycleAt += this.clipSeconds();
    }

    this.groups = this.groups.filter((g) => g.endAt > now - 0.5);
  }

  private sceneGains(): LayerGains {
    const spec = this.track.scenes[this.currentScene];
    return {
      drums: spec.gains.drums ?? 0,
      bass: spec.gains.bass ?? 0,
      music: 0,
      vocals: spec.gains.vocals ?? 0,
    };
  }

  private position() {
    const ctx = this.ctx;
    const beatDur = 60 / this.track.bpm;
    const elapsed = ctx && this.started ? Math.max(0, ctx.currentTime - this.startAt) : 0;
    const totalBeats = elapsed / beatDur;
    const bar = Math.floor(totalBeats / 4);
    const beat = Math.floor(totalBeats % 4);
    const totalSteps = totalBeats * 4;
    const step = Math.floor(totalSteps % 16);
    const frac = totalSteps - Math.floor(totalSteps);
    return { bar, beat, step, frac, phraseBar: bar % 8, phrase: Math.floor(bar / 8) };
  }

  get phraseLabel() {
    const spec = this.track.scenes[this.currentScene];
    const letter = this.currentScene === "foundation" ? "A" : this.currentScene === "tension" ? "B" : "C";
    return `${spec.label} · SCENE ${letter} · SOURCE PHRASE ${String(spec.sourcePhrase + 1).padStart(2, "0")}`;
  }

  visual(): MusicClock {
    const p = this.position();
    return {
      bpm: this.track.bpm,
      bar: p.bar + 1,
      beat: p.beat + 1,
      step: p.step,
      frac: p.frac,
      phraseBar: p.phraseBar,
      phrase: p.phrase,
      arrangement: this.arrangement,
      musicLevel: this.musicLevel,
      boardHeight: this.boardHeight,
      kickPulse: p.step % 4 === 0 ? 1 - p.frac : 0,
      duck: p.step % 4 === 0 ? 1 - p.frac : 0,
      layers: this.sceneGains(),
      pending: this.pending,
      trackId: this.track.id,
      trackTitle: this.track.title,
    };
  }

  waveform(): number[] {
    if (!this.analyser || !this.analyserData) return [];
    this.analyser.getByteFrequencyData(this.analyserData);
    return Array.from(this.analyserData);
  }

  tapeStop() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    setTimeout(() => this.stop(), 600);
  }
}
