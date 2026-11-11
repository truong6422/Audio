// GET/HEAD /media/<key>: đọc R2, hỗ trợ Range (206), ETag / 304, Content-Type theo đuôi, cache dài.
import type { Context } from "hono";
import type { AppEnv } from "./env";
import { cacheControlFor, contentTypeFor } from "./lib";

type ParsedRange = { offset: number; length?: number } | { suffix: number } | "invalid" | null;

function parseRange(h: string | undefined): ParsedRange {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m) return "invalid"; // nhiều đoạn / sai cú pháp → bỏ qua Range, trả nguyên tệp
  const [, a, b] = m;
  if (a === "" && b === "") return "invalid";
  if (a === "") return { suffix: Number(b) };
  const start = Number(a);
  if (b === "") return { offset: start };
  const end = Number(b);
  if (end < start) return "invalid";
  return { offset: start, length: end - start + 1 };
}

function baseHeaders(obj: R2Object, key: string): Headers {
  const h = new Headers();
  obj.writeHttpMetadata(h);
  const ct = contentTypeFor(key);
  if (ct !== "application/octet-stream" || !h.has("content-type")) h.set("content-type", ct);
  h.set("cache-control", cacheControlFor(key));
  h.set("etag", obj.httpEtag);
  h.set("last-modified", obj.uploaded.toUTCString());
  h.set("accept-ranges", "bytes");
  h.set("access-control-allow-origin", "*");
  h.set("access-control-expose-headers", "content-length, content-range, accept-ranges, etag");
  return h;
}

export async function serveMedia(c: Context<AppEnv>): Promise<Response> {
  const pathname = new URL(c.req.url).pathname;
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/media\//, ""));
  } catch {
    return c.text("Đường dẫn không hợp lệ", 400);
  }
  if (!/^(tracks|assets)\//.test(key) || key.split("/").some((p) => p === ".." || p === "." || p === "") || key.includes("\\")) {
    return c.text("Không tìm thấy", 404);
  }

  if (c.req.method === "HEAD") {
    const obj = await c.env.MEDIA.head(key);
    if (!obj) return c.body(null, 404);
    const h = baseHeaders(obj, key);
    h.set("content-length", String(obj.size));
    return new Response(null, { status: 200, headers: h });
  }

  const reqHeaders = c.req.raw.headers;
  let range = parseRange(reqHeaders.get("range") ?? undefined);
  if (range === "invalid") range = null;
  // If-Range: chỉ áp Range khi ETag còn khớp, ngược lại trả nguyên tệp.
  const ifRange = reqHeaders.get("if-range");
  if (range && ifRange) {
    const head = await c.env.MEDIA.head(key);
    if (!head) return c.text("Không tìm thấy", 404);
    if (ifRange !== head.httpEtag) range = null;
  }

  let obj: R2Object | R2ObjectBody | null;
  try {
    obj = await c.env.MEDIA.get(key, { onlyIf: range ? undefined : reqHeaders, range: range ?? undefined });
  } catch {
    // Range vượt kích thước tệp.
    const head = await c.env.MEDIA.head(key);
    if (!head) return c.body(null, 404);
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${head.size}` } });
  }
  if (!obj) return c.text("Không tìm thấy", 404);

  const h = baseHeaders(obj, key);
  if (!("body" in obj)) return new Response(null, { status: 304, headers: h });

  const r = (obj as R2ObjectBody).range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && r && (obj as R2ObjectBody).body) {
    const size = obj.size;
    let start: number;
    let length: number;
    if (r.suffix !== undefined) {
      length = Math.min(r.suffix, size);
      start = size - length;
    } else {
      start = r.offset ?? 0;
      length = r.length ?? size - start;
    }
    if (start >= size && size > 0) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    h.set("content-range", `bytes ${start}-${start + length - 1}/${size}`);
    h.set("content-length", String(length));
    return new Response((obj as R2ObjectBody).body, { status: 206, headers: h });
  }

  h.set("content-length", String(obj.size));
  return new Response((obj as R2ObjectBody).body, { status: 200, headers: h });
}
