import type { User } from "../../shared/types";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  /** URL gốc công khai của R2 (custom domain). Rỗng = phục vụ qua /media/. */
  MEDIA_PUBLIC_BASE?: string;
  /** Mã dựng quản trị viên đầu tiên (đặt trong .dev.vars / wrangler secret). */
  SETUP_TOKEN?: string;
  /** Trợ lý viết kịch bản: mock (mặc định, không gọi mạng) | claude | gemini. */
  WRITER_PROVIDER?: string | undefined;
  /** Ghi đè model của trợ lý viết. */
  WRITER_MODEL?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User | null };
};
