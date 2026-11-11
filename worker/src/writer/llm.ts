// Nhà cung cấp mô hình cho Trợ lý viết kịch bản. Gọi bằng fetch, không thư viện.
// WRITER_PROVIDER = mock (mặc định, KHÔNG gọi mạng) | claude | gemini
// WRITER_MODEL    = ghi đè model (mặc định claude-sonnet-5-5 / gemini-2.5-pro)
// ANTHROPIC_API_KEY, GEMINI_API_KEY = khoá (wrangler secret)
import { HttpError } from "../lib";
import { NARRATOR } from "./format";
import { FICTION_NOTE } from "./prompts";
import type { WriterProject } from "./types";

export type ProviderName = "mock" | "claude" | "gemini";

export interface WriterVars {
  WRITER_PROVIDER?: string;
  WRITER_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

export interface ProviderInfo {
  provider: ProviderName;
  model: string;
  ready: boolean; // đủ khoá để gọi
}

export function providerInfo(env: WriterVars): ProviderInfo {
  const p = (env.WRITER_PROVIDER ?? "mock").trim().toLowerCase();
  if (p === "claude") return { provider: "claude", model: env.WRITER_MODEL?.trim() || "claude-sonnet-5-5", ready: !!env.ANTHROPIC_API_KEY };
  if (p === "gemini") return { provider: "gemini", model: env.WRITER_MODEL?.trim() || "gemini-2.5-pro", ready: !!env.GEMINI_API_KEY };
  return { provider: "mock", model: "mock", ready: true };
}

export interface GenerateRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** đầu ra cố định khi chạy mock */
  mock: () => string;
}

export async function generate(env: WriterVars, req: GenerateRequest): Promise<string> {
  const info = providerInfo(env);
  if (info.provider === "mock") return req.mock();
  if (!info.ready) throw new HttpError(503, `Chưa cấu hình khoá cho ${info.provider === "claude" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY"}`);
  return info.provider === "claude" ? callClaude(env.ANTHROPIC_API_KEY!, info.model, req) : callGemini(env.GEMINI_API_KEY!, info.model, req);
}

// ---------- Anthropic Claude (Messages API, stream SSE để không bị cắt khi sinh dài) ----------

async function callClaude(key: string, model: string, req: GenerateRequest): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens,
      stream: true,
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    }),
  });
  if (!res.ok || !res.body) throw new HttpError(502, `Claude lỗi ${res.status}: ${(await safeText(res)).slice(0, 300)}`);

  let text = "";
  let stop = "";
  let streamError = "";
  await readSse(res.body, (data) => {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (ev.type === "content_block_delta") {
      const d = ev.delta as { type?: string; text?: string } | undefined;
      if (d?.type === "text_delta" && typeof d.text === "string") text += d.text;
    } else if (ev.type === "message_delta") {
      const d = ev.delta as { stop_reason?: string } | undefined;
      if (d?.stop_reason) stop = d.stop_reason;
    } else if (ev.type === "error") {
      streamError = JSON.stringify(ev.error ?? ev).slice(0, 300);
    }
  });
  if (streamError) throw new HttpError(502, `Claude lỗi: ${streamError}`);
  if (stop === "refusal") throw new HttpError(422, "Mô hình từ chối nội dung này — hãy chỉnh ý tưởng nhẹ nhàng hơn rồi thử lại");
  if (!text.trim()) throw new HttpError(502, "Claude không trả về nội dung");
  return text;
}

async function readSse(body: ReadableStream<Uint8Array>, onData: (data: string) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) onData(data);
    }
    if (done) break;
  }
}

// ---------- Google Gemini ----------

