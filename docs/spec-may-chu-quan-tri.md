# Đặc tả máy chủ & trang quản trị — suy ra từ bundle công khai của dramaaudio.online

> Nguồn: `app.js` (bundle Vite/React đã tải), `home.html`, `track.html`, cùng 7 request GET công khai chỉ-đọc
> (`/api/public/tracks?limit=2`, `/api/public/tracks/:slug`, `/api/playback/:id`, `/api/auth/me`, `sitemap.xml`,
> `robots.txt`, `ads.txt`) và `curl -I` trang chủ / API / media. Không đăng nhập, không gọi API ghi.
> Tài liệu chỉ mô tả **hành vi & hình dạng dữ liệu** để tự thiết kế lại; không chép mã, chữ, ảnh.
> Ký hiệu: **[thấy]** = đọc thẳng từ bundle / phản hồi; **[đoán]** = suy luận.

---

## 1. Hạ tầng (suy ra)

| Dấu hiệu | Kết luận |
|---|---|
| Mọi phản hồi `Server: cloudflare`, `CF-RAY`, NEL `cf-nel` | Đứng sau Cloudflare **[thấy]** |
| Chú thích trong HTML: "Worker ghi đè title/description/canonical/og:url cho các route trong `run_worker_first`" | **Cloudflare Workers + Static Assets** (`wrangler.jsonc` → `assets.run_worker_first` cho `/`, `/track/*`, `/api/*`…). Worker vừa phục vụ API vừa "SSR nhẹ" bằng cách sửa HTML tĩnh (nhiều khả năng `HTMLRewriter`) **[thấy chú thích / đoán cơ chế]** |
| Thông báo lỗi upload nhắc `R2_S3_ACCESS_KEY_ID / R2_S3_SECRET_ACCESS_KEY / R2_S3_ENDPOINT` | Lưu trữ media trên **Cloudflare R2**, ký URL presign qua API tương thích S3 (aws4fetch / aws-sdk) **[thấy]** |
| `media.dramaaudio.online`: `ETag` dạng MD5, `Accept-Ranges`, `Vary: Origin`, `cf-cache-status: DYNAMIC`, không có `Cache-Control` | **R2 bucket public qua custom domain** (có CORS) **[đoán mạnh]** |
| `<link rel=preconnect href="https://media.…">` | Domain media tách riêng, client tải `.m3u8/.ts` trực tiếp từ R2 **[thấy]** |
| HTML / API: `Cache-Control: no-store`; header bảo mật `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=()` | Worker tự gắn header **[thấy]** |
| Nút "Xoá cache Cloudflare" → `POST /api/settings/purge-cache` | Worker gọi Cloudflare API `POST /zones/:zone/purge_cache {purge_everything:true}` bằng token trong biến môi trường **[đoán]** |
| `robots.txt` là bản "Content-Signal" của Cloudflare | Dùng tính năng robots.txt được Cloudflare quản lý **[thấy]** |
| `id` dạng UUID, `createdAt` là **giây Unix** (số nguyên) | CSDL nhiều khả năng **Cloudflare D1 (SQLite)** — kiểu `INTEGER` epoch là thói quen D1 **[đoán]** |
| Cài đặt lưu dạng chuỗi (`gate_enabled: "true"/""`, `lock_points: "<JSON string>"`) | Bảng key–value `settings(key TEXT PK, value TEXT)` **[đoán mạnh]** |

Không có dấu hiệu Node/Express (không `x-powered-by`, không cookie phiên lạ trên GET công khai).

---

## 2. Quy ước API chung

- **Base URL**: cùng origin, tiền tố `/api` — wrapper `ie(path, init)` gọi `fetch('/api'+path, {credentials:'include'})` **[thấy]**.
- Có body → tự thêm `content-type: application/json` **[thấy]**.
- Lỗi: `!res.ok` → đọc JSON `{ error: string }`, ném lỗi kèm `status` HTTP; không có `error` thì "Lỗi <status>" **[thấy]**.
- **Xác thực: cookie phiên** (`credentials: 'include'`, không có header `Authorization`, không lưu token ở localStorage) **[thấy]**. Cookie nhiều khả năng HttpOnly, Secure, SameSite=Lax, ký HMAC/JWT hoặc ID phiên trong D1/KV **[đoán]**.
- Phân quyền: chỉ 2 mức — người dùng thường và `isAdmin` ("Chỉ admin (chủ sở hữu)…") **[thấy]**.

---

## 3. Danh sách endpoint

### 3.1 Xác thực

