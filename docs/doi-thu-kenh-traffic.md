# Đối thủ: kênh kéo người nghe & cách làm nội dung — Kể Đêm Audio

> Ngày nghiên cứu: 11/11/2026. Chỉ đọc trang công khai (tìm kiếm web, tải HTML công khai, trang kết quả tìm kiếm YouTube không đăng nhập). Không đăng nhập TikTok / Facebook.
> Quy ước: **(chưa chắc)** = nguồn bên thứ ba / suy luận / số liệu không tự kiểm được; **[đề xuất]** = khuyến nghị của người viết.
> Giới hạn: TikTok và Facebook không cho đọc dữ liệu khi chưa đăng nhập (trang `tiktok.com/tag/...` trả về khung trống, máy tìm kiếm không lập chỉ mục TikTok tốt) → phần TikTok / Facebook chủ yếu suy ra từ dấu vết trên web đối thủ và từ chính sách công khai. Nên dành 30 phút lướt TikTok / Facebook bằng tài khoản thật để bổ sung bảng 1.3.
> Đọc kèm: `nghien-cuu-doi-thu.md` (mô hình kiếm tiền, rủi ro Shopee), `spec-nguoi-nghe.md` (cơ chế web dramaaudio.online), `seo.md`.

---

## 1. Đối thủ đã thấy

### 1.1 dramaaudio.online — đối thủ trực tiếp (đọc HTML công khai)

