# Đối thủ cùng kiểu "bấm link sàn để mở khoá" — so sánh và đề xuất cho Kể Đêm Audio

> Ngày khảo sát: 11/11/2026. Cách làm: tìm bằng WebSearch, tải **tĩnh** HTML + JS công khai bằng `curl` (UA Android), đọc bằng `indexOf/slice` (giải mã cả script base64 nhúng). **Không** chạy mã của họ, không đăng nhập, không bấm link affiliate, không gọi API ghi. Tệp tải về: `scratchpad/doi-thu/<tên-miền>/` (chỉ để tham khảo, không đưa vào repo).
>
> Giới hạn: chỉ thấy những gì nằm trong HTML/JS phía trình duyệt; logic phía máy chủ, số liệu traffic và doanh thu không biết. Mã và chữ dưới đây là **mô tả để tự làm lại** — không chép.

## 1. Danh sách đã khảo sát

| # | Web | Loại nội dung | Ghi chú |
|---|---|---|---|
| 0 | **dramaaudio.online** (gốc) | Audio drama / truyện audio | Đã đặc tả ở `spec-nguoi-nghe.md` §5–7 |
| 1 | **truyendecu.net** | Truyện chữ ngôn tình, ngược, truyện ngắn | WordPress tự viết theme |
| 2 | **truyenhothay.site** (+ cùng hệ **doctruyenchill.net**, **hongtruyenhot.net**) | Truyện chữ cổ đại, ngôn tình ngắn | Một nền tảng, nhiều tên miền, chung 3 mã AdSense |
| 3 | **thinhhang.com** (+ cùng "bộ theme" **vivutruyen2.net**, **quytdau.blog**) | Truyện chữ (quytdau: đam mỹ) | WordPress + YOOtheme + plugin `truyen-aff`, chung Facebook appId → nhiều khả năng một nhà cung cấp bán theme / làm hộ |
| 4 | **wetruyen.com** (dtruyen.net chuyển về) | Truyện chữ tiên hiệp, convert | Click ẩn chỉ cho khách từ Google Ads |
| 5 | **dongphimngan.com** | Phim ngắn Trung (vietsub + thuyết minh) | Next.js; vừa click ẩn TikTok vừa nạp tiền / VIP |

Không tìm được web **audio** thứ hai cùng kiểu khoá (các web audio khác như sachnoiviet.net, nghetruyenaudio.com, goctruyenaudio.net dùng quảng cáo thường / app, không khoá bằng link sàn) → về mảng audio, dramaaudio gần như là mẫu duy nhất; cơ chế "khoá bằng link sàn" phổ biến chủ yếu ở **truyện chữ** và bắt đầu lan sang **phim ngắn**.

## 2. Bảng so sánh

