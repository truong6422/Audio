// HỢP ĐỒNG CHUNG giữa worker/ và web/. Đổi tệp này phải báo cả hai phía.

export type TrackFormat = "hls" | "file"; // hls = thư mục .m3u8 + .ts; file = một tệp mp3/m4a
export type TrackStatus = "processing" | "ready";

export interface Track {
  id: string;
  code: number; // mã số ngắn tăng dần (1, 2, 3…) để đọc trong clip: /s/<code>
  slug: string; // duy nhất, máy chủ sinh từ title (bỏ dấu), trùng thì thêm -2, -3…
  title: string;
  description: string;
  coverUrl: string | null;
  format: TrackFormat;
  durationSeconds: number;
  episodeCount: number; // >= 1; "tập" = chia đều thời lượng: ep = floor(t / (dur/episodeCount)) + 1
  status: TrackStatus;
  playCount: number;
  category: string | null; // slug thể loại (xem Category)
  tags: string[]; // tag tự do, chữ thường không dấu-gạch (vd "me-chong", "bao-thu")
  createdAt: number; // giây Unix
}

export interface Category {
  slug: string; // vd "gia-dinh"
  name: string; // vd "Drama gia đình"
  description: string;
}

export interface PlaybackInfo {
  trackId: string;
  format: TrackFormat;
  url: string; // URL .m3u8 (hls) hoặc tệp audio (file)
}

/** Một chốt khoá: khoá từ tập fromEp trở đi (tới trước chốt kế tiếp). */
export interface LockPoint {
  id: string;
  fromEp: number;
  atSecond?: number | null; // nếu có: khoá từ đúng giây này (đặt ở cao trào), ưu tiên hơn fromEp
  name: string; // tên nội bộ cho quản trị
  title: string; // dòng trên popup; rỗng = DEFAULT_GATE_TITLE
  link: string; // link affiliate / quảng cáo
  imageUrl: string;
  button: string; // chữ nút; rỗng = DEFAULT_GATE_BUTTON
  description: string; // chữ nhỏ dưới nút
}

export const DEFAULT_GATE_BUTTON = "Đồng ý mở Shopee và tham khảo sản phẩm";
export const DEFAULT_GATE_TITLE = `Bạn xác nhận bấm “${DEFAULT_GATE_BUTTON}” là hoàn toàn tự nguyện. Bạn cũng có thể bấm X ở góc và thoát khỏi website.`;
export const UNLOCK_TTL_MS = 6 * 60 * 60 * 1000;

/** Cấu hình công khai, máy chủ chèn vào HTML: <script>window.__SITE__=...</script> */
export interface PublicSiteConfig {
  brandName: string;
  siteTitle: string;
  tagline: string;
  contactEmail: string;
  gate: { checkpoints: LockPoint[]; unlockTtlHours: number } | null; // null khi tắt khoá; unlockTtlHours mặc định 6
  inAppBrowserPrompt: boolean; // bật màn "Mở trong trình duyệt"
  categories: Category[];
  defaultOgImage: string; // ảnh OG mặc định (PNG), rỗng = dùng /og/<slug>.svg
}

