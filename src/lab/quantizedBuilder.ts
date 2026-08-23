export type LayerId = "CHORDS" | "RESPONSE" | "MOTIF" | "PERC" | "VOCAL" | "HOOK" | "CLUB" | "BUILD";
export type LayerStatus = "OFF" | "ARMED" | "ON" | "DISARMING" | "BUILDING";

type SourceKey = "cityDrums" | "cityBass" | "cityOther" | "cityVocals" | "matrodaDrums" | "fingersDrums";
type SourceSpec = { path: string; bpm: number; beatOffset: number };
type CellSpec = { source: SourceKey; bar: number; bars: number; gain: number };

type LayerDefinition = {
  id: LayerId;
  label: string;
  description: string;
  quantizeBars: 1 | 4 | 8;
  kind: "add" | "replace-drums" | "build";
  cells: CellSpec[];
};

export type LayerRuntime = { status: LayerStatus; targetBar: number | null };
export type BuilderState = {
  ready: boolean;
  loading: boolean;
  running: boolean;
  bar: number;
  beat: number;
  phase: number;
  message: string;
  error: string | null;
  layers: Record<LayerId, LayerRuntime>;
};

type LoopHandle = { source: AudioBufferSourceNode; gain: GainNode; targetGain: number };

const TARGET_BPM = 124;
const BEAT_SECONDS = 60 / TARGET_BPM;
const BAR_SECONDS = BEAT_SECONDS * 4;

const SOURCES: Record<SourceKey, SourceSpec> = {
  cityDrums: { path: "stems/city-of-dreams-alt-control-millero/drums.mp3", bpm: 124, beatOffset: 0.021 },
  cityBass: { path: "stems/city-of-dreams-alt-control-millero/bass.mp3", bpm: 124, beatOffset: 0.021 },
  cityOther: { path: "stems/city-of-dreams-alt-control-millero/other.mp3", bpm: 124, beatOffset: 0.021 },
  cityVocals: { path: "stems/city-of-dreams-alt-control-millero/vocals.mp3", bpm: 124, beatOffset: 0.021 },
  matrodaDrums: { path: "stems/bullshit-matroda-klp/drums.mp3", bpm: 130, beatOffset: 0.0246 },
  fingersDrums: { path: "stems/20-fingers-putang-ina-mo/drums.mp3", bpm: 131, beatOffset: 0.3084 },
};

export const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    id: "CHORDS",
    label: "+ CHORDS",
    description: "Primera célula armónica. Entra al inicio de una frase de 4 compases.",
    quantizeBars: 4,
    kind: "add",
    cells: [{ source: "cityOther", bar: 40, bars: 4, gain: 0.27 }],
  },
  {
    id: "RESPONSE",
    label: "+ RESPONSE",
    description: "Otra célula musical compatible; nunca entra a mitad de la progresión.",
    quantizeBars: 4,
    kind: "add",
    cells: [{ source: "cityOther", bar: 64, bars: 4, gain: 0.20 }],
  },
  {
    id: "MOTIF",
    label: "+ MOTIF",
    description: "Frase más reconocible. Espera el siguiente bloque de 8 compases.",
    quantizeBars: 8,
    kind: "add",
    cells: [{ source: "cityOther", bar: 80, bars: 4, gain: 0.20 }],
  },
  {
    id: "PERC",
    label: "+ PERC",
    description: "Textura rítmica externa. Puede entrar en el siguiente 1.",
    quantizeBars: 1,
    kind: "add",
    cells: [{ source: "fingersDrums", bar: 48, bars: 4, gain: 0.15 }],
  },
  {
    id: "VOCAL",
    label: "+ VOCAL",
    description: "Frase vocal real. Espera una frase completa para no caer atravesada.",
    quantizeBars: 8,
    kind: "add",
    cells: [{ source: "cityVocals", bar: 48, bars: 4, gain: 0.34 }],
  },
  {
    id: "HOOK",
    label: "+ HOOK",
    description: "Sabor de sección avanzada. También puede ser desbloqueado por BUILD.",
    quantizeBars: 4,
    kind: "add",
    cells: [{ source: "cityOther", bar: 96, bars: 4, gain: 0.20 }],
  },
  {
    id: "CLUB",
    label: "CLUB KIT",
    description: "Sustituye la batería BASE por MATRODA, cuantizado a frase.",
    quantizeBars: 4,
    kind: "replace-drums",
    cells: [{ source: "matrodaDrums", bar: 64, bars: 4, gain: 0.78 }],
  },
  {
    id: "BUILD",
    label: "BUILD → DROP",
    description: "4 compases de subida. Al romper activa CLUB + HOOK, porque tú lo pediste.",
    quantizeBars: 4,
    kind: "build",
    cells: [
      { source: "matrodaDrums", bar: 48, bars: 4, gain: 0.82 },
      { source: "cityOther", bar: 72, bars: 4, gain: 0.24 },
    ],
  },
];

