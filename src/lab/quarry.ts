export type QuarryCategory = "DRUMS" | "BASS" | "MUSIC" | "VOCALS" | "BUILD";

type SourceSpec = {
  path: string;
  bpm: number;
  beatOffset: number;
};

export type CandidateLayer = {
  source: keyof typeof SOURCES;
  bar: number;
  gain: number;
};

export type CellCandidate = {
  id: string;
  category: QuarryCategory;
  label: string;
  sourceLabel: string;
  bars: number;
  layers: CandidateLayer[];
  note: string;
  tonal: "safe" | "check" | "rhythm";
};

const TARGET_BPM = 124;
const BAR_SECONDS = (60 / TARGET_BPM) * 4;

const SOURCES = {
  cityDrums: { path: "stems/city-of-dreams-alt-control-millero/drums.mp3", bpm: 124, beatOffset: 0.021 },
  cityBass: { path: "stems/city-of-dreams-alt-control-millero/bass.mp3", bpm: 124, beatOffset: 0.021 },
  cityOther: { path: "stems/city-of-dreams-alt-control-millero/other.mp3", bpm: 124, beatOffset: 0.021 },
  cityVocals: { path: "stems/city-of-dreams-alt-control-millero/vocals.mp3", bpm: 124, beatOffset: 0.021 },
  matrodaDrums: { path: "stems/bullshit-matroda-klp/drums.mp3", bpm: 130, beatOffset: 0.0246 },
  matrodaBass: { path: "stems/bullshit-matroda-klp/bass.mp3", bpm: 130, beatOffset: 0.0246 },
  matrodaOther: { path: "stems/bullshit-matroda-klp/other.mp3", bpm: 130, beatOffset: 0.0246 },
  matrodaVocals: { path: "stems/bullshit-matroda-klp/vocals.mp3", bpm: 130, beatOffset: 0.0246 },
  zeleoDrums: { path: "stems/zeleo-i-just-want-to-live/drums.mp3", bpm: 125, beatOffset: 0.1344 },
  zeleoBass: { path: "stems/zeleo-i-just-want-to-live/bass.mp3", bpm: 125, beatOffset: 0.1344 },
  zeleoOther: { path: "stems/zeleo-i-just-want-to-live/other.mp3", bpm: 125, beatOffset: 0.1344 },
  zeleoVocals: { path: "stems/zeleo-i-just-want-to-live/vocals.mp3", bpm: 125, beatOffset: 0.1344 },
  cafeDrums: { path: "stems/cafe-du-midi-your-house/drums.mp3", bpm: 122, beatOffset: 0.1295 },
  cafeBass: { path: "stems/cafe-du-midi-your-house/bass.mp3", bpm: 122, beatOffset: 0.1295 },
  cafeOther: { path: "stems/cafe-du-midi-your-house/other.mp3", bpm: 122, beatOffset: 0.1295 },
  cafeVocals: { path: "stems/cafe-du-midi-your-house/vocals.mp3", bpm: 122, beatOffset: 0.1295 },
  fingersDrums: { path: "stems/20-fingers-putang-ina-mo/drums.mp3", bpm: 131, beatOffset: 0.3084 },
  fingersOther: { path: "stems/20-fingers-putang-ina-mo/other.mp3", bpm: 131, beatOffset: 0.3084 },
  fingersVocals: { path: "stems/20-fingers-putang-ina-mo/vocals.mp3", bpm: 131, beatOffset: 0.3084 },
  modjoOther: { path: "stems/modjo-lady-other/other.mp3", bpm: 126, beatOffset: 0.3841 },
} satisfies Record<string, SourceSpec>;

const C = (
  id: string,
  category: QuarryCategory,
  label: string,
  sourceLabel: string,
  bars: number,
  layers: CandidateLayer[],
  note: string,
  tonal: CellCandidate["tonal"],
): CellCandidate => ({ id, category, label, sourceLabel, bars, layers, note, tonal });

