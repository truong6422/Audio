// Lớp nhà cung cấp TTS trừu tượng. Mọi adapter gọi bằng fetch HTTP và trả WAV PCM 16-bit.
// MOCK sinh WAV tổng hợp tại chỗ — KHÔNG gọi mạng. TTS_MODE khác "live" → mọi phiên bị ép về MOCK.

import { HttpError } from "../lib";
import { estimateSeconds, stripTags } from "./normalize";
import type { ProviderId, StudioEnv, SynthesisRequest, SynthesisResult } from "./types";
import { base64ToBytes, wavDurationMs, wavFromFloat, wavFromPcm16 } from "./wav";

export interface TtsProvider {
  id: ProviderId;
  label: string;
  /** Lý do chưa dùng được (thiếu khoá, chưa bật live…), null = sẵn sàng. */
  unavailable(env: StudioEnv): string | null;
  /** Mã mô hình đưa vào hash bộ đệm (đổi mô hình → không dùng lại bản cũ). */
  model(env: StudioEnv): string;
  /** Ước chi phí USD cho một lời (chars = ký tự gửi đi, seconds = giây audio). */
  cost(env: StudioEnv, chars: number, seconds: number): number;
  synthesize(env: StudioEnv, req: SynthesisRequest): Promise<SynthesisResult>;
  voices: { id: string; label: string; gender?: "nam" | "nữ" }[];
  /** elderFemale / elderMale: giọng cho vai lớn tuổi (mẹ chồng, bố chồng, bà, ông…); thiếu thì dùng female / male. */
  defaultVoice: { narrator: string; female: string; male: string; elderFemale?: string; elderMale?: string };
}

export const isLive = (env: StudioEnv) => (env.TTS_MODE ?? "").trim().toLowerCase() === "live";

/** Nhà cung cấp thực sự dùng: chưa bật live thì luôn MOCK. */
export function effectiveProvider(env: StudioEnv, wanted: ProviderId): ProviderId {
  return isLive(env) ? wanted : "mock";
}

/**
 * Cảm xúc → cách diễn của từng nhà cung cấp (docs/xuong-audio-thiet-ke.md mục 2.3).
 * prompt: style Gemini; rate/pitch (%) + volume (dB): Azure prosody & MOCK; stability/style/tag: ElevenLabs.
 */
export const EMOTIONS: Record<string, { label: string; prompt: string; rate: number; pitch: number; volume: number; stability: number; style: number; tag: string }> = {
  "": { label: "Bình thường", prompt: "", rate: 0, pitch: 0, volume: 0, stability: 0.5, style: 0.2, tag: "" },
  gian: { label: "Giận", prompt: "giận dữ, gằn giọng, nói nhanh", rate: 8, pitch: 3, volume: 2, stability: 0.3, style: 0.7, tag: "[angry]" },
  het: { label: "Quát", prompt: "quát lên giận dữ, rất to", rate: 10, pitch: 6, volume: 4, stability: 0.25, style: 0.85, tag: "[shouting]" },
  buon: { label: "Buồn", prompt: "buồn, chậm, trầm xuống cuối câu", rate: -10, pitch: -3, volume: -1, stability: 0.45, style: 0.5, tag: "[sad]" },
  khoc: { label: "Khóc", prompt: "nghẹn ngào, nói trong tiếng nấc", rate: -15, pitch: 2, volume: -1, stability: 0.3, style: 0.75, tag: "[crying]" },
  vui: { label: "Vui", prompt: "vui vẻ, tươi tắn", rate: 6, pitch: 4, volume: 0, stability: 0.45, style: 0.5, tag: "[excited]" },
  "so-hai": { label: "Sợ hãi", prompt: "sợ hãi, run rẩy, hụt hơi", rate: 5, pitch: 3, volume: -2, stability: 0.3, style: 0.6, tag: "[nervous]" },
  "thi-tham": { label: "Thì thầm", prompt: "thì thầm, hơi thở gần micro", rate: -10, pitch: -2, volume: -6, stability: 0.5, style: 0.4, tag: "[whispers]" },
  "che-gieu": { label: "Mỉa mai", prompt: "mỉa mai, kéo dài chữ", rate: -2, pitch: 2, volume: 0, stability: 0.4, style: 0.6, tag: "[sarcastic]" },
  "lanh-lung": { label: "Lạnh lùng", prompt: "lạnh lùng, đều đều, không cảm xúc", rate: -6, pitch: -4, volume: 0, stability: 0.7, style: 0.3, tag: "" },
  "am-ap": { label: "Ấm áp", prompt: "dịu dàng, ấm áp", rate: -6, pitch: 0, volume: -1, stability: 0.55, style: 0.4, tag: "" },
  "hoi-hop": { label: "Hồi hộp", prompt: "hồi hộp, nín thở", rate: -4, pitch: 1, volume: -2, stability: 0.4, style: 0.55, tag: "[curious]" },
  "cang-thang": { label: "Căng thẳng", prompt: "căng thẳng, lo lắng", rate: 4, pitch: 2, volume: 0, stability: 0.35, style: 0.55, tag: "[nervous]" },
  "ngac-nhien": { label: "Ngạc nhiên", prompt: "ngạc nhiên, sửng sốt", rate: 4, pitch: 6, volume: 1, stability: 0.4, style: 0.55, tag: "[surprised]" },
  "met-moi": { label: "Mệt mỏi", prompt: "mệt mỏi, uể oải", rate: -12, pitch: -3, volume: -1, stability: 0.55, style: 0.4, tag: "[sighs]" },
};
const emotionOf = (e: string) => EMOTIONS[e] ?? { ...EMOTIONS[""]!, prompt: e, tag: "" };

