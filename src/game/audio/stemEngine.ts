import type { Arrangement, LayerGains, MusicClock, PowerKind } from "../types";
import { heightToLevel, MUSIC_LEVEL_NAMES } from "../types";
import { TRACKS, trackById, type StemRole, type Track } from "./library";

const ROLES: StemRole[] = ["drums", "bass", "other", "vocals"];
const gainKey: Record<StemRole, keyof LayerGains> = { drums: "drums", bass: "bass", other: "music", vocals: "vocals" };
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
type StemNodes = { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };
type Pending = { kind: PowerKind; label: string };

export class StemEngine {
  ctx: AudioContext | null = null;
  track: Track = TRACKS[0]!;
  onStep: ((step: number) => void) | null = null;
  musicLevel = 0;
  boardHeight = 0;
  arrangement: Arrangement = "intro";

  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private nodes = new Map<StemRole, StemNodes>();
  private timer: number | null = null;
  private started = false;
  private paused = false;
  private startAt = 0;
  private userVolume = 0.78;
  private muted = false;
  private pending: Pending | null = null;
  private boostUntil = 0;
  private dropUntil = 0;
  private flashUntil = 0;
  private breakUntil = 0;
  private initPromise: Promise<void> | null = null;
  private currentSourcePhrase = 0;
  private queuedSourcePhrase: number | null = null;
  private lastPhraseBoundary = -1; // stores the last game bar used for a section change

  async unlock() { if (this.initPromise) return this.initPromise; this.initPromise = this.init(); return this.initPromise; }

