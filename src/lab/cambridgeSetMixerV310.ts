import { unzip } from "fflate";
import { DEFAULT_MIX, filterWindow, resonanceQ, type MixParams } from "./mixTypesV308";
import { EXTERNAL_ROLES, RHYTHM_ROLES, externalSet, type ExternalRole, type ExternalSetId, type ExternalSetSource } from "./externalSetsV310";

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
type TrackBuffer = { buffer: AudioBuffer; bpm: number; beatZero: number; support: boolean; name: string };
type Handle = { source: AudioBufferSourceNode };

const TARGET_BPM = 124;
const BEAT = 60 / TARGET_BPM;
const BAR = BEAT * 4;
const RHYTHM = new Set<ExternalRole>(["KICK", "SNARE", "HATS", "PERC", "FX"]);

// The edited Cambridge ZIPs are still large once expanded. Beatris only needs a
// small curated cell pool, not every multitrack in the archive.
const LIMITS: Record<ExternalRole, number> = { KICK: 1, SNARE: 1, HATS: 1, PERC: 1, BASS: 1, MUSIC: 2, VOCAL: 1, FX: 1 };
const SUPPORT_LIMITS: Record<ExternalRole, number> = { KICK: 1, SNARE: 1, HATS: 1, PERC: 1, BASS: 0, MUSIC: 0, VOCAL: 0, FX: 1 };
const MAX_ZIP_BYTES = 90 * 1024 * 1024;
const MAX_WAV_BYTES = 36 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 45_000;

const blankChannels = (): Record<ExternalRole, ExternalChannelRuntime> => Object.fromEntries(
  EXTERNAL_ROLES.map(({ id }) => [id, { status: "OFF", targetBar: null, count: 0 }]),
) as Record<ExternalRole, ExternalChannelRuntime>;

function classify(name: string): ExternalRole {
  const n = name.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/kick|bass drum|bassdrum|\bbd\b/.test(n)) return "KICK";
  if (/snare|clap|rim|snap/.test(n)) return "SNARE";
  if (/hi ?hat|hihat|hat\b|cymbal|ride|crash|overhead|\boh\b/.test(n)) return "HATS";
  if (/\bfx\b|effect|noise|sweep|riser|impact|reverse|transition|whoosh/.test(n)) return "FX";
  if (/sub ?bass|\bbass\b|bass synth|bassline/.test(n)) return "BASS";
  if (/vocal|vox|voice|\bbv\b|backing voc|lead voc/.test(n)) return "VOCAL";
  if (/perc|tom|shaker|tamb|conga|bongo|drum|loop|beat/.test(n)) return "PERC";
  return "MUSIC";
}

function skipFile(name: string) {
  const n = name.toLowerCase();
  return n.includes("__macosx") || /(^|[/ _-])(mix|master|preview|reference|rough mix)([/ _.-]|$)/.test(n);
}

function estimateBpm(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  const hop = 1024;
  const frames = Math.min(Math.floor(data.length / hop), Math.floor((buffer.sampleRate * 30) / hop));
  if (frames < 40) return 124;
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const from = i * hop;
    const to = Math.min(data.length, from + hop);
    for (let j = from; j < to; j += 4) sum += Math.abs(data[j]!);
    env[i] = sum / Math.max(1, (to - from) / 4);
  }
  const onset = new Float32Array(frames);
  for (let i = 1; i < frames; i++) onset[i] = Math.max(0, env[i]! - env[i - 1]! * 0.92);
  const fps = buffer.sampleRate / hop;
  let bestBpm = 124;
  let bestScore = -Infinity;
  for (let bpm = 85; bpm <= 175; bpm += 0.5) {
    const lag = Math.max(1, Math.round((60 * fps) / bpm));
    let score = 0;
    for (let i = lag; i < frames; i++) score += onset[i]! * onset[i - lag]!;
    const houseBias = 0.88 + 0.12 * Math.max(0, 1 - Math.abs(bpm - 126) / 70);
    score *= houseBias;
    if (score > bestScore) { bestScore = score; bestBpm = bpm; }
  }
  return Math.round(bestBpm * 10) / 10;
}

