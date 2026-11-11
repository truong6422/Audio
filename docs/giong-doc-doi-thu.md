# Giọng đọc của đối thủ & quy trình chọn / kiểm soát giọng cho Kể Đêm Audio

> Ngày khảo sát: 11/11/2026. Phạm vi: đối thủ **dùng** giọng gì, chọn giọng ra sao, kiểm soát chất lượng thế nào. So sánh nhà cung cấp TTS (giá, API, chất lượng từng hãng) nằm ở `docs/xuong-audio-thiet-ke.md` — không lặp lại ở đây.
> Quy ước: **(suy luận)** = rút ra từ dữ kiện gián tiếp; **(chưa chắc)** = nguồn thứ cấp / theo trí nhớ, cần kiểm lại trước khi dựa vào.

---

## 1. dramaaudio.online — đo kỹ thuật thực tế

### 1.1 Cách lấy mẫu
- `GET https://dramaaudio.online/api/public/tracks?limit=5` → 5 bài mới nhất.
- `GET /api/playback/950fee3d-…` (bài "Drama Audio Số 594", 2.597 s, 2 tập) → `manifestUrl = https://media.dramaaudio.online/hls/<trackId>/master.m3u8`, `expiresIn: 21600` — **không cần đăng nhập, URL không ký** (chỉ có thời hạn danh nghĩa).
- Tải `master.m3u8`, `128k/index.m3u8`, `128k/seg_000.ts`, `64k/seg_001.ts` (tổng 6 request). Tệp lưu ở `C:/Users/dev/AppData/Local/Temp/claude/7068491d7f5cb42e/6830cb2f-bdd4-4e6e-be33-2d40ca230c86/scratchpad/giong-doi-thu/`. Đọc bằng script node tự viết (PAT/PMT của MPEG-TS + header ADTS), không nghe.

### 1.2 Kết quả đo

| Mục | Giá trị |
|---|---|
| Master playlist | HLS `EXT-X-VERSION:6`, **3 mức**: `192k` (BANDWIDTH 208.625), `128k` (140.389), `64k` (72.002), `CODECS="mp4a.40.2"` |
| Playlist mức | `VOD`, `TARGETDURATION:10`, đoạn `seg_000.ts`… — bài 2.597 s có **260 đoạn**, đoạn chuẩn **10,0078 s** (= 431 khung AAC × 1024 mẫu / 44,1 kHz), đoạn cuối 6,94 s |
| Vỏ | MPEG-TS, 1 luồng PID 256, stream_type `0x0F` (AAC ADTS), không có luồng ID3 / timed metadata |
| Codec | **AAC-LC**, **44,1 kHz**, **2 kênh (stereo)** ở cả mức 64k và 128k |
| Bitrate thực | 128k → 130,4 kbps; 64k → 66,0 kbps. Đo theo từng 0,5 s: 114–142 kbps (128k), 57–71 kbps (64k) → gần như **CBR/ABR**, không có khung "rỗng" |
| Thẻ encoder | Bảng SDT của TS ghi provider **`FFmpeg`**, service **`Service01`** (mặc định của muxer mpegts trong FFmpeg) |
| CDN | `media.dramaaudio.online` sau Cloudflare (`cf-cache-status: HIT`, `Cache-Control: public, max-age=14400`), `Last-Modified` = ngày tải lên → lưu trữ R2 (suy luận, khớp đặc tả) |
| Danh mục | Tiêu đề kiểu **"Drama Audio Số 598"**, `description: null`, đa số `episodeCount: 2`, thời lượng 31–53 phút. 5 bài mới nhất đăng trong ~22 giờ (createdAt 1794300629 → 1794379453) |