const BASE_CELLS: CellSpec[] = [
  { source: "cityDrums", bar: 32, bars: 4, gain: 0.68 },
  { source: "cityBass", bar: 32, bars: 4, gain: 0.42 },
];

const blankLayers = (): Record<LayerId, LayerRuntime> => ({
  CHORDS: { status: "OFF", targetBar: null },
  RESPONSE: { status: "OFF", targetBar: null },
  MOTIF: { status: "OFF", targetBar: null },
  PERC: { status: "OFF", targetBar: null },
  VOCAL: { status: "OFF", targetBar: null },
  HOOK: { status: "OFF", targetBar: null },
  CLUB: { status: "OFF", targetBar: null },
  BUILD: { status: "OFF", targetBar: null },
});

export class QuantizedLayerBuilder {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SourceKey, AudioBuffer>();
  private loops = new Map<LayerId | "BASE_DRUMS" | "BASE_BASS", LoopHandle[]>();
  private pendingTimers = new Set<number>();
  private clockTimer: number | null = null;
  private startAt = 0;
  private volume = 0.82;
  private onState: (state: BuilderState) => void;

  state: BuilderState = {
    ready: false,
    loading: false,
    running: false,
    bar: 1,
    beat: 1,
    phase: 0,
    message: "Pulsa START. Nada nuevo entra hasta que tú lo armes.",
    error: null,
    layers: blankLayers(),
  };

  constructor(onState: (state: BuilderState) => void) {
    this.onState = onState;
  }

  private emit(patch?: Partial<BuilderState>) {
    if (patch) this.state = { ...this.state, ...patch };
    this.onState({ ...this.state, layers: { ...this.state.layers } });
  }

  private patchLayer(id: LayerId, patch: Partial<LayerRuntime>) {
    this.state = {
      ...this.state,
      layers: { ...this.state.layers, [id]: { ...this.state.layers[id], ...patch } },
    };
    this.emit();
  }

  async prepare() {
    if (this.state.ready || this.state.loading) return;
    this.emit({ loading: true, error: null, message: "Cargando ingredientes reales…" });
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio no disponible.");
      if (!this.ctx) {
        this.ctx = new Ctor({ latencyHint: "interactive" });
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      const keys = [...new Set([...BASE_CELLS, ...LAYER_DEFINITIONS.flatMap((d) => d.cells)].map((c) => c.source))];
      await Promise.all(keys.map((key) => this.loadBuffer(key)));
      await this.ctx.resume();
      this.emit({ ready: true, loading: false, message: "Ingredientes listos. START inicia solo BASE." });
    } catch (error) {
      this.emit({ loading: false, error: error instanceof Error ? error.message : "No se pudo cargar el Layer Builder." });
    }
  }

  private async loadBuffer(key: SourceKey) {
    if (this.buffers.has(key)) return;
    const spec = SOURCES[key];
    const response = await fetch(`/api/stem?path=${encodeURIComponent(spec.path)}`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`No se pudo cargar ${key} (${response.status}).`);
    const bytes = await response.arrayBuffer();
    if (!this.ctx) throw new Error("AudioContext no inicializado.");
    const buffer = await this.ctx.decodeAudioData(bytes);
    this.buffers.set(key, buffer);
  }

