export type StemRole = "drums" | "bass" | "other" | "vocals";

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
};

const cleanBase = (value: string) => value.replace(/\/$/, "");
const appBase = cleanBase(import.meta.env.BASE_URL || "");
const stemsEnv = (import.meta.env.VITE_BEATRIS_STEMS_URL as string | undefined)?.trim();
export const REMOTE_STEMS_CONFIGURED = Boolean(stemsEnv);
export const STEMS_BASE = cleanBase(stemsEnv || `${appBase}/audio/stems`);
const stem = (path: string) => `${STEMS_BASE}/${path}`;

export const FX = {
  impact: `${appBase}/audio/fx/impact.mp3`,
  crash: `${appBase}/audio/fx/crash.mp3`,
  sweep: `${appBase}/audio/fx/sweep.mp3`,
};

export const TRACKS: Track[] = [
  { id: "20-fingers-putang-ina-mo", title: "20 FINGERS — Putang Ina Mo", no: "01", bpm: 131, beatOffset: 0.3084, duration: 252.317, color: "#d5c69a", blurb: "Dance 1995 · 3 stems útiles (sin bass independiente).", stems: { drums: stem("20-fingers-putang-ina-mo/drums.mp3"), other: stem("20-fingers-putang-ina-mo/other.mp3"), vocals: stem("20-fingers-putang-ina-mo/vocals.mp3") }, stemCount: 3 },
  { id: "city-of-dreams-alt-control-millero", title: "City Of Dreams — Alt Control / Millero", no: "02", bpm: 124, beatOffset: 0.021, duration: 360.046, color: "#c47b4f", blurb: "House progresivo · drums + bass + music + vocals.", stems: { drums: stem("city-of-dreams-alt-control-millero/drums.mp3"), bass: stem("city-of-dreams-alt-control-millero/bass.mp3"), other: stem("city-of-dreams-alt-control-millero/other.mp3"), vocals: stem("city-of-dreams-alt-control-millero/vocals.mp3") }, stemCount: 4 },
  { id: "modjo-lady-other", title: "Modjo — Lady (other stem)", no: "03", bpm: 126, beatOffset: 0.3841, duration: 221.153, color: "#bd6550", blurb: "Referencia parcial · solo existe OTHER; no tiene batería/bajo/vocal aislados.", stems: { other: stem("modjo-lady-other/other.mp3") }, stemCount: 1 },
  { id: "cafe-du-midi-your-house", title: "Café Du MIDI — Your House", no: "04", bpm: 122, beatOffset: 0.1295, duration: 240.17, color: "#72817b", blurb: "House cálido · cuatro stems completos.", stems: { drums: stem("cafe-du-midi-your-house/drums.mp3"), bass: stem("cafe-du-midi-your-house/bass.mp3"), other: stem("cafe-du-midi-your-house/other.mp3"), vocals: stem("cafe-du-midi-your-house/vocals.mp3") }, stemCount: 4 },
  { id: "zeleo-i-just-want-to-live", title: "ZeLeo — I Just Want To Live", no: "05", bpm: 125, beatOffset: 0.1344, duration: 187.899, color: "#a78568", blurb: "House vocal · cuatro stems completos.", stems: { drums: stem("zeleo-i-just-want-to-live/drums.mp3"), bass: stem("zeleo-i-just-want-to-live/bass.mp3"), other: stem("zeleo-i-just-want-to-live/other.mp3"), vocals: stem("zeleo-i-just-want-to-live/vocals.mp3") }, stemCount: 4 },
  { id: "bullshit-matroda-klp", title: "Bullshit — MATRODA / KLP", no: "06", bpm: 130, beatOffset: 0.0246, duration: 178.913, color: "#87906f", blurb: "Club house · cuatro stems completos.", stems: { drums: stem("bullshit-matroda-klp/drums.mp3"), bass: stem("bullshit-matroda-klp/bass.mp3"), other: stem("bullshit-matroda-klp/other.mp3"), vocals: stem("bullshit-matroda-klp/vocals.mp3") }, stemCount: 4 },
];

export function trackById(id: string) { return TRACKS.find((t) => t.id === id) ?? TRACKS[0]!; }
export function hasStem(track: Track, role: StemRole) { return Boolean(track.stems[role]); }
