import { DEFAULT_MIX, filterWindow, resonanceQ, type MixParams } from "./mixTypesV308";
import { EXTERNAL_ROLES, externalSet, type ExternalRole, type ExternalSetId, type ExternalStemRef } from "./externalSetsV310";

export type ExternalChannelStatus = "OFF" | "ARMED" | "ON" | "EXIT";
export type ExternalChannelRuntime = { status: ExternalChannelStatus; targetBar: number | null; count: number };
export type ExternalSetState = {
  ready: boolean;
  loading: boolean;
  running: boolean;
  setId: ExternalSetId | null;
  sourceBpm: number;
  bar: number;
  beat: number;
  message: string;
  error: string | null;
  channels: Record<ExternalRole, ExternalChannelRuntime>;
};

type Bus = { hpf: BiquadFilterNode; lpf: BiquadFilterNode; gain: GainNode };
type TrackBuffer = { buffer: AudioBuffer; bpm: number; role: ExternalRole; name: string; key: string };
type Handle = { source: AudioBufferSourceNode };

const TARGET_BPM = 124;
const TARGET_BEAT = 60 / TARGET_BPM;
const TARGET_BAR = TARGET_BEAT * 4;
const DOWNLOAD_TIMEOUT_MS = 25_000;

const blankChannels = (): Record<ExternalRole, ExternalChannelRuntime> => Object.fromEntries(
  EXTERNAL_ROLES.map(({ id }) => [id, { status: "OFF", targetBar: null, count: 0 }]),
) as Record<ExternalRole, ExternalChannelRuntime>;

function sourcePhrase(bpm: number) { return (60 / bpm) * 16; }

