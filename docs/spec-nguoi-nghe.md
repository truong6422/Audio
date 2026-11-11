# Đặc tả chức năng phía người nghe — web nghe audio kiểu "dramaaudio.online"

> Nguồn: đọc tĩnh bundle công khai `app.js` (React + Vite, react-router v7), `index-P3o8lC4q.css`, `home.html`, `track.html`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, chunk `hls-*.js`. Không chạy mã của họ, không gọi API. Mọi chữ / màu / tên dưới đây là **mô tả để tự viết lại** — khi làm bản riêng phải đổi thương hiệu, câu chữ, ảnh, bảng màu.
>
> Ghi chú: mã là **white-label** — tên thương hiệu mặc định trong code là một tên khác ("…Audio"), mọi chỗ hiển thị đều đọc từ `window.__SONG__.brandName`. Một bộ mã phục vụ nhiều tên miền.

---

## 1. Kiến trúc tổng quát (suy ra)

| Lớp | Công nghệ / cách làm |
|---|---|
| Giao diện | SPA React, react-router (`BrowserRouter` + `Routes`), không thư viện UI; CSS thuần một tệp, biến CSS ở `:root`. |
| Phát audio | Một phần tử `new Audio()` duy nhất cho toàn app (nằm trong Context, không gắn DOM). HLS: Safari / iOS dùng HLS gốc (`canPlayType("application/vnd.apple.mpegurl")`), trình duyệt khác **nạp lười** chunk **hls.js 1.6.16** (`enableWorker: true`, `lowLatencyMode: false`). |
| Media | Tệp HLS (m3u8 + segment) trên R2 / CDN tên miền phụ `media.<domain>` (có `preconnect`). URL manifest lấy qua API `GET /api/playback/:trackId` → `{ manifestUrl }` (có thể là URL ký tạm thời). |
| Biên / SSR | Cloudflare Worker (chú thích "run_worker_first") ghi đè `<title>`, description, canonical, og:url theo route; chèn `window.__SONG__` (cấu hình công khai), JSON-LD, mã GA4, mã xác minh GSC, khối HTML `.ssr-seo` trong `#root` cho bot (React thay thế khi chạy). |
| API | Tiền tố `/api`, cookie phiên (`credentials: "include"`), lỗi trả `{ error }` → hiển thị nguyên văn, mặc định "Lỗi <status>". |

### 1.1 Cấu hình công khai `window.__SONG__`

```ts
type SiteConfig = {
  brandName: string | null;        // tên thương hiệu hiển thị
  siteTitle: string | null;        // title trang chủ
  contactEmail: string | null;     // dùng ở trang Liên hệ / chính sách
  gate: { checkpoints: GateCheckpoint[] } | null;  // khoá nghe
  redirect: { enabled: boolean; links: { id: string; url: string; delaySeconds: number }[] } | null;
};

type GateCheckpoint = {
  id: string;          // vd "cpxxxxxx" — khoá sessionStorage
  fromEp: number;      // áp dụng từ tập thứ N (1-based) trở đi; mảng phải xếp tăng dần
  name: string;        // nội bộ, không hiển thị
  title: string;       // tiêu đề popup; rỗng → câu mặc định (xem §5)
  link: string;        // link mở khi bấm (affiliate)
  imageUrl: string;    // ảnh quảng cáo trong popup
  button: string;      // chữ nút; rỗng → chữ mặc định
  description: string; // dòng ghi chú nhỏ dưới nút
};
```

### 1.2 Dữ liệu suy ra từ API (người nghe)

```ts
type Track = {
  id: string;
  title: string;
  description?: string | null;
  status: "ready" | "processing" | "failed";
  durationSeconds: number | null;
  createdAt: number | null;          // epoch GIÂY
  episodeCount?: number | null;      // ≥2 thì chia tập ảo (xem §4.4)
  lockedEpisodes?: number[];         // số tập (1-based) hiện biểu tượng khoá — chỉ trang chi tiết
};
type HistoryItem = { id: string; track: Track; playedAt: number /* epoch giây */ };
type User = { id: string; email: string; displayName?: string | null };
```

