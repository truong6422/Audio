// Prompt hệ thống + dựng yêu cầu + tách kết quả cho Trợ lý viết kịch bản.
import { NARRATOR } from "./format";
import type { Outline, OutlineEpisode, WriterCharacter, WriterProject } from "./types";

export const FICTION_NOTE = "Câu chuyện hoàn toàn là hư cấu, mọi nhân vật và tình tiết không liên quan tới người thật, việc thật.";

/** Tốc độ đọc kịch có ngắt nghỉ: ~140 tiếng / phút. */
export const WORDS_PER_MINUTE = 140;

export const SYSTEM_PROMPT = `Bạn là biên kịch audio drama gia đình Việt Nam cho kênh "Kể Đêm Audio" — truyện nghe buổi tối, giọng đọc AI nhiều vai.

NGƯỜI NGHE
Người lớn Việt Nam 25–55 tuổi, nghe bằng tai khi đang làm việc nhà, lái xe, trước khi ngủ. Họ không nhìn chữ — mọi thứ phải hiểu được chỉ bằng tai.

VĂN NÓI
- Viết như người thật đang nói chuyện: tự nhiên, đời thường, có "à", "ơi", "nhé", "cơ mà", "thôi" đúng chỗ. Xưng hô đúng vai vế gia đình Việt (con – mẹ, anh – em, bà – cháu…), nhất quán từ đầu tới cuối.
- Câu ngắn, dễ đọc thành tiếng: thường 6–20 tiếng một câu, mỗi dòng 1–3 câu. Tránh câu lồng nhiều mệnh đề, tránh từ Hán Việt khó, tránh ngoặc đơn, gạch đầu dòng, viết tắt, ký hiệu. Số viết bằng chữ khi dễ đọc sai ("hai trăm triệu", không "200tr").
- Người nghe phải luôn biết ai đang nói: gọi tên nhau trong thoại, lời kể nêu rõ ai làm gì. Không quá 3–4 nhân vật trong một cảnh.
- Tả bằng âm thanh và cảm giác (tiếng mưa, tiếng cửa, hơi thở, nhịp tim) hơn là tả hình ảnh.
- Thoại mang xung đột và cảm xúc; lời kể dẫn dắt, chuyển cảnh, giữ nhịp. Xen kẽ thoại và lời kể, không để một vai nói quá dài.
- Mỗi tập có nhịp: mở bằng một khoảnh khắc căng (không chào hỏi, không tóm tắt dài tập trước), giữa tập có ít nhất hai bước ngoặt nhỏ, cuối tập là MÓC CÂU — một câu hỏi bỏ ngỏ / sự thật hé lộ một nửa khiến người nghe phải nghe tập sau. Tập cuối khép lại trọn vẹn.

ĐỊNH DẠNG XƯỞNG AUDIO — BẮT BUỘC cho mọi kịch bản và đoạn mồi. Mỗi dòng đúng một trong các dạng sau, không có gì khác:
[Vai] lời
[Vai|cảm xúc] lời
(nghỉ 1.5s)
{nhạc: buồn}
{hiệu ứng: mưa}
---            (chuyển cảnh)
Quy tắc:
- "Vai" là tên nhân vật đúng như danh sách, hoặc "${NARRATOR}" cho lời dẫn. Mọi lời đều mở bằng [Vai]. Không thêm dấu hai chấm sau ngoặc vuông, không in đậm, không đánh số, không tiêu đề cảnh, không ghi chú; trong lời không dùng ngoặc [ ] { } và không dùng ( ) ngoài (nghỉ …).
- Cảm xúc là chỉ dẫn cách đọc, CHỈ chọn trong danh sách: giận, hét, buồn, khóc, nghẹn ngào, vui, cười, sợ, run, thì thầm, mỉa mai, lạnh lùng, dịu dàng, hồi hộp, căng thẳng, ngạc nhiên, mệt mỏi. Chỉ ghi khi cảm xúc đổi hoặc quan trọng.
- (nghỉ Ns) với N từ 0.3 đến 3 — đặt sau câu nặng cảm xúc, khi chuyển cảnh, trước khi lộ bí mật.
- {nhạc: …} gợi ý: ấm áp, buồn, căng thẳng, bí ẩn, cao trào, nhẹ nhàng, tắt. Đổi nhạc khi đổi không khí, không quá 6 lần một tập.
- {hiệu ứng: …} gợi ý: mưa, sấm, gió, cửa mở, cửa đóng sầm, bước chân, chuông điện thoại, tin nhắn, chuông cửa, xe máy, ô tô, chén vỡ, đồng hồ, tiếng khóc, tiếng cười, chợ, gà gáy. Dùng vừa phải, có chủ đích.

NỘI DUNG AN TOÀN (bắt buộc)
- Truyện hoàn toàn hư cấu. Không dùng tên, chuyện riêng của người thật, người nổi tiếng, doanh nghiệp, địa danh cụ thể có thể gây hiểu nhầm là chuyện thật.
- Không mô tả bạo lực chi tiết, máu me, tự hại, tự tử; xung đột thể xác chỉ nói thoáng qua bằng lời kể. Không cảnh tình dục hay gợi dục — chuyện ngoại tình kể qua hậu quả và cảm xúc.
- Không xúc phạm vùng miền, dân tộc, tôn giáo, giới tính, người khuyết tật; không lời lẽ tục tĩu nặng. Nhân vật xấu được phép cay nghiệt nhưng không chửi bới thô tục.
- Không cổ vũ hành vi phạm pháp; báo thù bằng sự thật, pháp luật, sự thành công — kẻ sai trả giá hợp lý.
- Không lời khuyên y tế, pháp lý, tài chính cụ thể.

TIÊU ĐỀ + MÔ TẢ SEO
- Tiêu đề tiếng Việt có dấu, 50–80 ký tự, gợi tò mò bằng xung đột thật có trong truyện, không giật tít sai sự thật, không viết hoa toàn bộ.
- Mô tả 2–4 câu hấp dẫn, chứa từ khoá thể loại (truyện audio, truyện đêm khuya, mẹ chồng nàng dâu…), kết bằng câu: "${FICTION_NOTE}"`;

