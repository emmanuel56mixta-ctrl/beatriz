export type LabStage = "BASE" | "ROW1" | "ROW2" | "ROW3" | "BUILD" | "TRIPLE" | "TETRIS";
export type RowRecipe = "I" | "T";

type StemKey = "cityDrums" | "cityBass" | "cityOther" | "cityVocals" | "matrodaDrums" | "zeleoDrums";

type SourceSpec = {
  path: string;
  bpm: number;
  beatOffset: number;
};

type LayerCell = {
  key: StemKey;
  bar: number;
  gain: number;
};

type Scene = {
  name: string;
  bars: number;
  layers: LayerCell[];
};

export type LabEngineState = {
  ready: boolean;
  loading: boolean;
  running: boolean;
  stage: LabStage;
  recipe: RowRecipe;
  scene: string;
  error: string | null;
  activeLayers: string[];
};

const TARGET_BPM = 124;
const BAR_SECONDS = (60 / TARGET_BPM) * 4;

const SOURCES: Record<StemKey, SourceSpec> = {
  cityDrums: { path: "stems/city-of-dreams-alt-control-millero/drums.mp3", bpm: 124, beatOffset: 0.021 },
  cityBass: { path: "stems/city-of-dreams-alt-control-millero/bass.mp3", bpm: 124, beatOffset: 0.021 },
  cityOther: { path: "stems/city-of-dreams-alt-control-millero/other.mp3", bpm: 124, beatOffset: 0.021 },
  cityVocals: { path: "stems/city-of-dreams-alt-control-millero/vocals.mp3", bpm: 124, beatOffset: 0.021 },
  matrodaDrums: { path: "stems/bullshit-matroda-klp/drums.mp3", bpm: 130, beatOffset: 0.0246 },
  zeleoDrums: { path: "stems/zeleo-i-just-want-to-live/drums.mp3", bpm: 125, beatOffset: 0.1344 },
};

const L = (key: StemKey, bar: number, gain: number): LayerCell => ({ key, bar, gain });

const BUILD_SCENE: Scene = {
  name: "BUILD · real roll candidate → CLUB",
  bars: 4,
  layers: [L("matrodaDrums", 56, 0.86), L("cityOther", 80, 0.32)],
};

function scenes(stage: LabStage, recipe: RowRecipe): Scene[] {
  const straight = recipe === "I";
  switch (stage) {
    case "BASE":
      return [
        { name: "BASE A · rhythm cell", bars: 8, layers: [L("cityDrums", 32, 0.66), L("cityBass", 32, 0.34)] },
        { name: "BASE A′ · alternate rhythm cell", bars: 8, layers: [L("cityDrums", 40, 0.64), L("cityBass", 40, 0.35)] },
      ];
    case "ROW1":
      return straight
        ? [
            { name: "ROW1 I · chord cell A", bars: 8, layers: [L("cityDrums", 40, 0.68), L("cityBass", 40, 0.40), L("cityOther", 40, 0.28)] },
            { name: "ROW1 I · chord cell A′", bars: 8, layers: [L("cityDrums", 48, 0.68), L("cityBass", 48, 0.41), L("cityOther", 48, 0.30)] },
          ]
        : [
            { name: "ROW1 T · syncopated cell A", bars: 8, layers: [L("cityDrums", 40, 0.68), L("cityBass", 40, 0.40), L("cityOther", 80, 0.31)] },
            { name: "ROW1 T · syncopated cell A′", bars: 8, layers: [L("cityDrums", 48, 0.68), L("cityBass", 48, 0.41), L("cityOther", 88, 0.32)] },
          ];
    case "ROW2":
      return straight
        ? [
            { name: "ROW2 I · progression B", bars: 8, layers: [L("cityDrums", 48, 0.71), L("cityBass", 48, 0.44), L("cityOther", 64, 0.35)] },
            { name: "ROW2 I · progression B′", bars: 8, layers: [L("cityDrums", 64, 0.71), L("cityBass", 64, 0.45), L("cityOther", 72, 0.36)] },
          ]
        : [
            { name: "ROW2 T · progression response", bars: 8, layers: [L("cityDrums", 48, 0.71), L("cityBass", 48, 0.44), L("cityOther", 88, 0.37)] },
            { name: "ROW2 T · progression answer", bars: 8, layers: [L("cityDrums", 64, 0.71), L("cityBass", 64, 0.45), L("cityOther", 96, 0.38)] },
          ];
    case "ROW3":
      return straight
        ? [
            { name: "ROW3 I · motif enters", bars: 8, layers: [L("cityDrums", 64, 0.72), L("cityBass", 64, 0.46), L("cityOther", 72, 0.39), L("cityVocals", 48, 0.13)] },
            { name: "ROW3 I · motif response", bars: 8, layers: [L("cityDrums", 72, 0.72), L("cityBass", 72, 0.47), L("cityOther", 80, 0.40), L("cityVocals", 56, 0.15)] },
          ]
        : [
            { name: "ROW3 T · chopped motif enters", bars: 8, layers: [L("cityDrums", 64, 0.72), L("cityBass", 64, 0.46), L("cityOther", 88, 0.40), L("cityVocals", 48, 0.15)] },
            { name: "ROW3 T · chopped motif response", bars: 8, layers: [L("cityDrums", 72, 0.72), L("cityBass", 72, 0.47), L("cityOther", 96, 0.41), L("cityVocals", 64, 0.16)] },
          ];
    case "BUILD":
      return [BUILD_SCENE];
    case "TRIPLE":
      return straight
        ? [
            { name: "TRIPLE · CLUB KIT / City harmony", bars: 8, layers: [L("matrodaDrums", 32, 0.78), L("cityBass", 72, 0.48), L("cityOther", 80, 0.41), L("cityVocals", 56, 0.13)] },
            { name: "TRIPLE · CLUB KIT B", bars: 8, layers: [L("matrodaDrums", 64, 0.79), L("cityBass", 80, 0.49), L("cityOther", 88, 0.42), L("cityVocals", 64, 0.14)] },
          ]
        : [
            { name: "TRIPLE T · CLUB KIT / syncopated harmony", bars: 8, layers: [L("matrodaDrums", 32, 0.78), L("cityBass", 72, 0.48), L("cityOther", 96, 0.43), L("cityVocals", 56, 0.14)] },
            { name: "TRIPLE T · CLUB KIT B", bars: 8, layers: [L("matrodaDrums", 64, 0.79), L("cityBass", 80, 0.49), L("cityOther", 88, 0.43), L("cityVocals", 64, 0.15)] },
          ];
    case "TETRIS":
      return straight
        ? [
            { name: "TETRIS · PEAK KIT / vocal A", bars: 8, layers: [L("zeleoDrums", 56, 0.80), L("cityBass", 80, 0.50), L("cityOther", 96, 0.44), L("cityVocals", 48, 0.34)] },
            { name: "TETRIS · PEAK KIT / vocal B", bars: 8, layers: [L("zeleoDrums", 64, 0.81), L("cityBass", 88, 0.51), L("cityOther", 88, 0.45), L("cityVocals", 56, 0.35)] },
          ]
        : [
            { name: "TETRIS T · PEAK KIT / vocal A", bars: 8, layers: [L("zeleoDrums", 56, 0.80), L("cityBass", 80, 0.50), L("cityOther", 88, 0.45), L("cityVocals", 48, 0.35)] },
            { name: "TETRIS T · PEAK KIT / vocal B", bars: 8, layers: [L("zeleoDrums", 64, 0.81), L("cityBass", 88, 0.51), L("cityOther", 96, 0.46), L("cityVocals", 64, 0.36)] },
          ];
  }
}