export const QUARRY_CANDIDATES: CellCandidate[] = [
  C("dr-city-32", "DRUMS", "City · Groove A", "City Of Dreams", 4, [{ source: "cityDrums", bar: 32, gain: 0.82 }], "124 BPM nativo; candidato BASE.", "rhythm"),
  C("dr-city-64", "DRUMS", "City · Groove B", "City Of Dreams", 4, [{ source: "cityDrums", bar: 64, gain: 0.82 }], "Otra zona del mismo drum stem.", "rhythm"),
  C("dr-matroda-32", "DRUMS", "MATRODA · Club A", "MATRODA / KLP", 4, [{ source: "matrodaDrums", bar: 32, gain: 0.86 }], "130 → 124; candidato cambio de capítulo.", "rhythm"),
  C("dr-matroda-64", "DRUMS", "MATRODA · Club B", "MATRODA / KLP", 4, [{ source: "matrodaDrums", bar: 64, gain: 0.86 }], "Segundo bloque para comparar cuerpo y groove.", "rhythm"),
  C("dr-zeleo-56", "DRUMS", "ZeLeo · Peak A", "ZeLeo", 4, [{ source: "zeleoDrums", bar: 56, gain: 0.86 }], "125 → 124; candidato PEAK.", "rhythm"),
  C("dr-zeleo-72", "DRUMS", "ZeLeo · Peak B", "ZeLeo", 4, [{ source: "zeleoDrums", bar: 72, gain: 0.86 }], "Otra zona para A/B.", "rhythm"),
  C("dr-cafe-40", "DRUMS", "Café · Warm", "Café Du MIDI", 4, [{ source: "cafeDrums", bar: 40, gain: 0.84 }], "122 → 124; opción más cálida.", "rhythm"),
  C("dr-fingers-32", "DRUMS", "20 Fingers · Raw", "20 Fingers", 4, [{ source: "fingersDrums", bar: 32, gain: 0.82 }], "131 → 124; úsalo solo si aporta carácter.", "rhythm"),

  C("ba-city-32", "BASS", "City · Bass A", "City Of Dreams", 4, [{ source: "cityBass", bar: 32, gain: 0.72 }], "Referencia tonal segura del Lab.", "safe"),
  C("ba-city-64", "BASS", "City · Bass B", "City Of Dreams", 4, [{ source: "cityBass", bar: 64, gain: 0.72 }], "Segunda célula del mismo mundo armónico.", "safe"),
  C("ba-city-80", "BASS", "City · Bass C", "City Of Dreams", 4, [{ source: "cityBass", bar: 80, gain: 0.72 }], "Candidato para sección avanzada.", "safe"),
  C("ba-cafe-48", "BASS", "Café · Bass", "Café Du MIDI", 4, [{ source: "cafeBass", bar: 48, gain: 0.70 }], "A/B externo: requiere verificar tonalidad con City.", "check"),
  C("ba-zeleo-48", "BASS", "ZeLeo · Bass", "ZeLeo", 4, [{ source: "zeleoBass", bar: 48, gain: 0.70 }], "No entra al arreglo hasta pasar prueba armónica.", "check"),
  C("ba-matroda-48", "BASS", "MATRODA · Bass", "MATRODA / KLP", 4, [{ source: "matrodaBass", bar: 48, gain: 0.70 }], "Solo cantera; comprobar pitch/centro antes de mezclar.", "check"),

  C("mu-city-40", "MUSIC", "City · Music A", "City Of Dreams", 4, [{ source: "cityOther", bar: 40, gain: 0.76 }], "Candidato CHORDS / ROW1.", "safe"),
  C("mu-city-64", "MUSIC", "City · Music B", "City Of Dreams", 4, [{ source: "cityOther", bar: 64, gain: 0.76 }], "Candidato RESPONSE / ROW2.", "safe"),
  C("mu-city-80", "MUSIC", "City · Music C", "City Of Dreams", 4, [{ source: "cityOther", bar: 80, gain: 0.76 }], "Candidato MOTIF / ROW3.", "safe"),
  C("mu-city-96", "MUSIC", "City · Music D", "City Of Dreams", 4, [{ source: "cityOther", bar: 96, gain: 0.76 }], "Candidato peak/hook dentro del mismo mundo.", "safe"),
  C("mu-cafe-48", "MUSIC", "Café · Other A", "Café Du MIDI", 4, [{ source: "cafeOther", bar: 48, gain: 0.74 }], "Puede aportar piano/synth/textura; aprobar armonía primero.", "check"),
  C("mu-cafe-72", "MUSIC", "Café · Other B", "Café Du MIDI", 4, [{ source: "cafeOther", bar: 72, gain: 0.74 }], "Segundo candidato externo.", "check"),
  C("mu-zeleo-64", "MUSIC", "ZeLeo · Other", "ZeLeo", 4, [{ source: "zeleoOther", bar: 64, gain: 0.74 }], "Buscar hook/textura reutilizable.", "check"),
  C("mu-matroda-64", "MUSIC", "MATRODA · Other", "MATRODA / KLP", 4, [{ source: "matrodaOther", bar: 64, gain: 0.74 }], "Buscar stab/fill/texture, no canción completa.", "check"),
  C("mu-modjo-40", "MUSIC", "Modjo · Other A", "Modjo", 4, [{ source: "modjoOther", bar: 40, gain: 0.72 }], "Cantera parcial; revisar tono y suciedad antes de usar.", "check"),

  C("vo-city-48", "VOCALS", "City · Vocal A", "City Of Dreams", 4, [{ source: "cityVocals", bar: 48, gain: 0.72 }], "Referencia: esta categoría ya demostró aportar carne.", "safe"),
  C("vo-city-64", "VOCALS", "City · Vocal B", "City Of Dreams", 4, [{ source: "cityVocals", bar: 64, gain: 0.72 }], "A/B dentro del universo principal.", "safe"),
  C("vo-zeleo-40", "VOCALS", "ZeLeo · Vocal A", "ZeLeo", 4, [{ source: "zeleoVocals", bar: 40, gain: 0.72 }], "Puede servir como reward/chop si aporta.", "check"),
  C("vo-zeleo-64", "VOCALS", "ZeLeo · Vocal B", "ZeLeo", 4, [{ source: "zeleoVocals", bar: 64, gain: 0.72 }], "Escuchar frase y compatibilidad tonal.", "check"),
  C("vo-cafe-48", "VOCALS", "Café · Vocal", "Café Du MIDI", 4, [{ source: "cafeVocals", bar: 48, gain: 0.72 }], "Candidato para respuesta vocal.", "check"),
  C("vo-fingers-32", "VOCALS", "20 Fingers · Vocal A", "20 Fingers", 4, [{ source: "fingersVocals", bar: 32, gain: 0.70 }], "Más agresivo; úsalo solo si mejora el set.", "check"),
  C("vo-fingers-56", "VOCALS", "20 Fingers · Vocal B", "20 Fingers", 4, [{ source: "fingersVocals", bar: 56, gain: 0.70 }], "Segundo recorte para A/B.", "check"),
  C("vo-matroda-48", "VOCALS", "MATRODA · Vocal", "MATRODA / KLP", 4, [{ source: "matrodaVocals", bar: 48, gain: 0.70 }], "Buscar hook/chop; no se incorpora sin aprobar oído.", "check"),

  C("bu-matroda-48", "BUILD", "Build candidate A", "MATRODA / KLP", 4, [{ source: "matrodaDrums", bar: 48, gain: 0.88 }, { source: "cityOther", bar: 72, gain: 0.34 }], "Buscar redoble/riser real. Si no crece, descartar.", "rhythm"),
  C("bu-matroda-56", "BUILD", "Build candidate B", "MATRODA / KLP", 4, [{ source: "matrodaDrums", bar: 56, gain: 0.88 }, { source: "cityOther", bar: 80, gain: 0.34 }], "Zona distinta para localizar una subida útil.", "rhythm"),
  C("bu-matroda-64", "BUILD", "Build candidate C", "MATRODA / KLP", 4, [{ source: "matrodaDrums", bar: 64, gain: 0.88 }, { source: "cityOther", bar: 88, gain: 0.34 }], "A/B/C: necesitamos un redoble que realmente anuncie el drop.", "rhythm"),
  C("bu-zeleo-48", "BUILD", "Build candidate D", "ZeLeo", 4, [{ source: "zeleoDrums", bar: 48, gain: 0.88 }, { source: "cityOther", bar: 72, gain: 0.34 }], "125 → 124; buscar crescendo y fills.", "rhythm"),
  C("bu-zeleo-64", "BUILD", "Build candidate E", "ZeLeo", 4, [{ source: "zeleoDrums", bar: 64, gain: 0.88 }, { source: "cityOther", bar: 80, gain: 0.34 }], "Otra posibilidad de transición.", "rhythm"),
  C("bu-fingers-48", "BUILD", "Build candidate F", "20 Fingers", 4, [{ source: "fingersDrums", bar: 48, gain: 0.84 }, { source: "cityOther", bar: 80, gain: 0.32 }], "131 → 124; solo conservar si el redoble aporta energía real.", "rhythm"),
];