const TIMEOUT_MS = 60_000;

async function failText(res: Response): Promise<string> {
  let t = "";
  try {
    t = (await res.text()).slice(0, 300);
  } catch {
    /* bỏ qua */
  }
  return t.replace(/\s+/g, " ").trim();
}

function upstreamError(name: string, status: number, detail: string): HttpError {
  if (status === 401 || status === 403) return new HttpError(502, `${name}: khoá API bị từ chối (${status}). Kiểm lại khoá / quyền.`);
  if (status === 429) return new HttpError(429, `${name}: vượt hạn mức gọi (429). Đợi một lúc rồi tạo lại.`);
  return new HttpError(502, `${name} lỗi ${status}${detail ? `: ${detail}` : ""}`);
}

/** fetch có thử lại 429 / 5xx (lùi 1 s, 3 s). */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  const waits = [1000, 3000];
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if ((res.status === 429 || res.status >= 500) && i < waits.length) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, waits[i]));
      continue;
    }
    return res;
  }
}

function notLive(env: StudioEnv): string | null {
  return isLive(env) ? null : "Đang ở chế độ thử (TTS_MODE chưa là live) — mọi lời tạo bằng MOCK";
}

const xmlEsc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

// ---------------------------------------------------------------- MOCK

function hashNum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** WAV 24 kHz tổng hợp: âm "ư" theo nhịp âm tiết, cao độ theo giọng, cảm xúc đổi âm lượng / tốc độ. Độ dài = ước lượng đọc thật. */
function mockWav(req: SynthesisRequest): SynthesisResult {
  const sr = 24000;
  const emo = emotionOf(req.emotion);
  const speed = Math.max(0.5, req.speed * (1 + emo.rate / 100));
  const text = stripTags(req.text);
  const seconds = Math.min(120, estimateSeconds(text, speed));
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  const h = hashNum(req.voice || "mock");
  const female = /^n[uữ]|kore|aoede|leda|hoaimy|despina|sulafat|zephyr|gacrux|callirrhoe/i.test(req.voice);
  const base = (female ? 240 : 140) + (h % 50) + emo.pitch * 3;
  const sylRate = 4.2 * speed;
  const amp = 0.3 * Math.pow(10, emo.volume / 20);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const syl = (t * sylRate) % 1;
    const env = syl < 0.8 ? Math.sin((Math.PI * syl) / 0.8) ** 2 : 0;
    const f = base * (1 + 0.08 * Math.sin(2 * Math.PI * 0.7 * t + (h % 7)));
    phase += (2 * Math.PI * f) / sr;
    const tone = Math.sin(phase) * 0.7 + Math.sin(2 * phase) * 0.2 + Math.sin(3 * phase) * 0.1;
    const fade = Math.max(0, Math.min(1, t / 0.01, (seconds - t) / 0.01));
    x[i] = tone * env * amp * fade;
  }
  return { wav: wavFromFloat(x, sr), durationMs: Math.round(seconds * 1000) };
}

const mock: TtsProvider = {
  id: "mock",
  label: "Giả lập (không gọi mạng, 0 đồng)",
  unavailable: () => null,
  model: () => "mock-1",
  cost: () => 0,
  synthesize: async (_env, req) => mockWav(req),
  voices: [
    { id: "nam-tram", label: "Nam trầm", gender: "nam" },
    { id: "nam-tre", label: "Nam trẻ", gender: "nam" },
    { id: "nam-gia", label: "Nam lớn tuổi", gender: "nam" },
    { id: "nu-am", label: "Nữ ấm", gender: "nữ" },
    { id: "nu-tre", label: "Nữ trẻ", gender: "nữ" },
    { id: "nu-gia", label: "Nữ lớn tuổi", gender: "nữ" },
  ],
  defaultVoice: { narrator: "nu-am", female: "nu-tre", male: "nam-tre", elderFemale: "nu-gia", elderMale: "nam-gia" },
};