| Phương thức & đường dẫn | Body | Phản hồi (suy ra) | Ghi chú |
|---|---|---|---|
| `GET /api/auth/me` | — | `{ user: User \| null, isAdmin: boolean }` | Gọi khi khởi động; 200 cả khi chưa đăng nhập **[thấy]** |
| `POST /api/auth/register` | `{ email, password, displayName?, setupToken? }` | `{ user, isAdmin }` + Set-Cookie | Mật khẩu ≥ 8 ký tự (validate ở form). `setupToken` có trong API nhưng form không gửi → **[đoán]** cơ chế "bootstrap admin": người đầu tiên / người có token bằng biến môi trường thì thành admin |
| `POST /api/auth/login` | `{ email, password }` | `{ user, isAdmin }` + Set-Cookie | Đăng nhập xong: admin → `/admin`, khác → trang trước |
| `POST /api/auth/logout` | — | `{ ok: true }` (đoán) | Xoá cookie |

### 3.2 Công khai (không cần đăng nhập)

| Endpoint | Phản hồi **[thấy]** |
|---|---|
| `GET /api/public/tracks?limit=200` | `{ tracks: Track[] }` — mới nhất trước |
| `GET /api/public/tracks/:slug` | `{ track: Track }` — tra theo **slug suy ra từ title** (không có cột slug trong JSON); 404 → client báo "không tìm thấy" |
| `GET /api/search?q=` | `{ tracks: Track[] }` — client debounce 250 ms |
| `GET /api/playback/:trackId` | `{ trackId, manifestUrl, expiresIn: 21600 }` — `manifestUrl = https://media.<domain>/hls/<trackId>/master.m3u8` (URL **không ký**, `expiresIn` 6 giờ chỉ mang tính hình thức) |

Ví dụ `Track` công khai (đã lược giá trị):
```json
{ "id": "uuid", "title": "…", "description": null, "durationSeconds": 2843,
  "episodeCount": 2, "lockedEpisodes": [], "episodePoints": {},
  "status": "ready", "uploadedBy": "uuid-user", "createdAt": 1794379453 }
```

### 3.3 Người dùng đã đăng nhập

| Endpoint | Phản hồi |
|---|---|
| `GET /api/history` | `{ history: [{ track: Track, …(đoán: playedAt / positionSeconds) }] }` — màn "Lịch sử nghe" (noindex) **[thấy hình dạng `m.track`]** |

Không có endpoint ghi lịch sử trong client → **[đoán]** máy chủ ghi lịch sử ngay trong `GET /api/playback/:id` khi có cookie.

### 3.4 Quản trị (yêu cầu `isAdmin`)

| Endpoint | Body | Phản hồi | Ghi chú |
|---|---|---|---|
| `GET /api/tracks` | — | `{ tracks: Track[] }` | Gồm cả track `processing` |
| `PATCH /api/tracks/:id` | `{ title, description }` | (bỏ qua) | Chỉ sửa 2 trường này |
| `DELETE /api/tracks/:id` | — | (bỏ qua) | Có `confirm()`; **[đoán]** xoá tệp R2 dưới `hls/<id>/` + purge CDN |
| `POST /api/uploads/hls/presign` | `{ title, paths: string[], episodeCount: int\|null, description? }` | `{ trackId, uploads: [{ path, url, contentType, cacheControl }] }` | Tạo bản ghi track `status=processing` + trả URL PUT ký sẵn cho **từng tệp** |
| `POST /api/uploads/complete` | `{ trackId, durationSeconds }` | (bỏ qua) | Đặt `status=ready`, lưu thời lượng |
| `POST /api/uploads/asset` | `{ kind: "gate", contentType, fileSize }` | `{ uploadUrl, publicUrl }` | Ảnh quảng cáo của chốt khoá. Khoá R2 thấy được: `branding/gate-<uuid>.<ext>` (vd. `.webp`, `.png`) |
| `GET /api/settings` | — | `{ settings: Record<string,string> }` | |
| `PUT /api/settings` | `Partial<Record<string,string>>` | (bỏ qua) | **Ghi từng phần**: mỗi tab chỉ gửi khoá của mình (upsert theo key) |
| `POST /api/settings/purge-cache` | — | (bỏ qua) | Purge toàn zone Cloudflare |

### 3.5 Không thuộc `/api` nhưng do Worker sinh