export const QUARRY_CATEGORIES: QuarryCategory[] = ["DRUMS", "BASS", "MUSIC", "VOCALS", "BUILD"];

export type QuarryState = {
  playingId: string | null;
  error: string | null;
};

export class QuarryEngine {
  private active: HTMLAudioElement[] = [];
  private timer: number | null = null;
  private masterVolume = 0.86;
  private onState: (state: QuarryState) => void;
  state: QuarryState = { playingId: null, error: null };

  constructor(onState: (state: QuarryState) => void) {
    this.onState = onState;
  }

  setVolume(value: number) {
    this.masterVolume = Math.max(0, Math.min(1, value));
    this.active.forEach((audio) => {
      const gain = Number(audio.dataset.gain ?? "1");
      audio.volume = Math.min(1, gain * this.masterVolume);
    });
  }

  async audition(candidate: CellCandidate) {
    this.stop();
    this.emit({ playingId: candidate.id, error: null });
    try {
      const entries = candidate.layers.map((layer) => {
        const spec = SOURCES[layer.source];
        const audio = new Audio(`/api/stem?path=${encodeURIComponent(spec.path)}`);
        audio.preload = "metadata";
        audio.crossOrigin = "anonymous";
        audio.setAttribute("playsinline", "");
        audio.dataset.gain = String(layer.gain);
        audio.volume = Math.min(1, layer.gain * this.masterVolume);
        const media = audio as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
        media.preservesPitch = true;
        media.webkitPreservesPitch = true;
        return { audio, spec, layer };
      });

      await Promise.all(entries.map(({ audio }) => this.waitMetadata(audio)));
      for (const { audio, spec, layer } of entries) {
        const sourceBarSeconds = (60 / spec.bpm) * 4;
        audio.playbackRate = TARGET_BPM / spec.bpm;
        audio.currentTime = spec.beatOffset + layer.bar * sourceBarSeconds;
      }

      this.active = entries.map(({ audio }) => audio);
      await Promise.all(this.active.map((audio) => audio.play()));
      const duration = candidate.bars * BAR_SECONDS * 1000;
      this.timer = window.setTimeout(() => this.stop(), duration);
    } catch (error) {
      this.stop();
      this.emit({ error: error instanceof Error ? error.message : "No se pudo reproducir la célula." });
    }
  }

  stop() {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const audio of this.active) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.active = [];
    this.emit({ playingId: null });
  }

  private emit(patch: Partial<QuarryState>) {
    this.state = { ...this.state, ...patch };
    this.onState({ ...this.state });
  }

  private waitMetadata(audio: HTMLAudioElement) {
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("No se pudo leer el stem privado.")); };
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
  }
}