  async start() {
    await this.prepare();
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.state.ready || this.state.running) return;
    await ctx.resume();
    this.stopScheduledOnly();
    this.stopAllSources();
    this.state = { ...this.state, running: true, bar: 1, beat: 1, phase: 0, layers: blankLayers(), error: null };
    this.startAt = ctx.currentTime + 0.18;
    const drum = this.startLoop(BASE_CELLS[0]!, this.startAt);
    const bass = this.startLoop(BASE_CELLS[1]!, this.startAt);
    this.loops.set("BASE_DRUMS", [drum]);
    this.loops.set("BASE_BASS", [bass]);
    this.startClock();
    this.emit({ message: "BASE está solo. Arma una capa cuando quieras; el motor esperará su entrada correcta." });
  }

  stop() {
    this.stopScheduledOnly();
    this.stopAllSources();
    if (this.clockTimer != null) window.clearInterval(this.clockTimer);
    this.clockTimer = null;
    this.state = { ...this.state, running: false, layers: blankLayers(), bar: 1, beat: 1, phase: 0 };
    this.emit({ message: "Stopped." });
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  toggle(id: LayerId) {
    if (!this.state.running || !this.ctx) return;
    const def = LAYER_DEFINITIONS.find((d) => d.id === id)!;
    const runtime = this.state.layers[id];
    if (runtime.status === "ARMED" || runtime.status === "DISARMING" || runtime.status === "BUILDING") return;
    if (def.kind === "build") {
      if (runtime.status === "OFF") this.armBuild(def);
      return;
    }
    if (runtime.status === "OFF") this.armOn(def);
    else if (runtime.status === "ON") this.armOff(def);
  }

  private armOn(def: LayerDefinition) {
    const targetBar = this.nextBoundary(def.quantizeBars);
    const when = this.timeForBar(targetBar);
    this.patchLayer(def.id, { status: "ARMED", targetBar: targetBar + 1 });
    this.emit({ message: `${def.label} ARMED · entra en BAR ${targetBar + 1}.` });
    this.activateAt(def, when);
    this.at(when, () => {
      if (!this.state.running) return;
      this.patchLayer(def.id, { status: "ON", targetBar: null });
      this.emit({ message: `${def.label} entró exactamente en el 1 de BAR ${targetBar + 1}.` });
    });
  }

  private activateAt(def: LayerDefinition, when: number) {
    if (def.kind === "replace-drums") {
      this.fadeHandles(this.loops.get("BASE_DRUMS"), 0, when, 0.12);
    }
    const handles = def.cells.map((cell) => this.startLoop(cell, when));
    this.loops.set(def.id, handles);
  }

  private armOff(def: LayerDefinition) {
    const ctx = this.ctx!;
    const targetBar = this.nextBoundary(def.quantizeBars);
    const when = this.timeForBar(targetBar);
    this.patchLayer(def.id, { status: "DISARMING", targetBar: targetBar + 1 });
    this.emit({ message: `${def.label} EXIT ARMED · sale en BAR ${targetBar + 1}.` });
    const handles = this.loops.get(def.id);
    this.fadeHandles(handles, 0, when, 0.12, true);
    if (def.kind === "replace-drums") {
      this.fadeHandles(this.loops.get("BASE_DRUMS"), BASE_CELLS[0]!.gain, when, 0.12);
    }
    this.at(when + 0.14, () => {
      if (!this.state.running) return;
      this.loops.delete(def.id);
      this.patchLayer(def.id, { status: "OFF", targetBar: null });
      this.emit({ message: `${def.label} salió cuantizado; el resto sigue intacto.` });
    });
    void ctx;
  }

  private armBuild(def: LayerDefinition) {
    const targetBar = this.nextBoundary(def.quantizeBars);
    const when = this.timeForBar(targetBar);
    const end = when + 4 * BAR_SECONDS;
    this.patchLayer("BUILD", { status: "ARMED", targetBar: targetBar + 1 });
    this.emit({ message: `BUILD ARMED · esperará BAR ${targetBar + 1}; no entra atravesado.` });

    // The build is a finite, user-requested transition. It ducks the current drums,
    // plays four real bars, then lands on a stronger persistent state.
    this.fadeHandles(this.currentDrumHandles(), 0.22, when, 0.14);
    const oneShots = def.cells.map((cell) => this.startOneShot(cell, when));

    this.at(when, () => {
      if (!this.state.running) return;
      this.patchLayer("BUILD", { status: "BUILDING", targetBar: targetBar + 5 });
      this.emit({ message: "BUILDING · 4 compases. El DROP está comprometido; no depende del reloj solo." });
    });

    this.at(end, () => {
      if (!this.state.running) return;
      oneShots.forEach((h) => { try { h.source.stop(); } catch { /* ended */ } });
      this.patchLayer("BUILD", { status: "OFF", targetBar: null });
      this.forceDropFlavor(end);
      this.emit({ message: `DROP · CLUB + HOOK entraron juntos en BAR ${targetBar + 5}.` });
    });
  }

  private forceDropFlavor(when: number) {
    const club = LAYER_DEFINITIONS.find((d) => d.id === "CLUB")!;
    const hook = LAYER_DEFINITIONS.find((d) => d.id === "HOOK")!;

    if (this.state.layers.CLUB.status !== "ON") {
      this.fadeHandles(this.loops.get("BASE_DRUMS"), 0, when, 0.08);
      const handles = club.cells.map((cell) => this.startLoop(cell, when));
      this.loops.set("CLUB", handles);
      this.patchLayer("CLUB", { status: "ON", targetBar: null });
    } else {
      this.fadeHandles(this.loops.get("CLUB"), club.cells[0]!.gain, when, 0.08);
    }

    if (this.state.layers.HOOK.status !== "ON") {
      const handles = hook.cells.map((cell) => this.startLoop(cell, when));
      this.loops.set("HOOK", handles);
      this.patchLayer("HOOK", { status: "ON", targetBar: null });
    }
  }

  private currentDrumHandles() {
    return this.state.layers.CLUB.status === "ON" ? this.loops.get("CLUB") : this.loops.get("BASE_DRUMS");
  }

  private startLoop(cell: CellSpec, when: number): LoopHandle {
    const ctx = this.ctx!;
    const spec = SOURCES[cell.source];
    const buffer = this.buffers.get(cell.source)!;
    const sourceBar = (60 / spec.bpm) * 4;
    const offset = spec.beatOffset + cell.bar * sourceBar;
    const loopEnd = Math.min(buffer.duration - 0.02, offset + cell.bars * sourceBar);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(TARGET_BPM / spec.bpm, when);
    source.loop = true;
    source.loopStart = offset;
    source.loopEnd = loopEnd;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, Math.max(ctx.currentTime, when - 0.02));
    gain.gain.linearRampToValueAtTime(cell.gain, when + 0.08);
    source.connect(gain).connect(this.master!);
    source.start(when, offset);
    return { source, gain, targetGain: cell.gain };
  }

  private startOneShot(cell: CellSpec, when: number): LoopHandle {
    const ctx = this.ctx!;
    const spec = SOURCES[cell.source];
    const buffer = this.buffers.get(cell.source)!;
    const sourceBar = (60 / spec.bpm) * 4;
    const offset = spec.beatOffset + cell.bar * sourceBar;
    const sourceDuration = Math.min(cell.bars * sourceBar, Math.max(0.1, buffer.duration - offset - 0.02));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(TARGET_BPM / spec.bpm, when);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, Math.max(ctx.currentTime, when - 0.02));
    gain.gain.linearRampToValueAtTime(cell.gain, when + 0.05);
    gain.gain.setValueAtTime(cell.gain, when + 3.6 * BAR_SECONDS);
    gain.gain.linearRampToValueAtTime(0.0001, when + 4 * BAR_SECONDS);
    source.connect(gain).connect(this.master!);
    source.start(when, offset, sourceDuration);
    return { source, gain, targetGain: cell.gain };
  }

  private fadeHandles(handles: LoopHandle[] | undefined, target: number, when: number, duration: number, stop = false) {
    if (!handles) return;
    handles.forEach((handle) => {
      const gain = handle.gain.gain;
      gain.cancelScheduledValues(when);
      gain.setValueAtTime(Math.max(0.0001, gain.value), when);
      gain.linearRampToValueAtTime(Math.max(0.0001, target), when + duration);
      if (stop) {
        try { handle.source.stop(when + duration + 0.02); } catch { /* already ended */ }
      }
    });
  }

  private nextBoundary(quantizeBars: 1 | 4 | 8) {
    if (!this.ctx) return 0;
    const bars = Math.max(0, (this.ctx.currentTime - this.startAt) / BAR_SECONDS);
    return Math.floor(bars / quantizeBars + 1) * quantizeBars;
  }

  private timeForBar(barIndex: number) {
    return this.startAt + barIndex * BAR_SECONDS;
  }

  private at(when: number, fn: () => void) {
    const delay = Math.max(0, (when - (this.ctx?.currentTime ?? when)) * 1000);
    const id = window.setTimeout(() => {
      this.pendingTimers.delete(id);
      fn();
    }, delay);
    this.pendingTimers.add(id);
  }

  private startClock() {
    if (this.clockTimer != null) window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => {
      if (!this.ctx || !this.state.running) return;
      const elapsed = Math.max(0, this.ctx.currentTime - this.startAt);
      const bars = elapsed / BAR_SECONDS;
      const barIndex = Math.floor(bars);
      const barFrac = bars - barIndex;
      const beatFloat = barFrac * 4;
      const beat = Math.min(4, Math.floor(beatFloat) + 1);
      const phase = beatFloat - Math.floor(beatFloat);
      this.emit({ bar: barIndex + 1, beat, phase });
    }, 50);
  }

  private stopScheduledOnly() {
    this.pendingTimers.forEach((id) => window.clearTimeout(id));
    this.pendingTimers.clear();
  }

  private stopAllSources() {
    for (const handles of this.loops.values()) {
      handles.forEach((handle) => {
        try { handle.source.stop(); } catch { /* already stopped */ }
      });
    }
    this.loops.clear();
  }
}
