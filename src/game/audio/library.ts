export type StemRole = "drums" | "bass" | "other" | "vocals";
export type SceneId = "foundation" | "tension" | "drop";

export type SceneSpec = {
  id: SceneId;
  label: string;
  sourcePhrase: number;
  gains: Partial<Record<StemRole, number>>;
};

export type Track = {
  id: string;
  title: string;
  no: string;
  bpm: number;
  beatOffset: number;
  duration: number;
  color: string;
  blurb: string;
  stems: Partial<Record<StemRole, string>>;
  stemCount: number;
  scenes: Record<SceneId, SceneSpec>;
};

const cleanBase = (value: string) => value.replace(/\/$/, "");
const appBase = cleanBase(import.meta.env.BASE_URL || "");

export const REMOTE_STEMS_CONFIGURED = true;
export const STEMS_BASE = `${appBase}/api/stem`;
const stem = (path: string) => `${STEMS_BASE}?path=${encodeURIComponent(`stems/${path}`)}`;

export const TRACKS: Track[] = [
  {
    id: "cafe-du-midi-your-house",
    title: "Café Du MIDI — Your House · A/B CAUSAL",
    no: "AB",
    bpm: 122,
    // External audit measured the MP3 encoder delay at ~23.8 ms. Correcting
    // the previous 0.1295 value keeps the downbeat closer to the actual transient.
    beatOffset: 0.1057,
    duration: 240.17,
    color: "#72817b",
    blurb: "Prueba mínima de 3 escenas. El stem OTHER se mantiene fuera para aislar el drone 258/522 Hz.",
    stems: {
      drums: stem("cafe-du-midi-your-house/drums.mp3"),
      bass: stem("cafe-du-midi-your-house/bass.mp3"),
      vocals: stem("cafe-du-midi-your-house/vocals.mp3"),
    },
    stemCount: 3,
    scenes: {
      foundation: { id: "foundation", label: "FOUNDATION", sourcePhrase: 0, gains: { drums: 0.72 } },
      tension: { id: "tension", label: "TENSION", sourcePhrase: 4, gains: { drums: 0.82, bass: 0.66 } },
      drop: { id: "drop", label: "DROP", sourcePhrase: 12, gains: { drums: 0.90, bass: 0.76, vocals: 0.50 } },
    },
  },
];

export function trackById(id: string) { return TRACKS.find((t) => t.id === id) ?? TRACKS[0]!; }
export function hasStem(track: Track, role: StemRole) { return Boolean(track.stems[role]); }