### 1.3 Suy luận về quy trình
1. **Đóng gói bằng FFmpeg phía máy chủ** (chắc): một lệnh `ffmpeg … -c:a aac -b:a {64k,128k,192k} -f hls -hls_time 10 -hls_playlist_type vod -master_pl_name master.m3u8` — đúng mẫu `seg_%03d.ts` + `var_stream_map`. Bộ mã hoá AAC gốc của FFmpeg (không phải libfdk) cho bitrate gần phẳng như đo được (suy luận).
2. **Nguồn vào là stereo 44,1 kHz** (suy luận): TTS xuất thẳng thường là **mono 22,05 / 24 kHz** (Azure, Vbee, FPT, ElevenLabs mặc định đều mono). Giữ stereo 44,1 kHz ở cả mức 64k (lãng phí cho giọng nói) cho thấy tệp gốc đã qua **phần mềm dựng / xuất video** (CapCut, Premiere… xuất AAC 44,1 kHz stereo) hoặc **tách tiếng từ video TikTok / YouTube** — hoặc đơn giản là lệnh FFmpeg không đặt `-ac 1` (chưa chắc).
3. **Có nhạc nền hay không**: không xác định được chỉ từ header vì bitrate gần như hằng — cần giải mã để đo (máy này không có ffmpeg). Khung nhỏ nhất ở 128k là 203 byte (không có khung im lặng số tuyệt đối trong 10 s đầu) → **10 s đầu có âm liên tục** (intro nhạc hoặc giọng nói liên tục) (chưa chắc).
4. **Không có metadata nguồn / tên giọng / nhãn AI**, tiêu đề đánh số, không mô tả, tốc độ ~5 bài/ngày, 31–53 phút/bài → nhiều khả năng là **gom lại nội dung đã có từ kênh TikTok / YouTube** ("truyện audio drama" dài 30–50 phút là định dạng điển hình của các kênh YouTube) hoặc dây chuyền TTS tự động hàng loạt (suy luận). Không có dấu hiệu QC công khai nào (không ghi người đọc, không chương mục, không phân biệt giọng người / AI).
5. **Bài học cho mình**: mã hoá thoại **mono**, 44,1 / 48 kHz, các mức 48k (HE-AAC) / 96k (AAC-LC) là đủ; ghi `voice_credit` + nhãn "Giọng đọc AI" trong metadata; chuẩn hoá độ to trước khi đóng gói (đối thủ không có dấu hiệu làm việc này).

---

## 2. Kênh truyện audio Việt (TikTok / YouTube / Facebook)

### 2.1 Giọng hay gặp (nhận diện công khai)

