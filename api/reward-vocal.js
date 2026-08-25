import { get } from "@vercel/blob";

const PATHNAME = "stems/city-of-dreams-alt-control-millero/vocals.mp3";

export default {
  async fetch(request) {
    // The isolated vocal reward is preview-only and the preview itself is
    // protected by Vercel Authentication. Never expose it from production.
    if (process.env.VERCEL_ENV === "production") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    const storeId = process.env.BEATRIS_STEMS_STORE_ID;
    if (!storeId) {
      console.error("BEATRIS_STEMS_STORE_ID is missing");
      return new Response("Reward unavailable", { status: 503 });
    }

    try {
      const result = await get(PATHNAME, {
        access: "private",
        storeId,
      });

      if (!result) return new Response("Not found", { status: 404 });

      const headers = new Headers({
        "Content-Type": result.blob.contentType || "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      });

      const length = result.headers.get("content-length");
      if (length) headers.set("Content-Length", length);

      return new Response(result.stream, {
        status: 200,
        headers,
      });
    } catch (error) {
      console.error("Private reward vocal read failed", error);
      return new Response("Reward unavailable", { status: 502 });
    }
  },
};
