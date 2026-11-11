-- Dữ liệu mẫu CHỈ dùng cho D1 cục bộ (wrangler --local). Chạy qua: node scripts/seed-local.mjs
-- 3 track dạng "file", tệp tracks/<id>/audio.wav (im lặng 10 giây) do seed-local.mjs đưa lên R2 cục bộ.
INSERT OR REPLACE INTO tracks
  (id, slug, code, title, title_search, description, cover_url, format, entry, duration_seconds, episode_count, status, play_count, created_at, updated_at)
VALUES
  ('seed-track-1', 'chuyen-nha-ben-song', 1, 'Chuyện nhà bên sông', 'chuyen nha ben song',
   'Một câu chuyện gia đình nhẹ nhàng bên dòng sông quê. (Bản mẫu để thử giao diện.)',
   NULL, 'file', 'audio.wav', 10, 2, 'ready', 12, 1793000000, 1793000000),
  ('seed-track-2', 'dem-mua-o-pho-cu', 2, 'Đêm mưa ở phố cũ', 'dem mua o pho cu',
   'Tiếng mưa, con phố cũ và những người đi qua đời nhau. (Bản mẫu.)',
   NULL, 'file', 'audio.wav', 10, 1, 'ready', 40, 1793100000, 1793100000),
  ('seed-track-3', 'chuyen-khong-dau-khong-cuoi', 3, 'Chuyện không đầu không cuối', 'chuyen khong dau khong cuoi',
   'Những mẩu chuyện vụn kể lúc nửa đêm. (Bản mẫu.)',
   NULL, 'file', 'audio.wav', 10, 3, 'ready', 5, 1793200000, 1793200000);