- `GET /sitemap.xml` (200, `application/xml`) — sinh động từ danh sách track **[thấy]**.
- `GET /ads.txt` (200) — sinh từ setting `adsense_pub_id` ("hệ thống tự tạo file /ads.txt") **[thấy]**.
- `robots.txt` — Cloudflare quản lý.
- HTML `/`, `/track/:slug`, 5 trang tĩnh pháp lý — xem mục 6.

---

## 4. Mô hình dữ liệu suy ra

```text
users
  id            uuid PK
  email         text unique
  password_hash text            -- PBKDF2/bcrypt (đoán; Workers hay dùng PBKDF2 WebCrypto)
  display_name  text null
  is_admin      bool            -- "chủ sở hữu"
  created_at    int (epoch s)

sessions (đoán — hoặc JWT ký không cần bảng)
  id, user_id, expires_at

tracks
  id               uuid PK
  title            text          -- slug = slugify(title), không lưu (xem 4.1)
  description      text null     -- ≤ 5000 ký tự (maxLength ở form)
  duration_seconds int null      -- client tính từ #EXTINF
  episode_count    int null      -- ≥1; ≥2 mới hiện danh sách tập
  locked_episodes  json  []      -- di sản: khoá theo track (nay không còn UI)
  episode_points   json  {}      -- di sản: mốc tập tuỳ chỉnh (nay rỗng)
  status           text          -- 'processing' | 'ready' (client có hiển thị % xử lý → từng có transcode phía máy chủ)
  uploaded_by      uuid → users
  created_at       int (epoch s)
  -- khoá R2: hls/<id>/master.m3u8 + các tệp con theo đường dẫn tương đối

listen_history
  user_id, track_id, played_at (đoán thêm position)

settings (key–value, value luôn là chuỗi)
```

### 4.1 Slug
`slugify(title)`: hạ thường → `đ`→`d` → NFD bỏ dấu → mọi cụm ký tự không `[a-z0-9]` thành `-` → cắt `-` đầu/cuối → tối đa 80 ký tự → rỗng thì `"audio"` **[thấy]**. Máy chủ tra `GET /public/tracks/:slug` bằng cùng hàm → **trùng tên = trùng slug** (điểm yếu). Bản viết lại nên lưu cột `slug` duy nhất, tự thêm hậu tố khi trùng.

### 4.2 "Tập" là tập ảo
Một track = **một luồng HLS liền**. `episodeCount = N` chia đều thời lượng: tập *k* bắt đầu ở `(k-1)·duration/N`; tập hiện tại = `min(N, floor(t / (duration/N)) + 1)` **[thấy]**. Form upload ghi "tự chia đều thời lượng".

### 4.3 Bảng khoá `settings` đã thấy

| Khoá | Kiểu (chuỗi) | Màn |
|---|---|---|
| `brand_name`, `site_title`, `contact_email` | text | Cài đặt |
| `ga4_id` (G-…) → máy chủ tự chèn gtag | text | Cài đặt |
| `gsc_verification` → thẻ `google-site-verification` | text | Cài đặt |
| `adsense_pub_id` (pub-…) → `/ads.txt` | text | Cài đặt |
| `head_code`, `body_code` → chèn thô vào `<head>` / cuối `<body>` | HTML | Cài đặt |
| `gate_enabled` | `"true"` \| `""` | Khoá audio |
| `lock_points` | JSON `Checkpoint[]` | Khoá audio |
| `gate_title`, `gate_description`, `gate_image_url`, `gate_link`, `gate_button` | text | **Di sản** (một khoá duy nhất) — client tự chuyển thành 1 chốt `fromEp=1` nếu `lock_points` rỗng |
| `redirect_enabled`, `redirect_links` (JSON `[{url, delaySeconds}]`) | | Redirect (không làm lại) |

`Checkpoint` **[thấy]**:
```ts
{ id: string /* [a-zA-Z0-9_-], ≤40, mặc định "cp"+6 ký tự ngẫu nhiên */,
  fromEp: int ≥ 1, name: string, title: string, description: string,
  imageUrl: string, link: string, button: string }
```
Lưu đã sắp theo `fromEp` tăng dần.

---

## 5. Luồng tải audio (HLS encode sẵn trên máy quản trị)