const TETRIS_BREAK: Scene = {
  name: "TETRIS · one-bar air",
  bars: 1,
  layers: [L("cityOther", 96, 0.22), L("cityVocals", 48, 0.24)],
};

export class MusicalCellsEngine {
  private decks = new Map<StemKey, [HTMLAudioElement, HTMLAudioElement]>();
  private active = new Map<StemKey, 0 | 1>();
  private fades = new Map<HTMLAudioElement, number>();
  private timer: number | null = null;
  private transitionId = 0;
  private sceneCursor = 0;
  private masterVolume = 0.82;
  private onState: (state: LabEngineState) => void;

  state: LabEngineState = {
    ready: false,
    loading: false,
    running: false,
    stage: "BASE",
    recipe: "I",
    scene: "Not started",
    error: null,
    activeLayers: [],
  };

  constructor(onState: (state: LabEngineState) => void) {
    this.onState = onState;
    (Object.keys(SOURCES) as StemKey[]).forEach((key) => {
      const spec = SOURCES[key];
      const pair: [HTMLAudioElement, HTMLAudioElement] = [this.makeAudio(spec), this.makeAudio(spec)];
      this.decks.set(key, pair);
      this.active.set(key, 0);
    });
  }

  private makeAudio(spec: SourceSpec) {
    const audio = new Audio(`/api/stem?path=${encodeURIComponent(spec.path)}`);
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";
    audio.setAttribute("playsinline", "");
    const media = audio as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    media.preservesPitch = true;
    media.webkitPreservesPitch = true;
    audio.volume = 0;
    return audio;
  }

  private emit(patch?: Partial<LabEngineState>) {
    if (patch) this.state = { ...this.state, ...patch };
    this.onState({ ...this.state });
  }

  async prepare() {
    if (this.state.loading || this.state.ready) return;
    this.emit({ loading: true, error: null });
    try {
      await Promise.all([...this.decks.values()].flat().map((audio) => this.waitMetadata(audio)));
      this.emit({ loading: false, ready: true });
    } catch (error) {
      this.emit({ loading: false, error: error instanceof Error ? error.message : "No se pudieron cargar las células." });
    }
  }

  async start() {
    await this.prepare();
    if (!this.state.ready) return;
    this.emit({ running: true, stage: "BASE", scene: "Starting BASE" });
    this.sceneCursor = 0;
    await this.playStageScene();
  }

