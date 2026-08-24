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
type TrackBuffer = { buffer: AudioBuffer; bpm: number; loopStart: number; role: ExternalRole; name: string };
type Handle = { source: AudioBufferSourceNode };

const TARGET_BPM = 124;
const BEAT = 60 / TARGET_BPM;
const BAR = BEAT * 4;
const PHRASE = BAR * 4;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const CDN_BASE = "https://cdn.jsdelivr.net/gh/ichbinsoftware/everythingisfree@main/src/2.Lithium/";
const RAW_BASE = "https://raw.githubusercontent.com/ichbinsoftware/everythingisfree/main/src/2.Lithium/";

const blankChannels = (): Record<ExternalRole, ExternalChannelRuntime> => Object.fromEntries(
  EXTERNAL_ROLES.map(({ id }) => [id, { status: "OFF", targetBar: null, count: 0 }]),
) as Record<ExternalRole, ExternalChannelRuntime>;

function stemUrl(base: string, file: string) {
  return `${base}${encodeURIComponent(file)}`;
}

function windowEnergy(buffer: AudioBuffer, start: number, duration = PHRASE) {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(start * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor((start + duration) * buffer.sampleRate));
  if (to <= from) return 0;
  const step = 2048;
  let sum = 0, count = 0;
  for (let i = from; i < to; i += step) { const v = data[i] ?? 0; sum += v * v; count++; }
  return count ? Math.sqrt(sum / count) : 0;
}

function bestWindow(buffer: AudioBuffer) {
  const phrases = Math.max(1, Math.floor(buffer.duration / PHRASE));
  let best = 0, bestScore = -1;
  for (let p = 0; p < phrases; p++) {
    const start = p * PHRASE;
    if (start + PHRASE > buffer.duration - 0.05) break;
    const score = windowEnergy(buffer, start);
    if (score > bestScore) { bestScore = score; best = start; }
  }
  return best;
}

function sharedWindow(tracks: TrackBuffer[]) {
  const usable = tracks.filter((t) => ["KICK", "HATS", "PERC", "BASS", "MUSIC"].includes(t.role));
  if (!usable.length) return 0;
  const phrases = Math.max(1, Math.min(...usable.map((t) => Math.floor(t.buffer.duration / PHRASE))));
  const energies = usable.map((track) => {
    const values: number[] = [];
    for (let p = 0; p < phrases; p++) values.push(windowEnergy(track.buffer, p * PHRASE));
    const max = Math.max(0.000001, ...values);
    return { track, values: values.map((v) => v / max) };
  });
  let bestPhrase = 0, bestScore = -1;
  for (let p = 0; p < phrases; p++) {
    let score = 0;
    for (const item of energies) {
      const weight = item.track.role === "MUSIC" || item.track.role === "BASS" ? 1.35 : item.track.role === "PERC" ? 1.0 : 0.72;
      score += (item.values[p] ?? 0) * weight;
    }
    if (score > bestScore) { bestScore = score; bestPhrase = p; }
  }
  return bestPhrase * PHRASE;
}

export class CambridgeSetMixerV310 {
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
  private downloadControllers = new Set<AbortController>();
  private decodedCache = new Map<string, AudioBuffer>();

  state: ExternalSetState = {
    ready: false, loading: false, running: false, setId: null, sourceBpm: 124,
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
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    output.gain.value = this.volume;
    master.connect(analyser).connect(output).connect(ctx.destination);
    this.ctx = ctx; this.master = master; this.analyser = analyser; this.output = output;
    EXTERNAL_ROLES.forEach(({ id }) => this.makeBus(id));
    await ctx.resume();
  }

