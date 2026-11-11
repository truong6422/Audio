# Nghiên cứu đối thủ & bài học cho Kể Đêm Audio

> Ngày nghiên cứu: 11/11/2026. Chỉ đọc trang công khai qua tìm kiếm web / tải trang, không đăng nhập, không tải mã của bên khác.
> Quy ước: mỗi nhận định có link nguồn; **(chưa chắc)** = nguồn yếu / bên thứ ba / suy luận của người viết; **[suy luận]** = khuyến nghị của người viết, không có nguồn trực tiếp.
> Một số trang Shopee (`shopee.vn/affiliate/...`, `affiliate-blog.shopee.vn`) trả 503 cho công cụ tải trang — phần trích các trang đó lấy qua trích đoạn của máy tìm kiếm, ghi rõ tại chỗ; **nên mở bằng trình duyệt đọc lại bản hiện hành trước khi chốt**.

Bối cảnh so sánh: bản gốc (dramaaudio.online, xem `spec-nguoi-nghe.md`, `spec-may-chu-quan-tri.md`) là một danh sách bài dài, chia tập ảo, khoá bằng popup link Shopee 6 giờ, ép mở trình duyệt ngoài. Bản Kể Đêm Audio hiện đã có sẵn trong CSDL: `slug` duy nhất, `cover_url`, `format` (`hls` | `file`), `history.position_seconds`, `play_count`, `unlock_events` (`migrations/0001_init.sql`).

---

## 1. Đối tượng tham khảo (tóm tắt)