/** Cài đặt quản trị (bảng settings key–value). GET/PUT /api/settings (PUT nhận một phần). */
export interface SiteSettings {
  brand_name: string;
  site_title: string;
  tagline: string;
  contact_email: string;
  gate_enabled: boolean;
  lock_points: LockPoint[];
  unlock_ttl_hours: number; // mặc định 6 (giống bản gốc)
  categories: Category[];
  default_og_image: string;
  in_app_prompt: boolean;
  head_html: string; // mã chèn vào <head> (Analytics, xác minh Search Console, AdSense…)
  body_html: string; // mã chèn cuối <body>
  ads_txt: string; // nội dung /ads.txt
}

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface HistoryItem {
  track: Track;
  positionSeconds: number;
  updatedAt: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ApiError = { error: string };

/** Sự kiện phễu: vào trang → bắt đầu nghe → chạm chốt → bấm mở khoá → nghe hết. */
export type FunnelEventType = "view" | "play" | "gate_shown" | "unlock" | "gate_dismiss" | "complete" | "share";
export interface FunnelEvent {
  type: FunnelEventType;
  trackId?: string;
  checkpointId?: string;
  source?: string; // utm_source hoặc nhận diện app (tiktok, facebook, zalo…)
  campaign?: string; // utm_campaign
}
export interface FunnelStats {
  days: number;
  rows: { day: string; source: string; view: number; play: number; gate_shown: number; unlock: number; complete: number }[];
}

/*
BỔ SUNG ĐỢT 2:
  GET  /api/public/tracks?...&category=<slug>&tag=<tag>      -> Page<Track>
  GET  /api/public/categories                                -> Category[] (kèm số bài nếu tiện: thêm trường count?)
  POST /api/public/events  FunnelEvent | FunnelEvent[]        -> { ok }   (công khai, giới hạn tần suất theo IP; không lưu IP thô)
  GET  /api/admin/funnel?days=30                             -> FunnelStats
  PATCH /api/admin/tracks/:id nhận thêm { category, tags }
  GET  /s/:code[?utm_…]  -> 302 tới /track/<slug> giữ nguyên query (mã ngắn đọc trong clip mồi); GET /api/public/tracks/by-code/:code -> { track }
  Trang HTML mới: /the-loai/:slug, /tag/:tag, /tim-kiem?q= (noindex khi có q), /track/:slug?t=<giây> (chia sẻ đúng giây; canonical bỏ t)

API — tiền tố /api, JSON, xác thực cookie phiên httpOnly "sid", lỗi trả { error } kèm mã 4xx/5xx.

Công khai
  GET  /api/public/tracks?page=1&pageSize=24&sort=new|hot     -> Page<Track>   (chỉ status=ready)
  GET  /api/public/tracks/:slug                                -> { track: Track, related: Track[] }
  GET  /api/search?q=...&page=1                                 -> Page<Track>   (tìm không dấu, không phân biệt hoa thường)
  GET  /api/playback/:id                                        -> PlaybackInfo  (+1 playCount)
  GET  /api/public/config                                       -> PublicSiteConfig

Tài khoản
  GET  /api/auth/me                     -> { user: User | null }
  POST /api/auth/register {email,password,name,setupToken?} -> { user }   (người đầu tiên có setupToken = env SETUP_TOKEN thành admin)
  POST /api/auth/login    {email,password}                  -> { user }
  POST /api/auth/logout                                     -> { ok: true }

Người dùng đã đăng nhập
  GET  /api/history                                  -> HistoryItem[] (mới nhất trước, tối đa 100)
  PUT  /api/history/:trackId {positionSeconds}       -> { ok: true }   (lưu vị trí nghe dở)

Quản trị (isAdmin)
  GET    /api/admin/tracks?page=&q=                  -> Page<Track> (mọi trạng thái)
  POST   /api/admin/tracks {title,description,format,episodeCount} -> { track }   (status=processing)
  PATCH  /api/admin/tracks/:id {title?,description?,episodeCount?,coverUrl?,durationSeconds?} -> { track }
  DELETE /api/admin/tracks/:id                       -> { ok }   (xoá bản ghi + tệp R2 tiền tố tracks/<id>/)
  PUT    /api/admin/upload/:id/<đường dẫn tương đối>  body = nội dung tệp -> { key }   (ghi R2 tracks/<id>/<path>)
  POST   /api/admin/tracks/:id/complete {durationSeconds, entry}  -> { track }  (entry = tên tệp .m3u8 hoặc tệp audio; status=ready)
  POST   /api/admin/assets  body = ảnh, header Content-Type          -> { url }   (R2 assets/<uuid>.<ext>)
  GET    /api/admin/settings                         -> SiteSettings
  PUT    /api/admin/settings  Partial<SiteSettings>  -> SiteSettings
  GET    /api/admin/stats                            -> { tracks, plays, users, unlocksToday }
  POST   /api/public/unlock {checkpointId, trackId}  -> { ok }  (công khai; chỉ đếm lượt mở khoá để thống kê)

Tệp media: GET /media/<key> đọc từ R2 (hỗ trợ Range, Content-Type đúng, cache dài).
  Nếu env MEDIA_PUBLIC_BASE khác rỗng thì URL media = MEDIA_PUBLIC_BASE + "/" + key, ngược lại "/media/" + key.

Trang HTML (worker chạy trước assets): với /, /track/:slug và trang tĩnh, worker lấy index.html từ ASSETS rồi
  - chèn <script>window.__SITE__=PublicSiteConfig</script>, head_html, body_html
  - đặt <title>, meta description, og:*, canonical, JSON-LD (AudioObject cho track), noindex cho /login /register /history /admin
  - chèn khối <noscript>/.ssr-seo chứa tiêu đề + mô tả + danh sách link cho bot.
  /sitemap.xml, /robots.txt, /ads.txt do worker sinh.
*/
