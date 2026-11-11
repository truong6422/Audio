-- GỢI Ý (không phải migration): bảng chuyển 301 slug cũ → slug mới khi đổi tiêu đề.
-- Khi đưa vào dùng: tạo migration riêng trong migrations/ từ nội dung này.
CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug   TEXT PRIMARY KEY,               -- slug đã từng dùng (không trùng slug đang dùng của tracks)
  track_id   TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL                -- giây Unix
);
CREATE INDEX IF NOT EXISTS slug_redirects_track_idx ON slug_redirects (track_id);

-- Khi PATCH /api/admin/tracks/:id đổi slug (cùng batch D1):
--   INSERT INTO slug_redirects (old_slug, track_id, created_at) VALUES (?old, ?id, ?now)
--     ON CONFLICT(old_slug) DO UPDATE SET track_id = excluded.track_id, created_at = excluded.created_at;
--   DELETE FROM slug_redirects WHERE old_slug = ?new;   -- slug mới trùng một slug cũ → bỏ chuyển hướng vòng
-- Khi /track/:slug không thấy bản ready:
--   SELECT t.slug FROM slug_redirects r JOIN tracks t ON t.id = r.track_id
--    WHERE r.old_slug = ? AND t.status = 'ready' LIMIT 1;   → 301 tới /track/<slug mới>