| Tiêu chí | dramaaudio | truyendecu | truyenhothay (hệ 3 tên miền) | thinhhang (hệ 3 tên miền) | wetruyen | dongphimngan |
|---|---|---|---|---|---|---|
| **Khoá từ đâu** | Theo mốc `fromEp` (ví dụ tập 1 → Shopee, tập 2 → ShopeeFood) | Chương **chẵn** → Shopee; chương **lẻ ≥ 5** → ShopeeFood | Theo mốc chương (khoá `popup_redirect_<n>`, mỗi mốc riêng) | Đúng **chương 2** (Shopee) và **chương 4** (Lazada), dò theo URL chứa `chuong-2` / `chuong-4` | Không khoá nội dung | Không khoá bằng link; khoá phim bằng **ví tiền / SVIP** |
| **Mở lại sau** | 6 giờ (sessionStorage → thực tế mất khi đóng tab) | **1 lần / ngày** (khoá localStorage theo ngày) | **6 giờ** (localStorage có hạn 21 600 s) | Cookie **5 phút** (dù chữ ghi "1 lần trong ngày") | Cookie 3 ngày sau khi đã bị ép mở Shopee | — |
| **Popup** | Lớp phủ tối + blur, hộp 420px, ✕, link dạng viên thuốc, ảnh, nút to; **cả hộp là vùng bấm** | Thay nội dung chương bằng hộp: "Mời bạn CLICK… MỞ ỨNG DỤNG SHOPEE để mở khoá", gif tay chỉ, link chữ + ảnh sản phẩm thật + tên sản phẩm; ghi "chỉ xuất hiện 1 lần trong ngày… mỗi click là lời cổ vũ để Sen…" | Popup hiện sau 1 s, link `spf.shopee.vn` + ảnh; bấm ✕ → **xoá nội dung chương**, ghi "Lỡ ấn x thì tải lại web là hiện popup" | Khối chèn trước nội dung, ẩn phần đọc; link chữ + ảnh | Không có popup | Không có popup sàn |
| **Click ẩn / ép mở** | Click bất kỳ sau N giây → mở link TikTok (2 link, 30 s / 60 s, mỗi phiên 1 lần) | Click bất kỳ sau **30 s** → mở ngẫu nhiên 1 trong **10 link TikTok Shop** (sản phẩm), 1 lần/ngày | **Lớp phủ trong suốt toàn màn**: TikTok sau 10 s, Lazada sau 50 s, mỗi phiên 1 lần; có gửi sự kiện GA `click_aff` | **Thẻ `<a>` trong suốt phủ toàn màn** (z-index 9999) sau 30 s → TikTok; cookie 5 phút. vivutruyen2 thêm plugin "Tiếp tục đọc" (phủ đen 90%, nút → TikTok) sau 120 s, nghỉ 30 phút, theo iOS/Android, đếm click qua admin-ajax | Nút **"Chương sau"** bị cài: bấm → mở `adflycode.com/shopee.php` tab mới rồi mới sang chương; mỗi 3 lượt xem, **chỉ với khách mobile đến từ Google Ads** (gclid / gad_source) | Lớp phủ trong suốt toàn màn, click đầu → TikTok, 1 giờ |
| **Ép trình duyệt ngoài** | Có, chặn toàn trang cho FB/Zalo/TikTok/IG…, Android có nút intent Chrome | Không thấy | Không thấy | **Có** (vivutruyen2, quytdau): chặn trong webview Facebook, hướng dẫn ••• → mở trình duyệt, ô chép link hiện tại; bỏ qua Messenger / Instagram | Có đoạn chuyển tên miền phụ về tên miền chính | Không thấy |
| **Quảng cáo khác** | AdSense (pub id trong cài đặt) | AdSense + GTM | **3 mã AdSense** trên một trang | AdSense + Facebook SDK + Site Kit | AdSense (bật có điều kiện) | Không AdSense; GA4 ×2 |
| **VIP / nạp xu** | Không | Không | Không | Không | Không | **Có**: nạp tiền bằng thẻ cào / PayPal / USDT, ví để mở khoá phim, VIP / SVIP, huy hiệu VIP trong bình luận |
| **Đăng nhập** | Có (lịch sử) | Không bắt buộc | Không thấy | Có ("Theo dõi" cần đăng nhập, Ultimate Member) | Có | Có (bình luận, nạp tiền) |
| **Công nghệ** | React SPA + Cloudflare Worker + R2, HLS | WordPress, LiteSpeed + "WPTangToc", Cloudflare | PHP tự viết (Laravel-mix, Bootstrap, jQuery), DMCA badge, analytics riêng `/_osh/collect.js` | WordPress + YOOtheme/UIkit + Yoast, Cloudflare, lazyload WPTangToc, plugin chống chép (xáo chữ bằng `data-before`) | PHP + jQuery, CDN riêng | Next.js (Turbopack), Tailwind, HLS, PWA (service worker), Cloudflare |
| **SEO** | SSR khối `.ssr-seo`, JSON-LD AudioObject, sitemap | Canonical; nội dung chương **vẫn nằm trong HTML** (chỉ ẩn bằng CSS) → bot đọc được | Canonical ×2, JSON-LD ×2 | Yoast, JSON-LD | Canonical, JSON-LD | JSON-LD `Movie` có tên gốc tiếng Trung, og:image riêng từng phim |
| **Nguồn traffic gợi ý** | Facebook / TikTok (vì có màn in-app) | Gợi ý "Truyện khác" cuối chương giữ chân; lịch sử đọc trong cookie | Facebook (popup webview) | **Facebook** rõ nhất (chặn webview FB, FB SDK) | **Google Ads** (mua traffic rồi ép click Shopee) | SEO tên phim + PWA |

## 3. Cách hay nên học