| Mục | Quan sát | Nguồn |
|---|---|---|
| Tên / khẩu hiệu | "Drama Audio — Không Drama không nghe" | [trang chủ](https://dramaaudio.online) |
| Bắt đầu | Tập cũ nhất trong sitemap: **03/08/2026**; đến 11/11/2026 có **585 tập** (số mới nhất 598, có số bị bỏ / xoá) | [sitemap.xml](https://dramaaudio.online/sitemap.xml) |
| Tần suất | Tháng 8: 162 tập, tháng 9: 207, tháng 10: 182 → **~5–7 tập/ngày**, cao điểm 9–11 tập/ngày (10–17/10); từ cuối tháng 10 giảm còn **2–4 tập/ngày** | đếm `lastmod` trong sitemap |
| Độ dài | Mẫu 7 tập: 30–75 phút (1790 s … 4508 s), phổ biến **30–50 phút** | JSON-LD `AudioObject.duration` trên [trang tập](https://dramaaudio.online/track/drama-audio-so-598) |
| Đặt tên | **Chỉ đánh số**: "Drama Audio Số 598", không tên truyện, không mô tả, không ảnh bìa riêng (og:image dùng chung `og-drama.png`) | HTML trang tập |
| Gợi ý cách kéo người | Tên dạng "Số N" khớp kiểu clip mồi ghi "nghe full số N ở link bio" → người xem vào web tìm đúng số **(chưa chắc — suy luận, không thấy được clip)** | — |
| Link mạng xã hội trên web | **Không có** link TikTok / Facebook / YouTube của kênh; chỉ email liên hệ Gmail | HTML + `window.__SONG__` |
| Khoá theo chốt | Chốt 1 (từ tập ảo 1): ảnh + nút "Mở Shopee qua link https://s.shopee.vn/…" , ghi chú "Quảng Cáo trên chỉ xuất hiện 1 lần trong ngày"; chốt 2 (từ tập ảo 2): link **ShopeeFood** (`spf.shopee.vn`). Mở khoá lưu `localStorage` **6 giờ**. **Cả hộp popup là vùng bấm** (bấm bất kỳ đâu = mở Shopee) | `window.__SONG__.gate`, mã `index-*.js` |
| Kiếm tiền thứ 2 | "Redirect": sau **30 s** và **60 s** kể từ lúc vào trang, **cú bấm kế tiếp ở bất kỳ đâu** mở tab mới tới link rút gọn `vt.tiktok.com` → trang **sản phẩm / chiến dịch TikTok Shop** (tiếp thị liên kết TikTok). Mỗi link 1 lần / phiên | `window.__SONG__.redirect`, lần theo chuyển hướng 302 |
| Trình duyệt trong app | Nhận diện Facebook / Messenger / Instagram / Zalo / TikTok / Line…, hiện "Mở trong trình duyệt" (Android dùng `intent://` ép mở Chrome; iPhone hướng dẫn mở Safari) + nút chép link | mã `index-*.js` |
| Đo đếm | Chỉ GA4 (gắn **trùng 2 lần**); không thấy tham số `utm_` hay mã nguồn trong mã giao diện | HTML |
| Tiện ích trình phát | Tốc độ, hẹn giờ ngủ (theo phút / hết bài), màn hình khoá (Media Session), chia tập ảo | JSON-LD + mã |

**Nhận xét [đề xuất]:**
- Điểm mạnh: ra bài **rất đều và nhiều** (sản xuất hàng loạt, nhiều khả năng giọng AI **(chưa chắc)**), vào là nghe ngay, không cần tài khoản, thoát trình duyệt trong app tốt (để cookie Shopee ghi nhận).
- Điểm yếu → cơ hội cho Kể Đêm: không tên truyện, không ảnh bìa, không chia sẻ đúng tập / đúng giây, không đo nguồn kênh, popup cả hộp là link + mở tab TikTok Shop khi bấm bất kỳ đâu (trải nghiệm xấu, rủi ro bị coi là lừa nhấp — xem `nghien-cuu-doi-thu.md` mục 4.2), SEO gần như bằng 0 vì tiêu đề chỉ là số.
- Giảm từ ~6 xuống ~3 tập/ngày từ cuối 10/2026 có thể do cạn nguồn truyện hoặc kênh mồi bị bóp **(chưa chắc)**.

### 1.2 Kênh YouTube Việt cùng thể loại (trang kết quả tìm kiếm YouTube, xếp theo lượt xem, 11/11/2026)

| Kênh | Người đăng ký | Định dạng / giọng | Video tiêu biểu (lượt xem · độ dài) | Gắn link / CTA trong mô tả kênh |
|---|---|---|---|---|
| [RADIO Hay](https://www.youtube.com/@RADIOHayOfficial) | ~706 N | Radio đọc truyện đời sống – gia đình, giọng người đọc diễn cảm | "Con Dâu Bản Lĩnh Trị Mẹ Chồng – Nghe Đọc Truyện Đêm Khuya Ngủ Ngon" 871 N · 2:03:55; "Ân Oán Mẹ Chồng Nàng Dâu" 359 N · 1:50:57 | Không link ngoài; định vị "lát cắt đời sống, bài học" |
| [AUDIO Truyện Hay Official](https://www.youtube.com/@AUDIOTruyenHayOfficial) | ~940 N | Truyện hôn nhân gia đình, **MC Minh Ngọc** (giọng nữ người thật) | "Sự Trả giá của kẻ bạc tình" 3,0 Tr · 3:22:39 | Gắn tên MC làm thương hiệu |
| [Phụng Miên Audio](https://www.youtube.com/@Ph%E1%BB%A5ngMi%C3%AAnAudio) | ~51,6 N | Truyện ngắn mạng (trà xanh, vả mặt, mẹ chồng), ảnh tĩnh + giọng đọc | "Cả Nhà Tôi Là Tổ Nghề Diệt Trà Xanh" 2,3 Tr · 59:04 | Kéo sang kênh phụ "Phụng Miên Review" |
| [Túi Mù Audio](https://www.youtube.com/@T%C3%BAiM%C3%B9Audio) | ~15,8 N | Truyện ngắn: ngôn tình, vả mặt, báo thù, trùng sinh | "Gả Thay Em Gái, Tôi Được Mẹ Chồng Cưng Tận Nóc" 1,27 Tr · 43:24 | Ghi "Nội dung do Túi Mù Audio tự sản xuất. Không reup" + email xử lý bản quyền |
| [Dứa Audio](https://www.youtube.com/@DuaAudio-n8u) | ~30 N | Truyện ngắn mạng | "Tôi Lười Đến Mức Khiến Trà Xanh Trầm Cảm" 2,6 Tr · 38:36 | — |
| [Tâm Hồn Ăn Uống](https://www.youtube.com/@tamhonanuong) (YumUp) | ~153 N, 870 video | **Hình làm bánh / nấu ăn + giọng kể tâm sự** đánh số "Tâm sự số 1214" | "Mẹ chồng thay con dâu đá bay trà xanh" 317 N · 30:16 | **Google Form nhận tâm sự người xem** → nguồn truyện tự có, không vướng bản quyền |
| Chuyện Kể Tuổi Xế Chiều, Tâm Sự Tuổi Già, Kỷ Niệm Tuổi Già, Tâm Tình Tuổi Xế Chiều | (không lấy được) | Tâm sự tuổi già, "Tâm sự cùng Văn Sâm", người cao tuổi kể | 0,9–1,3 Tr · 1:09–1:42 | — |
| ĐH Audio | (không lấy được) | Truyện "nhà chồng đuổi… tôi khiến họ hối hận" | 605 N · **3:16:15**, đăng 4 tuần trước | — |
| [Nàng Dâu Online](https://www.youtube.com/@nangdau.online) | ~1,65 Tr | Phim ngắn người thật (không phải audio) | — | Link TikTok + link rút gọn trong mô tả |

Số đăng ký lấy từ trang kênh công khai lúc đọc; lượt xem từ trang tìm kiếm. Một số kênh "Kể Chuyện Trải Đời" (~25 N, lập 14/02/2026) theo [vling.net](https://vling.net/channel/UCv-RrMFG-6g5HE1H7aZX5wA/channel-info) **(chưa chắc)**.

**Shorts cùng chủ đề** (tìm "truyện audio mẹ chồng nàng dâu shorts"): đa số **1–5 N lượt xem**, đánh số phần "p5, p6, p11", nền **video nấu ăn / skincare / làm bánh** + giọng kể, hashtag `#truyenaudio #mechongnangdau #shorts`; một số "Full ~ …" đăng 2–33 N. → Shorts kiểu cắt phần có lượt xem thấp hơn hẳn video dài **(chưa chắc — mẫu nhỏ)**.

### 1.3 TikTok / Facebook (chưa đọc được trực tiếp)

| Nền tảng | Điều suy ra được | Mức tin |
|---|---|---|
| TikTok | dramaaudio.online gắn link TikTok Shop và có màn thoát trình duyệt TikTok → **lượng người vào từ trình duyệt trong app TikTok là đáng kể** | (chưa chắc) |
| TikTok | Định dạng phổ biến trên Shorts / Reels cùng thể loại: chia "phần 1, 2, 3…", nền video thoả mãn mắt (nấu ăn, làm bánh, skincare, chơi game, cát động lực), phụ đề chữ to, giọng AI kể ngôi thứ nhất | (chưa chắc) |
| Facebook | dramaaudio.online nhận diện `FBAN/FBAV/Messenger` riêng → có traffic từ Facebook / Messenger; kiểu thường thấy: Reels + **link ở bình luận ghim / bình luận đầu** | (chưa chắc) |
| Cả hai | Việc cần làm: dùng tài khoản thật tìm `#truyenaudio`, `#mechongnangdau`, `#tamsugiadinh`, `#truyendemkhuya`, `drama audio số`, ghi 10 kênh: số follow, tần suất, độ dài, link bio (Linktree / web riêng / Shopee), câu CTA | — |

---

## 2. Công thức nội dung (rút từ tiêu đề / định dạng ở mục 1)

### 2.1 Chủ đề ăn khách (theo lượt xem quan sát được)
1. **Mẹ chồng – nàng dâu** (cả hai chiều: mẹ chồng ác / mẹ chồng cưng dâu "tận nóc").
2. **Trà xanh / tiểu tam / chồng phản bội** → "vả mặt", "khiến họ hối hận".
3. **Nhà chồng đuổi / ly hôn tay trắng → lật kèo** (thừa kế, con gái trùm, hào môn).
4. **Tuổi già**: con cái bất hiếu, "về già đừng ở với con", giả vờ lú lẫn thử con dâu.
5. **Bí mật động trời**: đêm tân hôn, chồng mất báo mộng, đập tường phát hiện…
6. Trùng sinh / xuyên sách (truyện mạng Trung Quốc chuyển ngữ) — **rủi ro bản quyền cao**.

### 2.2 Kiểu tiêu đề (mẫu thật, đã bỏ tên kênh)
- **Nhân vật + biến cố + cái kết:** "Chồng Vừa Mất, Nhà Chồng Đuổi 3 Mẹ Con Tôi Đi Tay Trắng, Tôi Đã Khiến Họ Phải Hối Hận".
- **Đảo ngược mong đợi:** "Gả Thay Em Gái, Tôi Được Mẹ Chồng Cưng Tận Nóc"; "Tôi Lười Đến Mức Khiến Trà Xanh Trầm Cảm".
- **Tiền tố khen + chủ đề + lợi ích nghe:** "Truyện Hay Ai Nghe Cũng Đều Khen: … – Nghe Đọc Truyện Đêm Khuya Ngủ Ngon".
- **Chữ IN HOA phần móc:** "MẸ CHỒNG CHO NHÀ TIỀN TỶ, ĐÊM TÂN HÔN CON DÂU KHÓC HẬN VÌ BÍ MẬT CỦA CHỒNG".
- **Đánh số loạt:** "Tâm sự số 1214", "Drama Audio Số 598" → nuôi thói quen, dễ nói "nghe số N".
- Đuôi từ khoá cố định: "Đọc truyện đêm khuya", "ngủ ngon", "#truyenaudio".

### 2.3 Móc câu 3 giây đầu (clip mồi) [đề xuất, dựa trên mẫu tiêu đề]
- Câu đầu là **câu thoại gây sốc** hoặc **kết quả trước, nguyên nhân sau**: "Đêm tân hôn, mẹ chồng đưa tôi cuốn sổ đỏ… và một lời dặn khiến tôi lạnh người."
- Ngôi thứ nhất "tôi", có con số cụ thể (3 mẹ con, 7 ngày, 2 giờ sáng, tiền tỷ).
- Chữ phụ đề to trên 1/3 giữa màn hình, câu móc hiện ngay khung đầu (người xem tắt tiếng vẫn đọc được).
- Kết clip **cắt đúng lúc cao trào** + câu: "Phần sau… nghe đủ ở link trên trang cá nhân, tìm **số 123**".

### 2.4 Độ dài
| Loại | Quan sát | Đề xuất |
|---|---|---|
| Bản full (web / YouTube dài) | 30–75 phút (dramaaudio), 40 phút – 3 giờ 20 (YouTube); video triệu view phổ biến 40–120 phút | Truyện 30–60 phút; truyện dài chia tập 20–30 phút |
| Clip mồi TikTok / Reels / Shorts | Shorts chia phần (p1…p11) | 45–90 giây, 1 cao trào; Shorts ≤ 3 phút **(chưa chắc giới hạn hiện hành)** |

### 2.5 Ảnh bìa / thumbnail
- YouTube dài: ảnh minh hoạ cảnh gia đình (thường ảnh AI), mặt nhân vật cảm xúc mạnh, 3–6 chữ to (hay trùng phần IN HOA tiêu đề) **(chưa chắc — không tải ảnh về đối chiếu)**.
- Shorts / TikTok: không thumbnail riêng; dùng nền video "thoả mãn mắt" (nấu ăn, làm bánh) + phụ đề.
- dramaaudio.online: **không** ảnh bìa từng tập → link chia sẻ trên Zalo / Messenger xem như nhau.

### 2.6 Giọng đọc & nhạc nền
- Kênh lớn lâu năm dựa vào **giọng người thật có tên** (MC Minh Ngọc, "diễn đọc MC Mộc Di", "Văn Sâm") — tên giọng thành thương hiệu.
- Kênh mới (2025–2026) nhiều giọng đọc đều, ít lỗi nhịp → nhiều khả năng giọng AI **(chưa chắc)**.
- Truyện đêm khuya: giọng nữ trầm ấm hoặc nam trung, tốc độ chậm vừa; nhạc nền piano / ambient nhỏ, không lời. Clip mồi: giọng nhanh hơn ~1,1–1,2×, có nhạc căng ở cao trào [đề xuất].
- Xem thêm `giong-doc-doi-thu.md`.

---

## 3. Chính sách nền tảng liên quan

### 3.1 YouTube
| Vấn đề | Nội dung | Nguồn |
|---|---|---|
| Nội dung không xác thực (inauthentic, trước là "repetitious") | Từ 15/07/2025 đổi tên; không kiếm tiền với: slideshow ảnh / cốt truyện theo mẫu / chữ cuộn **ít hoặc không có tường thuật**; **nội dung AI theo mẫu chung chung tạo cảm giác sản xuất hàng loạt**; nhân vật lặp cùng tình huống, cùng kết quả | [Chính sách kiếm tiền YouTube](https://support.google.com/youtube/answer/1311392) |
| Ví dụ YouTube nêu đích danh | Kênh **đăng truyện kể và slideshow chỉ khác nhau bề mặt, cùng kiểu tường thuật** là mass-produced | [TechCrunch 09/07/2025](https://techcrunch.com/2025/07/09/youtube-prepares-crackdown-on-mass-produced-and-repetitive-videos-as-concern-over-ai-slop-grows), [Plagiarism Today](https://www.plagiarismtoday.com/2025/07/08/youtube-targets-inauthentic-content/) |
| Nội dung tái sử dụng | Không kiếm tiền với nội dung **chỉ đọc lại tài liệu người khác viết**; vẫn áp dụng kể cả khi được chủ gốc cho phép | [support.google.com/youtube/answer/1311392](https://support.google.com/youtube/answer/1311392) |
| Gắn nhãn AI | Bắt buộc khai báo "Altered or synthetic content" khi nội dung **trông như thật** (vd. giọng AI giả người thật có tên, cảnh thật). Truyện hư cấu rõ ràng với giọng AI thường không bắt buộc **(chưa chắc — tuỳ cách hiểu "realistic")**; khai báo không làm giảm kiếm tiền | [Help: Disclosing altered or synthetic content](https://support.google.com/youtube/answer/14328491) |
| Link trong Shorts | Link trong mô tả / bình luận Shorts không bấm được từ 2023 → dùng link ở **video dài, kênh, bình luận video dài** | (chưa chắc — nhớ theo thông báo YouTube 2023, chưa mở lại nguồn) |

→ Hệ quả [đề xuất]: kênh YouTube của Kể Đêm **không nên** là dây chuyền "ảnh tĩnh + giọng AI + truyện nhặt" — rủi ro mất YPP. Nếu làm YouTube thì cần yếu tố riêng: người dẫn có tên, lời bình / bài học cuối truyện, minh hoạ khác nhau từng truyện, truyện tự viết / mua quyền.

### 3.2 TikTok
| Vấn đề | Nội dung | Nguồn |
|---|---|---|
| Link web ở hồ sơ | Bấm được khi **≥ 1.000 follower** hoặc tài khoản doanh nghiệp đã đăng ký; chỉ thêm trên app | Bên thứ ba: [rocketlink.io](https://rocketlink.io/blog/tiktok-link-in-bio-requirements), [Buffer](https://buffer.com/fr/resources/how-to-put-a-link-in-tiktok-bio) **(chưa chắc — chưa đọc được trang trợ giúp TikTok)** |
| Điều hướng mua hàng ngoài nền tảng | Cập nhật 08/2025: **giảm hiển thị** nội dung hướng người xem **mua hàng ngoài TikTok ở thị trường có TikTok Shop** (Việt Nam có TikTok Shop) | [Shopifreaks](https://www.shopifreaks.com/?p=10030) **(chưa chắc — thứ cấp)** |
| LIVE | LIVE có mục đích chính là đẩy người ra ngoài nền tảng → không vào For You | [Community Guidelines – Accounts & features](https://www.tiktok.com/community-guidelines/en/accounts-features) (qua trích đoạn tìm kiếm) |
| Spam / tương tác giả | Xoá tài khoản spam; cấm mua bán dịch vụ tăng tương tác | như trên |
| Nhãn AI | Bắt buộc gắn nhãn với nội dung AI **trông như thật**; TikTok có thể tự gắn "AI-generated" (không gỡ được); không gắn có thể bị gỡ / hạn chế | [PetaPixel 2023](https://petapixel.com/2023/03/21/tiktoks-new-guidelines-say-ai-generated-media-must-be-disclosed), [Hootsuite](https://blog.hootsuite.com/ai-disclosure-policy-for-tiktok/) **(chưa chắc — chưa mở được trang trợ giúp TikTok, bị chuyển hướng)** |

→ [đề xuất]: clip mồi **không nhắc Shopee / mua hàng**; chỉ "nghe tiếp phần sau ở trang cá nhân". Bật nhãn AI nếu giọng AI hoặc hình AI giống người thật — rẻ hơn bị gỡ.

### 3.3 Facebook (Meta)
| Vấn đề | Nội dung | Nguồn |
|---|---|---|
| Nội dung không nguyên bản | Từ 14/07/2025: tài khoản **đăng lại nhiều lần** ảnh / video / chữ của người khác không có biến đổi đáng kể → **giảm phân phối + tạm dừng kiếm tiền**; xem trạng thái trong Professional Dashboard | [Engadget](https://www.engadget.com/social-media/meta-says-its-cracking-down-on-facebook-creators-who-steal-content-203713569.html), [Search Engine Journal](https://www.searchenginejournal.com/meta-follows-youtube-in-crackdown-on-unoriginal-content/551096/) |
| Giới hạn bài có link | Thử nghiệm 12/2025: Trang / chế độ chuyên nghiệp không có Meta Verified bị giới hạn **số bài đăng kèm link** (báo cáo ~2 bài/tháng, tuỳ tài khoản); **link trong bình luận** và link affiliate **không tính** | [TechCrunch 17/12/2025](https://techcrunch.com/2025/12/17/facebook-is-testing-a-link-posting-limit-for-professional-accounts-and-pages) **(chưa chắc đã mở rộng ra Việt Nam)** |

→ [đề xuất]: Reels không kèm link trong nội dung bài; link đặt ở **bình luận ghim** + nút / link trên Trang.

### 3.4 Bản quyền truyện & Shopee
- Chuyển thể truyện thành audio = **tác phẩm phái sinh**, phải xin phép tác giả / chủ sở hữu quyền (Luật SHTT 2005 sửa 2022, Điều 20) — [lawfirm.vn](https://lawfirm.vn/tac-pham-phai-sinh-trong-luat-so-huu-tri-tue), [Luật Hoàng Anh](https://luathoanganh.vn/tu-van-so-huu-tri-tue/tac-pham-cai-bien-tac-pham-chuyen-the-la-gi-lha2720.html) (bài phân tích của công ty luật, nên đối chiếu văn bản gốc).
- Truyện mạng Trung Quốc chuyển ngữ (trùng sinh, xuyên sách, tổng tài…) đang phổ biến trên các kênh ở mục 1.2 nhưng **gần như chắc không có quyền** → rủi ro gỡ hàng loạt, đình chỉ kênh.
- Cách an toàn mà đối thủ lớn đang dùng: **nhận tâm sự người nghe qua form** (Tâm Hồn Ăn Uống), truyện tự viết, hoặc truyện mua quyền.
- Shopee Affiliate: đơn từ hành vi bị cấm / nghi gian lận không được tính hoa hồng; chi tiết ở `nghien-cuu-doi-thu.md` mục 4.2. Trang điều khoản Shopee trả 503 khi tải — đọc lại bằng trình duyệt.

---

## 4. Quy trình đăng hằng ngày cho Kể Đêm Audio [đề xuất]

### 4.1 Nhịp đăng
| Nền tảng | Số bài/ngày | Nội dung | Giờ gợi ý (chưa chắc — cần đo lại) |
|---|---|---|---|
| TikTok (1–2 tài khoản) | 3 clip | 1 truyện mới / ngày → 3 clip mồi khác móc (đoạn mở, đoạn giữa, đoạn cao trào) | 11:30, 19:30, 21:30–22:30 |
| Facebook Reels (Trang) | 2 Reels + 1 bài chữ | Cùng clip TikTok xuất lại **không logo TikTok**; 1 bài chữ "trích 5 dòng gay cấn" + ảnh bìa truyện | 12:00, 20:30–22:00 |
| YouTube Shorts | 1–2 | Clip mồi; link không bấm được ở Shorts → dẫn về video dài / kênh | 20:00 |
| YouTube dài | 2–3 / tuần | Chỉ truyện có quyền + phần lời bình riêng (tránh 3.1) | 21:00 |
| Web | 1 truyện mới / ngày, giữ đều (đối thủ 3–7/ngày nhưng truyện "Số N" không tên) | Mỗi truyện có tên, ảnh bìa, mô tả, mã số | Phát hành trước giờ đăng clip đầu tiên |

Nguyên tắc: **ít mà có tên** (mỗi truyện một trang có thể tìm thấy) thay vì nhiều số vô danh; đều đặn quan trọng hơn số lượng.

### 4.2 Mẫu tiêu đề clip mồi
- `[Biến cố] — [kết bất ngờ]… | Số {mã}`  → "Chồng mất 7 ngày, nhà chồng đuổi mẹ con tôi ra đường… | Số 123"
- `Mẹ chồng {hành động gây sốc}, tôi chỉ nói 1 câu… (P1)`
- `Đêm tân hôn, {bí mật}. Nghe tiếp ở link trang cá nhân – số {mã}`
- Phụ đề khung đầu: ≤ 10 chữ, IN HOA từ khoá (MẸ CHỒNG, TIỀN TỶ, LY HÔN).

### 4.3 Mẫu mô tả
**TikTok / Reels:**
```
{Câu móc 1 dòng}
🎧 Nghe trọn truyện "{Tên truyện}" — số {mã} — ở link trên trang cá nhân.
Truyện hư cấu. Giọng đọc AI.   ← nếu dùng giọng AI
#truyenaudio #truyendemkhuya #mechongnangdau #tamsugiadinh #kedemaudio
```
**Bình luận ghim (Facebook / YouTube dài):**
```
Nghe full "{Tên truyện}": {domain}/s/{mã}
```
**YouTube dài – mô tả:** 2 dòng tóm tắt (không tiết lộ kết) → link `{domain}/s/{mã}` → mốc thời gian chương → "Truyện gửi bởi thính giả / sáng tác của Kể Đêm" → khai báo AI nếu cần.

### 4.4 Gắn link không bị bóp
1. **Một link duy nhất ở hồ sơ** (TikTok bio / Trang Facebook / kênh YouTube) trỏ về `{domain}/?src=tiktok_bio` (hoặc `/t` – trang đích "truyện mới hôm nay" + ô nhập mã số).
2. Clip **không đọc / ghi link, không nhắc Shopee**, chỉ nói "link trang cá nhân, số {mã}".
3. Facebook: link vào **bình luận ghim**, không vào thân bài.
4. Link rút gọn **của chính domain** (`/s/123`) — dễ đọc, dễ nhớ, không dùng dịch vụ rút gọn lạ (dễ bị chặn như spam).
5. Không dùng dịch vụ tăng tương tác, không bình luận rải link ở bài người khác.

### 4.5 Đo đếm (UTM)
Quy ước tham số:

| Tham số | Giá trị | Ví dụ |
|---|---|---|
| `utm_source` | `tiktok`, `facebook`, `youtube`, `zalo`, `share` | `tiktok` |
| `utm_medium` | `bio`, `comment`, `desc`, `story`, `share` | `bio` |
| `utm_campaign` | slug truyện | `nha-chong-duoi-me-con` |
| `utm_content` | mã clip mồi (ngày + thứ tự + tài khoản) | `20261111-c2-tk1` |

- Link rút gọn `/s/{mã}?c={clip}` → máy chủ ghi lượt bấm rồi chuyển 302 sang `/truyen/{slug}?utm_...` — người dùng chỉ thấy link ngắn.
- Vì bio TikTok chỉ 1 link, nguồn theo clip lấy bằng **mã số người nhập** ("số 123") + `utm_content` từ link bình luận ghim. Cho phép trang đích nhận `?ma=123`.
- Chỉ số cần theo dõi mỗi ngày theo `source × campaign × content`: lượt vào → bắt đầu phát → nghe ≥ 60 s → **chạm chốt** → **mở khoá (bấm link Shopee)** → nghe hết. Đối chiếu với báo cáo Shopee Affiliate bằng **Sub_id** (mỗi kênh một sub_id) **(chưa chắc — kiểm lại tên trường trong trang tiếp thị liên kết Shopee)**.
- Bảng tuần: kênh nào có tỷ lệ "mở khoá / lượt vào" cao nhất → dồn clip cho kênh đó; clip nào > 2 lần trung bình → làm thêm 2 biến thể móc khác.

---

## 5. Tính năng web nên có để phục vụ kênh traffic

| # | Tính năng | Vì sao | Ưu tiên |
|---|---|---|---|
| 1 | **Mã số ngắn cho mỗi truyện** (`/s/123`) + ô "Nhập số truyện" ở trang chủ / trang đích | Clip chỉ nói được "số 123"; đối thủ dùng "Số N" nhưng không có ô tìm số | Cao |
| 2 | **Trang đích theo UTM / nguồn**: vào từ `utm_source=tiktok&utm_campaign={slug}` mở thẳng đúng truyện, nút Phát to, vị trí bắt đầu đúng đoạn clip vừa nghe | Giảm rơi rụng giữa clip và web | Cao |
| 3 | **Ghi nhận nguồn phía máy chủ** (lưu `utm_*`, `ma`, referrer vào phiên + sự kiện `unlock_events`) và bảng thống kê theo kênh / truyện / clip | Đối thủ chỉ có GA4, không biết kênh nào ra tiền | Cao |
| 4 | **Link chia sẻ đúng tập, đúng giây** (`/truyen/{slug}?t=754` hoặc `/s/123/754`) + nút "Chia sẻ đoạn này" dùng `navigator.share`, tự gắn `utm_source=share` | Lan truyền qua Zalo / Messenger; đối thủ không có | Cao |
| 5 | **Ảnh OG riêng từng truyện** (1200×630: ảnh bìa + tên truyện + "Số 123") — sinh tự động ở Worker; có nút "làm mới ảnh chia sẻ" | Link dán vào Zalo / Messenger / Facebook ra đúng truyện; đối thủ dùng ảnh chung | Cao |
| 6 | **Đoạn trích (snippet) xuất clip mồi**: chọn khoảng thời gian → xuất MP3/MP4 dọc 9:16 kèm phụ đề + mã số, hoặc ít nhất xuất mốc thời gian + lời thoại | Rút ngắn khâu làm 3 clip/ngày | Trung bình |
| 7 | **Trang "Truyện mới hôm nay"** (`/moi`) làm đích chung cho link bio | Bio chỉ có 1 link | Cao |
| 8 | Màn **"Mở trong trình duyệt"** cho trình duyệt trong app (TikTok, Facebook, Messenger, Zalo) — **giữ nguyên tham số UTM** khi chuyển | Cookie Shopee / đăng nhập Shopee chỉ ổn ở trình duyệt chính; đối thủ đang làm | Cao |
| 9 | Chốt mở khoá **minh bạch**: nút riêng, nút đóng rõ, không biến cả hộp thành link, **không** mở tab quảng cáo khi bấm bất kỳ đâu | Tránh bị coi là lừa nhấp (Shopee, Google, trình duyệt chặn popup) | Cao |
| 10 | **Tiêu đề + mô tả + JSON-LD từng truyện** (tên truyện, thể loại, thời lượng, giọng đọc, "truyện hư cấu / giọng AI") | SEO — đối thủ chỉ có "Số N" | Trung bình |
| 11 | **Form gửi tâm sự** của người nghe (đồng ý cho chuyển thể, ẩn danh) | Nguồn truyện có quyền, như Tâm Hồn Ăn Uống | Trung bình |
| 12 | Nhãn **"Giọng đọc AI" / "Truyện hư cấu"** hiển thị trên trang truyện, và trường cấu hình để in sẵn vào mô tả mẫu | Đồng bộ với khai báo AI trên nền tảng | Thấp |
| 13 | Nút **"Theo dõi kênh TikTok / Trang Facebook"** + đăng ký nhận thông báo truyện mới (đẩy / Zalo OA) ở cuối truyện | Biến người nghe web thành người theo dõi kênh mồi; đối thủ không có link mạng xã hội | Trung bình |
| 14 | **Sinh sẵn bộ mô tả** cho từng truyện (TikTok / Reels / bình luận ghim / YouTube) với link rút gọn + UTM đúng quy ước mục 4.5 | Giảm sai sót gắn link thủ công | Trung bình |
