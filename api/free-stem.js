const TRACKS = {
  lithium: {
    host: "https://lithium.ichbinsoftware.com/",
    folder: "2.Lithium",
    files: new Set([
      "2.Lithium_Stem_KICK.m4a",
      "2.Lithium_Stem_HATS.m4a",
      "2.Lithium_Stem_HOUSE BEAT.m4a",
      "2.Lithium_Stem_SY BASS.m4a",
      "2.Lithium_Stem_MELODY PAD.m4a",
      "2.Lithium_Stem_PLUCK.m4a",
      "2.Lithium_Stem_VOX ECHO.m4a",
      "2.Lithium_Stem_ORGAN SWEEP EFFECT.m4a",
    ]),
  },
  caesium: {
    host: "https://caesium.ichbinsoftware.com/",
    folder: "6.Caesium",
    files: new Set([
      "6.Caesium_Stem_KICK.m4a",
      "6.Caesium_Stem_HATS.m4a",
      "6.Caesium_Stem_GARAGE BEAT.m4a",
      "6.Caesium_Stem_FILL SCRATCH.m4a",
      "6.Caesium_Stem_MINILOGUE_SYNTH.m4a",
      "6.Caesium_Stem_VOX LEAD.m4a",
      "6.Caesium_Stem_BGVOX MAIN.m4a",
      "6.Caesium_Stem_BUILD.m4a",
      "6.Caesium_Stem_MICROCOSM_EFFECT.m4a",
    ]),
  },
  francium: {
    host: "https://francium.ichbinsoftware.com/",
    folder: "7.Francium",
    files: new Set([
      "7.Francium_Stem_KICK.m4a",
      "7.Francium_Stem_CLAPS.m4a",
      "7.Francium_Stem_OPEN HATS.m4a",
      "7.Francium_Stem_BIG BEAT.m4a",
      "7.Francium_Stem_SINE.m4a",
      "7.Francium_Stem_MELODY GLITCH.m4a",
      "7.Francium_Stem_MINILOGUE_SYNTH.m4a",
      "7.Francium_Stem_VOX LEAD.m4a",
      "7.Francium_Stem_MICROCOSM_EFFECT.m4a",
      "7.Francium_Stem_CRASH.m4a",
    ]),
  },
  hydrogen: {
    host: "https://hydrogen.ichbinsoftware.com/",
    folder: "1.Hydrogen",
    files: new Set([
      "1.Hydrogen_Stem_MAIN DRUMS.m4a",
      "1.Hydrogen_Stem_DRUMS BREAK 1.m4a",
      "1.Hydrogen_Stem_HH.m4a",
      "1.Hydrogen_Stem_MINILOGUE SYNTH.m4a",
      "1.Hydrogen_Stem_BEEPS.m4a",
      "1.Hydrogen_Stem_VOX LEAD.m4a",
      "1.Hydrogen_Stem_BGVOX HARMONY.m4a",
      "1.Hydrogen_Stem_SWEEPS.m4a",
      "1.Hydrogen_Stem_MICROCOSM EFFECT.m4a",
    ]),
  },
};

function encodeFile(file) {
  return file.split("/").map(encodeURIComponent).join("/");
}

async function fetchUpstream(track, file) {
  const encoded = encodeFile(file);
  const primary = `${track.host}${encoded}`;
  const fallback = `https://raw.githubusercontent.com/ichbinsoftware/everythingisfree/main/src/${track.folder}/${encoded}`;
  let last = null;
  for (const url of [primary, fallback]) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "Beatris-Audio-Lab/0.31" },
      });
      if (response.ok && response.body) return response;
      last = response.status;
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`upstream unavailable: ${String(last)}`);
}

export default {
  async fetch(request) {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    const url = new URL(request.url);
    const trackId = url.searchParams.get("track") || "";
    const file = url.searchParams.get("file") || "";
    const track = TRACKS[trackId];
    if (!track || !track.files.has(file)) return new Response("Not found", { status: 404 });

    try {
      const upstream = await fetchUpstream(track, file);
      const headers = new Headers({
        "Content-Type": upstream.headers.get("content-type") || "audio/mp4",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Content-Type-Options": "nosniff",
      });
      const length = upstream.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      return new Response(upstream.body, { status: 200, headers });
    } catch (error) {
      console.error("CC0 stem proxy failed", trackId, file, error);
      return new Response("Stem unavailable", { status: 502 });
    }
  },
};