| Lời gọi | Dùng ở |
|---|---|
| `GET /auth/me` → `{ user, isAdmin }` | khởi động app |
| `POST /auth/login {email,password}` / `POST /auth/register {email,password,displayName?,setupToken?}` → `{ user, isAdmin }` | đăng nhập / đăng ký (`setupToken` để tạo admin đầu tiên) |
| `POST /auth/logout` | nút Đăng xuất |
| `GET /public/tracks?limit=200` → `{ tracks: Track[] }` (mới nhất trước) | trang chủ, trang track (làm hàng đợi) |
| `GET /public/tracks/:slug` → `{ track }` | trang track |
| `GET /search?q=` → `{ tracks }` | ô tìm kiếm |
| `GET /playback/:id` → `{ manifestUrl }` | mỗi lần nạp bài (ghi lịch sử phía máy chủ khi đã đăng nhập — suy ra) |
| `GET /history` → `{ history: HistoryItem[] }` | màn Lịch sử |

**Slug**: sinh **phía client từ tiêu đề**: chữ thường → `đ`→`d` → bỏ dấu (NFD) → mọi chuỗi ký tự không phải `a-z0-9` thành `-` → cắt `-` hai đầu → tối đa 80 ký tự → rỗng thì `audio`. Máy chủ tra ngược slug. (Rủi ro: trùng tiêu đề = trùng slug; bản mình nên lưu slug duy nhất trong CSDL.)

---

## 2. Route và màn hình

| Route | Khung | Màn | Bảo vệ | robots |
|---|---|---|---|---|
| `/` | Khung chính | Trang chủ (danh sách + tìm kiếm) | — | index |
| `/track/:slug` | Khung chính | Chi tiết audio + danh sách tập | — | index |
| `/gioi-thieu`, `/lien-he`, `/chinh-sach-bao-mat`, `/dieu-khoan-su-dung`, `/mien-tru-trach-nhiem` | Khung chính | Trang thông tin tĩnh | — | index, `og:type=article` |
| `/history` | Khung chính | Lịch sử nghe | cần đăng nhập → chuyển `/login` | noindex |
| `/login`, `/register` | **không** khung (trang trơn) | Biểu mẫu | — | noindex |
| `/admin` | Khung quản trị | (ngoài phạm vi) | admin | — |
| `*` | — | chuyển về `/` (replace) | — | — |

**Không có** màn "Thư viện" / yêu thích / playlist riêng. ("Thư viện của bạn" chỉ là chuỗi `album` trong mediaSession.) Tìm kiếm không có route riêng — nằm trên trang chủ, không đồng bộ vào URL.

### 2.1 Khung chính (layout)
- **Thanh trên** dính đầu (sticky, nền mờ blur): logo = ký hiệu tròn màu nhấn + tên thương hiệu → `/`; menu: "Trang chủ", "Lịch sử" (chỉ khi đã đăng nhập), "＋ Quản trị" (chỉ admin, màu nhấn); bên phải: tên hiển thị / email + "Đăng xuất", hoặc nút "Đăng nhập".
- **Nội dung**: `<Outlet/>`, rộng tối đa 1000px, căn giữa.
- **Chân trang**: hàng link 5 trang tĩnh + "© <năm> <brand>. <khẩu hiệu ngắn>".
- Gắn cố định: thanh phát (§4), popup khoá (§5), bộ redirect (§7), màn "mở trong trình duyệt" (§6).
- Thân trang chừa đáy = chiều cao thanh phát + safe-area.

### 2.2 Trang chủ `/`
- Tiêu đề h1 ngắn ("Audio").
- Ô tìm kiếm có biểu tượng kính lúp; gõ → **debounce 250ms** → `GET /search?q=`; ô rỗng → quay về danh sách đầy đủ; đổi từ khoá → về trang 1.
- Danh sách = 200 bài mới nhất (giới hạn API), **phân trang phía client 24 bài / trang**, thanh "← Trước · Trang x/y · Sau →" (chỉ hiện khi > 1 trang).
- Dòng bài (chế độ "browse"): nút ▶ tròn bên trái là **link sang trang track** (không phát tại chỗ); tiêu đề là link; bên phải huy hiệu thời lượng (font mono, nền đen). Bài đang phát: viền màu nhấn + tiêu đề màu nhấn + biểu tượng sóng nhạc (3 vạch nhảy) thay ▶.
- Trạng thái: "Đang tải…"; trống: "chưa có audio" / "không tìm thấy" (khi đang tìm).
- Lưu ý: trên trang chủ không có xử lý lỗi tải (promise không catch) — bản mình cần thêm trạng thái lỗi.

