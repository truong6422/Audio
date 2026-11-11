-- Khởi tạo CSDL D1 cho Kể Đêm Audio.
-- Thời gian lưu dạng giây Unix (INTEGER). Boolean dạng 0/1.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  -- "pbkdf2-sha256$<vòng>$<salt base64>$<hash base64>"
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_email_uq ON users (email);
CREATE INDEX users_admin_idx ON users (is_admin) WHERE is_admin = 1;

-- Phiên đăng nhập: chỉ lưu SHA-256 của sid (cookie giữ sid gốc).
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE tracks (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL,
  -- mã số ngắn tăng dần (1, 2, 3…) cho link /s/<code>
  code             INTEGER NOT NULL,
  title            TEXT NOT NULL,
  -- tiêu đề bỏ dấu, chữ thường, đ→d — để tìm bằng LIKE
  title_search     TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  cover_url        TEXT,
  format           TEXT NOT NULL CHECK (format IN ('hls', 'file')),
  -- tên tệp vào (tương đối trong tracks/<id>/): master.m3u8 hoặc audio.mp3
  entry            TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  episode_count    INTEGER NOT NULL DEFAULT 1 CHECK (episode_count >= 1),
  status           TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready')),
  play_count       INTEGER NOT NULL DEFAULT 0,
  -- slug thể loại (danh sách thể loại nằm trong settings.categories)
  category         TEXT,
  -- mảng JSON các tag, vd ["me-chong","bao-thu"]
  tags             TEXT NOT NULL DEFAULT '[]',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX tracks_slug_uq ON tracks (slug);
CREATE UNIQUE INDEX tracks_code_uq ON tracks (code);
CREATE INDEX tracks_category_idx ON tracks (status, category, created_at DESC);
CREATE INDEX tracks_status_new_idx ON tracks (status, created_at DESC);
CREATE INDEX tracks_status_hot_idx ON tracks (status, play_count DESC, created_at DESC);

CREATE TABLE history (
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_id         TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, track_id)
);
CREATE INDEX history_user_recent_idx ON history (user_id, updated_at DESC);
CREATE INDEX history_track_idx ON history (track_id);

-- Cài đặt key–value, value là JSON.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Đếm lượt mở khoá chốt (chỉ để thống kê).
CREATE TABLE unlock_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  checkpoint_id TEXT NOT NULL,
  track_id      TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX unlock_events_created_idx ON unlock_events (created_at);
CREATE INDEX unlock_events_cp_idx ON unlock_events (checkpoint_id, created_at);

-- Sự kiện phễu (view → play → gate_shown → unlock → complete…). Không lưu IP thô: ip_hash = SHA-256(IP + ngày).
CREATE TABLE funnel_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL CHECK (type IN ('view', 'play', 'gate_shown', 'unlock', 'gate_dismiss', 'complete', 'share')),
  track_id      TEXT,
  checkpoint_id TEXT,
  source        TEXT NOT NULL DEFAULT '',
  campaign      TEXT NOT NULL DEFAULT '',
  ip_hash       TEXT NOT NULL,
  day           TEXT NOT NULL, -- YYYY-MM-DD theo giờ Việt Nam
  created_at    INTEGER NOT NULL
);
CREATE INDEX funnel_events_day_idx ON funnel_events (day, source, type);
CREATE INDEX funnel_events_ip_idx ON funnel_events (ip_hash, created_at);

-- Chuyển 301 slug cũ → slug mới khi đổi tiêu đề (worker/src/seo/schema.sql).
CREATE TABLE slug_redirects (
  old_slug   TEXT PRIMARY KEY,               -- slug đã từng dùng (không trùng slug đang dùng của tracks)
  track_id   TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL                -- giây Unix
);
CREATE INDEX slug_redirects_track_idx ON slug_redirects (track_id);

-- Thời gian: giây Unix. JSON lưu dạng TEXT.

-- Một dự án truyện = ý tưởng + nhân vật + dàn ý nhiều tập.
CREATE TABLE writer_projects (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  genre           TEXT NOT NULL,
  idea            TEXT NOT NULL,
  -- JSON: [{ "name": "Lan", "gender": "nữ", "age": "28", "role": "nàng dâu hiền" }]
  characters      TEXT NOT NULL DEFAULT '[]',
  episode_minutes INTEGER NOT NULL DEFAULT 10 CHECK (episode_minutes BETWEEN 3 AND 40),
  episode_count   INTEGER NOT NULL DEFAULT 5 CHECK (episode_count BETWEEN 1 AND 30),
  pov             TEXT NOT NULL DEFAULT 'ngoi3' CHECK (pov IN ('ngoi1', 'ngoi3')),
  ending          TEXT NOT NULL DEFAULT 'co-hau' CHECK (ending IN ('co-hau', 'twist')),
  notes           TEXT NOT NULL DEFAULT '',
  -- JSON dàn ý: { "title", "logline", "seoTitle", "seoDescription",
  --   "episodes": [{ "no", "title", "summary", "cliffhanger" }] } — NULL khi chưa sinh
  outline         TEXT,
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX writer_projects_updated_idx ON writer_projects (updated_at DESC);

-- Kịch bản từng tập, theo ĐỊNH DẠNG XƯỞNG AUDIO (xem worker/src/writer/format.ts).
CREATE TABLE writer_episodes (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES writer_projects (id) ON DELETE CASCADE,
  ep_no           INTEGER NOT NULL CHECK (ep_no >= 1),
  title           TEXT NOT NULL DEFAULT '',
  script          TEXT NOT NULL DEFAULT '',
  cliffhanger     TEXT NOT NULL DEFAULT '',
  -- đoạn mồi 30–60 giây cho TikTok, cùng định dạng kịch bản
  teaser          TEXT NOT NULL DEFAULT '',
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  hashtags        TEXT NOT NULL DEFAULT '',
  -- draft = đang soạn; sent = đã gửi sang Xưởng audio (sửa kịch bản sau khi gửi → về draft)
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_at         INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX writer_episodes_uq ON writer_episodes (project_id, ep_no);
CREATE INDEX writer_episodes_sent_idx ON writer_episodes (status, sent_at DESC);

-- ===== Xưởng audio (gộp từ worker/src/tts/schema.sql) =====
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
