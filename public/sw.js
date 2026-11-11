// Service worker Kể Đêm Audio.
// - Vỏ ứng dụng: tệp tĩnh có băm (/assets/*) → cache trước; trang HTML → mạng trước, mất mạng thì trả bản đã lưu.
// - Ảnh bìa / biểu tượng (cùng nguồn, hoặc khác nguồn có CORS) → dùng bản lưu, làm mới nền; giới hạn số lượng.
// - KHÔNG cache /api, /media/tracks (audio, HLS), yêu cầu có Range, /admin.
const VERSION = "v2";
const SHELL = `kd-shell-${VERSION}`;
const IMAGES = `kd-img-${VERSION}`;
const MAX_IMAGES = 150;
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png"]).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kd-") && k !== SHELL && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAudioLike(url) {
  return /\.(m3u8|ts|m4s|aac|mp3|m4a|ogg|opus|wav|flac|webm|mp4)$/i.test(url.pathname) || url.pathname.startsWith("/media/tracks/");
}

async function trimImages() {
  const c = await caches.open(IMAGES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname === "/sw.js")) return;
  if (isAudioLike(url) || req.destination === "audio" || req.destination === "video") return;

  // Trang HTML: mạng trước, lưu bản mới nhất làm vỏ khi mất mạng.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic" && (res.headers.get("content-type") || "").includes("text/html")) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(OFFLINE_URL, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Tệp tĩnh có băm: cache trước.
  if (same && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.svg")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // Không bao giờ lưu trang HTML dưới tên tệp tĩnh (bản deploy cũ/mới lệch nhau → trắng trang vĩnh viễn).
            if (res.ok && !(res.headers.get("content-type") || "").includes("text/html")) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Ảnh bìa: dùng bản lưu ngay, làm mới nền. Bỏ phản hồi "opaque" (tốn hạn mức lưu trữ rất lớn).
  if (req.destination === "image") {
    event.respondWith(
      caches.open(IMAGES).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok && res.type !== "opaque") {
                c.put(req, res.clone()).then(trimImages).catch(() => {});
              }
              return res;
            })
            .catch(() => hit || Response.error());
          if (hit) {
            event.waitUntil(net.catch(() => {}));
            return hit;
          }
          return net;
        }),
      ),
    );
  }
});