| Bên | Mô hình | Điểm đáng học | Nguồn |
|---|---|---|---|
| **Pocket FM** (Ấn Độ → Mỹ) | Truyện audio nhiều tập ngắn; vài tập đầu miễn phí, sau đó **chờ để mở miễn phí hoặc trả xu**; có quảng cáo khi mở tập + gói bỏ quảng cáo; chuỗi ngày nghe (streak) tặng xu | Doanh thu chạy năm ~500 triệu USD, trong đó ~85 triệu từ quảng cáo, ~415 triệu từ người nghe trả tiền mở từng tập; Mỹ ~70% doanh thu; giữ doanh thu 12 tháng 76% | [TechCrunch 2024](https://techcrunch.com/2024/03/20/pocket-fm-bags-103m-in-funding-as-it-eyes-global-expansion), [App Store](https://apps.apple.com/us/app/pocket-fm-audio-series/id1538433480), [Trợ giúp Pocket FM – tập khoá / mở](https://pocketfm.freshdesk.com/support/solutions/articles/88000058064-what-is-the-difference-between-unlocked-episodes-locked-episodes-and-scheduled-episodes-) |
| **Kuku FM** (Ấn Độ) | **Thuê bao** nghe không giới hạn (~₹99/tháng, ₹899/năm), "tập đầu miễn phí", có mở lẻ bằng xu; gần như không quảng cáo | Lượt tải cao hơn nhưng doanh thu trong app thấp hơn Pocket FM (theo Appfigures) | [App Store](https://apple.co/3FIpdqY), [Vertex Ventures](https://vertexventures.sg/news/india-s-kuku-snags-85m-as-mobile-content-wars-intensify), [TechCrunch 2023](https://techcrunch.com/2023/09/20/google-backed-indian-audio-platform-kuku-fm-raises-25-million) |
| **Kakao Page** (Hàn – truyện tranh/tiểu thuyết mạng) | **"Wait-or-Pay"**: chờ N giờ để mở tập kế miễn phí, hoặc trả tiền ngay | Tự công bố: tỉ lệ mua tăng từ **3–4% lên 25%** sau khi đổi sang Wait-or-Pay (2014) | [Kakao – lịch sử](https://www.kakaocorp.com/page/detail/9441?lang=ENG), [Asiae 2022](https://www.asiae.co.kr/en/article/2022120116233162297) |
| **Spotify (sách nói)** | Gói Premium / Audiobooks | Hẹn giờ ngủ, nhảy chương, "nghe tiếp đúng chỗ tối qua" | [Spotify newsroom – sleep timer](https://newsroom.spotify.com/tag/sleep-timer), [Engadget](https://www.engadget.com/entertainment/streaming/spotify-drops-a-bunch-of-new-tools-for-audiobooks-including-a-sleep-timer-173327861.html) |
| **Fonos** (VN) | Hội viên 99k/tháng, 899k/năm, các gói Lite/Premium; "thẻ sách" | Hẹn giờ tắt, đổi tốc độ | [App Store VN](https://apps.apple.com/vn/app/fonos-s%C3%A1ch-n%C3%B3i-podcourse/id1491002000), [FPT Shop](https://fptshop.com.vn/tin-tuc/giai-tri/fonos-thu-vien-sach-noi-voi-3000-noi-dung-phong-phu-mang-den-nhieu-thong-tin-huu-ich-cho-nguoi-dung-168937) |
| **Voiz FM** (VN) | VIP "từ 2.000đ/ngày", nghe không giới hạn | Trang bên thứ ba dẫn "tải app để nghe trọn vẹn" | [App Store](https://apps.apple.com/app/id1447395824), [Sforum](https://cellphones.com.vn/sforum/app-nghe-truyen-audio) |
| **audiotruyen.org** (web truyện audio VN) | Web miễn phí, SEO là chính | Menu theo thể loại, URL `/{the-loai}/{slug}.html`, tag `/tim-kiem/{tag}`, "Mới cập nhật", "Bảng xếp hạng" theo lượt nghe, nhãn FULL/HOT, trình phát có **tua ±30s**, **hẹn giờ 15/30/60 phút / hết tập này**, nút "Yêu thích", "Báo lỗi tập" | Trang [chủ](https://audiotruyen.org/) và [chi tiết](https://audiotruyen.org/huyen-huyen/dao-quan.html) (đọc 11/2026); lưu lượng chủ yếu từ Google theo [Semrush](https://tr.semrush.com/website/audiotruyen.org/overview) (chưa chắc) |
| **truyenaudiocv.org** | Đã đóng cửa, chuyển hướng sang công cụ AI; nhắc hoàn tiền VIP | Bài học: site truyện audio miễn phí khó sống bằng VIP | [Trang chủ](https://truyenaudiocv.org/) |
| **Kênh YouTube "truyện đêm khuya / chuyện nhà"** | Video dài, đăng giờ cố định (vd. 19h), chủ đề gia đình, bí mật, twist | Lịch đăng cố định; định vị "nghe đêm khuya" | [vidIQ – Đọc Truyện Đêm Khuya](https://vidiq.com/youtube-stats/channel/UCMgmVxJiRoTecW4uHxoBQ8A), [vling – Chuyện Nhà Sóng Gió](https://vling.net/en/channel/UCaOxm7PQgtXs5R08Jp2NDRQ/channel-info) (số liệu bên thứ ba, chưa chắc) |
| **Wattpad** | Truyện chữ ra từng chương | Người theo dõi nhận thông báo mỗi chương mới; tác giả xem tỉ lệ rơi theo chương | [goodereader](https://goodereader.com/blog/?p=88295), [scribecount](https://scribecount.com/author-resource/publishing-wide/wattpad-for-indie-authors) (chưa chắc — không có số liệu chính thức) |

---

## 2. Giao diện trình phát & trang truyện trên điện thoại

### 2.1 Những gì các bên đều có
- **Hẹn giờ ngủ** gần như là mặc định: Spotify, Fonos, Pocket FM, audiotruyen ([Spotify](https://newsroom.spotify.com/tag/sleep-timer), [FPT Shop – Fonos](https://fptshop.com.vn/tin-tuc/giai-tri/fonos-thu-vien-sach-noi-voi-3000-noi-dung-phong-phu-mang-den-nhieu-thong-tin-huu-ich-cho-nguoi-dung-168937), [Pocket FM App Store](https://apps.apple.com/us/app/pocket-fm-audio-series/id1538433480), [audiotruyen](https://audiotruyen.org/huyen-huyen/dao-quan.html)). audiotruyen có lựa chọn **"hết tập này"** — khác bản gốc dramaaudio chỉ có "hết bài" (= hết tệp, vài giờ).
- **Tua ±30 giây** là nút chính trên audiotruyen; bản gốc dramaaudio không có (chỉ thanh tua). Media Session có `seekbackward` / `seekforward` để điều khiển từ màn hình khoá ([web.dev – Media Session](https://web.dev/articles/media-session), [Chrome blog](https://developer.chrome.com/blog/media-session/)).
- **Ảnh bìa + metadata màn hình khoá**: Media Session hỗ trợ `artwork`, `setPositionState` hiển thị vị trí / tốc độ trên màn khoá ([MDN MediaSession](https://developer.mozilla.org/docs/Web/API/MediaSession)); hỗ trợ không đồng đều giữa trình duyệt ([w3cub/MDN](https://docs.w3cub.com/dom/media_session_api)).
- **Tốc độ phát**, **nghe tiếp đúng chỗ** (Spotify quảng bá "continue right where you left off") ([Spotify Audiobooks](https://www.spotify.com/de-en/audiobooks/)).
- Spotify đặt hẹn giờ trong màn "Đang phát" / hàng đợi ([Spotify community](https://community.spotify.com/t5/iOS-iPhone-iPad/Audiobook-timer-not-working/m-p/6887766)); có báo lỗi "hết chương" không dừng — chứng tỏ người nghe **rất để ý tính năng này**.

### 2.2 Lỗi người nghe phàn nàn (để tránh)
- Pocket FM: thông tin mở khoá không rõ ràng; giao diện rối; **mất tiến độ "xem quảng cáo để mở" khi chuyển app**; số lượt mở / thời gian chờ thay đổi không giải thích ([Kimola – phân tích đánh giá](https://kimola.com/reports/insightful-pocket-fm-user-feedback-analysis-report-app-store-in-145967), [App Store](https://apps.apple.com/us/app/pocket-fm-audio-series/id1538433480)).
- Pocket FM: xu từ streak **tự bị tiêu** mở tập kế mà không hỏi ([tổng hợp đánh giá App Store](https://apps.apple.com/in/app/pocket-fm-audio-series/id1538433480)) (chưa chắc — đánh giá cá nhân).

### 2.3 Áp vào Kể Đêm Audio [suy luận]
1. **Hai lớp trình phát**: thanh mini dưới đáy (như bản gốc) + **màn "Đang phát" toàn màn** khi chạm thanh mini: ảnh bìa lớn, tên truyện, "Tập 3/8", thanh tua theo tập, hàng nút lớn **⟲15 · ⏮ · ▶ · ⏭ · ⟳15** (hoặc 30), hàng phụ: tốc độ · hẹn giờ · danh sách tập. Người nghe nữ 25–50, dùng một tay, nghe khi làm việc nhà / trước khi ngủ → nút lớn (≥ 48px), chữ ≥ 16px, tương phản tốt.
2. **Hẹn giờ "Hết tập này"** (tập ảo, không phải hết tệp) + 15/30/45/60 phút; khi hẹn giờ sắp hết thì **giảm dần âm lượng 10–15 giây** thay vì cắt ngang.
3. **Media Session đầy đủ**: artwork = `cover_url` (nhiều cỡ), `setPositionState` theo cả tệp, `seekbackward/forward`, `title` = "Tên truyện – Tập x".
4. **Trang truyện**: ảnh bìa 1:1 lớn ngay đầu, nút **"Nghe tiếp tập x (còn mm:ss)"** nếu đã nghe dở, nếu chưa thì "Nghe từ đầu"; danh sách tập có **vạch tiến độ từng tập** (đã nghe / đang dở / chưa), biểu tượng khoá chỉ hiện **đúng trạng thái mở khoá của chính người nghe**.
5. **Nút "Báo lỗi tập"** (học audiotruyen) — rẻ, giúp phát hiện tệp hỏng.

---

## 3. Giữ chân người nghe

### 3.1 Bằng chứng
- **Nghe tiếp** là chức năng nền của mọi app lớn (Spotify ở trên; app "Nghe Đọc Truyện" VN ghi rõ "nghe tiếp" là tính năng — [App Store](https://apps.apple.com/vn/app/id6448612753)).
- **Theo dõi + thông báo tập mới**: Wattpad gửi thông báo cho người theo dõi mỗi chương mới ([scribecount](https://scribecount.com/author-resource/publishing-wide/wattpad-for-indie-authors)) (chưa chắc về hiệu quả — không có số liệu công khai).
- **Chuỗi ngày nghe (streak)**: Pocket FM có streak + nhắc trước khi mất chuỗi ([App Store](https://apps.apple.com/us/app/pocket-fm-audio-series/id1538433480)).
- **Lịch đăng cố định**: kênh YouTube truyện đêm khuya đăng đúng giờ hằng ngày ([vidIQ](https://vidiq.com/youtube-stats/channel/UCMgmVxJiRoTecW4uHxoBQ8A)) (chưa chắc).
- **Web push trên iPhone chỉ chạy khi web đã "Thêm vào Màn hình chính"** (iOS/iPadOS ≥ 16.4) và chỉ được xin quyền sau một thao tác của người dùng ([Daring Fireball tóm tắt bài WebKit](https://daringfireball.net/linked/2023/02/16/web-push-web-apps-ios), [OneSignal – Web push iOS](https://documentation.onesignal.com/docs/web-push-for-ios), [Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)). Safari iOS **không có** `beforeinstallprompt` → phải tự hiện hướng dẫn "Chia sẻ → Thêm vào MH chính", chỉ hiện khi ở Safari iOS và chưa ở chế độ standalone, cho tắt được ([Apple forums](https://developer.apple.com/forums/thread/807603), [web.dev – installation prompt](https://web.dev/learn/pwa/installation-prompt), [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_Web_Apps/Add_to_home_screen)).
- Tỉ lệ đồng ý nhận thông báo: số liệu chủ yếu cho app, trung vị ~49–53% (Airship 2025), dao động 23–92% theo ngành (Pushwoosh) ([Airship](https://www.airship.com/blog/a-marketers-guide-to-push-notification-benchmarks/), [Pushwoosh](https://www.pushwoosh.com/blog/push-notification-benchmarks/)). Không tìm được số tin cậy cho **web push** trên điện thoại (chưa chắc).

### 3.2 Áp vào Kể Đêm Audio [suy luận]
- **Nghe tiếp không cần đăng nhập**: lưu `trackId + position` vào localStorage mỗi 10–15 giây và khi `pause`/`pagehide`; trang chủ có dải **"Đang nghe dở"** đầu trang. Đăng nhập thì đồng bộ lên `history.position_seconds` (đã có cột).
- **Tự phát tập kế / truyện kế cùng bộ** (không phải "bài cũ hơn theo ngày đăng" như bản gốc). Cuối truyện: **thẻ "Nghe tiếp truyện tương tự"** đếm ngược 5 giây — cách giữ người nghe rẻ nhất.
- **Theo dõi truyện / tủ truyện** (localStorage trước, tài khoản sau) + **web push "có truyện mới"**: Android Chrome xin quyền được ngay sau khi nghe xong một tập; iPhone phải hướng dẫn cài PWA trước. Vì người nghe đến từ TikTok/FB và bị ép ra trình duyệt ngoài, đây là **kênh duy nhất kéo họ quay lại mà không phụ thuộc thuật toán mạng xã hội** → đáng đầu tư.
- **Lịch đăng cố định** (vd. 20h hằng ngày) ghi trên trang chủ + push đúng giờ.
- Streak: **để sau** — chỉ có ý nghĩa khi có phần thưởng (vd. streak 3 ngày = mở khoá 24 giờ thay vì 6 giờ). Không tự tiêu phần thưởng thay người nghe.

---

## 4. Kiếm tiền

### 4.1 Mô hình của các bên
| Mô hình | Ai dùng | Số liệu | Nguồn |
|---|---|---|---|
| Trả theo tập bằng xu + quảng cáo khi mở + chờ để mở miễn phí | Pocket FM | ~83% doanh thu từ người trả tiền mở tập, ~17% quảng cáo; 115 phút nghe/ngày toàn cầu, 135 phút ở Mỹ; gói xu $0.99–$19.99 | [TechCrunch](https://techcrunch.com/2024/03/20/pocket-fm-bags-103m-in-funding-as-it-eyes-global-expansion), [App Store](https://apps.apple.com/us/app/pocket-fm-audio-series/id1538433480) |
| Thuê bao không giới hạn | Kuku FM, Fonos, Voiz FM | Kuku ~94% doanh thu từ thuê bao (ước tính bên thứ ba, chưa chắc) | [valueforstartups](https://valueforstartups.in/kuku-fm) |
| Chờ hoặc trả (Wait-or-Pay) | Kakao Page, Piccoma | Tỉ lệ mua 3–4% → 25% (tự công bố); Mỹ chỉ ~4% người dùng trả tiền so với 26% ở Hàn | [Kakao](https://www.kakaocorp.com/page/detail/9441?lang=ENG), [Asiae](https://www.asiae.co.kr/en/article/2022120116233162297) |
| Quảng cáo thưởng (xem quảng cáo để mở nội dung) trên web | **AdSense Offerwall** — Google tự lo, đặt tần suất hiện lại sau khi người xem đã chọn; chỉ hiện khi có quảng cáo thưởng | — | [AdSense Help – Offerwall](https://support.google.com/adsense/answer/13865318), [Tần suất](https://support.google.com/adsense/answer/13866333), [PPC Land](https://ppc.land/google-adsense-offerwall-is-generally-available-what-it-means/) |
| Popup link affiliate để "mở khoá" | dramaaudio (bản gốc) | Không có số liệu công khai | `spec-nguoi-nghe.md` §5 |

Bài học chung: **cái "miễn phí nếu chờ" làm người nghe chấp nhận khoá** (Kakao, Pocket FM). Khó chịu nhất là luật mở khoá **không rõ / đổi liên tục** và **mất tiến độ** (Pocket FM, mục 2.2). Không tìm được tỉ lệ chuyển đổi công khai cho mô hình "bấm link affiliate để mở" (chưa chắc).

### 4.2 Rủi ro điều khoản Shopee Affiliate với kiểu "bấm link để mở khoá"

**Điều khoản chính thức tìm được:**
- *Chính sách chống hành vi gian lận đối với hoạt động tiếp thị liên kết* (help.shopee.vn) ([link](https://help.shopee.vn/portal/10/article/199468)), mục 3 cấm (trích):
  - **3.c**: dùng dịch vụ "để tạo hoặc che dấu lượt xem, tìm kiếm, nhấp chuột, hoặc chuyển đổi người dùng";
  - **3.m**: "chạy quảng cáo mồi nhử nhấp chuột (clickbait) với mục đích thu hút lượt nhấp và lưu lượng truy cập";
  - **3.j**: "đăng tải nội dung ngẫu nhiên hoặc không liên quan đến mặt hàng/gian hàng mà Đối Tác Liên Kết quảng cáo";
  - **3.f**: dùng link ở phương tiện có Nội Dung Cấm, **hoặc ở trang torrent / trang xem nội dung trực tuyến** (người viết hiểu là nhắm trang phát lậu — nhưng câu chữ đủ rộng để áp cho một web nghe audio, **(chưa chắc)** cách Shopee diễn giải);
  - **3.b / 3.t**: dùng robot / công cụ "thay đổi, giả mạo dữ liệu… lượt nhấp chuột".
  - **Chế tài (mục 4)**: cảnh báo; **loại bỏ kết quả** trong kỳ đối soát; tạm giữ hoa hồng; thu hồi tiền; **khoá tài khoản vĩnh viễn**; báo cơ quan chức năng; **phí bồi thường tới 10.000.000đ mỗi lần gian lận**, cấn trừ vào tiền trả.
- *Điều khoản hợp tác chương trình Affiliate (bản 18/08/2023)*: cấm tuyệt đối "lớp, add-ons, iFrames, **pop-up, pop-under**, site-under, quảng cáo **tự động chuyển hướng** người dùng đến Nền Tảng mà **không có sự tương tác** của người dùng" ([link](https://shopee.vn/affiliate/dieu-kien-hop-tac-chuong-trinh-tiep-thi-lien-ket-cua-shopee-viet-nam-update-18-08-2023/) — trích qua kết quả tìm kiếm, trang trả 503 khi tải, cần đọc lại).
- Định nghĩa "Đơn Hàng Thành Công" loại trừ đơn gian lận / phát sinh từ Hành Vi Bị Cấm, kể cả khi Shopee "chỉ có căn cứ hợp lý" ([điều khoản KOL 01/12/2025](https://shopee.vn/affiliate/kol-dieu-khoan-tham-gia-update-01-12-2025/) — trích qua kết quả tìm kiếm).
- Cookie ghi nhận đơn: **7 ngày**, app và web ([điều khoản KOL 01/12/2025](https://shopee.vn/affiliate/kol-dieu-khoan-tham-gia-update-01-12-2025/), [Shopee blog](https://shopee.vn/blog/tiep-thi-lien-ket-shopee-la-gi/)). Shopee SG: gắn nhãn gian lận là **quyết định cuối, không xem xét lại** ([Shopee SG FAQ](https://help.shopee.sg/portal/10/article/126383)).

**Đánh giá rủi ro [suy luận]:**
| Hành vi của bản gốc | Rủi ro | Cách giảm |
|---|---|---|
| Cả hộp popup là vùng bấm → mở Shopee | Cao: dễ bị coi là nhấp không chủ ý / clickbait (3.m) | Chỉ **một nút** rõ chữ "Mở Shopee xem sản phẩm"; nút ✕ to, tách xa |
| Bấm link để đổi lấy quyền nghe (khuyến khích nhấp) | **Trung bình–cao**: không thấy điều nào cấm đích danh "nhấp để nhận lợi ích", nhưng 3.c / 3.m / 3.j đủ rộng; lượt nhấp không có ý định mua → tỉ lệ đơn / nhấp thấp → dễ bị hệ thống chống gian lận gắn cờ (chưa chắc) | Sản phẩm **liên quan** nội dung (đồ gia dụng, mỹ phẩm, sách… hợp nhóm nữ 25–50), có ảnh / giá thật; giới hạn tần suất (6–24 giờ); đo tỉ lệ đơn / nhấp hằng tuần |
| Redirect khi click bất kỳ sau N giây | **Rất cao** (pop-up / chuyển hướng không do người dùng chủ động) | **Không làm** (spec đã bỏ) |
| Khoá từ tập 1 (popup ngay khi bấm Phát) | Cao về **SEO / Facebook** (mục 4.3) | Tập 1 luôn tự do; khoá từ tập 2–3 |
| Che giấu đích đến (link rút gọn bên thứ ba) | Trung bình | Hiện rõ tên miền shopee / s.shopee.vn trong popup |

Hệ quả xấu nhất không phải phạt mà là **mất toàn bộ hoa hồng kỳ đó + khoá tài khoản**, và khoản bồi thường tới 10 triệu/lần. → Nên **có phương án thứ hai** (AdSense Offerwall / quảng cáo thưởng, hoặc tự bán quảng cáo) và dùng chốt khoá như **công tắc chọn nguồn** (Shopee / quảng cáo thưởng / tắt).

### 4.3 Rủi ro từ Google, Meta, TikTok
- **Google Search**: overlay che phần lớn nội dung làm trải nghiệm kém; khuyên dùng banner nhỏ; chỉ ngoại lệ cho hộp bắt buộc theo luật ([Google – Interstitials and dialogs](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials), [Page experience](https://developers.google.com/search/docs/appearance/page-experience)). Màn "Mở trong trình duyệt" không nút đóng và popup khoá ngay khi vào trang đều thuộc loại này → **chỉ hiện popup khi người nghe chủ động bấm Phát / chạm tới tập khoá**, không hiện lúc tải trang; màn in-app chỉ hiện với UA in-app (Googlebot không bị ảnh hưởng).
- **AdSense** (nếu chạy song song): cấm khuyến khích nhấp quảng cáo Google, cấm đặt mã AdSense trong pop-up, cấm thưởng cho lượt nhấp; chủ site chịu trách nhiệm cả nguồn traffic từ affiliate ([AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en_US), [Google blog – pop-under](https://www.blog.google/products/adsense/clarification-around-pop-unders/)). → Không đặt quảng cáo AdSense **bên trong** popup khoá Shopee; câu chữ popup không được nhắc tới quảng cáo Google.
- **Facebook**: từ 2017 giảm phân phối bài đăng dẫn tới trang ít nội dung, nhiều quảng cáo gây phiền, **pop-up / interstitial che trang khi tải** ([Meta Newsroom 2017](https://about.fb.com/news/2017/05/reducing-links-to-low-quality-web-page-experiences/), [Meta Ad standards – low quality or disruptive](https://transparency.meta.com/policies/ad-standards/objectionable-content/low-quality-or-disruptive-experiences)). Nếu chạy quảng cáo FB dẫn về web: trang đích bị ép popup có thể bị từ chối (chưa chắc mức độ).
- **TikTok**: nội dung có mục đích chính là kéo người dùng ra khỏi nền tảng có thể không được đề xuất (nêu rõ cho LIVE); có tin TikTok giảm hiển thị nội dung dẫn mua hàng ngoài nền tảng ở nơi có TikTok Shop ([TikTok Guidelines – Accounts & features](https://www.tiktok.com/community-guidelines/en/accounts-features), [Shopifreaks](https://www.shopifreaks.com/tiktok-to-reduce-visibility-for-off-platform-commercial-content/)) (chưa chắc phạm vi áp dụng VN). → Video TikTok nên là **trích đoạn hấp dẫn**, link đặt ở bio / bình luận ghim, không ghi "bấm link Shopee".

---

## 5. SEO & lan truyền

### 5.1 Quan sát
- audiotruyen: URL `/{the-loai}/{slug}.html`, trang thể loại (~40 thể loại), trang tag `/tim-kiem/{tag}`, khối "Truyện cùng thể loại", "Bảng xếp hạng", "Từ khoá hot", lọc FULL / đang ra ([audiotruyen.org](https://audiotruyen.org/)). Lưu lượng chủ yếu từ Google ([Semrush](https://tr.semrush.com/website/audiotruyen.org/overview)) (chưa chắc).
- Google **không liệt kê** kết quả nhiều định dạng (rich result) riêng cho `AudioObject`; dữ liệu có cấu trúc chắc chắn được dùng là **Breadcrumb** và **tên trang (site name)** ([Google – Search result features](https://developers.google.com/search/docs/appearance/search-result-features)); thông tin rich result cho podcast chỉ thấy ở tài liệu cũ ([Search Engine Land](https://searchengineland.com/google-now-rolling-out-podcast-results-in-search-316673)) (chưa chắc hiện trạng).
- Ảnh OG theo trang sinh được ngay trên Cloudflare Workers (Satori / `workers-og`), có bẫy WASM & tải ảnh trong Worker ([Cloudflare tutorial](https://developers.cloudflare.com/workers/tutorials/generate-dynamic-og-images-using-workers), [dev.to – 6 pitfalls](https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle)).

### 5.2 Áp vào Kể Đêm Audio [suy luận]
- URL gọn, ổn định, không đuôi `.html`: `/truyen/<slug>` (trang truyện), `/truyen/<slug>/tap-<n>` (canonical riêng từng tập ảo, mở trình phát tại đầu tập — cho phép **chia sẻ đúng tập**), `/the-loai/<slug>`, `/tag/<slug>`. Giữ `/track/<slug>` cũ (nếu có link ngoài) bằng 301.
- **Trang thể loại / tag** có đoạn mô tả viết tay + danh sách phân trang máy chủ ("mẹ chồng nàng dâu", "ngoại tình", "báo hiếu", "đêm khuya"…) — đây là từ khoá người nghe hay gõ.
- **Ảnh bìa = ảnh OG** cho mỗi truyện (đã có `cover_url`); nếu không có thì sinh OG từ tiêu đề trên nền thương hiệu. Zalo / Facebook xem trước đều đọc `og:image` (chưa chắc — không tìm được tài liệu Zalo).
- **Chia sẻ có mốc thời gian**: nút "Chia sẻ đoạn này" tạo `/truyen/<slug>?t=1234` + Web Share API trên điện thoại; trích đoạn văn bản (tóm tắt tập) cho bot.
- JSON-LD: `BreadcrumbList` (Trang chủ › Thể loại › Truyện), `AudioObject`/`CreativeWorkSeries` để mô tả (không trông đợi rich result).
- HTML ban đầu phải có nội dung thật (tóm tắt, danh sách tập, truyện liên quan) — bản gốc đã làm qua `.ssr-seo`.

---

## 6. Hiệu năng (4G, điện thoại)

### 6.1 Dữ kiện
- **Bitrate giọng đọc**: mono 64 kbps AAC là mặc định phổ biến; 32–48 kbps mono vẫn ổn cho một giọng; Opus đạt chất lượng gần như trong suốt cho giọng nói từ ~40 kbps ([Hydrogenaudio wiki – Opus](https://wiki.hydrogenaud.io/?title=Opus), [Podnews – so sánh](https://podnews.net/article/audio-quality-comparisons), [convertintomp4](https://convertintomp4.com/blog/best-audio-format-for-audiobooks) (nguồn thương mại, chưa chắc)). 1 giờ @ 48 kbps ≈ 21,6 MB; @ 64 kbps ≈ 28,8 MB; @ 128 kbps stereo ≈ 57,6 MB.
- **HLS vs một tệp**: đa số podcast vẫn phát một tệp MP3 tải tiến dần; HLS bền hơn khi mạng chập chờn (đổi trạm), có thể đổi bitrate, nhưng tốn công đóng gói ([SoundStack](https://marketops.soundstack.com/blog/better-podcast-delivery-through-hls-key-questions-answered/)) (nguồn nhà cung cấp, chưa chắc).
- **iPhone**: Safari phát HLS gốc; Apple khuyên dùng HLS gốc trên thiết bị Apple; Managed Media Source có từ iOS 17.1, hls.js ≥ 1.5 dùng được ([hls.js README](https://github.com/video-dev/hls.js/), [Bitmovin – MMS](https://bitmovin.com/managed-media-source), [forasoft](https://forasoft.com/learn/video-streaming/articles-streaming/ios-safari-native-player)).
- **Kích thước hls.js**: ~153 KB gzip bản đầy đủ (theo trang thống kê bên thứ ba, chưa chắc); bản `light` bỏ phụ đề, DRM, alternate-audio — đủ cho audio đơn luồng ([hls.js README](https://github.com/video-dev/hls.js/), [depscope](https://depscope.dev/pkg/npm/hls.js)).
- **Chi phí R2**: không tính phí băng thông ra; đọc (Class B) **$0,36 / triệu yêu cầu**, miễn phí 10 triệu/tháng ([Cloudflare R2](https://www.cloudflare.com/products/r2/), [Pricing](https://www.cloudflare.com/pricing.md)). Bản gốc: media trả `cf-cache-status: DYNAMIC`, không `Cache-Control` (`spec-may-chu-quan-tri.md` §1) → mỗi segment là một lần đọc R2.

### 6.2 Áp vào Kể Đêm Audio [suy luận]
- **Mặc định nên dùng một tệp `.m4a` (AAC-LC mono 48–64 kbps, `faststart`) hoặc MP3 CBR**, phát bằng `<audio>` + HTTP Range — không cần tải hls.js (~150 KB) trên 4G, tua nhanh, 1 yêu cầu ban đầu thay vì hàng trăm segment. Dự án đã có `format: 'hls' | 'file'` → để **`file` làm mặc định**, `hls` cho tệp rất dài / cần nhiều chất lượng.
- Nếu dùng HLS: segment **10 giây** (1 giờ = 360 yêu cầu thay vì 600 với 6 giây), `Cache-Control: public, max-age=31536000, immutable` cho segment và bật cache Cloudflare trên tên miền media để không đọc R2 mỗi lần; dùng `hls.light` nạp lười chỉ khi trình duyệt không phát HLS gốc.
- `preconnect` tên miền media, `preload="metadata"`; trang chủ/trang truyện không chặn bởi JS trình phát (tải trình phát lười).
- Ảnh bìa: WebP/AVIF nhiều cỡ (`srcset`), 1:1 cho danh sách, 1200×630 cho OG.
- **Trình duyệt trong app**: Android dùng `intent:` mở Chrome khá tin cậy; **iOS không có cách thoát đáng tin**, chỉ còn hướng dẫn "⋯ → Mở trong trình duyệt"; Facebook Android có cài đặt "Links open externally" ([master.dev – Pitfalls of In-App Browsers](https://blog.master.dev/the-pitfalls-of-in-app-browsers/), [inapp-debugger](https://github.com/shalanah/inapp-debugger), [u2l.ai](https://u2l.ai/blog/how-to-disable-in-app-browser)) (chưa chắc hành vi bản app mới nhất). → Chép **URL hiện tại** (không phải trang chủ), thử `intent:` tự động một lần trên Android, và **cho nghe thử tập 1 ngay trong in-app** (đóng được màn nhắc) thay vì chặn cứng — nghe ngay tạo động lực mở trình duyệt ngoài hơn là tường chặn.

---

## 7. BẢNG ĐỀ XUẤT CHO KỂ ĐÊM AUDIO

Xếp theo **tác động / công sức** (trên cùng = làm trước). Công sức: S ≤ 1 ngày, M 2–4 ngày, L ≥ 1 tuần. Phần: **NN** = người nghe (web), **QT** = quản trị, **MC** = máy chủ (Worker / D1 / R2).

| # | Việc | Tác động | Công sức | Phần |
|---|---|---|---|---|
| 1 | **Nghe tiếp không cần đăng nhập**: lưu `trackId + position` localStorage mỗi 10–15s & khi `pagehide`; dải "Đang nghe dở" đầu trang chủ; nút "Nghe tiếp tập x (còn mm:ss)" trên trang truyện; đồng bộ `history.position_seconds` khi đăng nhập | Rất cao — giữ chân | S | NN (+MC đã có cột) |
| 2 | **Tập 1 luôn tự do, khoá từ tập ≥ 2**; popup chỉ hiện khi người nghe bấm Phát / chạm tập khoá, không hiện lúc tải trang | Cao — tránh phạt SEO/FB, người nghe "dính" truyện trước khi gặp khoá | S | NN + QT (chặn `fromEp = 1` hoặc cảnh báo) |
| 3 | **Popup khoá tuân thủ**: một nút rõ chữ "Mở Shopee xem sản phẩm", ✕ to tách xa, hiện tên miền đích, không để cả hộp là link, không auto-redirect; ghi luật "mở 1 lần nghe X giờ" rõ ràng; lưu mở khoá localStorage (giữ qua tab) | Cao — giảm rủi ro khoá tài khoản affiliate (phạt tới 10 tr/lần) | S | NN |
| 4 | **Media Session đầy đủ**: artwork từ `cover_url`, tiêu đề "Truyện – Tập x", `setPositionState`, `seekbackward/forward` | Cao — nghe khi tắt màn hình là kịch bản chính | S | NN |
| 5 | **Nút ⟲15 / ⟳15 (hoặc 30) lớn** + hẹn giờ **"Hết tập này"** (tập ảo) + giảm âm dần khi hết giờ | Cao — chuẩn ngành, bản gốc thiếu | S | NN |
| 6 | **Định dạng mặc định = một tệp m4a/mp3 mono 48–64 kbps** qua Range; HLS chỉ khi cần; nạp lười `hls.light` | Cao — tải nhanh 4G, nhẹ 150 KB JS, ít yêu cầu R2 | S–M | MC + QT (hướng dẫn encode / nhận tệp đơn) |
| 7 | **Cache media**: `Cache-Control: immutable` + bật cache Cloudflare trên tên miền media; segment HLS 10s | Trung bình–cao — giảm chi phí R2 Class B & độ trễ | S | MC |
| 8 | **Màn in-app**: chép URL hiện tại; Android tự thử `intent:` một lần; cho nghe thử tập 1 trong in-app, màn nhắc đóng được | Cao — nguồn chính từ TikTok/FB, giảm thoát trang | S | NN |
| 9 | **Tự phát tiếp** tập kế → truyện cùng bộ / cùng thể loại; thẻ "Nghe tiếp truyện tương tự" đếm ngược 5s cuối truyện | Cao — tăng thời lượng nghe/phiên | M | NN + MC (API gợi ý theo thể loại / `play_count`) |
| 10 | **Màn "Đang phát" toàn màn** (chạm thanh mini): bìa lớn, tập x/N, thanh tua theo tập, nút lớn, danh sách tập có vạch tiến độ | Cao — trải nghiệm chính trên điện thoại | M | NN |
| 11 | **Thể loại + tag** (bảng mới), trang `/the-loai/<slug>`, `/tag/<slug>` có mô tả viết tay, phân trang máy chủ; chọn thể loại/tag khi tải truyện | Cao — SEO dài hạn & điều hướng | M | MC (migration mới) + QT + NN |
| 12 | **URL tập** `/truyen/<slug>/tap-<n>` + `?t=` chia sẻ đúng đoạn, Web Share API; 301 từ `/track/<slug>` | Trung bình–cao — lan truyền qua Zalo/FB | S–M | NN + MC |
| 13 | **Ảnh OG theo truyện** (dùng `cover_url`; không có thì sinh từ tiêu đề bằng Worker) + `BreadcrumbList` JSON-LD | Trung bình–cao — tỉ lệ bấm khi chia sẻ | S (dùng bìa) / M (sinh ảnh) | MC + QT (bắt buộc / nhắc tải bìa) |
| 14 | **Theo dõi truyện / tủ truyện** (localStorage → tài khoản) + nhãn "Tập mới" | Trung bình | S–M | NN (+MC khi đồng bộ) |
| 15 | **PWA + Web Push "truyện mới / tập mới"**: service worker, hướng dẫn "Thêm vào MH chính" cho iPhone (chỉ Safari, chưa standalone, đóng được), xin quyền sau khi nghe xong 1 tập; quản trị gửi push khi đăng truyện | Cao về dài hạn (kênh quay lại không phụ thuộc MXH) | L | NN + MC (bảng subscription, VAPID, hàng đợi gửi) + QT |
| 16 | **Thống kê chốt khoá**: số lượt hiện popup / bấm mở / bấm ✕ / nghe tiếp sau mở, theo chốt & truyện; đối chiếu với báo cáo đơn Shopee hằng tuần (theo dõi tỉ lệ đơn/nhấp) | Cao — phát hiện sớm nguy cơ bị gắn cờ gian lận, tối ưu doanh thu | M | MC (mở rộng `unlock_events`) + QT |
| 17 | **Nguồn mở khoá thứ hai** (AdSense Offerwall / quảng cáo thưởng) hoặc công tắc chọn nguồn theo chốt — dự phòng khi tài khoản affiliate gặp sự cố | Trung bình–cao (giảm rủi ro tập trung) | M | NN + QT |
| 18 | **"Chờ để mở miễn phí"** (Wait-or-Pay kiểu Kakao): tập khoá tự mở sau N giờ nếu không bấm link — giảm cảm giác bị ép | Trung bình (chưa có số liệu cho mô hình affiliate) | M | NN + QT |
| 19 | **Lịch đăng cố định** (vd. 20h hằng ngày) + **lên lịch đăng** trong quản trị (`publish_at`) | Trung bình | S–M | QT + MC |
| 20 | **Báo lỗi tập** (nút trên trang truyện → bảng báo lỗi trong quản trị) | Thấp–trung bình, rẻ | S | NN + QT + MC |
| 21 | **Bảng xếp hạng** ("Nghe nhiều tuần này", nhãn HOT/MỚI/FULL) từ `play_count` theo cửa sổ thời gian | Trung bình | S–M | MC + NN |
| 22 | **Chuỗi ngày nghe** gắn phần thưởng (vd. 3 ngày liên tiếp → mở khoá 24 giờ); không tự tiêu thưởng | Thấp–trung bình, để sau | M | NN + MC |

**Ưu tiên giai đoạn 1 (1–2 tuần)**: #1–#8 (đều S, phần lớn phía người nghe) — đủ để vượt bản gốc về trải nghiệm và giảm rủi ro điều khoản. **Giai đoạn 2**: #9–#14, #16. **Giai đoạn 3**: #15, #17–#22.

**Ghi chú khi giao việc có đổi CSDL** (#11, #15, #16, #19, #20): theo quy tắc chung của máy này, mỗi commit chỉ một tệp migration; gộp các thay đổi CSDL chưa commit vào cùng một tệp `migrations/000N_*.sql`.
