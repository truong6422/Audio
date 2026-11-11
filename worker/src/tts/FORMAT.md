# Định dạng kịch bản Xưởng audio (chốt)

Bộ phân tích: `worker/src/tts/script.ts` (`parseScript`). Đọc được **hai dạng** trộn lẫn trong cùng một kịch bản:
**Dạng A** (Trợ lý viết đang xuất — giữ tương thích) và **Dạng B** (theo `docs/xuong-audio-thiet-ke.md`).
Mỗi dòng một lệnh. Dòng trống = hết đoạn văn (nghỉ 0,8 s).

## Vai người dẫn

Tên chuẩn: **`Người dẫn`** (trùng Trợ lý viết). Viết `Dẫn`, `Dẫn chuyện`, `Người kể` cũng được — tự quy về `Người dẫn`.
Dòng chữ thường không có nhãn vai = lời `Người dẫn`.

## Dạng A — nhãn vai trong ngoặc vuông

```text
# Đêm mưa ở phố cũ                    ← # = tiêu đề (dòng # đầu tiên) / chú thích, không đọc
[Người dẫn] Đêm ấy trời mưa tầm tã.
[Mẹ chồng|giận] Cô đi đâu giờ này?    ← vai | cảm xúc
[Nàng dâu|thì thầm|0.9] Con… con xin lỗi mẹ.   ← vai | cảm xúc | tốc độ (0.5–2)
(nghỉ 1.5s)                           ← nghỉ; (nghỉ) = 1 giây; đặt giữa câu cũng được
{nhạc: buồn}                          ← bật / đổi nhạc nền; {nhạc: buồn 20%} kèm âm lượng
{nhạc: tắt}
{hiệu ứng: mưa}                       ← hiệu ứng chồng lên, không làm trễ lời; {hiệu ứng: sấm 3s 80%}
---                                   ← chuyển cảnh (nghỉ 1,2 s)
```

## Dạng B — `Vai (cảm xúc): lời`

```text
# Đêm mưa ở phố cũ
@vai Người dẫn = gemini:Sulafat | ấm, kể chậm        ← khai báo vai: [nhà cung cấp:]giọng | persona [speed=0.9]
@vai Lan       = Kore | nữ trẻ, giọng miền Bắc
@đọc Hằng Nga  = Hằng Nga                            ← từ điển đọc của tập (khớp nguyên từ)
@nhạc mưa-đêm-piano vol=0.08 fade=3                  ← nhạc nền từ chỗ này

## Chương 1 — Người về                              ← ## = chương (nghỉ 2 s; gợi ý số tập)
[sfx mưa-rơi vol=0.3 loop until=chương]             ← hiệu ứng lặp tới hết chương
Dẫn: Đêm ấy trời mưa tầm tã…
[nghỉ 1.2]
[sfx: gõ-cửa]                                        ← dấu ":" sau từ khoá có cũng được
Lan (thì thầm, run rẩy): Anh… anh về rồi à?
Hùng (giận, quát): Cô còn dám hỏi câu đó sao?!
Lan (khóc nấc): Em xin lỗi… <sigh> em đã đợi anh suốt 10 năm.
Dẫn {đọc: mười năm ấy, chẳng ai nhắc lại nữa}: 10 năm ấy, chẳng ai nhắc lại nữa.
[nhạc giảm -6 trong 4]                               ← hạ nhạc 6 dB trong 4 giây; [nhạc tăng 3]
[nhạc tắt]
```

**Khi nào `Tên:` được coi là vai?** Khi tên ≤ 4 từ VÀ (đã khai báo `@vai`, HOẶC có `(cảm xúc)` / `{đọc: …}`,
HOẶC xuất hiện dạng `Tên:` từ 2 dòng trở lên, HOẶC là người dẫn). Còn lại (vd. `Cô nói: thôi về đi.`) là lời
người dẫn và có cảnh báo. Trợ lý viết nên khai báo `@vai` cho mọi nhân vật nếu xuất dạng B.

## Chi tiết chung

