import { get } from "@vercel/blob";

const ALLOWED = new Set([
  "stems/city-of-dreams-alt-control-millero/drums.mp3",
  "stems/city-of-dreams-alt-control-millero/bass.mp3",
  "stems/city-of-dreams-alt-control-millero/other.mp3",
  "stems/city-of-dreams-alt-control-millero/vocals.mp3",
  "stems/bullshit-matroda-klp/drums.mp3",
  "stems/zeleo-i-just-want-to-live/drums.mp3",
]);

function responseHeaders(result) {
  const headers = new Headers({
    "Content-Type": result.blob.contentType || "audio/mpeg",
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "ETag": result.blob.etag || "",
    "Accept-Ranges": result.headers.get("accept-ranges") || "bytes",
  });
  for (const name of ["content-length", "content-range", "last-modified"]) {
    const value = result.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export default {
  async fetch(request) {
    if (process.env.VERCEL_ENV === "production") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    }

    const url = new URL(request.url);
    const pathname = url.searchParams.get("path") || "";
    if (!ALLOWED.has(pathname)) return new Response("Not found", { status: 404 });

    const storeId = process.env.BEATRIS_STEMS_STORE_ID;
    if (!storeId) return new Response("Stem store unavailable", { status: 503 });

    const forwardedHeaders = {};
    const range = request.headers.get("range");
    const ifRange = request.headers.get("if-range");
    if (range) forwardedHeaders.Range = range;
    if (ifRange) forwardedHeaders["If-Range"] = ifRange;

    try {
      const result = await get(pathname, {
        access: "private",
        storeId,
        ifNoneMatch: request.headers.get("if-none-match") || undefined,
        headers: Object.keys(forwardedHeaders).length ? forwardedHeaders : undefined,
      });
      if (!result) return new Response("Not found", { status: 404 });
      if (result.statusCode === 304) {
        return new Response(null, { status: 304, headers: { ETag: result.blob.etag || "", "Cache-Control": "private, no-cache" } });
      }
      const headers = responseHeaders(result);
      const partial = Boolean(result.headers.get("content-range"));
      return new Response(result.stream, { status: partial ? 206 : 200, headers });
    } catch (error) {
      console.error("Private stem read failed", error);
      return new Response("Stem unavailable", { status: 502 });
    }
  },
};