function energy(buffer: AudioBuffer, start: number, duration: number) {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(start * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor((start + duration) * buffer.sampleRate));
  if (to <= from) return 0;
  const step = 1024;
  let sum = 0, count = 0;
  for (let i = from; i < to; i += step) {
    const v = data[i] ?? 0;
    sum += v * v;
    count++;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function bestSharedWindow(tracks: TrackBuffer[], bpm: number) {
  const phrase = sourcePhrase(bpm);
  if (!tracks.length) return 0;
  const usable = tracks.filter((t) => t.buffer.duration >= phrase + 0.05);
  if (!usable.length) return 0;
  const phrases = Math.max(1, Math.min(...usable.map((t) => Math.floor(t.buffer.duration / phrase))));
  let bestIndex = 0, bestScore = -1;
  for (let p = 0; p < phrases; p++) {
    let score = 0;
    for (const track of usable) {
      const roleWeight = track.role === "BASS" ? 1.35 : track.role === "MUSIC" ? 1.2 : track.role === "KICK" || track.role === "PERC" ? 1.1 : 0.7;
      score += energy(track.buffer, p * phrase, phrase) * roleWeight;
    }
    if (score > bestScore) { bestScore = score; bestIndex = p; }
  }
  return bestIndex * phrase;
}

export class CC0SetMixerV311 {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private output: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buses = new Map<ExternalRole, Bus>();
  private mix = new Map<ExternalRole, MixParams>();
  private tracks = new Map<ExternalRole, TrackBuffer[]>();
  private handles = new Map<ExternalRole, Handle[]>();
  private timers = new Set<number>();
  private clock: number | null = null;
  private startAt = 0;
  private volume = 0.82;
  private onState: (state: ExternalSetState) => void;
  private loadToken = 0;
  private controllers = new Set<AbortController>();
  private decodedCache = new Map<string, AudioBuffer>();
  private loopStart = 0;

  state: ExternalSetState = {
    ready: false, loading: false, running: false, setId: null, sourceBpm: TARGET_BPM,
    bar: 1, beat: 1, message: "SELECT SET", error: null, channels: blankChannels(),
  };

  constructor(onState: (state: ExternalSetState) => void) {
    this.onState = onState;
    EXTERNAL_ROLES.forEach(({ id }) => this.mix.set(id, { ...DEFAULT_MIX }));
  }

  private emit(patch?: Partial<ExternalSetState>) {
    if (patch) this.state = { ...this.state, ...patch };
    this.onState({ ...this.state, channels: { ...this.state.channels } });
  }

  private patchRole(id: ExternalRole, patch: Partial<ExternalChannelRuntime>) {
    this.state = { ...this.state, channels: { ...this.state.channels, [id]: { ...this.state.channels[id], ...patch } } };
    this.emit();
  }

  private async ensureContext() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio no disponible");
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const analyser = ctx.createAnalyser();
    const output = ctx.createGain();
    master.gain.value = 0.9;
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    output.gain.value = this.volume;
    master.connect(analyser).connect(output).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    this.output = output;
    EXTERNAL_ROLES.forEach(({ id }) => this.makeBus(id));
    await ctx.resume();
  }

  private makeBus(id: ExternalRole) {
    if (!this.ctx || !this.master) return;
    const hpf = this.ctx.createBiquadFilter();
    const lpf = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    hpf.type = "highpass";
    lpf.type = "lowpass";
    hpf.connect(lpf).connect(gain).connect(this.master);
    this.buses.set(id, { hpf, lpf, gain });
    this.applyBus(id, true);
  }

  private applyBus(id: ExternalRole, immediate = false) {
    const ctx = this.ctx, bus = this.buses.get(id), mix = this.mix.get(id);
    if (!ctx || !bus || !mix) return;
    const { hp, lp } = filterWindow(mix);
    const q = resonanceQ(mix.resonance);
    const tc = immediate ? 0.001 : 0.025;
    bus.hpf.frequency.setTargetAtTime(hp, ctx.currentTime, tc);
    bus.lpf.frequency.setTargetAtTime(lp, ctx.currentTime, tc);
    bus.hpf.Q.setTargetAtTime(Math.max(0.7, q * 0.55), ctx.currentTime, tc);
    bus.lpf.Q.setTargetAtTime(q, ctx.currentTime, tc);
    bus.gain.gain.setTargetAtTime(mix.gain, ctx.currentTime, tc);
  }

  setMix(id: ExternalRole, next: MixParams) { this.mix.set(id, { ...next }); this.applyBus(id); }
  getMix(id: ExternalRole) { return { ...(this.mix.get(id) ?? DEFAULT_MIX) }; }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.ctx && this.output) this.output.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  private abortLoads() {
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
  }

  private counts() {
    const channels = blankChannels();
    EXTERNAL_ROLES.forEach(({ id }) => { channels[id].count = this.tracks.get(id)?.length ?? 0; });
    return channels;
  }

  private baseStemRefs(stems: ExternalStemRef[]) {
    const selected: ExternalStemRef[] = [];
    const rhythm = stems.find((s) => s.role === "KICK") ?? stems.find((s) => s.role === "PERC");
    const bass = stems.find((s) => s.role === "BASS");
    const music = stems.find((s) => s.role === "MUSIC");
    if (rhythm) selected.push(rhythm);
    if (bass) selected.push(bass);
    if (music) selected.push(music);
    return selected.length ? selected : stems.slice(0, 2);
  }

  async loadSet(id: ExternalSetId) {
    if (this.state.setId === id && this.state.ready) return;
    this.abortLoads();
    const token = ++this.loadToken;
    this.stop();
    await this.ensureContext();
    this.tracks.clear();
    EXTERNAL_ROLES.forEach(({ id: role }) => this.tracks.set(role, []));
    const set = externalSet(id);
    this.emit({ loading: true, ready: false, setId: id, sourceBpm: set.bpm, error: null, message: `LOADING ${set.label} CORE…`, channels: blankChannels() });

    try {
      const coreRefs = this.baseStemRefs(set.stems);
      const coreResults = await Promise.allSettled(coreRefs.map((stem) => this.loadTrack(stem, set.bpm, set.key, token)));
      if (token !== this.loadToken) return;
      const coreTracks = coreResults.filter((r): r is PromiseFulfilledResult<TrackBuffer> => r.status === "fulfilled").map((r) => r.value);
      if (!coreTracks.length) throw new Error("NO AUDIO LOADED");
      this.loopStart = bestSharedWindow(coreTracks, set.bpm);
      coreTracks.forEach((track) => this.tracks.get(track.role)!.push(track));
      this.emit({ loading: false, ready: true, sourceBpm: set.bpm, channels: this.counts(), message: `${set.label} READY · ${set.bpm} BPM · ${set.key}` });

      const remaining = set.stems.filter((stem) => !coreRefs.includes(stem));
      void this.loadRemaining(id, remaining, set.bpm, set.key, token);
    } catch (error) {
      if (token !== this.loadToken) return;
      const message = error instanceof DOMException && error.name === "AbortError" ? "Carga cancelada" : error instanceof Error ? error.message : "No se pudo cargar el set";
      this.emit({ loading: false, ready: false, error: message, message });
    }
  }

  private async loadRemaining(id: ExternalSetId, stems: ExternalStemRef[], bpm: number, key: string, token: number) {
    let loaded = 0;
    for (const stem of stems) {
      if (token !== this.loadToken || this.state.setId !== id) return;
      try {
        const track = await this.loadTrack(stem, bpm, key, token);
        if (token !== this.loadToken || this.state.setId !== id) return;
        this.tracks.get(track.role)!.push(track);
        loaded++;
        this.emit({ channels: this.counts(), message: `${externalSet(id).label} READY · +${loaded} LAYERS` });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Optional CC0 stem skipped", stem.label, error);
      }
    }
  }

  private async loadTrack(stem: ExternalStemRef, bpm: number, key: string, token: number): Promise<TrackBuffer> {
    const cacheKey = `${stem.track}/${stem.file}`;
    const cached = this.decodedCache.get(cacheKey);
    if (cached) return { buffer: cached, bpm, role: stem.role, name: stem.label, key };
    if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");

    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/free-stem?track=${encodeURIComponent(stem.track)}&file=${encodeURIComponent(stem.file)}`, {
        cache: "force-cache",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw new Error("empty audio");
      if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");
      const buffer = await this.ctx!.decodeAudioData(bytes.slice(0));
      if (!buffer.length || buffer.duration < 0.1) throw new Error("invalid audio");
      this.decodedCache.set(cacheKey, buffer);
      return { buffer, bpm, role: stem.role, name: stem.label, key };
    } finally {
      window.clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  async start() {
    if (!this.state.ready || !this.ctx || this.state.running) return;
    await this.ctx.resume();
    const hasKick = (this.tracks.get("KICK")?.length ?? 0) > 0;
    const hasPerc = (this.tracks.get("PERC")?.length ?? 0) > 0;
    const hasBass = (this.tracks.get("BASS")?.length ?? 0) > 0;
    if (!hasKick && !hasPerc && !hasBass) {
      this.emit({ running: false, error: "NO AUDIO LOADED", message: "NO AUDIO LOADED" });
      return;
    }

    this.cancel();
    this.stopHandles();
    const channels = Object.fromEntries(Object.entries(this.state.channels).map(([id, runtime]) => [id, { ...runtime, status: "OFF", targetBar: null }])) as Record<ExternalRole, ExternalChannelRuntime>;
    this.startAt = this.ctx.currentTime + 0.12;
    const baseRoles: ExternalRole[] = [];
    if (hasKick) baseRoles.push("KICK"); else if (hasPerc) baseRoles.push("PERC");
    if (hasBass) baseRoles.push("BASS");
    baseRoles.forEach((role) => {
      this.activate(role, this.startAt);
      channels[role] = { ...channels[role], status: "ON" };
    });
    this.state = { ...this.state, running: true, bar: 1, beat: 1, error: null, channels };
    this.startClock();
    this.emit({ message: `${externalSet(this.state.setId!).label} · BASE ${baseRoles.join(" + ")}` });
  }

  stop() {
    this.cancel();
    this.stopHandles();
    if (this.clock != null) window.clearInterval(this.clock);
    this.clock = null;
    if (this.state.running) {
      const channels = Object.fromEntries(Object.entries(this.state.channels).map(([id, runtime]) => [id, { ...runtime, status: "OFF", targetBar: null }])) as Record<ExternalRole, ExternalChannelRuntime>;
      this.emit({ running: false, bar: 1, beat: 1, channels, message: this.state.ready ? "SET READY" : this.state.message });
    }
  }

  dispose() {
    this.abortLoads();
    this.loadToken++;
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.tracks.clear();
    this.buses.clear();
    this.decodedCache.clear();
  }

  toggle(id: ExternalRole) {
    if (!this.ctx || !this.state.running || !this.state.channels[id].count) return;
    const runtime = this.state.channels[id];
    if (runtime.status === "ARMED" || runtime.status === "EXIT") return;
    const q = EXTERNAL_ROLES.find((role) => role.id === id)!.q;
    if (runtime.status === "OFF") this.armOn(id, q); else if (runtime.status === "ON") this.armOff(id, q);
  }

  private armOn(id: ExternalRole, q: 1 | 4 | 8) {
    const bar = this.nextBoundary(q), when = this.timeForBar(bar);
    this.patchRole(id, { status: "ARMED", targetBar: bar + 1 });
    this.at(when, () => {
      if (!this.state.running) return;
      this.activate(id, when);
      this.patchRole(id, { status: "ON", targetBar: null });
      this.emit({ message: `${id} ON · BAR ${bar + 1}` });
    });
  }

  private armOff(id: ExternalRole, q: 1 | 4 | 8) {
    const bar = this.nextBoundary(q), when = this.timeForBar(bar), bus = this.buses.get(id)!;
    this.patchRole(id, { status: "EXIT", targetBar: bar + 1 });
    bus.gain.gain.cancelScheduledValues(when);
    bus.gain.gain.setValueAtTime(Math.max(0.0001, bus.gain.gain.value), when);
    bus.gain.gain.linearRampToValueAtTime(0.0001, when + 0.08);
    this.at(when + 0.1, () => {
      this.stopRole(id);
      this.patchRole(id, { status: "OFF", targetBar: null });
      this.applyBus(id);
    });
  }

  private activate(id: ExternalRole, when: number) {
    const list = this.tracks.get(id) ?? [];
    if (!list.length || !this.ctx) return;
    const bus = this.buses.get(id)!;
    const mix = this.mix.get(id)!;
    bus.gain.gain.cancelScheduledValues(when);
    bus.gain.gain.setValueAtTime(0.0001, Math.max(this.ctx.currentTime, when - 0.02));
    bus.gain.gain.linearRampToValueAtTime(mix.gain, when + 0.06);
    this.handles.set(id, list.map((track) => this.startTrack(track, id, when)));
  }

  private startTrack(track: TrackBuffer, role: ExternalRole, when: number): Handle {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    const phrase = sourcePhrase(track.bpm);
    const maxStart = Math.max(0, track.buffer.duration - phrase - 0.03);
    const start = Math.min(this.loopStart, maxStart);
    const end = Math.min(track.buffer.duration - 0.015, start + phrase);
    source.buffer = track.buffer;
    source.playbackRate.setValueAtTime(TARGET_BPM / track.bpm, when);
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = Math.max(start + 0.2, end);
    source.connect(this.buses.get(role)!.hpf);
    source.start(when, start);
    return { source };
  }

  private stopRole(id: ExternalRole) {
    this.handles.get(id)?.forEach(({ source }) => { try { source.stop(); } catch { /* already stopped */ } });
    this.handles.delete(id);
  }
  private stopHandles() { [...this.handles.keys()].forEach((id) => this.stopRole(id)); }

  spectrum() {
    if (!this.analyser) return new Uint8Array();
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }
  waveform() {
    if (!this.analyser) return new Uint8Array();
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  private nextBoundary(q: 1 | 4 | 8) {
    if (!this.ctx) return 0;
    const bars = Math.max(0, (this.ctx.currentTime - this.startAt) / TARGET_BAR);
    return Math.floor(bars / q + 1) * q;
  }
  private timeForBar(index: number) { return this.startAt + index * TARGET_BAR; }
  private at(time: number, fn: () => void) {
    const delay = Math.max(0, (time - (this.ctx?.currentTime ?? time)) * 1000);
    const id = window.setTimeout(() => { this.timers.delete(id); fn(); }, delay);
    this.timers.add(id);
  }
  private cancel() { this.timers.forEach((id) => window.clearTimeout(id)); this.timers.clear(); }
  private startClock() {
    if (this.clock != null) window.clearInterval(this.clock);
    this.clock = window.setInterval(() => {
      if (!this.ctx || !this.state.running) return;
      const elapsed = Math.max(0, this.ctx.currentTime - this.startAt);
      const bars = elapsed / TARGET_BAR;
      const bi = Math.floor(bars);
      const beatFloat = (bars - bi) * 4;
      this.emit({ bar: bi + 1, beat: Math.min(4, Math.floor(beatFloat) + 1) });
    }, 50);
  }
}