### 2.3 Trang track `/track/:slug`
- Tải `GET /public/tracks/:slug` + song song tải danh sách công khai (làm hàng đợi).
- Đang tải → "Đang tải…"; lỗi / không có → thông báo "không tìm thấy" + nút về trang chủ.
- Bố cục: link "← Quay lại" · **thẻ chi tiết**: ô ảnh vuông 124px (không có ảnh bìa — chỉ ký hiệu thương hiệu trên nền gradient, góc dưới phải huy hiệu thời lượng) · nhãn nhỏ "Audio" · h1 tiêu đề · trạng thái (Sẵn sàng / Đang xử lý… / Lỗi) + ngày tạo (định dạng "d tháng m, yyyy" vi-VN) · nút chính **▶ Phát / ❚❚ Tạm dừng** + nút **🌙 Hẹn giờ** (popover mở xuống dưới).
  - Bấm Phát: nếu bài đang là bài hiện tại → bật/tắt; nếu không → phát **cả danh sách công khai** bắt đầu tại bài này (không tìm thấy trong danh sách → hàng đợi 1 bài).
  - Bài chưa `ready` → nút khoá + dòng "đang xử lý, quay lại sau".
- Khối "Giới thiệu" (mô tả) nếu có.
- **Danh sách tập** (chỉ khi `episodeCount ≥ 2` và có thời lượng): tiêu đề "Danh sách tập (N)"; mỗi tập một nút: số thứ tự · tiêu đề bài · thời lượng tập; tập đang phát được tô (nền nhấn nhạt) và có ♪; tập trong `lockedEpisodes` có 🔒 (số tập màu cam). Bấm tập → tua tới đầu tập (nếu bài đang phát; nếu đang dừng thì phát) hoặc nạp hàng đợi rồi bắt đầu tại vị trí đầu tập.
- Mobile ≤680px: thẻ chi tiết xếp dọc, ô ảnh rộng full, cao 132px.

### 2.4 Lịch sử `/history`
- Cần đăng nhập (chưa đăng nhập → `/login`, kèm `state.from` nhưng màn đăng nhập không dùng lại).
- Danh sách `HistoryItem`: nút ▶ phát ngay **riêng bài đó** (hàng đợi 1 bài), tiêu đề → trang track, thời lượng · "đã nghe <thời gian tương đối>" (vừa xong / x phút / x giờ / x ngày trước / ≥7 ngày → ngày cụ thể).
- Trống → "Chưa có lịch sử nghe."
- **Không lưu vị trí đang nghe dở** — chỉ lưu "đã nghe bài nào, lúc nào". Không có "nghe tiếp từ chỗ dừng".

### 2.5 Đăng nhập / Đăng ký
- Trang trơn, một thẻ ở giữa. Đăng nhập: Email, Mật khẩu; Đăng ký: Tên hiển thị (tuỳ chọn), Email, Mật khẩu (≥ 8 ký tự). Lỗi máy chủ hiện dòng đỏ trên form; nút đổi chữ khi đang gửi.
- Thành công: admin → `/admin`, người thường → `/`. Tài khoản là **tuỳ chọn** (chỉ để có lịch sử).

### 2.6 Trang tĩnh
- Danh mục cứng 5 trang `{slug, title, description}`; description có `{brand}` thay động. Nội dung là JSX viết sẵn chèn tên thương hiệu + email liên hệ.
- Đề mục: Giới thiệu (giá trị mang lại, sứ mệnh); Liên hệ (email, hỗ trợ gì, thời gian phản hồi); Chính sách bảo mật (11 mục: dữ liệu thu thập, sử dụng, cookie, quảng cáo bên thứ ba **Google AdSense**, phân tích, chia sẻ, bảo mật, quyền, trẻ em, thay đổi, liên hệ — có ngày cập nhật); Điều khoản (9 mục); Miễn trừ trách nhiệm & quy trình gỡ bản quyền (DMCA, gỡ trong 48–72 giờ). → Bản mình tự soạn lại nội dung pháp lý.

---

## 3. Trạng thái trình phát (PlayerContext)