async function callGemini(key: string, model: string, req: GenerateRequest): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { maxOutputTokens: req.maxTokens, temperature: 0.9 },
    }),
  });
  if (!res.ok) throw new HttpError(502, `Gemini lỗi ${res.status}: ${(await safeText(res)).slice(0, 300)}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new HttpError(422, "Gemini chặn nội dung này — hãy chỉnh ý tưởng rồi thử lại");
  const cand = data.candidates?.[0];
  if (cand?.finishReason === "SAFETY") throw new HttpError(422, "Gemini chặn nội dung này — hãy chỉnh ý tưởng rồi thử lại");
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) throw new HttpError(502, "Gemini không trả về nội dung");
  return text;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// ---------- MOCK: đầu ra mẫu cố định, hợp định dạng ----------

function names(p: WriterProject) {
  const c = p.characters;
  return { a: c[0]?.name || "Hạnh", b: c[1]?.name || "Bà Tư", c: c[2]?.name || "Tuấn" };
}

export function mockOutline(p: WriterProject): string {
  const { a, b, c } = names(p);
  const episodes = Array.from({ length: p.episodeCount }, (_, i) => {
    const no = i + 1;
    const last = no === p.episodeCount;
    return {
      no,
      title: no === 1 ? "Chiếc phong bì dưới gối" : last ? "Ngày sum họp" : `Bí mật thứ ${no}`,
      summary: `(Mẫu thử) ${a} phát hiện thêm một manh mối về chuyện ${p.genre}. ${b} tỏ ra khó chịu, còn ${c} lảng tránh câu hỏi. Mâu thuẫn trong nhà lên cao.`,
      cliffhanger: last ? "Mọi hiểu lầm được hoá giải, cả nhà ngồi lại bên mâm cơm." : `${a} nghe thấy tiếng ai đó gọi điện lúc nửa đêm, nhắc tới tên mình.`,
    };
  });
  return JSON.stringify({
    title: p.title || `Nàng dâu và chiếc phong bì (mẫu thử)`,
    logline: `${a} về làm dâu, ngày ngày nhẫn nhịn, cho tới khi một chiếc phong bì lạ làm lộ ra bí mật của cả nhà.`,
    seoTitle: `Truyện audio ${p.genre}: chiếc phong bì lạ và bí mật nhà chồng`,
    seoDescription: `Truyện audio đêm khuya thể loại ${p.genre}. Một nàng dâu, một bà mẹ chồng và bí mật giấu kín nhiều năm. ${FICTION_NOTE}`,
    episodes,
  });
}

export function mockEpisode(p: WriterProject, epNo: number, total: number): string {
  const { a, b, c } = names(p);
  const narr = p.pov === "ngoi1" ? a : NARRATOR;
  const last = epNo >= total;
  return `===TIEU_DE===
${epNo === 1 ? "Chiếc phong bì dưới gối" : `Tập ${epNo}: bí mật thứ ${epNo}`}
===KICH_BAN===
[${NARRATOR}] ${FICTION_NOTE}
(nghỉ 1s)
{nhạc: bí ẩn}
{hiệu ứng: mưa}
[${narr}] ${p.pov === "ngoi1" ? "Đêm ấy mưa to lắm. Tôi" : `Đêm ấy mưa to lắm. ${a}`} trở mình mãi không ngủ được.
[${narr}] ${p.pov === "ngoi1" ? "Tay tôi" : "Tay cô"} chạm phải một thứ gì đó cộm lên dưới gối.
(nghỉ 1.5s)
[${a}|thì thầm] Cái gì đây nhỉ… một chiếc phong bì?
{hiệu ứng: cửa mở}
[${b}|lạnh lùng] Con còn thức à? Đèn đóm sáng trưng thế kia.
[${a}|sợ] Dạ… con xin lỗi mẹ. Con dậy uống nước thôi ạ.
[${b}] Ừ. Ngủ đi. Mai còn dậy sớm nấu cơm.
{hiệu ứng: bước chân}
(nghỉ 1s)
{nhạc: căng thẳng}
[${narr}] Chờ tiếng bước chân xa dần, ${p.pov === "ngoi1" ? "tôi" : a} mới dám mở phong bì ra.
[${narr}] Bên trong là một tờ giấy đã ngả vàng, nét chữ run run.
[${a}|run] Anh ${c} ơi… anh dậy đi. Anh xem cái này là gì?
[${c}|mệt mỏi] Gì thế em… Nửa đêm rồi mà.
[${a}] Tờ giấy này có tên em. Ký từ mười năm trước.
[${c}|sợ] Em… em lấy cái này ở đâu ra?
(nghỉ 2s)
{nhạc: cao trào}
[${narr}] Gương mặt ${c} tái đi. ${p.pov === "ngoi1" ? "Tôi" : a} biết, có chuyện gì đó cả nhà đã giấu ${p.pov === "ngoi1" ? "tôi" : "cô"} rất lâu rồi.
${last ? `[${narr}] Và đêm nay, mọi chuyện cuối cùng cũng được nói ra.\n{nhạc: ấm áp}\n[${b}|nghẹn ngào] Mẹ xin lỗi con. Mẹ sai rồi.\n[${NARRATOR}] Câu chuyện khép lại ở đây. Cảm ơn bạn đã lắng nghe.` : `[${NARRATOR}] Tờ giấy ấy viết gì, và vì sao ${c} lại sợ đến thế? Mời bạn nghe tiếp ở tập sau.`}
{nhạc: tắt}
===MOC_CAU===
${last ? "Mẹ chồng nhận lỗi, cả nhà hoà giải." : `Tờ giấy mười năm trước có tên ${a}, và ${c} biết điều gì đó.`}
===MOI_TIKTOK===
{nhạc: căng thẳng}
[${a}|run] Tờ giấy này có tên em. Ký từ mười năm trước.
[${c}|sợ] Em… em lấy cái này ở đâu ra?
(nghỉ 1s)
[${NARRATOR}] Một chiếc phong bì dưới gối, và bí mật cả nhà chồng giấu suốt mười năm.
[${NARRATOR}] Nghe trọn tập trên Kể Đêm Audio.
===SEO_TIEU_DE===
Tập ${epNo}: Chiếc phong bì dưới gối và bí mật mười năm của nhà chồng
===SEO_MO_TA===
Truyện audio ${p.genre} tập ${epNo}. Nửa đêm, ${a} tìm thấy một chiếc phong bì lạ dưới gối. ${FICTION_NOTE}
===HASHTAG===
#truyenaudio #truyendemkhuya #mechongnangdau #kedemaudio #truyengiadinh`;
}