  private makeBus(id: ExternalRole) {
    if (!this.ctx || !this.master) return;
    const hpf = this.ctx.createBiquadFilter();
    const lpf = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    hpf.type = "highpass"; lpf.type = "lowpass";
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

  private abortDownloads() {
    this.downloadControllers.forEach((controller) => controller.abort());
    this.downloadControllers.clear();
  }

  private channelCounts() {
    const channels = blankChannels();
    EXTERNAL_ROLES.forEach(({ id }) => { channels[id].count = this.tracks.get(id)?.length ?? 0; });
    return channels;
  }

  async loadSet(id: ExternalSetId) {
    if (this.state.setId === id && this.state.ready) return;
    this.abortDownloads();
    const token = ++this.loadToken;
    this.stop();
    await this.ensureContext();
    this.tracks.clear();
    EXTERNAL_ROLES.forEach(({ id: role }) => this.tracks.set(role, []));
    const set = externalSet(id);
    this.emit({ loading: true, ready: false, setId: id, sourceBpm: set.bpm, error: null, message: `LOADING ${set.label}…`, channels: blankChannels() });

    try {
      const loaded: TrackBuffer[] = [];
      let done = 0;
      const jobs = set.stems.map(async (stem) => {
        const buffer = await this.loadStem(stem, token);
        done++;
        if (token === this.loadToken) this.emit({ message: `LOADING ${set.label} · ${done}/${set.stems.length}` });
        return { buffer, bpm: set.bpm, loopStart: 0, role: stem.role, name: stem.label } as TrackBuffer;
      });
      const results = await Promise.allSettled(jobs);
      if (token !== this.loadToken) return;
      results.forEach((result) => { if (result.status === "fulfilled") loaded.push(result.value); });
      if (!loaded.length) throw new Error("No se pudo descargar ningún stem");

      const common = sharedWindow(loaded);
      loaded.forEach((track) => {
        track.loopStart = track.role === "VOCAL" || track.role === "FX" || track.role === "SNARE" ? bestWindow(track.buffer) : common;
        const maxStart = Math.max(0, track.buffer.duration - PHRASE - 0.04);
        track.loopStart = Math.min(track.loopStart, maxStart);
        this.tracks.get(track.role)!.push(track);
      });

      const channels = this.channelCounts();
      this.emit({ loading: false, ready: true, sourceBpm: set.bpm, channels, message: `${set.label} READY · ${set.bpm} BPM · ${set.key}` });
    } catch (error) {
      if (token !== this.loadToken) return;
      const message = error instanceof DOMException && error.name === "AbortError" ? "Carga cancelada" : error instanceof Error ? error.message : "No se pudo cargar el set";
      this.emit({ loading: false, ready: false, error: message, message });
    }
  }

  private async loadStem(stem: ExternalStemRef, token: number) {
    const cached = this.decodedCache.get(stem.file);
    if (cached) return cached;
    if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");
    const urls = [stemUrl(CDN_BASE, stem.file), stemUrl(RAW_BASE, stem.file)];
    let lastError: unknown = null;
    for (const url of urls) {
      const controller = new AbortController();
      this.downloadControllers.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      try {
        const response = await fetch(url, { cache: "force-cache", signal: controller.signal, mode: "cors" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");
        const buffer = await this.ctx!.decodeAudioData(bytes.slice(0));
        this.decodedCache.set(stem.file, buffer);
        return buffer;
      } catch (error) {
        lastError = error;
        if (error instanceof DOMException && error.name === "AbortError") throw error;
      } finally {
        window.clearTimeout(timeout);
        this.downloadControllers.delete(controller);
      }
    }
    throw new Error(`${stem.label}: ${lastError instanceof Error ? lastError.message : "download failed"}`);
  }

  async start() {
    if (!this.state.ready || !this.ctx || this.state.running) return;
    await this.ctx.resume();
    this.cancel(); this.stopHandles();
    const channels = Object.fromEntries(Object.entries(this.state.channels).map(([id, runtime]) => [id, { ...runtime, status: "OFF", targetBar: null }])) as Record<ExternalRole, ExternalChannelRuntime>;
    this.state = { ...this.state, running: true, bar: 1, beat: 1, channels };
    this.startAt = this.ctx.currentTime + 0.18;
    const baseRoles: ExternalRole[] = [];
    if (channels.KICK.count) baseRoles.push("KICK"); else if (channels.PERC.count) baseRoles.push("PERC");
    if (channels.BASS.count) baseRoles.push("BASS");
    baseRoles.forEach((role) => { this.activate(role, this.startAt); channels[role] = { ...channels[role], status: "ON" }; });
    this.state = { ...this.state, channels };
    this.startClock();
    this.emit({ message: `${externalSet(this.state.setId!).label} · BASE ${baseRoles.join(" + ") || "EMPTY"}` });
  }

  stop() {
    this.cancel(); this.stopHandles();
    if (this.clock != null) window.clearInterval(this.clock);
    this.clock = null;
    if (this.state.running) {
      const channels = Object.fromEntries(Object.entries(this.state.channels).map(([id, runtime]) => [id, { ...runtime, status: "OFF", targetBar: null }])) as Record<ExternalRole, ExternalChannelRuntime>;
      this.emit({ running: false, bar: 1, beat: 1, channels, message: this.state.ready ? "SET READY" : this.state.message });
    }
  }

  dispose() {
    this.abortDownloads();
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
    this.at(when, () => { if (!this.state.running) return; this.activate(id, when); this.patchRole(id, { status: "ON", targetBar: null }); this.emit({ message: `${id} ON · BAR ${bar + 1}` }); });
  }

  private armOff(id: ExternalRole, q: 1 | 4 | 8) {
    const bar = this.nextBoundary(q), when = this.timeForBar(bar), bus = this.buses.get(id)!;
    this.patchRole(id, { status: "EXIT", targetBar: bar + 1 });
    bus.gain.gain.cancelScheduledValues(when);
    bus.gain.gain.setValueAtTime(Math.max(0.0001, bus.gain.gain.value), when);
    bus.gain.gain.linearRampToValueAtTime(0.0001, when + 0.1);
    this.at(when + 0.12, () => { this.stopRole(id); this.patchRole(id, { status: "OFF", targetBar: null }); this.applyBus(id); });
  }

  private activate(id: ExternalRole, when: number) {
    const list = this.tracks.get(id) ?? [];
    if (!list.length) return;
    const bus = this.buses.get(id)!;
    const mix = this.mix.get(id)!;
    bus.gain.gain.cancelScheduledValues(when);
    bus.gain.gain.setValueAtTime(0.0001, Math.max(this.ctx!.currentTime, when - 0.02));
    bus.gain.gain.linearRampToValueAtTime(mix.gain, when + 0.08);
    this.handles.set(id, list.map((track) => this.startTrack(track, id, when)));
  }

  private startTrack(track: TrackBuffer, role: ExternalRole, when: number): Handle {
    const source = this.ctx!.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.setValueAtTime(TARGET_BPM / track.bpm, when);
    source.loop = true;
    source.loopStart = track.loopStart;
    source.loopEnd = Math.min(track.buffer.duration - 0.02, track.loopStart + PHRASE);
    source.connect(this.buses.get(role)!.hpf);
    source.start(when, track.loopStart);
    return { source };
  }

  private stopRole(id: ExternalRole) {
    this.handles.get(id)?.forEach(({ source }) => { try { source.stop(); } catch { /* already stopped */ } });
    this.handles.delete(id);
  }
  private stopHandles() { [...this.handles.keys()].forEach((id) => this.stopRole(id)); }

  spectrum() { if (!this.analyser) return new Uint8Array(); const data = new Uint8Array(this.analyser.frequencyBinCount); this.analyser.getByteFrequencyData(data); return data; }
  waveform() { if (!this.analyser) return new Uint8Array(); const data = new Uint8Array(this.analyser.fftSize); this.analyser.getByteTimeDomainData(data); return data; }

  private nextBoundary(q: 1 | 4 | 8) { if (!this.ctx) return 0; const bars = Math.max(0, (this.ctx.currentTime - this.startAt) / BAR); return Math.floor(bars / q + 1) * q; }
  private timeForBar(index: number) { return this.startAt + index * BAR; }
  private at(time: number, fn: () => void) { const delay = Math.max(0, (time - (this.ctx?.currentTime ?? time)) * 1000); const id = window.setTimeout(() => { this.timers.delete(id); fn(); }, delay); this.timers.add(id); }
  private cancel() { this.timers.forEach((id) => window.clearTimeout(id)); this.timers.clear(); }
  private startClock() { if (this.clock != null) window.clearInterval(this.clock); this.clock = window.setInterval(() => { if (!this.ctx || !this.state.running) return; const elapsed = Math.max(0, this.ctx.currentTime - this.startAt); const bars = elapsed / BAR; const bi = Math.floor(bars); const beatFloat = (bars - bi) * 4; this.emit({ bar: bi + 1, beat: Math.min(4, Math.floor(beatFloat) + 1) }); }, 50); }
}