const GENRE_HINTS: Record<string, string> = {
  "mẹ chồng nàng dâu": "Xung đột thế hệ, lễ giáo, nhẫn nhịn và lòng tự trọng; người chồng đứng giữa; kết có hoá giải hoặc cái giá rõ ràng.",
  "ngoại tình": "Kể qua dấu hiệu, nghi ngờ, đối chất và hậu quả với gia đình; tuyệt đối không cảnh nóng.",
  "báo thù": "Nhân vật chính bị phản bội, âm thầm gây dựng lại, lật mặt bằng bằng chứng và thành công — không bạo lực.",
  "gia sản": "Tranh chấp nhà đất, di chúc, anh em ruột thịt; lộ ra bí mật quá khứ; bài học về tình thân.",
  "tình cảm": "Chậm rãi, ấm áp, nhiều nội tâm; trắc trở đến từ hoàn cảnh và hiểu lầm.",
};

const charLine = (c: WriterCharacter) =>
  `- ${c.name} (${c.gender}${c.age ? `, ${c.age} tuổi` : ""}${c.voice ? `, vai ${c.voice}` : ""})${c.role ? `: ${c.role}` : ""}`;

function brief(p: WriterProject): string {
  const hint = GENRE_HINTS[p.genre.toLowerCase()];
  const main = p.characters[0]?.name ?? "nhân vật chính";
  return [
    `Thể loại: ${p.genre}${hint ? ` — ${hint}` : ""}`,
    `Ý tưởng: ${p.idea}`,
    p.characters.length ? `Nhân vật:\n${p.characters.map(charLine).join("\n")}` : "Nhân vật: tự đặt 3–5 nhân vật phù hợp (tên Việt phổ biến, không trùng người nổi tiếng).",
    p.pov === "ngoi1"
      ? `Giọng kể: NGÔI THỨ NHẤT — ${main} xưng "tôi" kể lại. Lời kể dùng vai [${main}] (không dùng "${NARRATOR}"), trừ dòng đầu ghi chú hư cấu.`
      : `Giọng kể: NGÔI THỨ BA — lời dẫn dùng vai [${NARRATOR}], giọng trầm ấm, khách quan.`,
    p.ending === "twist" ? "Kết: có TWIST bất ngờ nhưng hợp lý, cài manh mối từ các tập trước." : "Kết: CÓ HẬU — người tốt được đền đáp, kẻ sai biết hối lỗi hoặc trả giá.",
    `Số tập: ${p.episodeCount}, mỗi tập khoảng ${p.episodeMinutes} phút nghe (~${p.episodeMinutes * WORDS_PER_MINUTE} tiếng lời).`,
    p.notes ? `Ghi chú thêm của biên tập: ${p.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- Dàn ý ----------

export function outlinePrompt(p: WriterProject): string {
  return `${brief(p)}

Hãy lập DÀN Ý cho cả bộ truyện ${p.episodeCount} tập. Mỗi tập: tiêu đề tập ngắn, tóm tắt 3–5 câu (diễn biến chính, bước ngoặt), và móc câu cuối tập (tập cuối: ghi cách khép truyện).
Đặt tên truyện hấp dẫn, một câu logline, tiêu đề SEO và mô tả SEO cho cả bộ.

Chỉ trả về MỘT khối JSON hợp lệ, không giải thích, đúng mẫu:
{"title":"…","logline":"…","seoTitle":"…","seoDescription":"…","episodes":[{"no":1,"title":"…","summary":"…","cliffhanger":"…"}]}`;
}

function extractJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("Mô hình không trả về JSON dàn ý");
  return JSON.parse(text.slice(s, e + 1));
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeOutline(raw: unknown, count?: number): Outline {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const eps = Array.isArray(o.episodes) ? o.episodes : [];
  const episodes: OutlineEpisode[] = eps.slice(0, 30).map((e, i) => {
    const x = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    return { no: i + 1, title: s(x.title, 200), summary: s(x.summary, 3000), cliffhanger: s(x.cliffhanger, 1000) };
  });
  if (count !== undefined && episodes.length === 0) throw new Error("Dàn ý không có tập nào");
  return { title: s(o.title, 200), logline: s(o.logline, 500), seoTitle: s(o.seoTitle, 200), seoDescription: s(o.seoDescription, 2000), episodes };
}

export function parseOutline(text: string, count: number): Outline {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    throw new Error("Không đọc được dàn ý mô hình trả về, hãy thử sinh lại");
  }
  const o = normalizeOutline(raw, count);
  if (!o.seoDescription.includes("hư cấu")) o.seoDescription = `${o.seoDescription} ${FICTION_NOTE}`.trim();
  return o;
}

// ---------- Kịch bản một tập ----------

export interface EpisodeContext {
  project: WriterProject;
  outline: Outline;
  epNo: number;
  /** đuôi kịch bản tập trước (nếu có) để nối mạch */
  prevTail: string;
}

export function episodePrompt({ project: p, outline, epNo, prevTail }: EpisodeContext): string {
  const ep = outline.episodes[epNo - 1];
  const total = outline.episodes.length;
  const words = p.episodeMinutes * WORDS_PER_MINUTE;
  const plan = outline.episodes.map((e) => `Tập ${e.no} — ${e.title}: ${e.summary}${e.cliffhanger ? ` | Móc câu: ${e.cliffhanger}` : ""}`).join("\n");
  return `${brief(p)}

Tên truyện: ${outline.title || p.title}
Logline: ${outline.logline}

DÀN Ý CẢ BỘ:
${plan}

${prevTail ? `ĐOẠN CUỐI TẬP ${epNo - 1} (để nối mạch, không lặp lại):\n${prevTail}\n\n` : ""}VIỆC CẦN LÀM: viết trọn TẬP ${epNo}/${total} — "${ep?.title ?? ""}".
Tóm tắt tập: ${ep?.summary ?? ""}
${epNo < total ? `Móc câu cuối tập: ${ep?.cliffhanger ?? ""}` : "Đây là TẬP CUỐI: khép lại mọi tuyến truyện."}

Yêu cầu:
- Kịch bản dài khoảng ${words} tiếng lời (±15%), đúng ĐỊNH DẠNG XƯỞNG AUDIO.
- Dòng đầu tiên của kịch bản là: [${NARRATOR}] ${FICTION_NOTE}
- Sau đó {nhạc: …} mở không khí, rồi vào thẳng cảnh căng.
- ${epNo < total ? "Kết tập bằng móc câu, rồi một dòng [" + NARRATOR + "] mời nghe tập sau ngắn gọn." : "Kết bằng một câu đọng lại về tình thân / bài học, không giảng đạo dài."}
- ĐOẠN MỒI TIKTOK: 30–60 giây (khoảng 70–140 tiếng lời), cùng định dạng, cắt từ khoảnh khắc gay cấn nhất của tập (viết lại cho trọn ý), mở bằng câu gây sốc / câu hỏi trong 3 giây đầu, kết bằng câu bỏ lửng + [${NARRATOR}] mời nghe trọn tập trên Kể Đêm Audio. Không tiết lộ kết.
- Tiêu đề SEO và mô tả SEO cho riêng tập này; 5–8 hashtag tiếng Việt không dấu.

Trả về ĐÚNG các phần sau, mỗi phần mở bằng dòng đánh dấu riêng, không thêm gì khác:
===TIEU_DE===
(tiêu đề tập)
===KICH_BAN===
(kịch bản)
===MOC_CAU===
(một câu tóm móc câu cuối tập)
===MOI_TIKTOK===
(đoạn mồi)
===SEO_TIEU_DE===
(tiêu đề SEO)
===SEO_MO_TA===
(mô tả SEO)
===HASHTAG===
(#tag1 #tag2 …)`;
}

export interface EpisodeDraft {
  title: string;
  script: string;
  cliffhanger: string;
  teaser: string;
  seoTitle: string;
  seoDescription: string;
  hashtags: string;
}

const SECTIONS: Record<string, keyof EpisodeDraft> = {
  TIEU_DE: "title",
  KICH_BAN: "script",
  MOC_CAU: "cliffhanger",
  MOI_TIKTOK: "teaser",
  SEO_TIEU_DE: "seoTitle",
  SEO_MO_TA: "seoDescription",
  HASHTAG: "hashtags",
};

export function parseEpisode(text: string): EpisodeDraft {
  const out: EpisodeDraft = { title: "", script: "", cliffhanger: "", teaser: "", seoTitle: "", seoDescription: "", hashtags: "" };
  const re = /^\s*={2,}\s*([A-Z_]+)\s*={2,}\s*$/gm;
  const marks: Array<{ key: keyof EpisodeDraft; start: number; end: number }> = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const key = SECTIONS[m[1]];
    if (key) marks.push({ key, start: m.index, end: m.index + m[0].length });
  }
  if (!marks.length) {
    // Mô hình bỏ qua đánh dấu: coi cả đoạn là kịch bản.
    out.script = text.trim();
    return out;
  }
  marks.forEach((mk, i) => {
    out[mk.key] = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : text.length).trim();
  });
  return out;
}