// ---------------------------------------------------------------- Google Gemini TTS

// Theo docs/xuong-audio-thiet-ke.md: mặc định Gemini 3.8 Flash TTS, mỗi lời một request. Đổi mô hình qua GEMINI_TTS_MODEL.
// Dùng điểm cuối generateContent (responseModalities AUDIO); style = câu dẫn tự nhiên đứng trước lời.
const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash-tts";
/** USD / 1M token audio ra; 25 token / giây audio. Giá tăng gấp đôi từ 01/01/2027. */
const geminiRate = () => (Date.now() < Date.UTC(2027, 0, 1) ? 9 : 18);

const gemini: TtsProvider = {
  id: "gemini",
  label: "Google Gemini TTS",
  unavailable: (env) => notLive(env) ?? (env.GEMINI_API_KEY ? null : "Chưa cấu hình GEMINI_API_KEY"),
  model: (env) => env.GEMINI_TTS_MODEL || GEMINI_DEFAULT_MODEL,
  cost: (_env, _chars, seconds) => (seconds * 25 * geminiRate()) / 1e6,
  async synthesize(env, req) {
    const emo = emotionOf(req.emotion);
    const pace = req.speed <= 0.88 ? "đọc chậm rãi" : req.speed >= 1.12 ? "đọc nhanh" : "";
    const style = [req.style, emo.prompt, pace].filter(Boolean).join("; ");
    const prompt = `Đọc bằng tiếng Việt${style ? ` với phong cách: ${style}` : ", truyền cảm như kể chuyện"}. Chỉ đọc phần lời sau:\n${req.text}`;
    const model = gemini.model(env);
    const res = await fetchRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice || "Kore" } } },
        },
      }),
    });
    if (!res.ok) throw upstreamError("Gemini", res.status, await failText(res));
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) throw new HttpError(502, "Gemini không trả âm thanh (có thể bị bộ lọc an toàn chặn lời này)");
    const bytes = base64ToBytes(part.data);
    if (/wav/i.test(part.mimeType ?? "")) return { wav: bytes, durationMs: wavDurationMs(bytes) };
    const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
    const wav = wavFromPcm16(bytes, rate, 1);
    return { wav, durationMs: wavDurationMs(wav) };
  },
  voices: [
    { id: "Charon", label: "Charon — nam, trầm, kể chuyện", gender: "nam" },
    { id: "Orus", label: "Orus — nam, chắc", gender: "nam" },
    { id: "Puck", label: "Puck — nam, tươi", gender: "nam" },
    { id: "Fenrir", label: "Fenrir — nam, khàn, kích động", gender: "nam" },
    { id: "Iapetus", label: "Iapetus — nam, rõ", gender: "nam" },
    { id: "Algenib", label: "Algenib — nam, khàn", gender: "nam" },
    { id: "Kore", label: "Kore — nữ, chắc", gender: "nữ" },
    { id: "Aoede", label: "Aoede — nữ, nhẹ", gender: "nữ" },
    { id: "Leda", label: "Leda — nữ, trẻ", gender: "nữ" },
    { id: "Callirrhoe", label: "Callirrhoe — nữ, dễ chịu", gender: "nữ" },
    { id: "Despina", label: "Despina — nữ, mượt", gender: "nữ" },
    { id: "Gacrux", label: "Gacrux — nữ, trưởng thành", gender: "nữ" },
    { id: "Sulafat", label: "Sulafat — nữ, ấm", gender: "nữ" },
    { id: "Zephyr", label: "Zephyr — nữ, sáng", gender: "nữ" },
  ],
  defaultVoice: { narrator: "Sulafat", female: "Kore", male: "Puck", elderFemale: "Gacrux", elderMale: "Charon" },
};

// ---------------------------------------------------------------- Azure Speech (SSML vi-VN)

function pct(n: number): string {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : ""}${r}%`;
}

export function azureSsml(req: SynthesisRequest): string {
  const emo = emotionOf(req.emotion);
  const voice = req.voice || "vi-VN-HoaiMyNeural";
  const lang = /^([a-z]{2}-[A-Z]{2})-/.exec(voice)?.[1] ?? "vi-VN";
  // vi-VN không có mstts:express-as → diễn cảm bằng prosody; thẻ <short pause>/<long pause> → <break>.
  const text = xmlEsc(req.text)
    .replace(/&lt;short pause&gt;/g, '<break time="300ms"/>')
    .replace(/&lt;long pause&gt;/g, '<break time="800ms"/>')
    .replace(/&lt;(sigh|laugh|gasp)&gt;/g, " ");
  const vol = emo.volume >= 0 ? `+${emo.volume}dB` : `${emo.volume}dB`;
  const inner = `<prosody rate="${pct((req.speed - 1) * 100 + emo.rate)}" pitch="${pct(emo.pitch)}" volume="${vol}">${text}</prosody>`;
  const body = lang === "vi-VN" ? inner : `<lang xml:lang="vi-VN">${inner}</lang>`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="${xmlEsc(voice)}">${body}</voice></speak>`;
}