1. **Mốc khoá đổi sàn theo vị trí** (truyendecu: chẵn → Shopee, lẻ → ShopeeFood; thinhhang: ch.2 Shopee, ch.4 Lazada; dramaaudio: tập 1 Shopee, tập 2 ShopeeFood). Mỗi mốc là một chiến dịch → đo được sàn nào ăn hơn. Bản mình đã có `checkpoints` — thêm trường `platform` để thống kê theo sàn.
2. **Hạn mở khoá theo ngày lịch** (truyendecu, khoá `…_YYYY-MM-DD`) dễ hiểu với người dùng hơn "6 giờ": "mỗi ngày bấm 1 lần là nghe cả ngày". Truyenhothay dùng 6 giờ nhưng lưu **localStorage** (không mất khi đóng tab như dramaaudio).
3. **Ảnh + tên sản phẩm thật** trong popup (truyendecu lấy ảnh `susercontent` của chính sản phẩm) — trông như gợi ý mua sắm hơn là "bẫy", tăng tỉ lệ mua thật (hoa hồng tính theo đơn, không theo click).
4. **Câu chữ thân thiện, nói rõ "chỉ 1 lần trong ngày" + lời cảm ơn** ("mỗi click là lời cổ vũ…") — minh bạch giảm khó chịu.
5. **Nội dung vẫn có trong HTML cho bot** (truyendecu) → SEO không mất vì khoá. Với audio: trang tập vẫn render mô tả / tóm tắt / lời thoại tóm lược phía máy chủ.
6. **Giữ chân cuối chương**: khối "Không hợp gu? Thử truyện khác" xoay vòng đề xuất (truyendecu). Với audio: hết tập → thẻ "nghe thử bộ khác" + tự phát tập kế.
7. **Màn mở bằng trình duyệt ngoài chỉ cho webview cần thiết**, bỏ qua Messenger/Instagram, và **chép đúng URL hiện tại** (vivutruyen2) — tốt hơn dramaaudio (chép trang chủ).
8. **Đo click affiliate bằng sự kiện GA** (`click_aff`, nhãn theo sàn) và đếm 1 lần/ngày/thiết bị phía máy chủ (vivutruyen2) → biết thật số click, so với báo cáo Shopee.
9. **Mô hình lai** (dongphimngan): người không muốn bấm link có lối thoát trả phí (VIP) — dư địa doanh thu thứ hai, đồng thời là "van xả" cho người khó chịu với quảng cáo.
10. **Nhiều tên miền một nền tảng** (hệ truyenhothay, hệ thinhhang) → khi bị chặn / phạt một tên miền vẫn sống; nhưng xem rủi ro ở §4.

## 4. Cách nên tránh (rủi ro điều khoản / trải nghiệm)

| Cách làm | Ai dùng | Rủi ro |
|---|---|---|
| **Click ẩn**: lớp phủ / thẻ `<a>` trong suốt toàn màn, click bất kỳ → mở link sàn | dramaaudio, truyendecu, truyenhothay, thinhhang, dongphimngan | Điều khoản affiliate của Shopee / Lazada / TikTok Shop cấm click không chủ ý, gian lận click, "cookie stuffing" → nguy cơ bị **khoá tài khoản affiliate, thu hồi hoa hồng**. Người dùng thấy tự bật app lạ → thoát, báo xấu. |
| **Cài link vào nút điều hướng** ("Chương sau" mở Shopee) | wetruyen | Như trên + đánh lừa thao tác. |
| **Chỉ ép với khách Google Ads** (phân biệt theo gclid) | wetruyen | Gần với **cloaking** — vi phạm chính sách Google Ads (trang đích hành xử khác với người duyệt), dễ bị đình chỉ tài khoản quảng cáo. |
| **AdSense trên trang có popup chặn nội dung / lớp phủ click ẩn**, nhiều mã AdSense trên một trang | truyenhothay (3 pub), truyendecu, thinhhang | Chính sách AdSense cấm khuyến khích / đánh lừa nhấp, quảng cáo trên trang có trải nghiệm gây hiểu lầm → bị **vô hiệu hoá tài khoản**. Click ẩn có thể vô tình rơi vào quảng cáo AdSense. |
| **Bấm ✕ thì xoá nội dung**, chữ "lỡ ấn x thì tải lại" | truyenhothay | Biến ✕ thành vô nghĩa — bị coi là ép buộc; trải nghiệm tệ. |
| **Chữ nói một đằng, mã làm một nẻo** ("1 lần trong ngày" nhưng cookie 5 phút) | thinhhang, vivutruyen2, quytdau | Mất lòng tin; lạm dụng → khách bỏ. |
| **Khoá chỉ bằng CSS / cookie phía trình duyệt** | tất cả web chữ | Dễ vượt (xoá cookie, tắt CSS) — không phải rủi ro pháp lý nhưng là lỗ hổng doanh thu. Với audio thì không đáng tối ưu quá — đừng làm phức tạp. |
| **Nạp tiền bằng USDT / thẻ cào** không rõ pháp nhân | dongphimngan | Rủi ro pháp lý thanh toán tại VN; nếu làm VIP phải qua cổng hợp lệ (VNPay/MoMo…) có hoá đơn. |
| **Nội dung không rõ bản quyền** (truyện dịch lậu, phim ngắn Trung thuyết minh lại) | hầu hết | Khiếu nại DMCA → Google gỡ chỉ mục, Shopee/AdSense có thể chấm dứt hợp tác với web vi phạm bản quyền. Kể Đêm Audio nên dùng truyện tự viết / có quyền. |
| **Xoay nhiều tên miền để né phạt** | hệ truyenhothay, thinhhang, wetruyen | Bị đánh giá là mạng lưới spam; một lần phạt có thể lan cả hệ (cùng pub id / tài khoản affiliate). |

