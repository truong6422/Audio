// Kiểu dữ liệu của Xưởng audio (worker/src/tts). Phía web có bản sao ở web/src/admin/studio/studioApi.ts —
// đổi ở đây nhớ sửa bên đó (hai tsconfig composite không cho import chéo thư mục).

/**
 * Env bindings Xưởng audio cần (gắn sub-app dưới /api/admin/studio SAU requireAdmin):
 *   DB     — D1: studio_jobs, studio_segments, studio_usage (schema.sql); đăng track thì ghi bảng tracks
 *   MEDIA  — R2: studio/<jobId>/<n>.wav, studio/lib/<music|sfx>/<tên>.<đuôi>, tracks/<trackId>/studio-*.wav
 * Tuỳ chọn:
 *   TTS_MODE = "live" mới gọi nhà cung cấp thật; thiếu / "mock" → MỌI phiên bị ép về MOCK (không gọi mạng, 0 đồng)
 *   GEMINI_API_KEY, GEMINI_TTS_MODEL (mặc định gemini-3.8-flash-tts)
 *   AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (vd. southeastasia)
 *   ELEVENLABS_API_KEY, ELEVENLABS_MODEL (mặc định eleven_v3)
 *   STUDIO_MONTHLY_BUDGET_USD — trần chi tháng (mặc định 10); vượt → 402
 * Khoá đặt bằng `wrangler secret put`, không ghi vào wrangler.jsonc.
 */
export interface StudioEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  TTS_MODE?: string;
  GEMINI_API_KEY?: string;
  GEMINI_TTS_MODEL?: string;
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL?: string;
  STUDIO_MONTHLY_BUDGET_USD?: string;
}

export type ProviderId = "mock" | "gemini" | "azure" | "elevenlabs";
export const PROVIDER_IDS: readonly ProviderId[] = ["mock", "gemini", "azure", "elevenlabs"];

/** Mã cảm xúc chuẩn (khớp docs/xuong-audio-thiet-ke.md mục 2.3). "" = bình thường. */
export type Emotion =
  | ""
  | "gian"
  | "het"
  | "buon"
  | "khoc"
  | "vui"
  | "so-hai"
  | "thi-tham"
  | "che-gieu"
  | "lanh-lung"
  | "am-ap"
  | "hoi-hop"
  | "cang-thang"
  | "ngac-nhien"
  | "met-moi";

/** Một mục trên dòng thời gian sau khi phân tích kịch bản (FORMAT.md). */
export type ScriptItem =
  | {
      type: "speech";
      n: number; // số thứ tự lời (0..), trùng studio_segments.n
      line: number; // dòng trong kịch bản (1..)
      chapter: number; // chỉ số chương (0 = trước chương đầu)
      role: string;
      emotion: Emotion | string; // mã chuẩn, hoặc chữ tự do nếu không khớp
      direction: string; // chỉ dẫn diễn nguyên văn trong (…), vd. "thì thầm, run rẩy"
      speed: number | null; // ghi đè tốc độ của vai
      text: string; // chữ hiển thị
      ttsText: string; // chữ đưa vào máy (đã chuẩn hoá / {đọc: …})
      pauseAfter: number; // giây nghỉ sau lời
    }
  | { type: "pause"; line: number; seconds: number }
  | { type: "chapter"; line: number; index: number; title: string }
  | { type: "music"; line: number; action: "start" | "stop" | "gain"; asset: string | null; volume: number | null; fade: number | null; db: number | null }
  | { type: "sfx"; line: number; asset: string; volume: number | null; seconds: number | null; loop: boolean; untilChapter: boolean };

export interface CastHint {
  provider: ProviderId | null;
  voice: string;
  persona: string;
  speed: number | null;
}

export interface ParseResult {
  title: string;
  items: ScriptItem[];
  roles: string[]; // theo thứ tự xuất hiện
  cast: Record<string, CastHint>; // từ dòng @vai
  lexicon: Record<string, string>; // từ dòng @đọc (tầng "tập")
  chapters: string[];
  speechCount: number;
  chars: number; // tổng ký tự đưa vào TTS
  estSeconds: number;
  warnings: { line: number; message: string }[];
}

export interface RoleVoice {
  voice: string; // tên / mã giọng của nhà cung cấp
  speed: number; // 0.5..2
  persona: string; // mô tả cố định gửi kèm mọi lời (Gemini dùng làm style)
}

export type JobStatus = "draft" | "generating" | "ready" | "error" | "published";
export type SegmentStatus = "pending" | "generating" | "done" | "error";

export interface StudioJob {
  id: string;
  title: string;
  script: string;
  provider: ProviderId;
  voices: Record<string, RoleVoice>;
  status: JobStatus;
  trackId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StudioSegment {
  n: number;
  role: string;
  emotion: string;
  style: string;
  text: string;
  ttsText: string;
  provider: ProviderId;
  voice: string;
  speed: number;
  hash: string;
  status: SegmentStatus;
  error: string | null;
  qc: string | null; // null = ổn; chuỗi = lý do nghi lỗi (gợi ý đọc lại)
  durationMs: number;
  bytes: number;
  costUsd: number;
  cached: boolean;
}

export interface SynthesisRequest {
  text: string; // đã chuẩn hoá; có thể chứa thẻ <sigh> <laugh> <gasp> <short pause> <long pause>
  voice: string;
  speed: number;
  emotion: string;
  style: string; // persona + chỉ dẫn diễn (Gemini), các nhà khác bỏ qua / quy về prosody
}

export interface SynthesisResult {
  wav: Uint8Array; // luôn là WAV PCM 16-bit
  durationMs: number;
}