1. Admin chọn **một thư mục** (`<input webkitdirectory>`) chứa HLS đã encode sẵn (hỗ trợ nhiều chất lượng). Client lọc đuôi `m3u8, ts, m4s, mp4, m4a, aac`; đường dẫn tương đối bỏ tên thư mục gốc; bắt buộc có `master.m3u8` ở gốc. Tên thư mục gợi ý làm tiêu đề **[thấy]**.
2. Client đọc các `.m3u8`, cộng mọi `#EXTINF:<giây>` của playlist media đầu tiên có EXTINF → `durationSeconds` (làm tròn) **[thấy]**.
3. `POST /api/uploads/hls/presign {title, paths[], episodeCount, description}` → máy chủ tạo track `processing`, trả mỗi path một URL PUT presign R2 (khoá `hls/<trackId>/<path>`), kèm `contentType` và `cacheControl` mà client **phải gửi đúng** khi PUT (vì header nằm trong chữ ký) **[thấy]**. Đoán: `.m3u8` → `application/vnd.apple.mpegurl`, `.ts` → `video/mp2t`, cache dài `public, max-age=31536000, immutable`.
4. Client PUT song song **6 luồng**, mỗi tệp thử lại 3 lần (chờ 500 ms, 1000 ms), cập nhật % theo số tệp xong **[thấy]**.
5. `POST /api/uploads/complete {trackId, durationSeconds}` → `status=ready` **[thấy]**.
6. Lỗi PUT mạng/403 → gợi ý kiểm khoá R2 / CORS bucket **[thấy]**. Yêu cầu: bucket R2 bật **CORS cho PUT từ origin site**.

**Phát lại**: `GET /api/playback/:id` → `manifestUrl`; Safari phát HLS gốc, trình duyệt khác tải động `hls.js` (`enableWorker`) **[thấy]**. Có Media Session (màn hình khoá), tốc độ 0.25–2× lưu localStorage, hẹn giờ ngủ (phút / hết bài) — phần giao diện.