```ts
type PlayerState = {
  queue: Track[]; current: Track | null; isPlaying: boolean;
  currentTime: number; duration: number; loading: boolean; error: string | null;
  playbackRate: number;                       // 0.25..2, lưu localStorage
  sleepRemainingMs: number | null; sleepEndOfTrack: boolean;
  gateEnabled: boolean; gatePoint: GateCheckpoint | null;
  gateOpen: boolean; gateDismissed: boolean;
};
type PlayerActions = {
  playQueue(tracks, index), playQueueAt(tracks, index, startSec), playNow(track),
  toggle(), next(), prev(), seek(sec), setRate(r), setSleepTimer(min | "track" | null),
  unlockGate(), openGate(), dismissGate()
};
```

## 4. Trình phát

### 4.1 Nạp bài
1. `playQueue` lọc chỉ bài `status === "ready"`; không còn bài → lỗi "không có bài sẵn sàng".
2. Kiểm khoá (§5) tại vị trí bắt đầu; bị khoá → chỉ **nạp sẵn nguồn** (không phát), mở popup; mở khoá xong mới phát.
3. `GET /playback/:id` → `manifestUrl`; huỷ instance hls cũ; Safari gán `audio.src`, còn lại hls.js `loadSource` + `attachMedia`; hls không hỗ trợ → lỗi "trình duyệt không hỗ trợ HLS"; lỗi fatal → "Lỗi phát HLS".
4. `play()`, đặt lại `playbackRate`, nếu có vị trí bắt đầu thì tua tới (đặt lại ở `loadedmetadata` nếu chưa được).
5. Cập nhật mediaSession metadata.
- Có cờ "tự phát khi sẵn sàng": nếu `play()` bị chặn, thử lại ở sự kiện `canplay` / `loadeddata`.

### 4.2 Thanh phát dưới đáy
- Cố định đáy, cao 88px (mobile 104px), nền gradient tối gần đặc + blur, chỉ hiện khi có `current`.
- Trái: biểu tượng sóng nhạc (5 vạch, nhảy khi phát, tắt khi `prefers-reduced-motion`) + tiêu đề + dòng phụ: lỗi (đỏ) / "Đang tải…" / "Tập x/N • Đang phát|Tạm dừng".
- Giữa: ⏮ · nút tròn chính ▶/❚❚ · ⏭ · nút tốc độ (hiện "1×", "1.25×"…; tô màu khi ≠1) · nút 🌙 (khi hẹn giờ đang chạy hiện đếm ngược hoặc "Hết bài").
- Dưới: thời gian hiện tại · thanh tua · tổng — **theo tập** nếu có chia tập (0 → độ dài tập), không phải cả tệp. Kéo thanh tua chỉ cập nhật hiển thị, **tua thật khi nhả** (pointerup / keyup).
- Mobile: lưới 2 hàng — [meta | nút] / [thanh tua full rộng].
- Popover nổi phía trên nút, rộng ~248px, có mũi tên; đóng khi bấm ra ngoài.

### 4.3 Tốc độ phát
- Thanh trượt 0.25–2, bước 0.05 + 8 nút nhanh: 0.25, 0.5, 0.75, **Chuẩn (1)**, 1.25, 1.5, 1.75, 2.
- Làm tròn 2 số lẻ, kẹp trong khoảng; lưu `localStorage["song_rate"]`, đọc lại khi mở trang (giá trị ngoài khoảng → 1); áp lại mỗi lần nạp bài.

### 4.4 Chia "tập" ảo theo thời lượng
- Một bài = **một tệp HLS liền**; nếu `episodeCount ≥ 2`, chia đều: `seg = duration / episodeCount`.
- Số tập hiện tại (1-based, dùng cho khoá): `ep = clamp(floor(t / seg) + 1, 1, episodeCount)`; không chia tập → luôn 1.
- Chỉ số tập 0-based cho hiển thị: `min(N-1, floor(t/seg))`; tập cuối kéo tới hết tệp.
- `duration` lấy từ phần tử audio, chưa có thì dùng `durationSeconds`.

### 4.5 Bài trước / bài tiếp / tự chuyển
- **Tiếp**: còn tập sau trong cùng tệp → tua tới đầu tập sau; hết → bài kế trong hàng đợi (nếu có).
- **Trước**: đã vào tập > 3 giây → về đầu tập; ở đầu tập và không phải tập 1 → về đầu tập trước; không chia tập: > 3 giây → về 0; ngược lại → bài trước trong hàng đợi.
- Sự kiện `ended` → **Tiếp** (tự chuyển bài), trừ khi hẹn giờ "Hết bài này" đang bật (khi đó dừng và tắt cờ).
- Hàng đợi từ trang track = danh sách công khai mới→cũ, nên "Tiếp" sẽ sang bài **cũ hơn**.

