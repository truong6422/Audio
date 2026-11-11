-- Trợ lý viết kịch bản (worker/src/writer). Gộp vào migrations/0001_init.sql.
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
