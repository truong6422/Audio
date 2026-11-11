# Xưởng audio — thiết kế (nghiên cứu, chưa làm)

> Trạng thái: **đề xuất**, chưa sửa mã. Giá / giới hạn kiểm ngày **11/11/2026** từ trang chính thức (link ở từng dòng); con số ghi "ước" là tính lại hoặc từ nguồn thứ cấp — kiểm lại trước khi chốt.
> Mục tiêu: trong `/admin` có màn **Xưởng audio**: dán / viết kịch bản truyện drama tiếng Việt → tạo giọng (người dẫn + nhiều nhân vật, cảm xúc) → ghép, nghỉ, hiệu ứng, nhạc nền → xuất HLS và đăng thẳng thành `Track` (dùng lại luồng tải `PUT /api/admin/upload/:id/*` + `POST /api/admin/tracks/:id/complete`).

Quy ước tính chi phí: truyện đọc tiếng Việt ~160 âm tiết/phút × ~4,6 ký tự/âm tiết (kể cả dấu cách) ≈ **45.000 ký tự / 1 giờ audio** (ước). Gemini tính theo token audio: 25 token/giây → 90.000 token / giờ.

---

## 1. So sánh nhà cung cấp TTS tiếng Việt

| Lựa chọn | Tiếng Việt | Điều khiển cảm xúc | Nhiều giọng | Giá / 1 giờ audio (ước) | Giới hạn mỗi lần gọi | Dùng thương mại | Gọi từ Worker (HTTP thuần) |
|---|---|---|---|---|---|---|---|
| **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`) | Có (130+ ngôn ngữ, tự nhận ngôn ngữ) [docs](https://aistudio.google.com/docs/speech-generation) | **Tốt**: `speech_metadata.style` theo lượt ("thì thầm, run rẩy", "quát lên giận dữ"), thẻ trong câu `<sigh>` `<laugh>` `<gasp>` `<short pause>` `<long pause>`, dấu "…", chữ HOA để nhấn | Giọng dựng sẵn (Kore, Charon…); ≤ 2 người nói / request → **ta gọi mỗi lời một request** | Ra audio $9/1M token → **~$0,81/giờ** (tới 31/12/2026), **~$1,62/giờ từ 01/01/2027**; Batch/Flex nửa giá; vào (chữ) $0,50/1M không đáng kể [pricing](https://aistudio.google.com/docs/pricing) | Docs không ghi; nên ≤ 1–2 phút audio / lần | Bản trả phí: Google không dùng dữ liệu để huấn luyện; bản miễn phí thì có. Mọi audio gắn **SynthID** (không nghe thấy) | Có: `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`; trả WAV 24 kHz mono 16-bit |
| Gemini 3.8 Flash-Lite TTS | Có (100+) | Như trên, kém hơn chút (cần nghe thử) | như trên | ~$0,54/giờ (2026) → ~$1,08 (2027) | — | như trên | Có |
| Gemini 3.1 Flash TTS preview / 2.5 Pro preview TTS | Có | Tốt | ≤ 2 / request | $20/1M token ra → ~$1,8/giờ (3.1, 25 tok/s); 2.5 Pro không ghi tốc độ token | — | preview, có thể đổi | Có |
| Google Cloud TTS **Chirp 3 HD** vi-VN | Có [docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd) | **Yếu**: chỉ tốc độ `speaking_rate` 0,25–2, nghỉ `[pause short/long]`; vi-VN **không** có phát âm tuỳ chỉnh | Nhiều giọng dựng sẵn | $30/1M ký tự → ~$1,35/giờ; 1M ký tự đầu / tháng có thể miễn phí (chưa xác minh) [pricing](https://cloud.google.com/text-to-speech/pricing) | — | Có | Có (REST, cần OAuth/khoá API) |
| **ElevenLabs v3 / v4** | Có (v3 70+, v4 90+; Multilingual v2 **không** có tiếng Việt) [models](https://elevenlabs.io/docs/overview/models) | **Tốt nhất về diễn**: thẻ `[whispers]` `[crying]` `[sighs]` `[laughs]` `[excited]` `[sarcastic]`…; **không** có `<break>` SSML ở v3/v4 [hướng dẫn](https://elevenlabs.io/docs/best-practices/prompting/eleven-v3) | Text-to-Dialogue API; mỗi vai một giọng từ thư viện | $0,08/1K ký tự → **~$3,6/giờ**; gói Creator $22/tháng = 275K ký tự ≈ 6 giờ [pricing](https://elevenlabs.io/pricing/api) | v3 5.000 ký tự, v4 10.000 | **Gói Free cấm thương mại**; từ Starter trở lên được | Có (REST, `xi-api-key`, trả mp3) |
| ElevenLabs Flash v2.5 | Có | Ít | Có | $0,04/1K → ~$1,8/giờ | 40.000 ký tự | Gói trả phí | Có |
| OpenAI `gpt-4o-mini-tts` | Có trong danh sách nhưng tối ưu tiếng Anh [docs](https://developers.openai.com/api/docs/guides/text-to-speech) | `instructions` (cảm xúc, thì thầm, tốc độ) | 13 giọng | ~$0,015/phút → ~$0,9/giờ (nguồn thứ cấp) | ~2.000 token (thứ cấp) | Phải báo người nghe là giọng AI. **Ngừng 06/01/2027** | Có |
| Azure Speech vi-VN | `HoaiMyNeural`, `NamMinhNeural` (Standard), `Linh:MAI-Voice-2-Flash` (HD Flash) [language-support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) | **Không có style** cho vi-VN; chỉ SSML `prosody` (rate/pitch/volume), `break` | 3 giọng | Trang giá không hiển thị số hôm nay; F0 miễn phí 0,5M ký tự/tháng [pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) | ~10 phút / request (SSML) | Có | Có (REST + SSML) |
| Microsoft **Edge TTS** (không chính thức) | Cùng giọng HoaiMy / NamMinh | Như Azure, hạn chế hơn | 2 giọng | $0 | — | **Rủi ro**: không phải API công khai; câu trả lời Microsoft Q&A khuyên dùng Azure cho thương mại; điểm cuối kiểm user-agent / token `Sec-MS-GEC`, hay bị 403 [Q&A](https://learn.microsoft.com/en-us/answers/questions/2088770/are-opensource-edge-tts-free-for-commercial-use) | WebSocket — chạy trong Worker được nhưng **không dùng** cho nội dung đăng |
| **FPT.AI** TTS v5 | Có (banmai, lannhi… giọng Bắc/Nam) | Ít (tốc độ, giọng) | Nhiều giọng | Gói 0,185–0,33 VNĐ/ký tự → **~8–15 nghìn VNĐ/giờ** (~$0,3–0,6); miễn phí 100K ký tự/tháng (chậm, xếp hàng) [pricing](http://docs.fpt.ai/docs/en/speech/documentation/tts-pricing/) | Không ghi | Có (gói trả phí) | Có (`POST https://api.fpt.ai/hmi/tts/v5`, trả link tải bất đồng bộ) |
| VBee AIVoice | Có, có nhóm giọng "đọc truyện" | API có tuỳ chỉnh phong cách / cảm xúc (theo tài liệu) | Nhiều | **Không công khai** — phải hỏi | Realtime (ngắn) + Batch (dài) [api-docs](https://api-docs.vbee.vn) | Có (theo gói) | Có (bearer token) |
| Viettel AI, Zalo AI | Có | Ít | Vài giọng | Không công khai | — | Theo hợp đồng | Có |
| Cloudflare Workers AI | **Không** (aura-1/2 en, es; MeloTTS gốc không có vi) [models](https://developers.cloudflare.com/workers-ai/models/?tasks=Text-to-Speech) | — | — | — | — | — | — |
| **VieNeu-TTS v3 Turbo** (chạy máy) [GitHub](https://github.com/pnnbao97/VieNeu-TTS) | Có, chuyên tiếng Việt, 48 kHz, nhân bản giọng 3–8s | Thẻ thử nghiệm `[cười]` `[thở dài]` `[hắng giọng]` | Có (nhân bản) | $0 (GPU/CPU nhà; CPU i5 đời 12 ~RTF 0,5) | — | Mã Apache-2.0; **giấy phép trọng số không ghi rõ** ở repo chính; bản 0.3B cũ là CC BY-NC; v4 đóng | **Không** (Python/GPU) — chỉ qua máy chủ local khi dev |
| F5-TTS-Vietnamese, viXTTS | Có | Có (nhân bản) | Có | $0 | — | **Không**: CC-BY-NC-SA / CPML (cấm cả đầu ra thương mại) | Không |

### Khuyến nghị

- **Mặc định: Gemini 3.8 Flash TTS (bản trả phí)** — rẻ nhất trong nhóm có điều khiển cảm xúc bằng lời (~$0,8/giờ năm 2026, ~$1,6/giờ từ 2027; dùng Batch/Flex khi không vội → nửa giá), tiếng Việt chính thức, style theo từng lời + thẻ thở dài / cười / nghỉ, trả WAV gọi bằng `fetch` từ Worker. Mỗi lời một request, giọng dựng sẵn cố định cho từng vai (ổn định hơn để mô hình tự đóng 2 vai). Lưu ý: mô hình sinh đôi khi đọc sai / bỏ chữ / ra lặng → phải có **kiểm độ dài bất thường** và nút "đọc lại câu này" (mục 3.6).
- **Dự phòng chất lượng cao: ElevenLabs v3/v4** (gói Creator trở lên) cho truyện "đinh" cần diễn khóc / thì thầm thật — đắt gấp ~4 lần.
- **Dự phòng rẻ / ổn định không cảm xúc: FPT.AI** (giọng Việt bản địa, rẻ) hoặc **Azure HoaiMy/NamMinh** (SSML chuẩn). Dùng cho người dẫn chuyện khi Gemini lỗi / quá hạn mức.
- **Dev / thử: chế độ MOCK** (mặc định, không gọi mạng) và tuỳ chọn máy chủ local VieNeu-TTS — chỉ để nghe thử, chưa đăng khi chưa xác minh giấy phép trọng số.
- **Không dùng**: Edge TTS (điều khoản), F5-TTS-Vietnamese / viXTTS (phi thương mại), gói Free của ElevenLabs, OpenAI TTS (sắp ngừng), Workers AI (không có tiếng Việt).

Thiết kế theo **lớp nhà cung cấp** (`TtsProvider`) để đổi qua lại theo từng vai: ví dụ người dẫn = FPT banmai, nhân vật = Gemini.

---

## 2. Định dạng kịch bản

Hai lớp: **chữ đánh dấu** để người viết dán / gõ nhanh, và **JSON chuẩn** (lưu D1, là hợp đồng). Bộ phân tích viết thuần TS trong `shared/studio.ts` (dùng chung web + worker, không thư viện).

### 2.1 Chữ đánh dấu (nhập tay)

```text
# Đêm mưa ở phố cũ
@vai Dẫn    = gemini:Charon   | trầm, ấm, kể chậm
@vai Lan    = gemini:Kore     | nữ trẻ, giọng miền Bắc
@vai Hùng   = gemini:Fenrir   | nam trung niên, khàn
@nhạc mưa-đêm-piano  vol=0.08 fade=3

## Chương 1 — Người về
[sfx mưa-rơi vol=0.3 loop until=chương]
Dẫn: Đêm ấy trời mưa tầm tã. Con phố cũ chỉ còn ánh đèn vàng hắt xuống mặt đường loang loáng…
[nghỉ 1.2]
[sfx gõ-cửa]
Lan (thì thầm, run rẩy): Anh… anh về rồi à?
Hùng (giận, quát): Cô còn dám hỏi câu đó sao?!
Lan (khóc nấc): Em xin lỗi… <sigh> em đã đợi anh suốt mười năm.
Dẫn {đọc: mười năm ấy}: 10 năm ấy, chẳng ai nhắc lại nữa.
[nhạc giảm -6 trong 4]

## Chương 2 — …
```

Luật: `Tên:` = lời; `(…)` = cảm xúc / chỉ dẫn diễn (tự do, có từ khoá chuẩn ở 2.3); `{đọc: …}` = chữ đưa vào máy khác chữ hiển thị (như `loi_doc` của make-YT); `[…]` = lệnh; dòng trống = nghỉ đoạn; `##` = chương (= ranh giới xuất, = "tập" gợi ý).

### 2.2 JSON chuẩn

```ts
// shared/studio.ts (đề xuất)
export type Emotion = "binh-thuong" | "buon" | "gian" | "thi-tham" | "khoc" | "vui" | "so-hai"
  | "cang-thang" | "met-moi" | "che-gieu" | "hoi-hop" | "am-ap";

export interface CastMember {
  id: string;            // "dan", "lan"
  name: string;          // "Dẫn", "Lan"
  provider: "gemini" | "elevenlabs" | "fpt" | "azure" | "local" | "mock";
  voice: string;         // "Charon" | voice_id | "banmai" | "vi-VN-HoaiMyNeural"
  persona: string;       // mô tả cố định gửi kèm mọi lời (Gemini style / ElevenLabs không dùng)
  speed: number;         // 0.8–1.2
  gainDb: number;        // chỉnh to nhỏ từng vai khi trộn
}

export type Block =
  | { kind: "chapter"; id: string; title: string }
  | { kind: "line"; id: string; speaker: string; text: string; readText?: string;
      emotion?: Emotion; direction?: string;        // chỉ dẫn tự do "khóc nấc, nói đứt quãng"
      speed?: number; pauseAfter?: number;          // giây, ghi đè mặc định
      overlapPrev?: number }                        // giây chồng lên lời trước (cắt lời)
  | { kind: "pause"; id: string; seconds: number }
  | { kind: "sfx"; id: string; asset: string; volume: number; offset?: number;
      loop?: boolean; until?: "chapter" | string }  // until = id khối kết thúc
  | { kind: "music"; id: string; action: "start" | "stop" | "duck"; asset?: string;
      volume?: number; fade?: number; db?: number };

export interface StudioScript {
  version: 1;
  title: string;
  cast: CastMember[];
  music?: { asset: string; volume: number; fade: number };   // nhạc nền mặc định
  pauses: { comma: number; period: number; question: number; ellipsis: number;
            paragraph: number; speakerChange: number; chapter: number };
  blocks: Block[];
}
```

`id` của khối sinh ổn định (băm nội dung + thứ tự) để sửa một câu chỉ đọc lại câu đó.

### 2.3 Ánh xạ cảm xúc sang từng nhà cung cấp

| Emotion | Gemini `style` | ElevenLabs thẻ | Azure / FPT (không có style) |
|---|---|---|---|
| thi-tham | "thì thầm, hơi thở gần micro" | `[whispers]` | rate −10%, volume −6 dB |
| khoc | "nghẹn ngào, nói trong tiếng nấc" + `<sigh>` | `[crying]` | rate −15%, pitch +2% |
| gian | "giận dữ, gằn giọng, nói nhanh" | `[angry]`/`[shouting]` (thử) | rate +8%, volume +2 dB |
| buon | "buồn, chậm, trầm xuống cuối câu" | `[sad]` (thử) / `[sighs]` | rate −10% |
| so-hai | "sợ hãi, run rẩy, hụt hơi" | `[nervous]` (thử) | rate +5% |
| che-gieu | "mỉa mai, kéo dài chữ" | `[sarcastic]` | — |

Ghép style cho Gemini = `persona` của vai + `emotion` + `direction`. Thẻ ElevenLabs ngoài danh sách chính thức (`[whispers] [sighs] [exhales] [sarcastic] [curious] [excited] [crying] [laughs]…`) phải nghe thử với tiếng Việt.

### 2.4 Mặc định nghỉ (giây) — lấy từ `config-vi.yaml` của make-YT, cộng thêm cho drama

| Loại | Giá trị | Nguồn |
|---|---|---|
| phẩy `, ; :` | 0,25 | make-YT config-vi |
| chấm `.` | 0,50 | make-YT |
| hỏi / than `? !` | 0,55 | make-YT |
| ngắt `…` `—` | 0,50 (drama: 0,7) | make-YT |
| xuống đoạn | 0,80 | make-YT |
| đổi người nói | 0,35 (cãi nhau: 0,15; trầm lắng: 0,6) | mới |
| hết chương | 2,0 + nhạc chuyển | mới |

Lặng giữ lại mỗi đầu clip sau khi cắt lặng: 0,03 s (`DEM_MANH`), fade 10 ms hai đầu chống tiếng "bụp".

---

## 3. Kiến trúc trên stack hiện có

### 3.1 Phân vai xử lý

| Việc | Ở đâu | Lý do |
|---|---|---|
| Phân tích kịch bản, chuẩn hoá chữ, ước chi phí | `shared/studio.ts` (chạy cả hai phía) | thuần TS |
| Gọi TTS (giữ khoá API) | **Worker** — mỗi lời một request | khoá không bao giờ xuống trình duyệt; CPU Worker gần như 0 vì chờ mạng không tính CPU |
| Lưu clip | **R2** `studio/<projectId>/clips/<hash>.wav|mp3` | bộ đệm theo băm (như make-YT `build/giong/manh/<băm>.wav`) |
| Trộn, mastering, mã hoá | **Trình duyệt quản trị** (Web Audio + WebCodecs) | Worker không có ffmpeg, 128 MB RAM, CPU ≤ 5 phút/request (gói Paid) [limits](https://developers.cloudflare.com/workers/platform/limits/) — không đủ để giải mã + trộn 60 phút |
| Đăng | luồng tải HLS có sẵn (`uploadLogic.ts`) | không thêm endpoint đăng mới |

### 3.2 Bảng D1 mới (`migrations/0002_studio.sql`)

```sql
CREATE TABLE studio_projects (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  source_text TEXT NOT NULL DEFAULT '',      -- chữ đánh dấu gốc
  script_json TEXT NOT NULL,                 -- StudioScript
  mix_json    TEXT NOT NULL DEFAULT '{}',    -- âm lượng nhạc, LUFS đích, bitrate…
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','voicing','mixing','published')),
  track_id    TEXT REFERENCES tracks (id) ON DELETE SET NULL,
  created_by  TEXT REFERENCES users (id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Một dòng = một lần sinh giọng đã lưu; khoá = băm(provider|voice|persona|style|speed|chữ đọc|phiên bản chuẩn hoá)
CREATE TABLE studio_clips (
  hash        TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES studio_projects (id) ON DELETE CASCADE,
  block_id    TEXT NOT NULL,
  provider    TEXT NOT NULL,
  r2_key      TEXT,
  format      TEXT NOT NULL DEFAULT 'wav',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  chars       INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,       -- ước, để cộng ngân sách
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','error','suspect')),
  error       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX studio_clips_project_idx ON studio_clips (project_id, block_id);

-- Kho nhạc nền / hiệu ứng, BẮT BUỘC có nguồn + giấy phép
CREATE TABLE studio_assets (
  id          TEXT PRIMARY KEY,              -- slug: "mua-dem-piano"
  kind        TEXT NOT NULL CHECK (kind IN ('music','sfx')),
  name        TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  license     TEXT NOT NULL,                 -- "Pixabay Content License", "CC0", "CC BY 4.0"
  source_url  TEXT NOT NULL,
  attribution TEXT NOT NULL DEFAULT '',      -- dòng ghi công nếu CC BY
  created_at  INTEGER NOT NULL
);

-- Sổ chi tiêu theo ngày để chặn vượt ngân sách
CREATE TABLE studio_usage (
  day       TEXT NOT NULL,                   -- 'YYYY-MM-DD'
  provider  TEXT NOT NULL,
  chars     INTEGER NOT NULL DEFAULT 0,
  seconds   REAL NOT NULL DEFAULT 0,
  cost_usd  REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);
```

Cài đặt thêm vào bảng `settings` có sẵn: `studio_monthly_budget_usd`, `studio_default_provider`, `studio_lufs_target` (−16).

### 3.3 Endpoint mới (thêm vào chú thích `shared/types.ts`, đều sau `requireAdmin`)

```
Xưởng audio (isAdmin)
  GET    /api/admin/studio/projects?page=                 -> Page<StudioProjectSummary>
  POST   /api/admin/studio/projects {title, sourceText}    -> { project }       (phân tích + lưu)
  GET    /api/admin/studio/projects/:id                    -> { project, clips: StudioClip[] }
  PATCH  /api/admin/studio/projects/:id {title?, sourceText?, script?, mix?} -> { project }
  DELETE /api/admin/studio/projects/:id                    -> { ok }  (xoá clip R2 studio/<id>/)
  POST   /api/admin/studio/projects/:id/estimate           -> { chars, seconds, byProvider: {provider, usd}[], cachedChars }
  POST   /api/admin/studio/projects/:id/voice {blockIds: string[], force?: boolean}
                                                           -> { clips: StudioClip[] }   (≤ 5 lời / lần; trùng băm thì trả bộ đệm)
  POST   /api/admin/studio/preview {provider, voice, persona, emotion?, text}  -> audio/wav (nghe thử giọng, giới hạn 300 ký tự)
  GET    /api/admin/studio/clips/:hash                     -> tệp audio từ R2 (KHÔNG qua /media công khai)
  GET    /api/admin/studio/assets?kind=                    -> StudioAsset[]
  POST   /api/admin/studio/assets  body=tệp, header X-Asset-Meta: JSON {id,kind,name,license,sourceUrl,attribution}
  DELETE /api/admin/studio/assets/:id                      -> { ok }
  GET    /api/admin/studio/assets/:id/file                 -> tệp (cho Web Audio tải về trộn)
  GET    /api/admin/studio/usage?month=YYYY-MM             -> { budgetUsd, spentUsd, byProvider }
  POST   /api/admin/studio/projects/:id/published {trackId} -> { project }   (gắn track sau khi trình duyệt tải xong)
```

`POST …/voice` xử lý tuần tự trong một request (mỗi lời 3–15 s chờ mạng), trả kết quả từng lời; trình duyệt gọi lặp với 2–3 luồng song song → không cần Queues ở giai đoạn 1. Trước khi gọi thật: cộng `studio_usage` tháng + ước chi lời này, vượt ngân sách → 402 `{error:"Vượt ngân sách tháng"}`.

### 3.4 Lớp nhà cung cấp trong Worker

```ts
// worker/src/studio/tts.ts
interface TtsRequest { text: string; voice: string; persona: string; emotion?: Emotion; direction?: string; speed: number }
interface TtsResult  { bytes: ArrayBuffer; format: "wav" | "mp3"; durationMs: number; costUsd: number }
interface TtsProvider { id: string; synth(r: TtsRequest, env: Env): Promise<TtsResult> }
```

- `gemini`: `fetch` tới `/v1beta/interactions`, `speech_metadata.style` = persona + cảm xúc; nhận WAV 24 kHz. Thử lại 429/5xx với lùi luỹ thừa (1s, 3s, 9s), tối đa 3 lần.
- `elevenlabs`: `POST /v1/text-to-speech/:voice_id?output_format=mp3_44100_128`, chèn thẻ `[whispers]`… vào đầu câu.
- `fpt`: v5 trả URL bất đồng bộ → poll ≤ 30 s rồi tải.
- `azure`: SSML `<prosody>` + `<break>`; format `audio-24khz-96kbitrate-mono-mp3`.
- `local`: `fetch(env.TTS_LOCAL_URL)` (máy chủ VieNeu Python ở máy dev) — chỉ cho phép khi `TTS_MODE=local`.
- `mock`: xem 3.5.

Biến môi trường (thêm vào `Env`): `TTS_MODE` (`mock` | `live` | `local`, **thiếu = mock**), `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `FPT_TTS_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `TTS_LOCAL_URL`. Khoá đặt bằng `wrangler secret put`, không ghi vào `wrangler.jsonc` / `.dev.vars` mẫu.

### 3.5 Chế độ MOCK (mặc định local)

- `TTS_MODE` không đặt hoặc `mock` → **mọi** vai bị ép về `mock`, kể cả khi có khoá. Giao diện hiện dải vàng "Đang ở chế độ thử — giọng là tiếng bíp, không tốn tiền".
- Mock sinh WAV 24 kHz trong Worker bằng JS thuần: thời lượng = số âm tiết × 0,33 s / speed + nghỉ theo dấu câu (để thử nhịp, tổng thời lượng, ducking đúng như thật); mỗi vai một cao độ khác (Dẫn 180 Hz, nữ 260 Hz…), bao hình theo âm tiết, cảm xúc đổi âm lượng (thì thầm −12 dB, giận +3 dB). Chi phí ghi 0.
- Test tự động (nếu thêm sau) chỉ chạy mock.

### 3.6 Kiểm chất lượng sau khi sinh (tự động, như `kiem_nhip.py`)

Đánh dấu clip `suspect` (vàng, gợi ý "Đọc lại") khi:
1. `durationMs / số âm tiết` ngoài 0,15–0,60 s (đọc quá nhanh / kéo dài / bỏ chữ / ra lặng — lỗi hay gặp của TTS sinh);
2. RMS cả clip < −40 dBFS (gần như im) hoặc đỉnh ≥ 0 dBFS (vỡ);
3. lặng giữa clip > 2 s.

Báo nhịp toàn truyện (chỉ khuyên): tốc độ ngoài 140–200 âm tiết/phút; một lời > 30 s (nên tách); một vai nói liền > 90 s không đổi người / không nghỉ; tổng thời lượng mỗi chương lệch > 50% so với trung bình (chương "tập" không đều).

### 3.7 Trộn và xuất trong trình duyệt (không ffmpeg, không thư viện mới)

1. **Dựng dòng thời gian** (thuần TS): mỗi lời có `start = end trước + nghỉ`, `overlapPrev` cho cắt lời; SFX theo khối; nhạc theo `start/stop`. Ra mảng sự kiện + tổng thời lượng mỗi chương.
2. **Kết xuất từng cửa sổ 3 phút** bằng `OfflineAudioContext(2, 44100 × 180, 44100)` — 3 phút stereo float32 ≈ 64 MB, không dồn cả giờ vào RAM (60 phút stereo 48 kHz ≈ 1,4 GB). Nhạc nền nối liền giữa cửa sổ bằng `source.start(0, offsetTrongBài)`; lời / SFX cắt ngang ranh giới được vẽ ở cả hai cửa sổ với offset.
3. **Ducking xác định**: biết chính xác lúc có lời nên tự động hoá `gain` của nhạc bằng `setTargetAtTime` (giảm 4–6 dB, vào 0,15 s, nhả 0,4 s) — thay cho sidechain ffmpeg của make-YT (cùng mức giảm 3–6 dB). Nhạc nền mặc định 0,07–0,08 (≈ −22 dB), fade vào 1,5 s, fade ra 3 s.
4. **Mastering 2 lượt**: lượt 1 kết xuất + đo độ ồn tích hợp theo ITU-R BS.1770 (lọc K + cổng −70 LUFS tuyệt đối / −10 LU tương đối, ~80 dòng TS tự viết); lượt 2 kết xuất với `gain = −16 − LUFS_đo` + bộ giới hạn đỉnh nhìn trước 5 ms tự viết trên `Float32Array` (trần −1,5 dBFS, xấp xỉ true-peak −1 dBTP). `OfflineAudioContext` chạy nhanh hơn thời gian thực hàng chục lần nên 2 lượt vẫn ổn.
5. **Mã hoá: WebCodecs `AudioEncoder` AAC-LC** (`mp4a.40.2`, 96 kbps stereo / 64 kbps mono) → tự gói **ADTS** (7 byte đầu mỗi khung) → đoạn HLS **packed audio `.aac`** ~6 s, mỗi đoạn đầu có thẻ ID3 `PRIV com.apple.streaming.transportStreamTimestamp` (bắt buộc với Safari) → `index.m3u8` (`#EXTINF` theo số khung × 1024/44100). Định dạng này **khớp sẵn** `TrackFormat = "hls"` và danh sách đuôi `HLS_EXT` (đã có `aac`) trong `uploadLogic.ts`; mỗi cửa sổ mã xong tải ngay qua `PUT /api/admin/upload/:id/seg-00042.aac` rồi bỏ khỏi RAM.
   - Kiểm trước `AudioEncoder.isConfigSupported({codec:"mp4a.40.2",…})` (Chrome/Edge máy tính Windows/macOS có). Không hỗ trợ → báo "Dùng Chrome/Edge trên máy tính".
   - **Không dùng MediaRecorder**: chỉ ghi theo thời gian thực (truyện 60 phút mất 60 phút) và ra webm/opus, iPhone phát kém.
   - Không dùng WAV (1 giờ ≈ 600 MB). MP3 cần thư viện mã hoá (lamejs/wasm) → chỉ là phương án nếu chủ dự án duyệt thêm thư viện.
   - Nghiệm thu bắt buộc: phát được trên Safari iPhone (HLS gốc) + Chrome Android (hls.js), tua đúng.
6. **Đăng**: `POST /api/admin/tracks` (format `hls`) → tải đoạn → `complete {durationSeconds, entry:"index.m3u8"}` → `POST …/studio/projects/:id/published`. `episodeCount` gợi ý = số chương (lưu ý hợp đồng hiện chia tập **đều theo thời lượng**, không theo chương — nếu muốn tập theo chương cần đổi hợp đồng sau).

### 3.8 Truyện dài 30–90 phút

- 60 phút ≈ 600–900 lời. Sinh giọng: trình duyệt điều phối 3 luồng × 5 lời/request ≈ 10–20 phút; có thể đóng tab và mở lại — trạng thái nằm ở `studio_clips`, chỉ sinh lời còn `pending`/`error`.
- **Giai đoạn 2** (khi cần chạy không cần mở tab): Cloudflare **Queues** `studio-tts` (mỗi thông điệp = 1 lời, consumer tối đa 15 phút wall-time, `max_concurrency` thấp để khỏi 429) hoặc Durable Object một-dự-án-một-đối-tượng có alarm; cùng dùng lại `TtsProvider`. Dùng **Gemini Batch** (nửa giá) khi chạy nền. Kiểm gói Workers (Queues cần gói Paid — xác nhận lại).
- Trộn / mã hoá vẫn ở trình duyệt (theo cửa sổ 3 phút, tiến độ theo chương; dừng giữa chừng thì chạy lại từ chương chưa xong).

---

## 4. Giao diện Xưởng audio (`/admin/studio`)

Thêm mục "Xưởng audio" vào menu `AdminApp.tsx` (route `studio`, `studio/:id`). Danh sách dự án → mở dự án là trình hướng dẫn 5 bước (tab ngang, bước sau mở khi bước trước hợp lệ):

1. **Kịch bản** — ô soạn chữ đánh dấu (font đơn cách, tô màu tên vai / lệnh), nút "Phân tích"; bên phải xem trước dạng khối (mỗi lời một thẻ: vai, cảm xúc, chữ đọc). Lỗi phân tích liệt kê theo dòng + cách sửa (kiểu `LoiKichBan` của make-YT: gom mọi lỗi một lần). Nút "Chèn mẫu" (một cảnh drama ngắn) cho người mới.
2. **Dàn vai** — mỗi vai một hàng: nhà cung cấp, giọng (danh sách theo provider), persona, tốc độ, âm lượng; nút ▶ nghe thử một câu mẫu của chính vai đó (`/studio/preview`). Cảnh báo vai chưa gán giọng.
3. **Tạo giọng** — đầu màn: **ước chi phí** (ký tự, phút, USD theo provider, phần đã có trong bộ đệm) + ngân sách tháng còn lại → nút "Tạo giọng (~$0,62)" phải bấm xác nhận. Danh sách lời có trạng thái (chờ / đang đọc / xong / nghi lỗi / lỗi), ▶ nghe từng lời, sửa chữ / cảm xúc tại chỗ rồi "Đọc lại" chỉ lời đó; lọc "chỉ nghi lỗi". Thanh tiến độ, dừng / tiếp tục.
4. **Dựng & trộn** — chọn nhạc nền / SFX từ kho (có cột giấy phép; không có giấy phép thì không cho chọn), âm lượng nhạc, mức ducking, nghỉ mặc định (bảng 2.4), LUFS đích (−16). Nghe thử một chương / 60 s quanh vị trí chọn (kết xuất nhanh một cửa sổ). Dải thời gian đơn giản theo chương: khối lời màu theo vai, SFX, nhạc. Báo nhịp (3.6).
5. **Xuất & đăng** — tiêu đề, mô tả, ảnh bìa (dùng `POST /api/admin/assets`), số tập; nút "Xuất và đăng": tiến độ theo chương (kết xuất → đo → mã hoá → tải); xong hiện link track + LUFS đo được + thời lượng. Tuỳ chọn "Xoá clip nháp sau khi đăng" (giảm R2).

Màn phụ **Kho âm thanh**: tải nhạc / SFX kèm bắt buộc ô Nguồn (URL), Giấy phép, Ghi công. Màn **Tổng quan** thêm thẻ "Chi phí TTS tháng này".

---

## 5. Dùng lại từ make-YT (viết lại sang TS)

| make-YT | Dùng lại thế nào |
|---|---|
| `chuan_hoa.py` — nguyên tắc "chỉ sửa cái động cơ đọc sai", từ điển YAML khớp nguyên từ, khoá dài trước, khoá chữ thường không phân biệt hoa | `normalizeVi()` + từ điển đọc lưu trong `settings` (`studio_lexicon`), sửa trong giao diện. Bổ sung luật tiếng Việt mà make-YT chưa có (nó chỉ đọc số tiếng Anh): số → chữ (mốt / tư / lăm / mươi / linh, nghìn–triệu–tỷ), ngày `12/3/2024`, giờ `9h30`, tiền `500k` / `2tr` / `đ`, `%`, số La Mã sau "thế kỷ / chương", viết tắt chat (`ko`, `k`, `đc`, `vs`, `ng`), địa danh (`TP.HCM`, `HN`). Áp vào `readText`, giữ `text` gốc để hiển thị. Lưu phiên bản bộ chuẩn hoá trong băm clip. |
| `tach_manh()` — tách mẩu theo dấu câu, loại nghỉ `phay/cham/hoi/ngat/doan`, gộp mẩu < 3 từ, không tách `10,000` / `3.5` / `9:30` / `2008–2009` | `splitPhrases()` cho nhà cung cấp không hỗ trợ nghỉ tốt (FPT/Azure/mock): đọc từng mẩu rồi chèn lặng theo bảng 2.4; với Gemini/ElevenLabs gửi cả lời (giữ ngữ điệu) và chỉ nghỉ giữa lời. |
| `tach_doan(…, 300)` — cắt ≤ N ký tự ưu tiên ranh giới câu, cùng lắm cắt ở dấu phẩy / theo từ | Tách lời quá dài trước khi gửi (Gemini ~1.500 ký tự, ElevenLabs v3 5.000, mỗi lần an toàn ≤ 1–2 phút audio). |
| `NGHI_MAC_DINH` + `config-vi.yaml` (`phay 0,25 / cham 0,5 / hoi 0,55 / ngat 0,5 / doan 0,8`, tốc độ 0,8 cho tiếng Việt) và `DEM_MANH = 0,03` cắt lặng hai đầu | Bảng 2.4; cắt lặng mỗi clip (ngưỡng −45 dBFS) giữ 30 ms. |
| `giong.py` — bộ đệm theo băm mẩu: sửa một câu chỉ đọc lại câu đó; khoá băm gồm tên giọng | `studio_clips.hash` = băm(provider, voice, persona, style, speed, readText, phiên bản chuẩn hoá). |
| `giong.py` — động cơ `GiaLap` (tiếng bíp) để thử luồng không cần mô hình | Provider `mock` (3.5), mặc định ở local. |
| `kiem_nhip.py` — báo khuyên không chặn, mỗi cảnh báo kèm "Cách sửa", ngưỡng đổi được | 3.6, đổi đơn vị "từ/phút" sang "âm tiết/phút" cho tiếng Việt. |
| `am_thanh.py` — nhạc 0,07 (≈ −23 dB dưới giọng), ducking thêm 3–6 dB (ngưỡng 0,05, tỉ lệ 2,5, attack 20 ms, release 300 ms), fade vào 1,5 s / ra 3 s, chuẩn hoá đỉnh hiệu ứng 0,98, giới hạn 0,95 | Cùng con số, làm bằng tự động hoá gain Web Audio + limiter tự viết. Thêm đo LUFS (make-YT chưa có). |
| `kichban.py` — kiểm khoá lạ, gom mọi lỗi một thông báo, điền mặc định | Bộ phân tích chữ đánh dấu + kiểm JSON. |
| `docs/03` — mỗi tệp nhạc / SFX phải có dòng nguồn + giấy phép + ghi công; chỉ Freesound CC0 / CC BY; không dùng nhạc AI khi chưa đọc điều khoản; không nhân bản giọng người khác | Bảng `studio_assets` bắt buộc các cột đó; trang track có thể hiện ghi công CC BY. **Khác make-YT**: YouTube Audio Library chỉ dùng cho YouTube → **không** dùng cho web này. |

---

## 6. Rủi ro giấy phép / chi phí

**Giấy phép**
- **Nội dung truyện**: chỉ đăng kịch bản tự viết / có quyền. Chuyển thể tiểu thuyết, truyện mạng người khác thành audio là vi phạm bản quyền dù giọng do máy đọc.
- **Giọng**: dùng bản trả phí của nhà cung cấp (Gemini paid, ElevenLabs Starter+, FPT Premium). Gói miễn phí: ElevenLabs cấm thương mại; Gemini miễn phí thì Google dùng nội dung để cải thiện sản phẩm. Không nhân bản giọng người thật (diễn viên, MC…) — kể cả VieNeu cho phép nhân bản 3 giây.
- **Mô hình mở**: F5-TTS-Vietnamese (CC-BY-NC-SA), viXTTS (CPML, cấm cả đầu ra thương mại) → loại. VieNeu v3 Turbo: mã Apache-2.0 nhưng giấy phép trọng số chưa ghi rõ ở repo chính → hỏi tác giả trước khi đăng nội dung kiếm tiền.
- **Edge TTS**: không phải dịch vụ công khai, có thể bị chặn bất kỳ lúc nào và trái điều khoản khi dùng thương mại → không dùng.
- **Gắn nhãn AI**: OpenAI bắt buộc báo giọng AI; Gemini gắn SynthID vào mọi audio; nên ghi "Giọng đọc tạo bằng AI" ở mô tả track (cũng hợp xu hướng luật Việt Nam yêu cầu gắn nhãn sản phẩm do AI tạo — cần kiểm văn bản luật hiện hành).
- **Nhạc / SFX**: Pixabay (không cần ghi công, cấm bán lại tệp rời), Freesound chỉ CC0 / CC BY (ghi công), Kenney CC0, Incompetech CC BY (bắt buộc ghi công). Lưu chứng nhận tải (Pixabay) cho từng bài.

**Chi phí**
- Gemini 3.8 Flash TTS **tăng gấp đôi từ 01/01/2027** ($9 → $18 / 1M token ra); 1 truyện 60 phút ≈ $0,8 (2026) / $1,6 (2027), cộng ~20–30% cho đọc lại. Batch/Flex nửa giá.
- ElevenLabs ≈ $3,6/giờ — dùng có chọn lọc; gói tháng hết ký tự thì tính theo mức vượt.
- Chặn tiêu ngoài ý muốn: MOCK mặc định; xác nhận số tiền trước mỗi lượt sinh; ngân sách tháng (`studio_monthly_budget_usd`) chặn ở máy chủ; bộ đệm theo băm không trả tiền lần hai; giới hạn `force` đọc lại.
- R2: clip WAV 24 kHz mono ≈ 170 MB / giờ — xoá sau khi đăng; HLS AAC 96 kbps ≈ 43 MB / giờ.
- Worker: gọi TTS chủ yếu là chờ mạng (không tính CPU); gói Free (10 ms CPU) vẫn có thể đủ cho chuyển tiếp nhưng giải mã base64 / ghép WAV có thể vượt → nên gói Paid. Queues (giai đoạn 2) cần kiểm gói.
- Phụ thuộc preview: Gemini 3.1 / 2.5 TTS là preview, OpenAI TTS ngừng 06/01/2027 → giữ lớp `TtsProvider` để đổi nhanh.

**Kỹ thuật**
- WebCodecs AAC chỉ chắc trên Chrome/Edge máy tính; packed-audio HLS phải nghiệm thu trên Safari iPhone (thẻ ID3 timestamp).
- TTS sinh có thể đọc sai thanh điệu tên riêng / từ Hán Việt hiếm → từ điển đọc + nghe duyệt lời "nghi lỗi" trước khi xuất.
- Giọng Gemini có thể trôi giữa các lần gọi → cố định persona + giọng mỗi vai, không đổi style quá mạnh trong cùng một cảnh.

---

## Thứ tự làm đề xuất

1. `shared/studio.ts` (phân tích, chuẩn hoá, dòng thời gian, ước chi) + provider `mock` + bảng D1 + endpoint dự án / voice / clips.
2. Màn bước 1–3 với mock; trộn + xuất HLS AAC (bước 4–5) với mock → nghiệm thu phát trên iPhone/Android.
3. Bật `gemini` (khoá thật, ngân sách nhỏ), nghe thử 10 phút truyện mẫu, chỉnh bảng cảm xúc.
4. Thêm `fpt` / `elevenlabs`; kho âm thanh có giấy phép; giai đoạn 2 Queues nếu cần.