| Thành phần | Cú pháp | Ghi chú |
|---|---|---|
| Cảm xúc | trong `(…)` (B) hoặc sau `|` (A); nhiều chỉ dẫn cách nhau bằng dấu phẩy | Từ khoá đầu tiên khớp bảng dưới → mã chuẩn; toàn bộ chữ trong ngoặc vẫn gửi Gemini làm `style`. Số `0.9` / `1.1x` = tốc độ |
| Thẻ trong câu | `<sigh>` `<laugh>` `<gasp>` `<short pause>` `<long pause>` (hoặc `<thở dài>` `<cười>` `<hít hà>` `<nghỉ ngắn>` `<nghỉ dài>`) | Gemini hiểu; Azure đổi pause → `<break>`; nhà khác bỏ thẻ |
| Chữ đọc khác chữ hiện | `{đọc: …}` trên dòng | Thay **toàn bộ** chữ đưa vào máy của dòng đó. Muốn sửa một từ → dùng `@đọc từ = cách đọc` |
| Nghỉ | `[nghỉ 1.2]`, `[nghỉ 2 giây]`, `(nghỉ 1.5s)`, `(nghỉ)` | Thay nghỉ tự động của lời ngay trước |
| Nhạc nền | `[nhạc tên vol=0.08 fade=3]`, `[nhạc: tên]`, `{nhạc: tên 20%}`, `@nhạc tên …`, `[nhạc tắt]`, `[nhạc giảm -6 trong 4]` | `tên` = tệp trong thư viện Xưởng (slug không dấu: "mưa-đêm" ↔ `mua-dem`), không có thì Xưởng tự tổng hợp nền theo tâm trạng (buồn, vui, kinh dị, hồi hộp…) |
| Hiệu ứng | `[sfx tên vol=0.3 dài=4s loop until=chương]`, `[sfx: tên]`, `{hiệu ứng: tên 3s 80%}` | Không có tệp → tổng hợp sẵn: mưa, gió, sấm, gõ cửa, cửa, bước chân, chuông; tên khác → tiếng "vút" |
| Chương | `## Tên chương` | |
| Chú thích | `# …` (dòng `#` đầu tiên là tiêu đề), `// …` | |
| Cảnh | `---` | nghỉ 1,2 s |

**Mã cảm xúc chuẩn** (từ khoá → mã): bình thường → `""`; giận, tức, gằn → `gian`; quát, hét, gào → `het`;
buồn → `buon`; khóc, khóc nấc, nghẹn ngào → `khoc`; vui, cười, phấn khích → `vui`; sợ, sợ hãi, run rẩy → `so-hai`;
thì thầm, nói nhỏ → `thi-tham`; mỉa mai, châm chọc, chế giễu → `che-gieu`; lạnh lùng → `lanh-lung`;
dịu dàng, nhẹ nhàng, ấm áp → `am-ap`; hồi hộp → `hoi-hop`; căng thẳng, lo lắng → `cang-thang`;
ngạc nhiên, bất ngờ, sửng sốt → `ngac-nhien`; mệt mỏi, uể oải → `met-moi`. Chữ khác vẫn nhận (cảnh báo) và gửi nguyên văn cho Gemini.

**Nghỉ tự động sau mỗi lời** (giây): `,;:` 0,25 · `.` 0,5 · `?!` 0,55 · `…` / `—` 0,7 · không dấu 0,4 ·
đổi người nói ≥ 0,35 · hết đoạn văn (dòng trống) ≥ 0,8 · chương 2 · cảnh `---` 1,2.

**Chuẩn hoá tiếng Việt** (`normalize.ts`, áp vào chữ đọc, chữ hiển thị giữ nguyên): số → chữ (mốt / tư / lăm / linh,
nghìn–triệu–tỷ; `1.250.000`, `3,5`, `3.5`), ngày `12/3/2024`, `4/2023`, giờ `9h30` / `21:15`, tiền `500k` `2tr` `đ` `$`,
`%`, đơn vị (km, kg, m², km/h…), khoảng `3-5`, số điện thoại đọc từng chữ số, số thứ tự `thứ 4`, La Mã sau
"thế kỷ / chương / phần / tập", viết tắt (TP.HCM, UBND, ko, đc, vs…).

**Giới hạn**: kịch bản ≤ 200.000 ký tự, ≤ 2.000 lời; lời > 600 ký tự tự chia theo câu (mỗi phần một request).
