export type ExternalSetId = "TRANCE_DRIVE" | "ELECTRO_POP" | "MINIMAL_TECHNO" | "DARK_ELECTRONIC";
export type ExternalRole = "KICK" | "SNARE" | "HATS" | "PERC" | "BASS" | "MUSIC" | "VOCAL" | "FX";

export type ExternalSetSource = {
  id: string;
  artist: string;
  title: string;
  support?: boolean;
};

export type ExternalSetDefinition = {
  id: ExternalSetId;
  label: string;
  genre: string;
  sources: ExternalSetSource[];
};

export const EXTERNAL_ROLES: { id: ExternalRole; label: string; q: 1 | 4 | 8 }[] = [
  { id: "KICK", label: "KICK", q: 1 },
  { id: "SNARE", label: "SNARE / CLAP", q: 1 },
  { id: "HATS", label: "HATS / CYMBALS", q: 1 },
  { id: "PERC", label: "PERC / DRUM LOOPS", q: 1 },
  { id: "BASS", label: "BASS", q: 4 },
  { id: "MUSIC", label: "SYNTH / MUSIC", q: 4 },
  { id: "VOCAL", label: "VOCAL", q: 8 },
  { id: "FX", label: "SOURCE FX", q: 1 },
];

export const EXTERNAL_SETS: ExternalSetDefinition[] = [
  {
    id: "TRANCE_DRIVE",
    label: "TRANCE DRIVE",
    genre: "Progressive Trance",
    sources: [
      { id: "apzx_transcention", artist: "APZX", title: "Transcention" },
      { id: "cfx_mathematician", artist: "c:fx", title: "Mathematician", support: true },
    ],
  },
  {
    id: "ELECTRO_POP",
    label: "ELECTRO POP",
    genre: "Electronic Dance Pop",
    sources: [
      { id: "amcontra_heart", artist: "AM Contra", title: "Heart Peripheral" },
    ],
  },
  {
    id: "MINIMAL_TECHNO",
    label: "MINIMAL TECHNO",
    genre: "Minimal / Techno",
    sources: [
      { id: "albert_ubiquitous", artist: "Albert Kader", title: "Ubiquitous" },
      { id: "albert_whiptails", artist: "Albert Kader", title: "Whiptails", support: true },
    ],
  },
  {
    id: "DARK_ELECTRONIC",
    label: "DARK ELECTRONIC",
    genre: "Electronic",
    sources: [
      { id: "cryonic_excessive", artist: "cryonicPAX", title: "Excessive" },
      { id: "cryonic_holdme", artist: "cryonicPAX", title: "Hold Me", support: true },
    ],
  },
];

export const RHYTHM_ROLES = new Set<ExternalRole>(["KICK", "SNARE", "HATS", "PERC", "FX"]);

export function externalSet(id: ExternalSetId) {
  return EXTERNAL_SETS.find((set) => set.id === id)!;
}
