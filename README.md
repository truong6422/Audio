# Kể Đêm Audio

Web nghe truyện audio — Cloudflare Workers + Hono + D1 + R2, giao diện React (Vite).

- `worker/src/` — máy chủ: API `/api/*`, media `/media/*`, trang HTML có SEO, `/sitemap.xml`, `/robots.txt`, `/ads.txt`.
- `migrations/` — lược đồ D1.
- `shared/types.ts` — hợp đồng API dùng chung worker ↔ web.
- `web/` — giao diện người nghe + quản trị (`web/src/admin/`).
- `scripts/` — dữ liệu mẫu cục bộ.

## Chạy cục bộ (không cần tài khoản Cloudflare)

```bash
npm install

# 1. Biến bí mật cục bộ (không đưa vào git)
echo "SETUP_TOKEN=doi-thanh-chuoi-ngau-nhien-dai" > .dev.vars

# 2. Tạo bảng D1 cục bộ
npm run db:migrate:local

# 3. (Tuỳ chọn) 3 track mẫu + tệp WAV im lặng trong R2 cục bộ
node scripts/seed-local.mjs

# 4. Máy chủ API (cổng 8787) — cần có thư mục dist/ (npm run build, hoặc mkdir dist khi chỉ thử API)
npm run dev:api

# 5. Giao diện (cổng 5173, proxy /api /media /sitemap.xml sang 8787)
npm run dev
```

Tạo quản trị viên đầu tiên: đăng ký kèm `setupToken` bằng giá trị `SETUP_TOKEN` (chỉ dùng được khi chưa có admin):

```bash
curl -X POST http://127.0.0.1:8787/api/auth/register -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"matkhau-dai","name":"Quản trị","setupToken":"<SETUP_TOKEN>"}'
```

## Tải audio (quản trị)

1. `POST /api/admin/tracks {title, description, format: "hls"|"file", episodeCount}` → track `processing`, slug sinh tự động (bỏ dấu, trùng thì `-2`, `-3`…).
2. Mỗi tệp: `PUT /api/admin/upload/<id>/<đường dẫn tương đối>` (thân = nội dung tệp). Chỉ nhận `.m3u8 .ts .m4s .aac .mp3 .m4a .mp4 .jpg .png .webp`, cấm `..`. Ghi vào R2 `tracks/<id>/<path>`.
3. `POST /api/admin/tracks/<id>/complete {durationSeconds, entry}` (entry = `master.m3u8` hoặc `audio.mp3`) → `ready`.

Xoá track xoá luôn mọi tệp R2 dưới `tracks/<id>/`.

## Ghi chú vận hành

- Mật khẩu băm PBKDF2-SHA256 (WebCrypto, salt 16 byte, 100 000 vòng — mức tối đa Workers cho phép).
- Phiên: cookie `sid` httpOnly, SameSite=Lax, Secure (trừ localhost), hạn 30 ngày; D1 chỉ lưu SHA-256 của sid.
- `MEDIA_PUBLIC_BASE` (wrangler.jsonc `vars`): để trống thì media phục vụ qua `/media/<key>` (hỗ trợ Range); đặt domain R2 công khai thì URL phát trỏ thẳng tới đó.
- Trang HTML: worker lấy `index.html` từ ASSETS, chèn `window.__SITE__`, meta/OG/canonical, JSON-LD, khối `.ssr-seo` vào hai mốc `<!--ssr-head-->` / `<!--ssr-body-->`. Chưa build giao diện thì dùng khung HTML dự phòng.
- Triển khai thật (khi sẵn sàng): tạo D1/R2, thay `database_id` trong `wrangler.jsonc`, `wrangler secret put SETUP_TOKEN`, `npm run deploy`.