  stop() {
    this.transitionId += 1;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const pair of this.decks.values()) {
      for (const audio of pair) {
        this.cancelFade(audio);
        audio.pause();
        audio.volume = 0;
      }
    }
    this.emit({ running: false, scene: "Stopped", activeLayers: [] });
  }

  setVolume(value: number) {
    this.masterVolume = Math.max(0, Math.min(1, value));
  }

  async setRecipe(recipe: RowRecipe) {
    if (this.state.recipe === recipe) return;
    this.emit({ recipe });
    if (this.state.running && this.state.stage !== "BASE" && this.state.stage !== "BUILD") {
      this.sceneCursor = 0;
      await this.playStageScene();
    }
  }

  async setStage(stage: LabStage) {
    if (!this.state.running) return;
    this.emit({ stage });
    this.sceneCursor = 0;
    if (stage === "BUILD") {
      await this.playScene(BUILD_SCENE, "TRIPLE");
      return;
    }
    if (stage === "TETRIS") {
      await this.playScene(TETRIS_BREAK);
      return;
    }
    await this.playStageScene();
  }

  private async playStageScene() {
    const list = scenes(this.state.stage, this.state.recipe);
    const scene = list[this.sceneCursor % list.length]!;
    this.sceneCursor = (this.sceneCursor + 1) % list.length;
    await this.playScene(scene);
  }

  private async playScene(scene: Scene, nextStage?: LabStage) {
    const id = ++this.transitionId;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;

    const nextKeys = new Set(scene.layers.map((layer) => layer.key));
    const activeLayers = scene.layers.map((layer) => `${layer.key} · bar ${layer.bar}`);
    this.emit({ scene: scene.name, activeLayers, error: null });

    await Promise.all(scene.layers.map((layer) => this.startLayer(layer, id)));
    if (id !== this.transitionId) return;

    for (const key of SOURCES_KEYS) {
      if (!nextKeys.has(key)) this.fadeOutKey(key, 150);
    }

    const durationMs = scene.bars * BAR_SECONDS * 1000;
    const nextDelay = Math.max(250, durationMs - 180);
    this.timer = window.setTimeout(() => {
      if (id !== this.transitionId || !this.state.running) return;
      if (nextStage) {
        this.emit({ stage: nextStage });
        this.sceneCursor = 0;
      }
      void this.playStageScene();
    }, nextDelay);
  }

  private async startLayer(layer: LayerCell, transition: number) {
    const spec = SOURCES[layer.key];
    const pair = this.decks.get(layer.key)!;
    const currentIndex = this.active.get(layer.key) ?? 0;
    const nextIndex = currentIndex === 0 ? 1 : 0;
    const current = pair[currentIndex];
    const next = pair[nextIndex];

    await this.waitMetadata(next);
    if (transition !== this.transitionId) return;

    const sourceBarSeconds = (60 / spec.bpm) * 4;
    const sourceTime = spec.beatOffset + layer.bar * sourceBarSeconds;
    next.playbackRate = TARGET_BPM / spec.bpm;
    next.volume = 0;
    try { next.currentTime = sourceTime; } catch { /* metadata race */ }

    try {
      await next.play();
    } catch {
      this.emit({ error: `El navegador bloqueó ${layer.key}. Pulsa START AUDIO otra vez.` });
      return;
    }
    if (transition !== this.transitionId) {
      next.pause();
      return;
    }

    this.active.set(layer.key, nextIndex);
    this.fade(next, layer.gain * this.masterVolume, 150);
    this.fade(current, 0, 150, true);
  }

  private fadeOutKey(key: StemKey, ms: number) {
    const pair = this.decks.get(key)!;
    pair.forEach((audio) => this.fade(audio, 0, ms, true));
  }

  private fade(audio: HTMLAudioElement, target: number, ms: number, pauseAtEnd = false) {
    this.cancelFade(audio);
    const start = audio.volume;
    const targetClamped = Math.max(0, Math.min(1, target));
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / Math.max(1, ms));
      audio.volume = start + (targetClamped - start) * p;
      if (p < 1) {
        const frame = requestAnimationFrame(tick);
        this.fades.set(audio, frame);
      } else {
        this.fades.delete(audio);
        if (pauseAtEnd && targetClamped === 0) audio.pause();
      }
    };
    const frame = requestAnimationFrame(tick);
    this.fades.set(audio, frame);
  }

  private cancelFade(audio: HTMLAudioElement) {
    const frame = this.fades.get(audio);
    if (frame != null) cancelAnimationFrame(frame);
    this.fades.delete(audio);
  }

  private waitMetadata(audio: HTMLAudioElement) {
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("No se pudieron leer los stems privados.")); };
      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", done);
        audio.removeEventListener("error", fail);
      };
      audio.addEventListener("loadedmetadata", done, { once: true });
      audio.addEventListener("error", fail, { once: true });
      audio.load();
    });
  }

  dispose() {
    this.stop();
    this.decks.clear();
  }
}

const SOURCES_KEYS = Object.keys(SOURCES) as StemKey[];
