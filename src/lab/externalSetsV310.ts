export type ExternalSetId = "TRANCE_DRIVE" | "ELECTRO_POP" | "MINIMAL_TECHNO" | "DARK_ELECTRONIC";
export type ExternalRole = "KICK" | "SNARE" | "HATS" | "PERC" | "BASS" | "MUSIC" | "VOCAL" | "FX";
export type ExternalTrackId = "lithium" | "caesium" | "francium" | "hydrogen";

export type ExternalStemRef = {
  role: ExternalRole;
  track: ExternalTrackId;
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

// Four genuinely different CC0 songs from Software-Entwicklungskit's
// "Everything is Free". Every stem in a set comes from the same song, so
// tempo changes transpose the whole set together and never create internal
// harmonic clashes.
export const EXTERNAL_SETS: ExternalSetDefinition[] = [
  {
    id: "TRANCE_DRIVE",
    label: "HOUSE 124",
    genre: "House / Electro · CC0",
    bpm: 124,
    key: "G minor",
    stems: [
      { role: "KICK", track: "lithium", file: "2.Lithium_Stem_KICK.m4a", label: "Kick" },
      { role: "HATS", track: "lithium", file: "2.Lithium_Stem_HATS.m4a", label: "Hats" },
      { role: "PERC", track: "lithium", file: "2.Lithium_Stem_HOUSE BEAT.m4a", label: "House Beat" },
      { role: "BASS", track: "lithium", file: "2.Lithium_Stem_SY BASS.m4a", label: "Synth Bass" },
      { role: "MUSIC", track: "lithium", file: "2.Lithium_Stem_MELODY PAD.m4a", label: "Melody Pad" },
      { role: "MUSIC", track: "lithium", file: "2.Lithium_Stem_PLUCK.m4a", label: "Pluck" },
      { role: "VOCAL", track: "lithium", file: "2.Lithium_Stem_VOX ECHO.m4a", label: "Vox Echo" },
      { role: "FX", track: "lithium", file: "2.Lithium_Stem_ORGAN SWEEP EFFECT.m4a", label: "Organ Sweep" },
    ],
  },
  {
    id: "ELECTRO_POP",
    label: "GARAGE 130",
    genre: "Garage / Electronic · CC0",
    bpm: 130,
    key: "C major",
    stems: [
      { role: "KICK", track: "caesium", file: "6.Caesium_Stem_KICK.m4a", label: "Kick" },
      { role: "HATS", track: "caesium", file: "6.Caesium_Stem_HATS.m4a", label: "Hats" },
      { role: "PERC", track: "caesium", file: "6.Caesium_Stem_GARAGE BEAT.m4a", label: "Garage Beat" },
      { role: "SNARE", track: "caesium", file: "6.Caesium_Stem_FILL SCRATCH.m4a", label: "Scratch Fill" },
      { role: "MUSIC", track: "caesium", file: "6.Caesium_Stem_MINILOGUE_SYNTH.m4a", label: "Minilogue" },
      { role: "VOCAL", track: "caesium", file: "6.Caesium_Stem_VOX LEAD.m4a", label: "Lead Vox" },
      { role: "VOCAL", track: "caesium", file: "6.Caesium_Stem_BGVOX MAIN.m4a", label: "Background Vox" },
      { role: "FX", track: "caesium", file: "6.Caesium_Stem_BUILD.m4a", label: "Build" },
      { role: "FX", track: "caesium", file: "6.Caesium_Stem_MICROCOSM_EFFECT.m4a", label: "Microcosm" },
    ],
  },
  {
    id: "MINIMAL_TECHNO",
    label: "BIG BEAT 128",
    genre: "Big Beat / Glitch · CC0",
    bpm: 128,
    key: "B♭",
    stems: [
      { role: "KICK", track: "francium", file: "7.Francium_Stem_KICK.m4a", label: "Kick" },
      { role: "SNARE", track: "francium", file: "7.Francium_Stem_CLAPS.m4a", label: "Claps" },
      { role: "HATS", track: "francium", file: "7.Francium_Stem_OPEN HATS.m4a", label: "Open Hats" },
      { role: "PERC", track: "francium", file: "7.Francium_Stem_BIG BEAT.m4a", label: "Big Beat" },
      { role: "BASS", track: "francium", file: "7.Francium_Stem_SINE.m4a", label: "Sine Bass" },
      { role: "MUSIC", track: "francium", file: "7.Francium_Stem_MELODY GLITCH.m4a", label: "Melody Glitch" },
      { role: "MUSIC", track: "francium", file: "7.Francium_Stem_MINILOGUE_SYNTH.m4a", label: "Minilogue" },
      { role: "VOCAL", track: "francium", file: "7.Francium_Stem_VOX LEAD.m4a", label: "Lead Vox" },
      { role: "FX", track: "francium", file: "7.Francium_Stem_MICROCOSM_EFFECT.m4a", label: "Microcosm" },
      { role: "FX", track: "francium", file: "7.Francium_Stem_CRASH.m4a", label: "Crash" },
    ],
  },
  {
    id: "DARK_ELECTRONIC",
    label: "ELECTRO 132",
    genre: "Electro / Experimental · CC0",
    bpm: 132,
    key: "D major",
    stems: [
      { role: "PERC", track: "hydrogen", file: "1.Hydrogen_Stem_MAIN DRUMS.m4a", label: "Main Drums" },
      { role: "SNARE", track: "hydrogen", file: "1.Hydrogen_Stem_DRUMS BREAK 1.m4a", label: "Drum Break" },
      { role: "HATS", track: "hydrogen", file: "1.Hydrogen_Stem_HH.m4a", label: "Hi Hats" },
      { role: "MUSIC", track: "hydrogen", file: "1.Hydrogen_Stem_MINILOGUE SYNTH.m4a", label: "Minilogue" },
      { role: "MUSIC", track: "hydrogen", file: "1.Hydrogen_Stem_BEEPS.m4a", label: "Beeps" },
      { role: "VOCAL", track: "hydrogen", file: "1.Hydrogen_Stem_VOX LEAD.m4a", label: "Lead Vox" },
      { role: "VOCAL", track: "hydrogen", file: "1.Hydrogen_Stem_BGVOX HARMONY.m4a", label: "Harmony Vox" },
      { role: "FX", track: "hydrogen", file: "1.Hydrogen_Stem_SWEEPS.m4a", label: "Sweeps" },
      { role: "FX", track: "hydrogen", file: "1.Hydrogen_Stem_MICROCOSM EFFECT.m4a", label: "Microcosm" },
    ],
  },
];

export function externalSet(id: ExternalSetId) {
  return EXTERNAL_SETS.find((set) => set.id === id)!;
}