| Giọng / nguồn | Đặc điểm | Hay dùng cho | Độ chắc |
|---|---|---|---|
| **"Chị Google"** (Google Translate / soundoftext.com) | đều, "đơ", miễn phí; ghép vào CapCut | hài, mẩu ngắn TikTok, không dùng cho drama dài | chắc — [didongviet](https://didongviet.vn/dchannel/cach-lam-video-tiktok-giong-chi-google/), [dienmaycholon](https://dienmaycholon.com/kinh-nghiem-mua-sam/giong-chi-google) |
| **CapCut TTS** (giọng nữ / nam tiếng Việt, chỉnh cao độ, tốc độ, "cảm xúc") | có sẵn trong app dựng, xuất thẳng TikTok | tâm sự, drama ngắn 1–3 phút trên TikTok | công cụ chắc — [CapCut AI voice](https://www.capcut.com/vi-vn/tools/ai-voice-generator-text-to-speech); tên giọng cụ thể & độ phổ biến (chưa chắc) |
| **Vbee AIVoice** (vd. "Hà Nội – Ngọc Huyền", giọng miền Nam / Trung; kho >700 giọng) | giọng "kể chuyện" có cảm xúc, có từ điển & biên tập văn bản | truyện dài YouTube, ngôn tình, tâm sự đêm khuya | công cụ chắc — [Vbee chọn giọng](https://help.vbee.vn/huong-dan-su-dung/ung-dung-vbee-ai-voice/chuyen-van-ban/chon-giong-doc), [biên tập văn bản](https://help.vbee.vn/huong-dan-su-dung/ung-dung-vbee-ai-voice/chuyen-van-ban/bien-tap-van-ban); gắn giọng ↔ thể loại (suy luận) |
| **FPT.AI** ("Ban Mai", "Lê Minh", "Thu Minh"…) | đổi giọng trong cùng bài, chèn ngắt nghỉ | đối thoại nhiều vai, đọc tin, kinh dị giọng nam trầm | [fptshop](https://fptshop.com.vn/tin-tuc/danh-gia/chuyen-van-ban-thanh-giong-noi-bang-ai-192547); gắn thể loại (suy luận) |
| **Microsoft Azure** `vi-VN-HoaiMyNeural` (nữ), `vi-VN-NamMinhNeural` (nam) | miễn phí qua Edge "Đọc to" / công cụ edge-tts → rất phổ biến với kênh "truyện cv", truyện chữ dài | tiên hiệp, truyện convert, đọc dài nhiều giờ | (chưa chắc — thường gặp, không có thống kê công khai) |
| **Fish Audio "Ngạn Đọc Truyện"** (giọng nhân bản phong cách MC Nguyễn Ngọc Ngạn) | giọng nam kể chuyện ma / đời | kinh dị, truyện đêm khuya | [fish.audio](https://fish.audio/m/0be3b33cfb354eeca0f2cf57fedb7a3d) — nhà cung cấp tự quảng cáo; **rủi ro pháp lý** (giọng mô phỏng người thật) |
| **ElevenLabs** (giọng đa ngữ / nhân bản giọng) | cảm xúc tốt hơn, tiếng Việt đôi khi lơ lớ dấu | kênh "faceless" mới, drama cảm xúc | [anyspeech](https://anyspeech.io/vi/blog/faceless-youtube-channel-ai-voice) (chưa chắc về tỉ lệ dùng ở VN) |

### 2.2 Quan sát về cách làm
- Kênh "truyện audio cv" thường **biên tập văn bản thủ công trước khi đưa qua TTS**, đăng chương mỗi ngày; YouTube là nơi tập trung chính ([nguồn tổng hợp](https://edx.ipeindia.org/canyon_field/truyen-audio-cv-high-quality) — chưa chắc).
- Sách nói AI tràn YouTube, kéo theo vi phạm bản quyền khó kiểm soát ([Tuổi Trẻ](https://tuoitre.vn/sach-ai.html)).
- YouTube: giọng AI vẫn được kiếm tiền, nhưng **nội dung hàng loạt, rập khuôn bị tắt kiếm tiền**; nội dung AI "trông như thật, dễ gây hiểu lầm" phải công khai ([anyspeech 2026](https://anyspeech.io/vi/blog/faceless-youtube-channel-ai-voice)). → Bộ giọng riêng + biên tập + nhạc nền riêng là cách tránh bị xếp "rập khuôn" (suy luận).
- Mẫu chung theo thể loại (suy luận từ cách các kênh mô tả, chưa có số liệu):
  - **Drama gia đình / mẹ chồng nàng dâu**: 1 giọng dẫn nữ trung niên, ấm, tốc độ vừa; đối thoại thường **đọc chung một giọng** (chi phí thấp) — điểm yếu lớn nhất, người nghe khó phân vai.
  - **Tâm sự đêm khuya**: nữ trẻ / trung, chậm, thì thầm nhẹ, nhạc piano nền.
  - **Kinh dị**: nam trầm, chậm, nhiều ngắt nghỉ, hiệu ứng âm.
  - **Ngôn tình**: nữ trẻ trong, nam trầm cho nam chính khi có hai giọng.

---

## 3. Nền tảng lớn — chọn giọng & kiểm soát chất lượng

| Nền tảng | Chọn giọng / casting | QC / quy định AI | Nguồn |
|---|---|---|---|
| **Fonos** (VN) | Người đọc thật làm theo **mô hình xưởng (studio)**, không ghi tên; thử nghiệm giọng AI có tên thương hiệu **"Hải Đăng" (nam), "Trà My" (nữ)** để mở rộng lựa chọn giọng | **Gắn nhãn sách đọc bởi người / AI trước khi mua**; bị phản ứng vì đặt tên cho AI mà không ghi tên người đọc | [Znews](https://znews.vn/cong-ty-sach-noi-bi-phan-ung-nhan-tinh-hoa-ai-post1604461.html) |
| **Voiz FM** (VN) | CEO: cập nhật đầu sách hằng ngày nên dùng giọng AI; tiêu chí chọn = **phát âm chuẩn + ngắt đúng dấu câu**, cảm xúc còn đang phát triển; trang App Store lại ghi "100% người đọc chuyên nghiệp" (mâu thuẫn — có thể lỗi thời) | Cho người nghe thử phân biệt người / AI, tự nhận giống ~80% | [Znews](https://znews.vn/cong-ty-sach-noi-bi-phan-ung-nhan-tinh-hoa-ai-post1604461.html), [App Store](https://apps.apple.com/app/id1447395824) |
| **Pocket FM** | Chuỗi truyện dài kỳ: 1 người dẫn + ~10 diễn viên lồng các vai (tin tuyển, không ghi ngày). Dòng **AI Audio Series** (ElevenLabs, 2024): tác giả **chọn một giọng + nhạc nền** khi truyện đủ số chữ | Tự báo cáo: >30.000 giờ audio AI, giảm chi phí tới 90%, **mức tương tác ngang bản giọng người** (chưa kiểm chứng độc lập) | [BusinessWire](https://www.businesswire.com/news/home/20240619545743/en/Pocket-FM-teams-up-with-ElevenLabs-launches-AI-Audio-Series-to-build-worlds-first-voice-AI-capability-to-empower-writers), [SpeechTech](https://www.speechtechmag.com/Articles/News/Speech-Technology-News/Pocket-FM-Teams-up-with-ElevenLabs-to-Launch-AI-Audio-Series-164664.aspx), [CastingCall](https://www.castingcall.club/projects/pocketfm-long-term-paid-vo-work) |
| **Kuku FM** | Mô hình giống Pocket FM (truyện ngắn tập, Ấn Độ), có dùng giọng AI cho đa ngôn ngữ | — | (chưa chắc, chưa tìm được nguồn trong phiên này) |
| **Audible / ACX** | Người đọc chọn qua thử giọng (audition) trên ACX; giọng AI chỉ qua **KDP Virtual Voice** (beta mời, Mỹ) | Nhãn **"Narrator: Virtual Voice"** hiện ở trang sách, nghe thử trước khi mua. Chuẩn kỹ thuật ACX: **RMS −23…−18 dB, đỉnh ≤ −3 dB, nền ồn ≤ −60 dB RMS**, MP3 192 kbps CBR 44,1 kHz, có room tone 0,5–1 s đầu & 1–5 s cuối | [ACX requirements](https://help.acx.com/s/article/acx-audio-submission-requirements), [Publishers Weekly](https://www.publishersweekly.com/pw/by-topic/industry-news/audio-books/article/93625-kindle-direct-publishing-will-beta-test-virtual-voice-narrated-audiobooks.html), [macmyths](https://macmyths.com/even-audiobooks-arent-safe-from-ai-slop/) |
| **Google Play Books** | Có **tự đọc (auto-narration)** cho NXB, cho chọn giọng & sửa phát âm từng từ; nhận cả tệp AI tải lên | Nhãn AI: nguồn mâu thuẫn (chưa chắc) | [inkfluenceai](https://www.inkfluenceai.com/learn/where-to-sell-an-ai-audiobook) |
| **Storytel** | **VoiceSwitcher** (ElevenLabs): người nghe đổi giữa giọng người và các giọng AI cho cùng một sách. Lý do: **89% người nghe từng bỏ sách vì giọng không hợp** | Giọng là lựa chọn của người nghe, không phải của nhà làm | [Storytel press](https://press.storytel.com/post/storytel-launches-voiceswitcher-feature), [Publishing Perspectives](https://publishingperspectives.com/2023/06/ai-voices-in-audiobooks-storytel-in-elevenlabs-partnership/) |
| **Spotify** | Nhận sách nói đọc bằng ElevenLabs, có ghi rõ là giọng AI (theo trí nhớ, công bố ~02/2025) | Bắt buộc công khai AI | (chưa chắc) |

**Rút ra từ nền tảng lớn**
1. **Gắn nhãn AI là chuẩn chung** (Audible, Fonos, Spotify, YouTube). Kể Đêm nên ghi "Giọng đọc AI · <tên bộ giọng>" ngay trên trang bài.
2. **Giọng không hợp = bỏ nghe** (số liệu 89% của Storytel) → giọng là biến số đáng thử A/B nhất, không chỉ kịch bản.
3. Tiêu chí tối thiểu của Voiz (phát âm đúng, ngắt đúng dấu câu) là ngưỡng sàn; nhân vật & cảm xúc là phần tạo khác biệt.
4. Chuẩn độ to ACX là chuẩn sách nói đọc trong phòng yên tĩnh; nghe điện thoại / tai nghe ban đêm thì theo chuẩn podcast (−16 LUFS stereo / −19 LUFS mono, Apple; Spotify chuẩn hoá −14 LUFS) (chuẩn podcast theo trí nhớ — chưa chắc).

---

## 4. Quy trình chọn & kiểm soát giọng cho Kể Đêm Audio (đề xuất)

### 4.1 Bộ vai chuẩn và tiêu chí chọn giọng

| Vai | Giới / tuổi giọng | Chất giọng | Tốc độ (so với 1.0 của TTS) | Cao độ | Ghi chú |
|---|---|---|---|---|---|
| **Dẫn chuyện** | nữ 30–45 (drama gia đình, tâm sự) / nam 35–55 (kinh dị) | ấm, ít kịch tính, rõ dấu | 0,90–0,95 (≈ 150–165 tiếng/phút) | gốc | Giọng "thương hiệu" của series — **không đổi giữa các tập** |
| **Mẹ chồng** | nữ 50–65 | dày, sắc, nhấn mạnh cuối câu | 0,95–1,05 | −1…−2 bán cung | Cảnh cãi: cho phép nhanh 1,05–1,1 |
| **Nàng dâu** | nữ 22–32 | trong, mềm, có độ run khi khóc | 0,95–1,0 | +0…+1 | Phải khác dẫn chuyện rõ ràng (nếu dẫn chuyện cũng nữ: khác vùng miền hoặc khác ≥2 bán cung) |
| **Chồng** | nam 28–40 | trung, phẳng hơn | 0,95–1,0 | gốc | |
| **Bố chồng / ông** | nam 55–70 | trầm, chậm | 0,85–0,95 | −1…−2 | |
| **Trẻ con** | dùng giọng trẻ có sẵn; tránh nâng cao độ giọng người lớn quá +3 bán cung (méo, "chipmunk") | | 1,0–1,05 | | Nếu không có giọng trẻ đạt → kể gián tiếp qua dẫn chuyện |
| **Tâm sự đêm khuya** | nữ 25–40 | thì thầm nhẹ, hơi thở | 0,85–0,9 | −0,5 | Nhạc nền piano/lo-fi −22…−26 dB dưới giọng |
| **Kinh dị** | nam trầm | chậm, khoảng lặng dài 0,8–1,5 s trước cao trào | 0,85–0,9 | −1 | |

**Quy tắc chọn** (áp cho mọi vai, chấm 1–5 bởi 2 người nghe trên cùng đoạn thử 60 giây):
1. Phát âm đúng dấu & tên riêng (ngưỡng sàn: phải đạt 5).
2. Ngắt nghỉ tự nhiên theo dấu câu, không "đọc liền" câu dài.
3. Phân biệt được vai khi nhắm mắt (nghe 2 vai đối thoại liền nhau, người thử đoán đúng ≥ 90%).
4. Hợp thể loại / tuổi nhân vật.
5. Không mệt tai sau 10 phút (nghe liên tục một đoạn dài).
6. Vùng miền nhất quán theo bối cảnh truyện (truyện bối cảnh miền Nam → giọng Nam cho nhân vật địa phương).
7. **Không dùng giọng mô phỏng người thật** (MC nổi tiếng, diễn viên) khi chưa có giấy phép.

### 4.2 Từ điển phát âm
- **Ba tầng**: toàn hệ thống → theo series → theo tập (tầng hẹp ghi đè tầng rộng).
- **Mục cần có**: tên riêng nhân vật / địa danh (vd. "Hằng Nga" không bị đọc thành tên khác; tên nước ngoài phiên âm), từ địa phương & tiếng lóng ("mắc" = đắt (Nam), "dưng mà", "răng rứa"), viết tắt ("UBND", "BHXH", "TP.HCM" → đọc đầy đủ), **số** (năm "1975" → "một nghìn chín trăm bảy mươi lăm" hay "năm bảy lăm" tuỳ ngữ cảnh; tiền "500k" → "năm trăm nghìn"; giờ "7h30" → "bảy giờ ba mươi"; số điện thoại đọc từng chữ số), ký hiệu (%, /, –), từ đồng tự khác nghĩa cần ép trọng âm / ngắt.
- **Cơ chế**: thay thế văn bản trước khi gửi TTS (an toàn với mọi nhà cung cấp) + SSML `<sub>`/`<phoneme>`/`<break>` khi nhà cung cấp hỗ trợ (Azure, Google, Vbee có từ điển riêng).
- **Phát hiện tự động** từ mới cần thêm: từ viết hoa giữa câu chưa có trong từ điển, chuỗi có chữ số, từ không có trong từ điển tiếng Việt → đưa vào danh sách "cần duyệt" trước khi tạo audio.

### 4.3 Danh sách kiểm QC trước khi đăng

**Tự động (Xưởng audio chạy sau mỗi lần tạo, chặn đăng nếu đỏ)** — đo bằng ffmpeg `ebur128` / `astats` / `silencedetect` trên máy chủ:

| Kiểm | Ngưỡng đề xuất | Mức |
|---|---|---|
| Độ to tích hợp | −16 LUFS ±1 (mono −19 nếu xuất mono) — chuẩn hoá về đó bằng `loudnorm` 2 lượt | đỏ nếu lệch > 2 LU |
| Đỉnh thật (true peak) | ≤ −1,5 dBTP (chặt hơn ACX −3 dB đỉnh mẫu nếu muốn tương thích ACX) | đỏ |
| Biên độ biến thiên (LRA) | ≤ 8 LU cho thoại; cảnh báo nếu nhạc nền làm LRA vọt | vàng |
| Nền ồn ở khoảng nghỉ | ≤ −60 dB RMS (TTS thường đạt; nhạc nền thì đo ở đoạn không nhạc) | vàng |
| Im lặng bất thường | khoảng lặng > 2,5 s giữa câu (trừ chỗ đánh dấu `<break>` cố ý); im lặng đầu > 1 s, cuối > 3 s | đỏ |
| Cắt cụt / tràn | sample chạm 0 dBFS liên tiếp ≥ 3 mẫu | đỏ |
| Độ dài lệch ước lượng | ước lượng = số âm tiết ÷ (tốc độ chuẩn của giọng × hệ số tốc độ); lệch > ±15% → nghi TTS bỏ câu / lặp câu | đỏ |
| Lặp / thiếu chữ | chạy nhận dạng giọng nói (ASR) ngược lại, so với kịch bản: tỉ lệ lỗi từ (WER) > 8% hoặc có n-gram lặp ≥ 3 lần liên tiếp → đánh dấu đoạn | vàng/đỏ |
| Đúng giọng theo vai | mỗi câu thoại trong kịch bản đã gán vai; kiểm mã giọng của từng đoạn đã tạo khớp bộ giọng series | đỏ |
| Ghép đoạn | không có "click" ở điểm nối (crossfade 10–20 ms), khoảng nghỉ giữa đoạn theo quy ước (câu 0,3 s, đoạn văn 0,7 s, đổi cảnh 1,2 s) | vàng |
| Kỹ thuật xuất | mono, 44,1/48 kHz; HLS mức 48k HE-AAC + 96k AAC-LC; đoạn 6–10 s | đỏ |
| Metadata | có nhãn "Giọng đọc AI", tên bộ giọng, chương mục (mốc thời gian từng tập) | đỏ |

**Thủ công (người duyệt, ~5–7 phút / tập 40 phút)**:
- **Nghe điểm**: 30 giây đầu, mọi đoạn được tự động gắn vàng/đỏ, 3 đoạn ngẫu nhiên, đoạn cao trào (đánh dấu trong kịch bản), 30 giây cuối.
- Nghe **lần xuất hiện đầu tiên của mỗi tên riêng** (hệ thống nhảy tới vị trí).
- Nghe trên **loa điện thoại ở âm lượng thấp** (bối cảnh nghe đêm) — kiểm nhạc nền không lấn lời.
- Ký duyệt: người duyệt + thời điểm, lưu vào lịch sử tập.

### 4.4 Đề xuất tính năng cho Xưởng audio

1. **Thư viện giọng có nghe thử**: mỗi giọng có thẻ (giới, tuổi cảm nhận, vùng miền, chất giọng, thể loại hợp, nhà cung cấp, chi phí/1.000 ký tự), nút nghe **cùng một đoạn mẫu chuẩn** (đoạn dẫn + đoạn thoại cãi nhau + đoạn khóc) để so ngang hàng; điểm chấm theo 7 tiêu chí ở 4.1.
2. **Gán giọng theo vai**: kịch bản có cú pháp vai (`[Mẹ chồng]: …`) hoặc AI tách vai tự động rồi người duyệt sửa; mỗi vai một giọng + tham số (tốc độ, cao độ, phong cách); xem trước từng câu, tạo lại riêng một câu không phải tạo lại cả tập.
3. **"Bộ giọng" (voice cast) theo series**: lưu vai → giọng + tham số + từ điển phát âm series; tập mới tự kế thừa; khoá phiên bản bộ giọng (đổi giọng giữa series phải có lý do + ghi lịch sử) để nhất quán.
4. **Từ điển phát âm 3 tầng** + danh sách "từ cần duyệt" tự phát hiện (4.2).
5. **Bảng QC tự động** (4.3) hiển thị đỏ/vàng/xanh, nhảy tới mốc thời gian lỗi; chặn đăng khi còn đỏ.
6. **Chấm điểm A/B giọng**: cho cùng một tập 2 biến thể (khác giọng dẫn hoặc khác tốc độ), chia ngẫu nhiên người nghe 50/50 theo phiên; đo **tỉ lệ nghe hết tập** (≥ 90% thời lượng), **tỉ lệ bỏ trong 60 giây đầu**, thời gian nghe trung bình, tỉ lệ nghe tiếp tập sau. Cần ≥ ~300–500 lượt nghe mỗi nhánh trước khi kết luận (suy luận; tính theo sai khác 8–10 điểm %); thắng → cập nhật bộ giọng mặc định cho thể loại.
7. **Nhãn AI tự động** trên trang bài & metadata, giống Audible / Fonos.
8. (Sau) **Cho người nghe đổi giọng dẫn** kiểu VoiceSwitcher của Storytel — chỉ khi đã có đủ dữ liệu A/B và chi phí tạo 2 bản chấp nhận được.

---

## 5. Hạn chế của khảo sát này
- Chỉ đo header 2 đoạn của 1 bài dramaaudio.online; chưa giải mã nên **chưa đo được LUFS, nhạc nền, có phải TTS hay không**. Muốn chắc: cài ffmpeg cục bộ, chạy `ffmpeg -i seg.ts -af ebur128,astats -f null -` trên vài đoạn rải đều.
- Tên giọng phổ biến trên TikTok / YouTube Việt chưa có thống kê công khai; bảng 2.1 phần "hay dùng cho" chủ yếu là suy luận.
- Spotify, Kuku FM, chuẩn LUFS podcast ghi theo trí nhớ — kiểm lại trước khi đưa vào quy định.