**Ảnh (asset)**: `POST /api/uploads/asset {kind:'gate', contentType, fileSize}` → `{uploadUrl, publicUrl}`; client PUT tệp thô bằng XHR (không gửi header phụ); `publicUrl` gán vào `imageUrl` của chốt, lưu khi bấm "Lưu khoá audio" **[thấy]**. Chỉ thấy `kind="gate"`; tiền tố khoá `branding/` gợi ý từng có/sẽ có kind khác (logo, OG) **[đoán]**. Máy chủ nên kiểm `contentType` (image/*) và `fileSize` tối đa.

---

## 6. HTML phía máy chủ: `window.__SONG__` & SEO

Worker trả `index.html` tĩnh đã build, rồi **sửa trên luồng** cho route được `run_worker_first` **[thấy chú thích + kết quả]**:

1. **Thẻ meta theo trang**: `<title>`, `description`, `canonical`, `og:title/description/url`, `twitter:*`. Trang track: tiêu đề = `<tên track> — <brand>`, description = mô tả track hoặc câu mặc định có tên track; canonical `https://<domain>/track/<slug>`. `og:image` là ảnh tĩnh chung của site (không theo track).
2. **JSON-LD**: `WebApplication` (tĩnh trong HTML) + `AudioObject` theo track `{name, url, duration: "PT<s>S", uploadDate: ISO}`. Trang chủ phía client thêm `ItemList` (50 mục đầu).
3. **Nội dung SEO trong `#root`** (`div.ssr-seo`): `h1` tên track + link trang chủ, `nav` "nghe thêm" ~30 track mới nhất, `nav` 5 trang pháp lý (giới thiệu, liên hệ, bảo mật, điều khoản, miễn trừ/DMCA). React render đè lên khi chạy (không hydrate).
4. **`window.__SONG__`** (một `<script>` cuối `<head>`):
   ```ts
   { brandName, siteTitle, contactEmail,
     gate: { checkpoints: Checkpoint[] } | null,   // null khi gate_enabled tắt
     redirect: { enabled, links: [{ id, url, delaySeconds }] } | null }
   ```
   Client đọc qua `Te()`; cấu hình khoá đọc **một lần** khi tải trang (đổi cài đặt phải mở tab mới).
5. **Mã chèn**: chèn `gsc_verification` thành meta, `ga4_id` thành gtag, rồi `head_code` thô vào `<head>`, `body_code` cuối `<body>`. (Trên site thật thấy bị chèn trùng do admin dán cả thẻ đầy đủ — bản viết lại nên chuẩn hoá: ô nhận ID thì lọc lấy giá trị `content`.)
6. `Cache-Control: no-store` cho HTML ⇒ mỗi lượt xem đều chạy Worker + đọc D1; purge-cache chỉ thật sự cần cho tài sản tĩnh / media qua CDN.

Route client **[thấy]**: `/`, `/track/:slug`, `/gioi-thieu`, `/lien-he`, `/chinh-sach-bao-mat`, `/dieu-khoan-su-dung`, `/mien-tru-trach-nhiem`, `/history` (cần đăng nhập), `/login`, `/register`, `/admin` (cần admin), `*` → `/`. Trang pháp lý dùng `{brand}` và `contactEmail` từ `__SONG__`.

---

## 7. Khoá audio theo chốt — logic (để làm lại phía máy chủ / client)

- Bật khi `gate_enabled="true"` và có ≥1 chốt. Không áp dụng trên `/admin` **[thấy]**.
- Mỗi chốt khoá từ tập `fromEp` tới trước chốt kế tiếp. Tập trước chốt đầu tự do. Đặt `fromEp=1` = khoá toàn bộ. Áp cho **mọi track** (khoá theo track `lockedEpisodes` là di sản) **[thấy]**.
- Khi tập hiện tại (theo 4.2) rơi vào chốt chưa mở → hiện popup: ảnh, dòng tiêu đề (mặc định câu xác nhận tự nguyện), nút (mặc định chữ "đồng ý mở…"), mô tả dưới nút; bấm nút → mở `link` ở tab mới **và** ghi `sessionStorage['<prefix>:cp'+id] = now`; có nút ✕ để bỏ qua. Mở khoá **riêng từng chốt**, hiệu lực **6 giờ** trong phiên tab **[thấy]**.
- **Điểm yếu**: khoá thuần client — `manifestUrl` công khai, không ký, toàn bộ tập nằm trong một playlist. Bản viết lại nếu cần khoá thật: tách playlist theo tập hoặc ký URL ngắn hạn (cookie ký / token CDN) và kiểm mở khoá ở máy chủ.

### Redirect (chỉ ghi nhận, không làm lại)
Tab "Redirect": bật/tắt + danh sách `{url, delaySeconds (mặc định 30)}` chỉ nhận `http(s)`. Client: sau khi người xem ở site đủ số giây, cú click kế tiếp mở link đó ở tab mới, mỗi link một lần mỗi phiên.

---

## 8. Trang quản trị `/admin`

Một trang, 4 tab **[thấy]**:

1. **Thư viện** (mặc định)
   - Thẻ "Tải audio lên (HLS)": chọn thư mục, Tên audio, Mô tả/tóm tắt SEO (≤5000), Số tập (trống = không chia), thanh tiến độ %, trạng thái `idle → signing → uploading → finishing → done | error`.
   - Danh sách "Thư viện (n)": mỗi dòng nút phát, tên (link `/track/<slug>`), thời lượng, ngày tạo, trạng thái `processing` (%), nút Sửa / Xoá.
   - Hộp "Sửa audio": chỉ Tên + Mô tả; ghi chú khoá đặt chung ở tab Khoá.
2. **Cài đặt & mã chèn**: Tên thương hiệu, Tiêu đề site, Email liên hệ, GA4 ID, mã xác minh Search Console, AdSense Publisher ID, mã chèn `<head>`, mã chèn cuối `<body>`; nút Lưu; khối "Xoá cache Cloudflare" có xác nhận.
3. **Khoá audio**: công tắc bật; danh sách thẻ "Chốt n" (Khoá từ tập, Tiêu đề popup, Liên kết, Ảnh tải từ máy + xem trước + xoá ảnh, Chữ nút, Mô tả dưới nút, Xoá chốt); "+ Thêm chốt" (fromEp = chốt cuối + 1); Lưu → sắp theo `fromEp`.
4. **Redirect**: (không làm lại).

Không thấy: quản lý người dùng, ảnh bìa từng track, thể loại/tag, thống kê lượt nghe, sửa thứ tự, lên lịch đăng.

---

## 9. Gợi ý khi tự viết lại (thương hiệu riêng)

- Giữ kiến trúc rẻ: Worker (Hono) + D1 + R2 public custom domain + Static Assets; hoặc tương đương Node + Postgres + S3.
- Thêm cột `slug` duy nhất; ảnh bìa / OG theo track; `kind` asset có danh sách trắng (`gate`, `logo`, `og`, `cover`).
- Ký `cacheControl`/`contentType` vào presign; giới hạn số tệp & dung lượng mỗi lần presign; dọn rác khi upload bỏ dở (track `processing` quá N giờ).
- Rate-limit `login/register`; tắt đăng ký công khai sau khi đã có admin (thay cho `setupToken`).
- Lọc `head_code/body_code` chỉ cho admin, ghi nhật ký thay đổi cài đặt.
- Nếu muốn khoá có tác dụng thật, chuyển kiểm mở khoá về máy chủ (xem mục 7).
