export type ExternalSetId = "TRANCE_DRIVE" | "ELECTRO_POP" | "MINIMAL_TECHNO" | "DARK_ELECTRONIC";
export type ExternalRole = "KICK" | "SNARE" | "HATS" | "PERC" | "BASS" | "MUSIC" | "VOCAL" | "FX";

export type ExternalStemRef = {
  role: ExternalRole;
  file: string;
  label: string;
};

export type ExternalSetDefinition = {
  id: ExternalSetId;
  label: string;
  genre: string;
  bpm: number;
  key: string;
  stems: ExternalStemRef[];
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

// All four banks use stems from Software-Entwicklungskit's "Lithium":
// 124 BPM, G minor, CC0. Stems are individually streamable M4A files and all
// start at bar 1, so the banks can be mixed safely without ZIP extraction.
export const EXTERNAL_SETS: ExternalSetDefinition[] = [
  {
    id: "TRANCE_DRIVE",
    label: "HOUSE 124",
    genre: "House · G minor · CC0",
    bpm: 124,
    key: "G minor",
    stems: [
      { role: "KICK", file: "2.Lithium_Stem_KICK.m4a", label: "Kick" },
      { role: "HATS", file: "2.Lithium_Stem_HATS.m4a", label: "Hats" },
      { role: "PERC", file: "2.Lithium_Stem_HOUSE BEAT.m4a", label: "House Beat" },
      { role: "BASS", file: "2.Lithium_Stem_SY BASS.m4a", label: "Synth Bass" },
      { role: "MUSIC", file: "2.Lithium_Stem_MELODY PAD.m4a", label: "Melody Pad" },
      { role: "MUSIC", file: "2.Lithium_Stem_PLUCK.m4a", label: "Pluck" },
      { role: "VOCAL", file: "2.Lithium_Stem_VOX ECHO.m4a", label: "Vox Echo" },
      { role: "FX", file: "2.Lithium_Stem_ORGAN SWEEP EFFECT.m4a", label: "Organ Sweep" },
    ],
  },
  {
    id: "ELECTRO_POP",
    label: "DEEP 124",
    genre: "Deep / Atmospheric · G minor · CC0",
    bpm: 124,
    key: "G minor",
    stems: [
      { role: "KICK", file: "2.Lithium_Stem_KICK.m4a", label: "Kick" },
      { role: "HATS", file: "2.Lithium_Stem_ALT HH.m4a", label: "Alt Hats" },
      { role: "PERC", file: "2.Lithium_Stem_SLOW BEAT.m4a", label: "Slow Beat" },
      { role: "BASS", file: "2.Lithium_Stem_SY BASS.m4a", label: "Synth Bass" },
      { role: "MUSIC", file: "2.Lithium_Stem_ECHO PAD.m4a", label: "Echo Pad" },
      { role: "MUSIC", file: "2.Lithium_Stem_PAD INTRO.m4a", label: "Intro Pad" },
      { role: "VOCAL", file: "2.Lithium_Stem_BGVOX AAAAAHHHH.m4a", label: "Air Vox" },
      { role: "FX", file: "2.Lithium_Stem_CRASH FADE.m4a", label: "Crash Fade" },
    ],
  },
  {
    id: "MINIMAL_TECHNO",
    label: "CLUB 124",
    genre: "Club / Electro · G minor · CC0",
    bpm: 124,
    key: "G minor",
    stems: [
      { role: "KICK", file: "2.Lithium_Stem_KICK.m4a", label: "Kick" },
      { role: "SNARE", file: "2.Lithium_Stem_SNARE BUILD.m4a", label: "Snare Build" },
      { role: "HATS", file: "2.Lithium_Stem_GLITCH HH.m4a", label: "Glitch Hats" },
      { role: "PERC", file: "2.Lithium_Stem_OFF KICK.m4a", label: "Off Kick" },
      { role: "BASS", file: "2.Lithium_Stem_SY BASS.m4a", label: "Synth Bass" },
      { role: "MUSIC", file: "2.Lithium_Stem_ARP DIST.m4a", label: "Dist Arp" },
      { role: "MUSIC", file: "2.Lithium_Stem_MINILOGUE_SYNTH.m4a", label: "Minilogue" },
      { role: "VOCAL", file: "2.Lithium_Stem_VOX LEAD.m4a", label: "Lead Vox" },
      { role: "FX", file: "2.Lithium_Stem_EDM BUILD.m4a", label: "EDM Build" },
    ],
  },
  {
    id: "DARK_ELECTRONIC",
    label: "PEAK 124",
    genre: "Peak / Glitch · G minor · CC0",
    bpm: 124,
    key: "G minor",
    stems: [
      { role: "KICK", file: "2.Lithium_Stem_KICK.m4a", label: "Kick" },
      { role: "SNARE", file: "2.Lithium_Stem_SNARE BUILD.m4a", label: "Snare Build" },
      { role: "HATS", file: "2.Lithium_Stem_HAT FILL.m4a", label: "Hat Fill" },
      { role: "PERC", file: "2.Lithium_Stem_BREAK BEAT.m4a", label: "Break Beat" },
      { role: "BASS", file: "2.Lithium_Stem_SY BASS.m4a", label: "Synth Bass" },
      { role: "MUSIC", file: "2.Lithium_Stem_MINILOGUE_SYNTH.m4a", label: "Minilogue" },
      { role: "MUSIC", file: "2.Lithium_Stem_ARP DIST.m4a", label: "Dist Arp" },
      { role: "VOCAL", file: "2.Lithium_Stem_BGVOX MAIN.m4a", label: "Main BG Vox" },
      { role: "FX", file: "2.Lithium_Stem_EDM BUILD.m4a", label: "EDM Build" },
      { role: "FX", file: "2.Lithium_Stem_CRASH INTRO.m4a", label: "Crash" },
    ],
  },
];

export function externalSet(id: ExternalSetId) {
  return EXTERNAL_SETS.find((set) => set.id === id)!;
}