const azure: TtsProvider = {
  id: "azure",
  label: "Azure Speech (vi-VN)",
  unavailable: (env) =>
    notLive(env) ?? (!env.AZURE_SPEECH_KEY ? "Chưa cấu hình AZURE_SPEECH_KEY" : !env.AZURE_SPEECH_REGION ? "Chưa cấu hình AZURE_SPEECH_REGION" : null),
  model: () => "azure-neural-riff24k",
  cost: (_env, chars) => (chars * 16) / 1e6, // ước ~$16 / 1M ký tự (Neural) — kiểm lại bảng giá
  async synthesize(env, req) {
    const region = env.AZURE_SPEECH_REGION!.replace(/[^a-z0-9]/gi, "");
    const res = await fetchRetry(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY!,
        "content-type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "user-agent": "audio-studio",
      },
      body: azureSsml(req),
    });
    if (!res.ok) throw upstreamError("Azure Speech", res.status, await failText(res));
    const wav = new Uint8Array(await res.arrayBuffer());
    if (!wav.byteLength) throw new HttpError(502, "Azure Speech trả về rỗng");
    return { wav, durationMs: wavDurationMs(wav) };
  },
  voices: [
    { id: "vi-VN-HoaiMyNeural", label: "Hoài My — nữ", gender: "nữ" },
    { id: "vi-VN-NamMinhNeural", label: "Nam Minh — nam", gender: "nam" },
    { id: "en-US-AvaMultilingualNeural", label: "Ava đa ngữ — nữ", gender: "nữ" },
    { id: "en-US-AndrewMultilingualNeural", label: "Andrew đa ngữ — nam", gender: "nam" },
  ],
  defaultVoice: { narrator: "vi-VN-HoaiMyNeural", female: "vi-VN-HoaiMyNeural", male: "vi-VN-NamMinhNeural" },
};

// ---------------------------------------------------------------- ElevenLabs

// Multilingual v2 KHÔNG có tiếng Việt → mặc định eleven_v3 (thẻ [whispers] [crying]… đặt đầu câu).
const ELEVEN_DEFAULT_MODEL = "eleven_v3";
const elevenlabs: TtsProvider = {
  id: "elevenlabs",
  label: "ElevenLabs",
  unavailable: (env) => notLive(env) ?? (env.ELEVENLABS_API_KEY ? null : "Chưa cấu hình ELEVENLABS_API_KEY"),
  model: (env) => env.ELEVENLABS_MODEL || ELEVEN_DEFAULT_MODEL,
  cost: (env, chars) => (chars * (/flash|turbo/.test(elevenlabs.model(env)) ? 0.04 : 0.08)) / 1000,
  async synthesize(env, req) {
    if (!req.voice || !/^[A-Za-z0-9]{8,40}$/.test(req.voice)) throw new HttpError(400, "ElevenLabs cần mã giọng (voice_id) — dán mã từ Voice Library vào bảng vai");
    const emo = emotionOf(req.emotion);
    const model = elevenlabs.model(env);
    const plain = stripTags(req.text);
    const text = /v3|v4/.test(model) && emo.tag ? `${emo.tag} ${plain}` : plain;
    const res = await fetchRetry(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voice)}?output_format=pcm_24000`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": env.ELEVENLABS_API_KEY!, accept: "audio/pcm" },
      body: JSON.stringify({
        text,
        model_id: model,
        language_code: "vi",
        voice_settings: {
          stability: emo.stability,
          similarity_boost: 0.75,
          style: emo.style,
          use_speaker_boost: true,
          speed: Math.min(1.2, Math.max(0.7, req.speed * (1 + emo.rate / 200))),
        },
      }),
    });
    if (!res.ok) throw upstreamError("ElevenLabs", res.status, await failText(res));
    const pcm = new Uint8Array(await res.arrayBuffer());
    if (!pcm.byteLength) throw new HttpError(502, "ElevenLabs trả về rỗng");
    const wav = wavFromPcm16(pcm, 24000, 1);
    return { wav, durationMs: wavDurationMs(wav) };
  },
  voices: [],
  defaultVoice: { narrator: "", female: "", male: "" },
};

export const PROVIDERS: Record<ProviderId, TtsProvider> = { mock, gemini, azure, elevenlabs };

export function getProvider(id: string): TtsProvider {
  const p = PROVIDERS[id as ProviderId];
  if (!p) throw new HttpError(400, `Nhà cung cấp "${id}" không tồn tại`);
  return p;
}