### 4.6 Hẹn giờ tắt
- Lựa chọn: 15 / 30 / 45 / 60 phút, "Hết bài này"; khi đang bật hiện "Còn lại mm:ss" hoặc "Sẽ dừng khi hết bài" + nút "Tắt hẹn giờ".
- Lưu thời điểm kết thúc trong state (không lưu bền); interval 1 giây; hết giờ → `pause()` và xoá hẹn giờ. "Hết bài" = hết **tệp**, không phải hết tập.

### 4.7 Media Session (màn hình khoá / tai nghe)
- Handler: play, pause, previoustrack (= Trước), nexttrack (= Tiếp), seekto.
- Metadata: `title` = tiêu đề bài, `artist` = tên thương hiệu, `album` = chuỗi cố định; **không có artwork**, không `setPositionState`. → Bản mình nên thêm ảnh bìa + position state + seekbackward/seekforward (±15s).

### 4.8 Lưu tiến độ
- **Không có** lưu vị trí nghe dở (localStorage chỉ có `song_rate`). Lịch sử nghe ghi phía máy chủ khi gọi playback (suy ra). → Bản mình nên bổ sung "nghe tiếp" (lưu `trackId + position` local, đồng bộ khi đăng nhập).

### 4.9 Định dạng thời gian
- `h:mm:ss` nếu ≥ 1 giờ, ngược lại `m:ss`; giá trị lỗi → `0:00`.

---

## 5. Cơ chế khoá nghe (gate / checkpoints)

**Mục đích**: bắt người nghe bấm một link affiliate (Shopee…) để "mở khoá" từ một tập nhất định; mở khoá có hạn.

### 5.1 Quy tắc chọn checkpoint
- Với vị trí `t`, tính `ep` (§4.4). Duyệt checkpoints (đã xếp tăng theo `fromEp`), lấy **checkpoint cuối cùng có `fromEp ≤ ep`**. Không có → không khoá.
- Đã mở khoá nếu `sessionStorage["song_unlock:cp" + id]` là timestamp (ms) và `now - ts < 6 giờ` (360 phút). Lưu ý: sessionStorage mất khi đóng tab, nên thực tế hạn = min(6 giờ, vòng đời tab).
- Mỗi checkpoint mở khoá **độc lập** — sang vùng `fromEp` lớn hơn sẽ bị hỏi checkpoint mới.
- Bỏ qua hoàn toàn trên `/admin`.

### 5.2 Khi nào hiện popup
1. **Lúc bắt đầu phát** (playQueue): vị trí bắt đầu rơi vào checkpoint chưa mở → nạp sẵn nguồn, không phát, hiện popup.
2. **Mỗi `timeupdate`** khi đang phát: chạm vùng khoá → `pause()`, hiện popup (nếu popup chưa mở). Với `fromEp = 1` → khoá ngay từ giây đầu.
3. **Khi tua** (thanh tua / bấm tập): đích bị khoá → dừng, đặt vị trí tới đích, hiện popup.
- Nếu người nghe đã bấm X rồi bấm Phát lại → `timeupdate` lại bắt và **hiện lại popup**.

### 5.3 Nội dung popup
- Lớp phủ toàn màn tối 72% + blur, hộp giữa rộng tối đa 420px, căn giữa chữ.
- **Cả hộp bấm được** (con trỏ tay) — bấm bất cứ đâu trong hộp = mở khoá.
- Thứ tự: nút **✕** tròn 44px góc trên phải → **tiêu đề** (`title`; rỗng → một câu mặc định kiểu "bạn xác nhận bấm nút là tự nguyện, có thể bấm X để thoát") → **viên thuốc link** (viền màu nhấn, font mono, "›" + URL rút gọn bằng ellipsis) → **ảnh** (`imageUrl`, full rộng, bo góc) → **nút chính** full rộng to (`button`; rỗng → chữ mặc định kiểu "Đồng ý mở <sàn> và xem sản phẩm") → **mô tả** nhỏ màu mờ (`description`, nếu có).
- `role="dialog"`, `aria-modal`.

