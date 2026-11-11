-- Xưởng audio (worker/src/tts). Gộp vào migrations/0001_init.sql (migration chưa commit), SAU bảng tracks.
-- Thời gian: giây Unix. Tệp: R2 studio/<job_id>/<n>.wav; thư viện nhạc / hiệu ứng studio/lib/<music|sfx>/<tên>.<đuôi>.

CREATE TABLE studio_jobs (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  script      TEXT NOT NULL DEFAULT '',
  -- nhà cung cấp chọn cho phiên: 'mock' | 'gemini' | 'azure' | 'elevenlabs' (TTS_MODE ≠ live thì vẫn chạy mock)
  provider    TEXT NOT NULL DEFAULT 'mock',
  -- JSON { "<vai>": { "voice": "...", "speed": 1, "persona": "..." } }
  voices_json TEXT NOT NULL DEFAULT '{}',
  -- JSON ScriptItem[] — dòng thời gian đã phân tích (lời, nghỉ, chương, nhạc, hiệu ứng)
  items_json  TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'ready', 'error', 'published')),
  track_id    TEXT REFERENCES tracks (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX studio_jobs_recent_idx ON studio_jobs (updated_at DESC);

CREATE TABLE studio_segments (
  job_id      TEXT NOT NULL REFERENCES studio_jobs (id) ON DELETE CASCADE,
  n           INTEGER NOT NULL,
  role        TEXT NOT NULL,
  emotion     TEXT NOT NULL DEFAULT '',
  -- persona của vai + chỉ dẫn diễn (Gemini style)
  style       TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL,
  tts_text    TEXT NOT NULL,
  provider    TEXT NOT NULL DEFAULT 'mock',
  voice       TEXT NOT NULL DEFAULT '',
  speed       REAL NOT NULL DEFAULT 1,
  -- SHA-256(nhà cung cấp | mô hình | giọng | tốc độ | cảm xúc | style | chữ | phiên bản chuẩn hoá) — khoá bộ đệm
  hash        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'done', 'error')),
  error       TEXT,
  -- NULL = ổn; chuỗi = lý do nghi lỗi (độ dài / âm tiết lệch, gần im, vỡ tiếng, lặng giữa câu)
  qc          TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  bytes       INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,
  -- 1 = lấy lại từ bộ đệm (không gọi nhà cung cấp, không tính tiền)
  cached      INTEGER NOT NULL DEFAULT 0 CHECK (cached IN (0, 1)),
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (job_id, n)
);
CREATE INDEX studio_segments_hash_idx ON studio_segments (hash) WHERE status = 'done';

-- Sổ chi tiêu theo ngày (giờ UTC) để chặn vượt ngân sách tháng (env STUDIO_MONTHLY_BUDGET_USD).
CREATE TABLE studio_usage (
  day      TEXT NOT NULL,              -- 'YYYY-MM-DD'
  provider TEXT NOT NULL,
  chars    INTEGER NOT NULL DEFAULT 0,
  seconds  REAL NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);