## 5. Đề xuất cụ thể cho Kể Đêm Audio

**Nguyên tắc**: một hành động **chủ ý, nhìn thấy rõ** = một lần mở khoá. Không có bất kỳ click ẩn nào.

1. **Cổng mở khoá (gate)** — giữ cấu trúc checkpoint của dramaaudio, chỉnh:
   - Mỗi checkpoint: `fromEp`, `platform` (shopee / shopeefood / lazada / tiktokshop), `link`, `imageMediaId`, `productName`, `title`, `buttonText`, `note`, `ttlMode` = `hours` (mặc định 6) **hoặc** `calendarDay`, `enabled`.
   - Lưu mở khoá ở **localStorage** (không mất khi đóng tab); đã đăng nhập thì lưu thêm phía máy chủ để đổi máy vẫn còn.
   - Tập 1 **luôn nghe tự do** (trải nghiệm trước, khoá từ tập 2 hoặc giữa tập 1 sau ~3–5 phút) — tăng giữ chân, giảm thoát ngay.
2. **Popup**: chỉ **nút chính** là vùng mở link (không để cả hộp là link); có ✕ rõ ràng 44px; bấm ✕ không xoá gì, chỉ hiện thanh nhắc "Mở khoá để nghe tiếp" (như dramaaudio). Hiển thị ảnh + tên sản phẩm thật, dòng minh bạch: "Bấm mở Shopee một lần là nghe tiếp tới <giờ hết hạn / hết hôm nay>. Bạn không cần mua gì."
3. **Không làm** "click bất kỳ → mở TikTok" (dramaaudio §7), lớp phủ trong suốt, cài link vào nút Tiếp / Phát, hay ép theo nguồn Google Ads.
4. **Trình duyệt ngoài**: giữ màn hướng dẫn, nhưng chép **URL hiện tại** (kèm vị trí đang nghe `?t=`), bỏ qua Messenger/Instagram nếu phát được, cho nút "Vẫn nghe ở đây" khi webview phát được audio (thử `canPlayType` + HLS).
5. **Đo đếm**: sự kiện `gate_view`, `gate_click` (nhãn `platform`, `checkpointId`, `trackId`), `gate_dismiss`; máy chủ đếm click 1 lần/ngày/thiết bị để đối chiếu báo cáo affiliate; bảng quản trị xem tỉ lệ click / thoát theo checkpoint.
6. **Doanh thu thứ hai (giai đoạn sau)**: gói "Không quảng cáo" qua cổng thanh toán hợp lệ — nghe không cần bấm link; tránh thẻ cào / tiền mã hoá.
7. **AdSense**: nếu dùng thì **không đặt trên lớp phủ gate**, chỉ ở trang danh sách / trang chi tiết; một pub id duy nhất.
8. **SEO**: trang tập render phía máy chủ tiêu đề + tóm tắt + (nếu có) lời thoại tóm lược, JSON-LD `AudioObject` / `PodcastEpisode`, og:image riêng từng bộ; gate không ảnh hưởng nội dung bot đọc.
9. **Giữ chân**: hết tập → tự phát tập kế + thẻ "Nghe thử bộ khác" (học truyendecu); "Nghe tiếp" trên trang chủ.
10. **Nội dung**: chỉ đăng truyện tự sản xuất / có quyền — đây là lợi thế cạnh tranh và là điều kiện để giữ tài khoản affiliate / AdSense lâu dài.

## 6. Nguồn

- Trang đã tải (đọc tĩnh): `truyendecu.net/nguoi-thay-chang-dong-tan-da-qua/chuong-2-…`, `truyenhothay.site/…/chuong-4`, `thinhhang.com/nguoi-luon-o-lai-sau-cung/`, `vivutruyen2.net/`, `quytdau.blog/…/chuong-3/`, `wetruyen.com` + `cdn.wetruyen.com/assets/truyenfull/js/main.js`, `dongphimngan.com/phim/cun-con-ngui-hoa-tuong-vi` + chunk `_next`, trang chủ `doctruyenchill.net`, `hongtruyenhot.net`, `dramaaudio.online`.
- Tìm thấy qua WebSearch (cụm "s.shopee.vn" + "chương tiếp theo", "MỞ ỨNG DỤNG SHOPEE" + "mở khóa", "phim ngắn" + "thuyết minh").
