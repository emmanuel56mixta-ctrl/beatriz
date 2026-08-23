const SOURCES = {
  apzx_transcention: "http://mtkdata.cambridgemusictechnology.co.uk/MTK004/APZX_Transcention.zip",
  cfx_mathematician: "http://mtkdata.cambridgemusictechnology.co.uk/MTK005/cfx_Mathematician.zip",
  amcontra_heart: "http://mtkdata.cambridgemusictechnology.co.uk/MTK003/AMContra_HeartPeripheral.zip",
  albert_ubiquitous: "http://multitracks.cambridge-mt.com/AlbertKader_Ubiquitous.zip",
  albert_whiptails: "http://multitracks.cambridge-mt.com/AlbertKader_Whiptails.zip",
  cryonic_excessive: "http://multitracks.cambridge-mt.com/cryonicPAX_Excessive.zip",
  cryonic_holdme: "http://multitracks.cambridge-mt.com/cryonicPAX_HoldMe.zip",
};

export default {
  async fetch(request) {
    // Cambridge-MT material is for private prototype / practice only.
    // Never expose these multitracks from the production deployment.
    if (process.env.VERCEL_ENV === "production") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const source = SOURCES[id];
    if (!source) return new Response("Unknown set source", { status: 404 });

    try {
      const upstream = await fetch(source, {
        redirect: "follow",
        headers: { "User-Agent": "Beatris-Audio-Lab/0.30 (private educational prototype)" },
      });
      if (!upstream.ok || !upstream.body) {
        return new Response(`Cambridge source unavailable (${upstream.status})`, { status: 502 });
      }
      const headers = new Headers({
        "Content-Type": "application/zip",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      });
      const length = upstream.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      return new Response(upstream.body, { status: 200, headers });
    } catch (error) {
      console.error("Cambridge multitrack proxy failed", error);
      return new Response("Cambridge source unavailable", { status: 502 });
    }
  },
};