function estimateBeatZero(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  const hop = 512;
  const frames = Math.min(Math.floor(data.length / hop), Math.floor((buffer.sampleRate * 10) / hop));
  if (frames < 8) return 0;
  const novelty = new Float32Array(frames);
  let previous = 0;
  let max = 0;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const from = i * hop;
    const to = Math.min(data.length, from + hop);
    for (let j = from; j < to; j += 4) sum += Math.abs(data[j]!);
    const energy = sum / Math.max(1, (to - from) / 4);
    const value = Math.max(0, energy - previous * 0.9);
    novelty[i] = value;
    max = Math.max(max, value);
    previous = energy;
  }
  const threshold = max * 0.58;
  for (let i = 2; i < frames - 2; i++) {
    if (novelty[i]! >= threshold && novelty[i]! >= novelty[i - 1]! && novelty[i]! >= novelty[i + 1]!) {
      return (i * hop) / buffer.sampleRate;
    }
  }
  return 0;
}

function yieldUi() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function unzipCurated(compressed: Uint8Array, source: ExternalSetSource) {
  const used = new Map<ExternalRole, number>();
  EXTERNAL_ROLES.forEach(({ id }) => used.set(id, 0));
  const limits = source.support ? SUPPORT_LIMITS : LIMITS;

  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      compressed,
      {
        filter(file) {
          const name = file.name;
          if (!/\.wav$/i.test(name) || skipFile(name)) return false;
          if (file.originalSize > MAX_WAV_BYTES) return false;
          const role = classify(name);
          if (source.support && !RHYTHM_ROLES.has(role)) return false;
          const current = used.get(role) ?? 0;
          const limit = limits[role];
          if (current >= limit) return false;
          used.set(role, current + 1);
          return true;
        },
      },
      (error, archive) => {
        if (error) reject(error);
        else resolve(archive as Record<string, Uint8Array>);
      },
    );
  });
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
    if (this.ctx) return;
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

  async loadSet(id: ExternalSetId) {
    if (this.state.setId === id && this.state.ready) return;
    this.abortDownloads();
    const token = ++this.loadToken;
    this.stop();
    await this.ensureContext();
    this.tracks.clear();
    EXTERNAL_ROLES.forEach(({ id: role }) => this.tracks.set(role, []));
    this.emit({ loading: true, ready: false, setId: id, error: null, message: `LOADING ${externalSet(id).label}…`, channels: blankChannels() });

    try {
      const set = externalSet(id);
      const primary = set.sources.find((source) => !source.support) ?? set.sources[0];
      if (!primary) throw new Error("Set without source");
      const primaryBpm = await this.loadSource(primary, token);
      if (token !== this.loadToken) return;

      const channels = this.channelCounts();
      this.emit({
        loading: false,
        ready: true,
        sourceBpm: primaryBpm,
        channels,
        message: `${set.label} READY · ${primaryBpm.toFixed(1)} → 124 BPM`,
      });

      // Extra percussion/FX arrive after the playable primary set is already ready.
      const support = set.sources.filter((source) => source.support);
      if (support.length) void this.loadSupportSources(id, support, token, primaryBpm);
    } catch (error) {
      if (token !== this.loadToken) return;
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Carga cancelada"
        : error instanceof Error ? error.message : "No se pudo cargar el set externo";
      this.emit({ loading: false, ready: false, error: message, message });
    }
  }

  private channelCounts() {
    const channels = blankChannels();
    EXTERNAL_ROLES.forEach(({ id: role }) => { channels[role].count = this.tracks.get(role)?.length ?? 0; });
    return channels;
  }

  private async loadSupportSources(id: ExternalSetId, sources: ExternalSetSource[], token: number, primaryBpm: number) {
    for (const source of sources) {
      if (token !== this.loadToken || this.state.setId !== id) return;
      try {
        await this.loadSource(source, token);
        if (token !== this.loadToken || this.state.setId !== id) return;
        const set = externalSet(id);
        this.emit({
          channels: this.channelCounts(),
          sourceBpm: primaryBpm,
          message: `${set.label} READY · + ${source.title.toUpperCase()} RHYTHM`,
        });
      } catch (error) {
        if (token !== this.loadToken) return;
        console.warn("Support multitrack skipped", source.id, error);
      }
    }
  }

  private async loadSource(source: ExternalSetSource, token: number) {
    if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");
    this.emit({ message: `DOWNLOADING ${source.artist} · ${source.title}…` });

    const controller = new AbortController();
    this.downloadControllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`/api/cambridge?id=${encodeURIComponent(source.id)}`, {
        cache: "force-cache",
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
      this.downloadControllers.delete(controller);
    }

    if (!response.ok) throw new Error(`${source.artist} · ${source.title} (${response.status})`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_ZIP_BYTES) throw new Error(`${source.title}: ZIP demasiado grande para preview`);

    const compressed = new Uint8Array(await response.arrayBuffer());
    if (compressed.byteLength > MAX_ZIP_BYTES) throw new Error(`${source.title}: ZIP demasiado grande para preview`);
    if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");

    this.emit({ message: `EXTRACTING ${source.artist} · ${source.title}…` });
    await yieldUi();
    const archive = await unzipCurated(compressed, source);
    if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");

    const decoded = new Map<ExternalRole, { name: string; buffer: AudioBuffer }[]>();
    EXTERNAL_ROLES.forEach(({ id }) => decoded.set(id, []));
    const entries = Object.entries(archive).filter(([name]) => /\.wav$/i.test(name) && !skipFile(name));

    for (let index = 0; index < entries.length; index++) {
      const [name, bytes] = entries[index]!;
      if (token !== this.loadToken) throw new DOMException("Cancelled", "AbortError");
      const role = classify(name);
      if (source.support && !RHYTHM_ROLES.has(role)) continue;
      this.emit({ message: `DECODING ${source.title.toUpperCase()} · ${index + 1}/${entries.length}` });
      try {
        const copy = bytes.slice().buffer as ArrayBuffer;
        const buffer = await this.ctx!.decodeAudioData(copy);
        decoded.get(role)!.push({ name, buffer });
      } catch {
        console.warn("Skipping undecodable multitrack", name);
      }
      await yieldUi();
    }

    const timing = decoded.get("KICK")?.[0]?.buffer ?? decoded.get("PERC")?.[0]?.buffer ?? decoded.get("HATS")?.[0]?.buffer ?? decoded.get("BASS")?.[0]?.buffer ?? decoded.get("MUSIC")?.[0]?.buffer;
    if (!timing) throw new Error(`${source.artist} · ${source.title}: no WAV tracks detected`);
    const bpm = estimateBpm(timing);
    const beatZero = estimateBeatZero(timing);

    for (const { id: role } of EXTERNAL_ROLES) {
      for (const item of decoded.get(role)!) {
        this.tracks.get(role)!.push({ buffer: item.buffer, bpm, beatZero, support: Boolean(source.support), name: item.name });
      }
    }
    return bpm;
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

  dispose() { this.abortDownloads(); this.loadToken++; this.stop(); void this.ctx?.close(); this.ctx = null; this.tracks.clear(); this.buses.clear(); }

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
    const handles = list.map((track) => this.startTrack(track, id, when));
    this.handles.set(id, handles);
  }

  private startTrack(track: TrackBuffer, role: ExternalRole, when: number): Handle {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    const sourceBar = (60 / track.bpm) * 4;
    const needed = sourceBar * 4;
    let loopStart = track.beatZero + sourceBar * 4;
    if (loopStart + needed >= track.buffer.duration - 0.03) loopStart = track.beatZero;
    if (loopStart + needed >= track.buffer.duration - 0.03) loopStart = Math.max(0, track.buffer.duration - needed - 0.03);
    const loopEnd = Math.min(track.buffer.duration - 0.02, loopStart + needed);
    source.playbackRate.setValueAtTime(TARGET_BPM / track.bpm, when);
    source.loop = true;
    source.loopStart = loopStart;
    source.loopEnd = Math.max(loopStart + 0.25, loopEnd);
    source.connect(this.buses.get(role)!.hpf);
    source.start(when, loopStart);
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