### 5.4 Hành vi
- **Bấm hộp** → lưu `sessionStorage["song_unlock:cp"+id] = Date.now()` → đóng popup → chạy hành động chờ (phát tiếp / bắt đầu phát) → `window.open(link, "_blank", "noopener,noreferrer")`.
- **Bấm ✕** (chặn lan sự kiện) → đóng popup, đặt `gateDismissed = true`, huỷ vị trí bắt đầu chờ; audio vẫn dừng.
- Khi `gateDismissed` và popup đóng: hiện **thanh nhắc nổi** giữa đáy (trên thanh phát): chữ "Mở khoá để nghe audio" + nút **"Mở lại"** → mở lại popup.
- Trang chi tiết hiện 🔒 cho các tập trong `lockedEpisodes` (máy chủ tính, có thể không khớp trạng thái mở khoá phía client).

### 5.5 Gợi ý khi làm bản riêng
- Mỗi checkpoint nên có `id`, `fromEp`, `link`, `imageMediaId`, `title`, `buttonText`, `note`, `ttlHours` (cấu hình được, mặc định 6), `enabled`; lưu mở khoá bằng localStorage nếu muốn giữ qua tab.
- Đảm bảo nút đóng rõ ràng, tách vùng bấm (không để cả hộp là link) để tránh bị coi là quảng cáo lừa nhấp; sắp xếp checkpoint phía máy chủ thay vì giả định.

---

## 6. Màn "Mở trong trình duyệt" (in-app browser)

- Nhận diện theo User-Agent: Facebook / Messenger (`FBAN|FBAV|FB_IAB|FB4A|Messenger`), Instagram, Zalo, TikTok (`Bytedance|musical_ly|TikTok|trill`), Line, WeChat (`MicroMessenger`), Snapchat. Không khớp → không hiện.
- Khi khớp: **lớp phủ chặn toàn trang, không có nút đóng** (dùng chung kiểu hộp của gate).
  - Tiêu đề: "Bạn đang mở trong <app>"; mô tả: trình duyệt trong app không nghe được, hãy mở bằng **Safari** (iOS) / **Chrome** (khác).
  - **Android và không phải TikTok**: nút lớn "Mở bằng Chrome" → `location.href = "intent://<url không scheme>#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=<url mã hoá>;end"`.
  - **iOS hoặc TikTok**: khung hướng dẫn 2 bước: bấm nút "⋯" góc trên phải → chọn "Mở trong trình duyệt".
  - Ngăn cách "— hoặc —", ô hiển thị link (chọn được toàn bộ, bấm để chép) + nút "Sao chép liên kết" (đổi thành "Đã sao chép ✓" trong 2 giây) + dòng "dán vào <trình duyệt> để mở". Chép bằng `navigator.clipboard.writeText`.
  - Lưu ý: link chép là **origin** (trang chủ), không phải URL hiện tại → mất trang track. Bản mình nên chép `location.href`.

---

## 7. Redirect khi click (chỉ ghi nhận)

Có bộ lắng nghe click toàn trang (`capture`): sau N giây kể từ lần vào đầu phiên (`sessionStorage["song_visit_start"]`), click bất kỳ sẽ `window.open` một link cấu hình (mỗi link một lần / phiên, khoá `song_redir_<id>`). **Không làm lại.**

---

## 8. SEO

### 8.1 Phía client (hook `useSeo`)
- `document.title` = `<tiêu đề> — <brand>` (không lặp nếu đã chứa brand).
- Cập nhật / tạo: `meta description`, `og:description`, `og:title`, `og:type`, `meta robots` (`index, follow` hoặc `noindex, nofollow`), `link canonical` = origin + `canonicalPath` (không có thì URL bỏ query), `og:url`.
- Chèn `<script type="application/ld+json" data-seo="route">`, gỡ khi rời route.

| Route | title | description | JSON-LD | robots |
|---|---|---|---|---|
| `/` | `siteTitle` hoặc "<brand> — Nghe audio trực tuyến" | nghe miễn phí, không cần tài khoản | `ItemList` 50 bài đầu, mỗi phần tử `AudioObject {name, duration: PT<s>S}` | index |
| `/track/:slug` | tiêu đề bài | 155 ký tự đầu mô tả, rỗng → "Nghe "<tên>" trên <brand>." | `AudioObject {name, description, duration}` | index |
| trang tĩnh | title trang | description có `{brand}` | — (`og:type=article`) | index |
| `/history`, `/login`, `/register` | … | … | — | noindex |

