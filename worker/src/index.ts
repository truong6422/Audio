// Worker Kể Đêm Audio: API (/api), media (/media), trang HTML có SEO, sitemap / robots / ads.txt.
import { Hono } from "hono";
import type { AppEnv } from "./env";
import { api } from "./api";
import { loadSession } from "./auth";
import { getReadyTrackByCode } from "./data";
import { HttpError } from "./lib";
import { serveMedia } from "./media";
import { adsTxt, ogImage, renderPage, robots, sitemap, sitemapPages, sitemapTracks } from "./pages";
import { requireAdmin } from "./auth";
import { writer } from "./writer/routes";
import studio from "./tts/routes";

const app = new Hono<AppEnv>();

// Header bảo mật chung.
app.use("*", async (c, next) => {
  await next();
  try {
    c.res.headers.set("x-content-type-options", "nosniff");
  } catch {
    // Response từ ASSETS / fetch có header bất biến → sao chép.
    c.res = new Response(c.res.body, c.res);
  }
  const h = c.res.headers;
  if (!h.has("x-content-type-options")) h.set("x-content-type-options", "nosniff");
  if (!h.has("referrer-policy")) h.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!h.has("x-frame-options")) h.set("x-frame-options", "SAMEORIGIN");
  if (!h.has("permissions-policy")) h.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
});

// API: không cache, chặn ghi chéo nguồn (bổ sung cho SameSite=Lax), nạp phiên.
app.use("/api/*", async (c, next) => {
  const m = c.req.method;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    const origin = c.req.header("origin");
    if (origin && origin !== "null") {
      let ok = false;
      try {
        ok = new URL(origin).host === new URL(c.req.url).host;
      } catch {
        ok = false;
      }
      if (!ok) throw new HttpError(403, "Yêu cầu từ nguồn khác bị chặn");
    }
  }
  await next();
  c.res.headers.set("cache-control", "no-store");
});
app.use("/api/*", loadSession);

app.route("/api", api);

// ===== CHỖ GẮN MÔ-ĐUN NGOÀI (seo / tts / writer…) =====
// Gắn TẠI ĐÂY: sau app.route("/api", api), TRƯỚC 404 của /api và catch-all trang bên dưới.
// Middleware /api/* phía trên (chặn nguồn khác, no-store, nạp phiên → c.get("user")) áp dụng sẵn;
// quyền admin: import { requireAdmin } from "./auth". Ví dụ:
//   app.route("/api/admin/writer", writerRoutes);
//   app.get("/og/:file", ogImage);           // /og/<slug>.svg — phải gắn trước catch-all (có dấu "." sẽ bị chuyển sang ASSETS)
app.use("/api/admin/writer/*", requireAdmin);
app.route("/api/admin/writer", writer);
app.use("/api/admin/studio/*", requireAdmin);
app.route("/api/admin/studio", studio);
app.get("/og/:file", ogImage);
// ===== HẾT CHỖ GẮN =====

app.all("/api/*", (c) => c.json({ error: "Không tìm thấy đường dẫn API" }, 404));

app.get("/media/*", serveMedia);
app.all("/media/*", (c) => c.json({ error: "Phương thức không được hỗ trợ" }, 405));

// Link ngắn đọc trong clip: /s/<code> → /track/<slug>, giữ nguyên query (utm…).
app.get("/s/:code", async (c) => {
  const code = Number(c.req.param("code"));
  const row = Number.isInteger(code) && code > 0 ? await getReadyTrackByCode(c.env, code) : null;
  const url = new URL(c.req.url);
  if (!row) return c.redirect("/" + url.search, 302);
  return c.redirect(`/track/${encodeURIComponent(row.slug)}${url.search}`, 302);
});

app.get("/sitemap.xml", sitemap);
app.get("/sitemap-pages.xml", sitemapPages);
app.get("/:file{sitemap-tracks-[0-9]+\\.xml}", sitemapTracks);
app.get("/robots.txt", robots);
app.get("/ads.txt", adsTxt);

// Còn lại: tệp tĩnh đi thẳng ASSETS, đường dẫn trang thì chèn SEO.
app.get("*", async (c) => {
  const path = new URL(c.req.url).pathname;
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (path.startsWith("/assets/") || last.includes(".")) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    // Tệp tĩnh không tồn tại (vd. chunk của bản deploy cũ) phải là 404 thật, không trả index.html — tránh trắng trang.
    if (res.status === 404 || (res.headers.get("content-type") || "").includes("text/html")) {
      return new Response("Không tìm thấy tệp", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    return res;
  }
  return renderPage(c);
});
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: "Lỗi máy chủ, vui lòng thử lại sau" }, 500);
});

export default app;
