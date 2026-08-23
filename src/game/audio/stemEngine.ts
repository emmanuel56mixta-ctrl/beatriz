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
  private initPromise: Promise<void> | null = null;

  async unlock() { if (this.initPromise) return this.initPromise; this.initPromise = this.init(); return this.initPromise; }
  private async init() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio no disponible");
    this.ctx = new Ctor({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 128; this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
    this.master.connect(comp).connect(this.analyser).connect(this.ctx.destination); this.applyMaster(); await this.ctx.resume();
  }
  async loadTrack(id: string) {
    await this.unlock(); this.stop(); this.track = trackById(id); const ctx = this.ctx!;
    for (const role of ROLES) { const url = this.track.stems[role]; if (!url || this.buffers.has(url)) continue; try { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); this.buffers.set(url, await ctx.decodeAudioData(await response.arrayBuffer())); } catch { this.buffers.set(url, this.makeFallback(role)); } }
  }
  private makeFallback(role: StemRole) {
    const ctx = this.ctx!; const bars = 8; const seconds = bars * 4 * 60 / this.track.bpm; const length = Math.ceil(seconds * ctx.sampleRate); const b = ctx.createBuffer(2, length, ctx.sampleRate);
    const root = [43,45,41,48,46,38][Math.max(0, TRACKS.findIndex(t => t.id === this.track.id))] ?? 43; const beatDur = 60 / this.track.bpm;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) { const t = i / ctx.sampleRate; const bp = t / beatDur; const beat = Math.floor(bp); const phase = bp - beat; let v = 0;
      if (role === "drums") { const env = Math.exp(-phase * 17); const hz = 52 + 75 * Math.exp(-phase * 22); v += Math.sin(Math.PI * 2 * hz * t) * env * 0.7; const hphase = (bp * 2) % 1; const noise = (((i * 1664525 + 1013904223) >>> 8) % 65536) / 32768 - 1; v += noise * Math.exp(-hphase * 32) * 0.055; if (beat % 4 === 1 || beat % 4 === 3) v += noise * Math.exp(-phase * 25) * 0.12; }
      else if (role === "bass") { const pattern = [0,0,7,5,0,3,7,10]; const note = pattern[beat % pattern.length] ?? 0; const hz = 440 * 2 ** ((root + note - 69) / 12); const env = Math.min(1, phase * 18) * Math.exp(-phase * 2.4); v = (Math.sin(2*Math.PI*hz*t) + 0.25*Math.sin(4*Math.PI*hz*t)) * env * 0.2; }
      else if (role === "other") { const progression = [0,5,3,7]; const r = root + 12 + (progression[Math.floor(beat / 4) % 4] ?? 0); for (const iv of [0,3,7]) { const hz = 440 * 2 ** ((r + iv - 69) / 12); v += Math.sin(2*Math.PI*hz*t + ch*0.12) * 0.034; } }
      else if ((beat % 8 === 3 || beat % 8 === 7) && phase < 0.7) { const hz = 440 * 2 ** ((root + 27 + (beat % 8 === 7 ? 4 : 0) - 69) / 12); v = Math.sin(2*Math.PI*hz*t) * Math.sin(Math.PI*Math.min(1,phase*2)) * Math.exp(-phase*3) * 0.09; }
      d[i] = clamp(v, -0.95, 0.95);
    }} return b;
  }
  start() { if (!this.ctx || this.started) return; this.started = true; this.paused = false; this.musicLevel = 0; this.boardHeight = 0; this.arrangement = "intro"; this.pending = null; this.boostUntil = 0; this.dropUntil = 0; this.startAt = this.ctx.currentTime + 0.08 - this.track.beatOffset; this.spin(this.ctx.currentTime + 0.08); this.applyMix(); this.timer = window.setInterval(() => this.tick(), 35); }
  private spin(when: number) { this.stopNodes(); const ctx = this.ctx!; for (const role of ROLES) { const url = this.track.stems[role]; if (!url) continue; const buffer = this.buffers.get(url); if (!buffer) continue; const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; const gain = ctx.createGain(); const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 18000; source.connect(gain).connect(filter).connect(this.master!); source.start(when, 0); this.nodes.set(role, { source, gain, filter }); } }
  private stopNodes() { for (const n of this.nodes.values()) { try { n.source.stop(); } catch {} } this.nodes.clear(); }
  stop() { if (this.timer != null) clearInterval(this.timer); this.timer = null; this.stopNodes(); this.started = false; this.paused = false; }
  pause() { if (!this.ctx || !this.started || this.paused) return; this.paused = true; if (this.timer != null) clearInterval(this.timer); this.timer = null; void this.ctx.suspend(); }
  resume() { if (!this.ctx || !this.started || !this.paused) return; this.paused = false; void this.ctx.resume().then(() => { this.timer = window.setInterval(() => this.tick(), 35); }); }
  dispose() { this.stop(); void this.ctx?.close(); this.ctx = null; this.initPromise = null; }
  setVolume(v: number) { this.userVolume = clamp(v); this.applyMaster(); }
  setMuted(v: boolean) { this.muted = v; this.applyMaster(); }
  private applyMaster() { if (!this.ctx || !this.master) return; this.master.gain.setTargetAtTime(this.muted ? 0.0001 : this.userVolume ** 2, this.ctx.currentTime, 0.03); }
  setBoardHeight(rows: number) { this.boardHeight = clamp(rows / 20, 0, 1) * 100; const next = heightToLevel(this.boardHeight); if (next > this.musicLevel) { this.musicLevel = next; if (next >= 5 && this.arrangement !== "drop") this.arrangement = "build"; if (next >= 6 && !this.pending) this.request("drop", true); this.applyMix(); } }
  request(kind: PowerKind, _auto = false) { if (!this.started) return false; const labels: Record<PowerKind,string> = { flash:"FLASH", filter:"FILTER", boost:"BOOST", switch:"SWITCH", drop:"DROP" }; this.pending = { kind, label: `${labels[kind]} ARMED` }; return true; }
  private tick() { if (!this.ctx || !this.started || this.paused) return; const p = this.position(); this.onStep?.(p.step); if (this.pending && p.step === 0 && p.frac < 0.3) { const kind = this.pending.kind; this.pending = null; const now = this.ctx.currentTime; if (kind === "flash") this.flashUntil = now + 60 / this.track.bpm / 2; if (kind === "boost") this.boostUntil = now + 8 * 4 * 60 / this.track.bpm; if (kind === "filter") for (const n of this.nodes.values()) { n.filter.frequency.cancelScheduledValues(now); n.filter.frequency.setValueAtTime(900, now); n.filter.frequency.exponentialRampToValueAtTime(18000, now + 4*4*60/this.track.bpm); } if (kind === "switch") this.arrangement = "break"; if (kind === "drop") { this.arrangement = "drop"; this.dropUntil = now + 8*4*60/this.track.bpm; } this.applyMix(); } if (this.arrangement === "drop" && this.ctx.currentTime > this.dropUntil) { this.arrangement = "groove"; this.applyMix(); } if (this.arrangement === "break" && p.phraseBar >= 2) { this.arrangement = "groove"; this.applyMix(); } if (this.ctx.currentTime > this.flashUntil) this.applyMix(); }
  private targetGains(): LayerGains { const level = this.musicLevel; const drop = this.arrangement === "drop"; const brk = this.arrangement === "break"; const boost = Boolean(this.ctx && this.ctx.currentTime < this.boostUntil); return { drums: brk ? 0.12 : drop ? 1 : level >= 2 ? 0.82 : 0.42, bass: brk ? 0.08 : drop ? 0.96 : level >= 1 ? 0.72 + (boost ? 0.12 : 0) : 0, music: brk ? 0.58 : drop ? 0.9 : level >= 3 ? 0.68 : level >= 0 ? 0.26 : 0, vocals: drop ? 0.72 : level >= 4 ? 0.42 : brk ? 0.6 : 0 }; }
  private applyMix() { if (!this.ctx) return; const g = this.targetGains(); const now = this.ctx.currentTime; for (const [role,n] of this.nodes) { let value = g[gainKey[role]]; if (this.flashUntil > now) value *= 0.03; n.gain.gain.setTargetAtTime(value, now, 0.06); if (role === "drums" && this.musicLevel === 0) n.filter.frequency.setTargetAtTime(1600, now, 0.08); else n.filter.frequency.setTargetAtTime(18000, now, 0.08); } }
  private currentGains(): LayerGains { const out: LayerGains = { drums:0,bass:0,music:0,vocals:0 }; for (const [role,n] of this.nodes) out[gainKey[role]] = clamp(n.gain.gain.value); return out; }
  private position() { const ctx = this.ctx; const beatDur = 60 / this.track.bpm; const elapsed = ctx && this.started ? Math.max(0, ctx.currentTime - this.startAt) : 0; const totalBeats = elapsed / beatDur; const bar = Math.floor(totalBeats / 4); const beat = Math.floor(totalBeats % 4); const totalSteps = totalBeats * 4; const step = Math.floor(totalSteps % 16); const frac = totalSteps - Math.floor(totalSteps); return { bar, beat, step, frac, phraseBar: bar % 8, phrase: Math.floor(bar / 8) }; }
  get phraseLabel() { return `${this.track.title.toUpperCase()} · ${MUSIC_LEVEL_NAMES[this.musicLevel] ?? "FOUNDATION"}`; }
  visual(): MusicClock { const p = this.position(); return { bpm:this.track.bpm, bar:p.bar+1, beat:p.beat+1, step:p.step, frac:p.frac, phraseBar:p.phraseBar, phrase:p.phrase, arrangement:this.arrangement, musicLevel:this.musicLevel, boardHeight:this.boardHeight, kickPulse:p.step % 4 === 0 ? 1-p.frac : 0, duck:p.step % 4 === 0 ? 1-p.frac : 0, layers:this.currentGains(), pending:this.pending, trackId:this.track.id, trackTitle:this.track.title }; }
  waveform(): number[] { if (!this.analyser || !this.analyserData) return []; this.analyser.getByteFrequencyData(this.analyserData); return Array.from(this.analyserData); }
  tapeStop() { if (!this.ctx || !this.master) return; const t=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(Math.max(0.0001,this.master.gain.value),t); this.master.gain.exponentialRampToValueAtTime(0.0001,t+0.6); setTimeout(()=>this.stop(),650); }
}