### 8.2 Phía máy chủ / biên
- HTML ban đầu đã có đúng title / description / canonical / og / twitter card (`summary_large_image`) / `og:image` 1200×630 chung / `og:locale vi_VN` / `theme-color`.
- JSON-LD `WebApplication` (MultimediaApplication, giá 0) trên mọi trang; trang track thêm `AudioObject {name, url, duration, uploadDate}`.
- `#root` chứa khối `.ssr-seo` cho bot: trang chủ = danh sách link "Audio mới nhất"; trang track = h1 + link trang chủ + "Nghe thêm" 30 bài khác + link 5 trang tĩnh. `<noscript>` báo cần bật JS.
- Mã GA4 (gtag), xác minh Google Search Console, AdSense pub id, `head_code` / `body_code` tuỳ biến — chèn từ cài đặt quản trị. (Hiện đang bị chèn **trùng** gtag và một thẻ GSC sai định dạng — tránh khi làm lại.)
- `sitemap.xml`: `/` (daily, 1.0), 5 trang tĩnh (monthly, 0.3), mỗi bài `/track/<slug>` (weekly, 0.7, `lastmod`) — ~590 URL.
- `robots.txt`: cho phép tất cả; chặn `/admin`, `/login`, `/register`, `/history`, `/api/`; **mở `/api/public/`** để Googlebot render JS lấy được dữ liệu trang track; khai báo Sitemap. (Phần đầu là khối Cloudflare chặn bot huấn luyện AI.)
- `manifest.webmanifest`: PWA tối giản (standalone, nền tối, icon SVG) — không thấy service worker.

---

## 9. Giao diện (mô tả từ CSS — tự chọn bảng màu riêng)

- **Chủ đề tối duy nhất** (`color-scheme: dark`): nền gần đen, hai vầng sáng mờ (ấm góc trên phải, xanh lạnh góc trên trái); chữ màu kem; chữ phụ xám ấm; màu nhấn **hổ phách → cam** (gradient cho nút chính, có bóng phát sáng); màu phụ xanh ngọc cho focus và link trang tĩnh; đỏ cho lỗi, xanh lá cho thành công.
- **Font**: 3 họ — display (tiêu đề, thương hiệu, nút), body (nội dung), mono (thời gian, huy hiệu, link trong popup).
- Biến chính: bo góc 12px, chiều cao thanh phát 88/104px, rộng nội dung 1000px.
- **Thẻ / dòng bài**: lưới `48px | 1fr | auto`, bo 14px, viền mảnh, nền gradient hai tông panel; hover viền nhấn mờ + bóng; đang phát viền nhấn.
- **Nút**: `primary` (gradient nhấn, chữ tối, đậm), `ghost` (viền), `icon-btn` tròn; trạng thái disabled mờ 45%.
- **Popover** tốc độ / hẹn giờ: nền panel, viền, bo 12px, mũi tên tam giác; nút lựa chọn dạng ô nhỏ (lưới 2 cột cho hẹn giờ).
- **Tập**: dòng full rộng, bo 12px; đang phát nền nhấn 10%; khoá: số màu cam + 🔒.
- **Popup gate / in-app**: phủ đen + blur, hộp 420px, nút ✕ tròn lớn, viên thuốc link viền nhấn.
- Responsive một mốc **680px**; tôn trọng `safe-area-inset-bottom`; `font-size:16px` cho input (chống zoom iOS); `prefers-reduced-motion`.
- Không có ảnh bìa bài — chỉ ô biểu tượng. Bản mình nên hỗ trợ ảnh bìa (dùng cho mediaSession + og:image theo bài).

---

## 10. Khoảng trống / điểm nên làm tốt hơn khi viết lại

1. Lưu & khôi phục vị trí nghe dở; "Nghe tiếp" trên trang chủ.
2. Ảnh bìa từng bài; `og:image` theo bài; mediaSession artwork + position state + tua ±15s.
3. Slug lưu CSDL, duy nhất; tìm kiếm đồng bộ `?q=` vào URL; phân trang phía máy chủ (không giới hạn 200).
4. Trạng thái lỗi cho trang chủ / lịch sử.
5. Hàng đợi: hiển thị / chỉnh được; thứ tự "tiếp" theo bộ (series) thay vì theo ngày đăng.
6. Màn in-app: chép URL hiện tại; cho phép đóng nếu chỉ cần đọc.
7. Gate: TTL cấu hình được, nút đóng rõ ràng, không bắt cả hộp là link; bỏ redirect-on-click.