  private async init() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio no disponible");
    this.ctx = new Ctor({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 128;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
    this.master.connect(comp).connect(this.analyser).connect(this.ctx.destination);
    this.applyMaster();
    await this.ctx.resume();
  }

  async loadTrack(id: string) {
    await this.unlock();
    this.stop();
    this.track = trackById(id);
    this.buffers.clear();
    const ctx = this.ctx!;
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

  private phraseSeconds() { return 8 * 4 * 60 / this.track.bpm; }
  private sourceWindow(phraseIndex: number) {
    const start = this.track.beatOffset + phraseIndex * this.phraseSeconds();
    const end = Math.min(start + this.phraseSeconds(), this.track.duration - 0.03);
    return { start: Math.max(0, start), end: Math.max(start + 0.5, end) };
  }

  start() {
    if (!this.ctx || this.started) return;
    this.started = true; this.paused = false; this.musicLevel = 0; this.boardHeight = 0; this.arrangement = "intro";
    this.pending = null; this.boostUntil = 0; this.dropUntil = 0; this.flashUntil = 0; this.breakUntil = 0;
    this.currentSourcePhrase = this.track.phraseMap[0]; this.queuedSourcePhrase = null; this.lastPhraseBoundary = -1;
    const when = this.ctx.currentTime + 0.08;
    this.startAt = when;
    this.spinSegment(when, this.currentSourcePhrase, true);
    this.applyMix();
    this.timer = window.setInterval(() => this.tick(), 30);
  }

  private spinSegment(when: number, phraseIndex: number, initial = false) {
    const ctx = this.ctx!;
    const old = this.nodes;
    const next = new Map<StemRole, StemNodes>();
    const { start, end } = this.sourceWindow(phraseIndex);

    for (const role of ROLES) {
      const url = this.track.stems[role]; if (!url) continue;
      const buffer = this.buffers.get(url); if (!buffer) continue;
      const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.loopStart = start; source.loopEnd = Math.min(end, buffer.duration - 0.01);
      const gain = ctx.createGain(); gain.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 18000; filter.Q.value = 0.45;
      source.connect(gain).connect(filter).connect(this.master!);
      source.start(when, Math.min(start, Math.max(0, buffer.duration - 0.05)));
      next.set(role, { source, gain, filter });
    }

    this.nodes = next;
    this.currentSourcePhrase = phraseIndex;
    this.applyMix(when);

    if (!initial) {
      for (const node of old.values()) {
        node.gain.gain.cancelScheduledValues(when);
        node.gain.gain.setTargetAtTime(0.0001, when, 0.025);
        try { node.source.stop(when + 0.12); } catch {}
      }
    } else {
      for (const node of old.values()) { try { node.source.stop(); } catch {} }
    }
  }

  private stopNodes() { for (const n of this.nodes.values()) { try { n.source.stop(); } catch {} } this.nodes.clear(); }
  stop() { if (this.timer != null) clearInterval(this.timer); this.timer = null; this.stopNodes(); this.started = false; this.paused = false; }
  pause() { if (!this.ctx || !this.started || this.paused) return; this.paused = true; if (this.timer != null) clearInterval(this.timer); this.timer = null; void this.ctx.suspend(); }
  resume() { if (!this.ctx || !this.started || !this.paused) return; this.paused = false; void this.ctx.resume().then(() => { this.timer = window.setInterval(() => this.tick(), 30); }); }
  dispose() { this.stop(); void this.ctx?.close(); this.ctx = null; this.initPromise = null; this.buffers.clear(); }

  setVolume(v: number) { this.userVolume = clamp(v); this.applyMaster(); }
  setMuted(v: boolean) { this.muted = v; this.applyMaster(); }
  private applyMaster() { if (!this.ctx || !this.master) return; this.master.gain.setTargetAtTime(this.muted ? 0.0001 : this.userVolume ** 2, this.ctx.currentTime, 0.03); }

  setBoardHeight(rows: number) {
    this.boardHeight = clamp(rows / 20, 0, 1) * 100;
    const next = heightToLevel(this.boardHeight);
    if (next <= this.musicLevel) return;

    this.musicLevel = next;
    this.queuedSourcePhrase = this.track.phraseMap[next] ?? this.currentSourcePhrase;
    if (next >= 5) this.arrangement = "build";
    else if (next > 0) this.arrangement = "groove";
    if (next >= 6 && !this.pending) this.request("drop", true);
    this.applyMix();
  }

  request(kind: PowerKind, _auto = false) {
    if (!this.started) return false;
    const labels: Record<PowerKind,string> = { flash:"FLASH", filter:"FILTER", boost:"BOOST", switch:"SWITCH", drop:"DROP" };
    this.pending = { kind, label: `${labels[kind]} ARMED` };
    return true;
  }

  private tick() {
    if (!this.ctx || !this.started || this.paused) return;
    const p = this.position();
    this.onStep?.(p.step);

    // The source track is NOT allowed to progress on its own. It stays inside an
    // 8-bar phrase until the board raises the persistent music level. Once armed,
    // the new phrase starts on the next bar so gameplay feedback stays immediate.
    if (this.queuedSourcePhrase != null && p.step === 0 && p.frac < 0.34 && p.bar !== this.lastPhraseBoundary) {
      this.lastPhraseBoundary = p.bar;
      const nextPhrase = this.queuedSourcePhrase;
      this.queuedSourcePhrase = null;
      if (nextPhrase !== this.currentSourcePhrase) this.spinSegment(this.ctx.currentTime, nextPhrase);
    }

    if (this.pending && p.step === 0 && p.frac < 0.3) {
      const kind = this.pending.kind; this.pending = null; const now = this.ctx.currentTime;
      if (kind === "flash") this.flashUntil = now + 60 / this.track.bpm / 2;
      if (kind === "boost") this.boostUntil = now + 8 * 4 * 60 / this.track.bpm;
      if (kind === "filter") for (const n of this.nodes.values()) { n.filter.frequency.cancelScheduledValues(now); n.filter.frequency.setValueAtTime(700, now); n.filter.frequency.exponentialRampToValueAtTime(18000, now + 4*4*60/this.track.bpm); }
      if (kind === "switch") { this.arrangement = "break"; this.breakUntil = now + 4 * 4 * 60 / this.track.bpm; this.spinSegment(now, this.track.breakPhrase); }
      if (kind === "drop") { this.arrangement = "drop"; this.dropUntil = now + 8*4*60/this.track.bpm; this.spinSegment(now, this.track.dropPhrase); }
      this.applyMix();
    }

    if (this.arrangement === "drop" && this.ctx.currentTime > this.dropUntil) {
      this.arrangement = "groove";
      this.queuedSourcePhrase = this.track.phraseMap[this.musicLevel] ?? this.currentSourcePhrase;
      this.applyMix();
    }
    if (this.arrangement === "break" && this.ctx.currentTime > this.breakUntil) {
      this.arrangement = this.musicLevel >= 5 ? "build" : "groove";
      this.queuedSourcePhrase = this.track.phraseMap[this.musicLevel] ?? this.currentSourcePhrase;
      this.applyMix();
    }
    if (this.ctx.currentTime > this.flashUntil) this.applyMix();
  }

  private targetGains(): LayerGains {
    const level = this.musicLevel;
    const drop = this.arrangement === "drop";
    const brk = this.arrangement === "break";
    const boost = Boolean(this.ctx && this.ctx.currentTime < this.boostUntil);
    let g: LayerGains;

    if (brk) g = { drums: 0.08, bass: 0.06, music: 0.68, vocals: 0.52 };
    else if (drop) g = { drums: 1, bass: 0.96, music: 0.88, vocals: 0.68 };
    else if (level === 0) g = { drums: 0.62, bass: 0, music: 0, vocals: 0 };
    else if (level === 1) g = { drums: 0.70, bass: 0.56, music: 0, vocals: 0 };
    else if (level === 2) g = { drums: 0.80, bass: 0.66, music: 0.13, vocals: 0 };
    else if (level === 3) g = { drums: 0.87, bass: 0.73, music: 0.38, vocals: 0 };
    else if (level === 4) g = { drums: 0.92, bass: 0.78, music: 0.56, vocals: 0.22 };
    else g = { drums: 0.68, bass: 0.54, music: 0.72, vocals: 0.38 };

    if (!this.track.stems.bass && level >= 1 && this.track.stems.other) g.music = Math.max(g.music, 0.18);
    if (this.track.stemCount === 1 && this.track.stems.other) g.music = Math.max(g.music, 0.5);
    if (boost) { g.drums = Math.min(1, g.drums + 0.12); g.bass = Math.min(1, g.bass + 0.12); }
    return g;
  }

  private applyMix(at?: number) {
    if (!this.ctx) return;
    const g = this.targetGains(); const now = at ?? this.ctx.currentTime;
    for (const [role,n] of this.nodes) {
      let value = g[gainKey[role]];
      if (this.flashUntil > now) value *= 0.03;
      n.gain.gain.setTargetAtTime(Math.max(0.0001, value), now, 0.055);
      if (role === "drums" && this.musicLevel === 0) n.filter.frequency.setTargetAtTime(5200, now, 0.08);
      else n.filter.frequency.setTargetAtTime(18000, now, 0.08);
    }
  }

  private currentGains(): LayerGains { const out: LayerGains = { drums:0,bass:0,music:0,vocals:0 }; for (const [role,n] of this.nodes) out[gainKey[role]] = clamp(n.gain.gain.value); return out; }
  private position() { const ctx = this.ctx; const beatDur = 60 / this.track.bpm; const elapsed = ctx && this.started ? Math.max(0, ctx.currentTime - this.startAt) : 0; const totalBeats = elapsed / beatDur; const bar = Math.floor(totalBeats / 4); const beat = Math.floor(totalBeats % 4); const totalSteps = totalBeats * 4; const step = Math.floor(totalSteps % 16); const frac = totalSteps - Math.floor(totalSteps); return { bar, beat, step, frac, phraseBar: bar % 8, phrase: Math.floor(bar / 8) }; }
  get phraseLabel() { return `${MUSIC_LEVEL_NAMES[this.musicLevel] ?? "FOUNDATION"} · SOURCE PHRASE ${String(this.currentSourcePhrase + 1).padStart(2,"0")}`; }
  visual(): MusicClock { const p = this.position(); return { bpm:this.track.bpm, bar:p.bar+1, beat:p.beat+1, step:p.step, frac:p.frac, phraseBar:p.phraseBar, phrase:p.phrase, arrangement:this.arrangement, musicLevel:this.musicLevel, boardHeight:this.boardHeight, kickPulse:p.step % 4 === 0 ? 1-p.frac : 0, duck:p.step % 4 === 0 ? 1-p.frac : 0, layers:this.currentGains(), pending:this.pending, trackId:this.track.id, trackTitle:this.track.title }; }
  waveform(): number[] { if (!this.analyser || !this.analyserData) return []; this.analyser.getByteFrequencyData(this.analyserData); return Array.from(this.analyserData); }
  tapeStop() { if (!this.ctx || !this.master) return; const t=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(Math.max(0.0001,this.master.gain.value),t); this.master.gain.exponentialRampToValueAtTime(0.0001,t+0.6); setTimeout(()=>this.stop(),650); }
}
