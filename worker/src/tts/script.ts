// Phân tích kịch bản viết tay → dòng thời gian (ScriptItem[]). Định dạng chốt: worker/src/tts/FORMAT.md.
// Chính: `Vai (cảm xúc): lời`, `[nghỉ 1.2]`, `[sfx tên …]`, `[nhạc tên …]`, `## Chương`, `@vai`, `@nhạc`, `@đọc`.
// Vẫn đọc dạng cũ: `[Vai|cảm xúc|tốc độ] lời`, `(nghỉ 1.5s)`, `{nhạc: buồn}`, `{hiệu ứng: mưa}`.

import { estimateSeconds, normalizeVi } from "./normalize";
import type { CastHint, Emotion, ParseResult, ProviderId, ScriptItem } from "./types";
import { PROVIDER_IDS } from "./types";

export const NARRATOR = "Người dẫn"; // trùng Trợ lý viết (worker/src/writer)
const NARRATOR_ALIASES = ["dẫn", "người dẫn", "dẫn chuyện", "người kể", "kể"];
export const MAX_SCRIPT_CHARS = 200_000;
export const MAX_SEGMENTS = 2000;
/** Lời dài hơn bị chia theo câu (mỗi phần = một request TTS, an toàn ≤ ~1–2 phút audio). */
export const MAX_SEGMENT_CHARS = 600;

/** Nghỉ mặc định (giây) — docs/xuong-audio-thiet-ke.md mục 2.4. */
export const PAUSE = { comma: 0.25, period: 0.5, question: 0.55, ellipsis: 0.7, none: 0.4, paragraph: 0.8, speakerChange: 0.35, scene: 1.2, chapter: 2 };

/** Từ khoá cảm xúc (chữ thường) → mã chuẩn. */
export const EMOTION_ALIASES: Record<string, Emotion> = {
  "bình thường": "",
  thường: "",
  "kể chuyện": "",
  giận: "gian",
  "giận dữ": "gian",
  tức: "gian",
  "tức giận": "gian",
  gằn: "gian",
  quát: "het",
  hét: "het",
  gào: "het",
  "quát lên": "het",
  buồn: "buon",
  "buồn bã": "buon",
  khóc: "khoc",
  "khóc nấc": "khoc",
  "nghẹn ngào": "khoc",
  nức: "khoc",
  vui: "vui",
  "vui vẻ": "vui",
  cười: "vui",
  "phấn khích": "vui",
  sợ: "so-hai",
  "sợ hãi": "so-hai",
  "run rẩy": "so-hai",
  run: "so-hai",
  "thì thầm": "thi-tham",
  "thầm thì": "thi-tham",
  "nói nhỏ": "thi-tham",
  "mỉa mai": "che-gieu",
  "châm chọc": "che-gieu",
  "chế giễu": "che-gieu",
  "lạnh lùng": "lanh-lung",
  "dịu dàng": "am-ap",
  "nhẹ nhàng": "am-ap",
  "ấm áp": "am-ap",
  "hồi hộp": "hoi-hop",
  "căng thẳng": "cang-thang",
  "lo lắng": "cang-thang",
  "ngạc nhiên": "ngac-nhien",
  "bất ngờ": "ngac-nhien",
  "sửng sốt": "ngac-nhien",
  "mệt mỏi": "met-moi",
  "uể oải": "met-moi",
};
const EMOTION_CODES = new Set<string>(Object.values(EMOTION_ALIASES));

const RE_CMD = /^\[\s*(nghỉ|nghi|pause|sfx|hiệu ứng|nhạc|nhac|music)(?=[\s:\]])([^\]]*)\]$/i;
const RE_INLINE_PAUSE = /\[\s*nghỉ(?:\s+(\d+(?:[.,]\d+)?)\s*(?:s|giây)?)?\s*\]|\(\s*nghỉ(?:\s+(\d+(?:[.,]\d+)?)\s*(?:s|giây|g)?)?\s*\)/gi;
const RE_LEGACY_CUE = /^\{\s*(nhạc|nhac|hiệu ứng|hieu ung|âm thanh|sfx|music)\s*:\s*([^}]*)\}$/i;
const RE_LEGACY_ROLE = /^\[([^\]]{1,80})\]\s*(.*)$/;
// Tên (≤ 40 ký tự, không chứa : ( ) [ ] { }) + (chỉ dẫn)? + {đọc: …}? + ":" + lời
const RE_SPEAKER = /^([^\s:()[\]{}<>][^:()[\]{}<>]{0,39}?)\s*(?:\(([^)]{0,120})\))?\s*(?:\{\s*đọc\s*:\s*([^}]*)\})?\s*:\s*(.*)$/i;
const RE_READ = /\{\s*đọc\s*:\s*([^}]*)\}/i;

const num = (s: string) => Number(s.replace(",", "."));
const clampSpeed = (n: number) => Math.min(2, Math.max(0.5, n));
const isNarrator = (name: string) => NARRATOR_ALIASES.includes(name.trim().toLowerCase());
const canonRole = (name: string) => (isNarrator(name) ? NARRATOR : name.trim().replace(/\s+/g, " "));

/** Tách lời dài theo câu (ưu tiên . ! ? …, rồi , ; :, cùng lắm theo từ) — như tach_doan của make-YT. */
export function splitLong(text: string, max = MAX_SEGMENT_CHARS): string[] {
  const s = text.trim();
  if (s.length <= max) return s ? [s] : [];
  const sentences = s.split(/(?<=[.!?…]["')\]]?)\s+/).filter(Boolean);
  const pieces: string[] = [];
  for (const sen of sentences) {
    if (sen.length <= max) {
      pieces.push(sen);
      continue;
    }
    let cur = "";
    for (const part of sen.split(/(?<=[,;:])\s+/)) {
      if (part.length > max) {
        if (cur) pieces.push(cur), (cur = "");
        let w = "";
        for (const word of part.split(/\s+/)) {
          if (w && w.length + 1 + word.length > max) pieces.push(w), (w = word);
          else w = w ? `${w} ${word}` : word;
        }
        if (w) pieces.push(w);
      } else if (cur && cur.length + 1 + part.length > max) {
        pieces.push(cur);
        cur = part;
      } else cur = cur ? `${cur} ${part}` : part;
    }
    if (cur) pieces.push(cur);
  }
  const out: string[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + 1 + p.length <= max) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

function pauseFor(text: string): number {
  const t = text.trim().replace(/<[^>]*>\s*$/, "").replace(/["')\]]+$/, "").trim();
  if (/(…|\.\.|—|–)$/.test(t)) return PAUSE.ellipsis;
  if (/[?!]$/.test(t)) return PAUSE.question;
  if (/\.$/.test(t)) return PAUSE.period;
  if (/[,;:-]$/.test(t)) return PAUSE.comma;
  return PAUSE.none;
}

/** Tham số dạng `vol=0.3 fade=3 loop until=chương dài=4s 20%` + phần tên. */
function parseArgs(raw: string) {
  let rest = ` ${raw.trim()} `;
  const kv: Record<string, string> = {};
  rest = rest.replace(/\s([\p{L}_]+)\s*=\s*([^\s]+)/gu, (_m, k: string, v: string) => {
    kv[k.toLowerCase()] = v;
    return " ";
  });
  let volume: number | null = null;
  let seconds: number | null = null;
  let loop = false;
  rest = rest.replace(/(-?\d+(?:[.,]\d+)?)\s*%/g, (_m, v: string) => ((volume = num(v) / 100), " "));
  rest = rest.replace(/(\d+(?:[.,]\d+)?)\s*(?:s|giây)(?![\p{L}])/giu, (_m, v: string) => ((seconds = num(v)), " "));
  rest = rest.replace(/\s(loop|lặp)(?=\s)/gi, () => ((loop = true), " "));
  const v = kv.vol ?? kv.volume ?? kv["âm_lượng"];
  if (v !== undefined && Number.isFinite(num(v))) volume = num(v) > 1 ? num(v) / 100 : num(v);
  const d = kv["dài"] ?? kv.dai ?? kv.len ?? kv.duration;
  if (d !== undefined && Number.isFinite(num(d.replace(/s$/, "")))) seconds = num(d.replace(/s$/, ""));
  const fade = kv.fade !== undefined && Number.isFinite(num(kv.fade)) ? Math.min(30, Math.max(0, num(kv.fade))) : null;
  const until = (kv.until ?? kv["đến"] ?? "").toLowerCase();
  return {
    name: rest.replace(/[,|]/g, " ").replace(/\s+/g, " ").trim(),
    volume: volume === null ? null : Math.min(1, Math.max(0, volume)),
    seconds: seconds === null ? null : Math.min(600, Math.max(0.1, seconds)),
    loop: loop || until !== "",
    untilChapter: until.startsWith("chương") || until.startsWith("chuong") || until === "chapter",
    fade,
  };
}

/** "(thì thầm, run rẩy, 0.9)" → cảm xúc chuẩn đầu tiên khớp + chỉ dẫn nguyên văn + tốc độ. */
export function parseDirection(raw: string): { emotion: string; direction: string; speed: number | null; known: boolean } {
  let emotion = "";
  let known = true;
  let speed: number | null = null;
  const words: string[] = [];
  for (const p of raw.split(/[,;/|]/).map((x) => x.trim()).filter(Boolean)) {
    const sp = /^(?:tốc độ\s*)?(\d+(?:[.,]\d+)?)x?$/i.exec(p);
    if (sp) {
      speed = clampSpeed(num(sp[1]!));
      continue;
    }
    words.push(p);
    const k = p.toLowerCase();
    if (!emotion) {
      if (k in EMOTION_ALIASES) emotion = EMOTION_ALIASES[k]!;
      else if (EMOTION_CODES.has(k)) emotion = k;
    }
  }
  if (!emotion && words.length) {
    // thử khớp từ khoá nằm trong cụm ("hơi giận" → giận)
    const hit = Object.keys(EMOTION_ALIASES).sort((a, b) => b.length - a.length).find((k) => k && words.join(" ").toLowerCase().includes(k));
    if (hit) emotion = EMOTION_ALIASES[hit]!;
    else known = false;
  }
  return { emotion, direction: words.join(", "), speed, known };
}

export function parseScript(script: string): ParseResult {
  const items: ScriptItem[] = [];
  const roles: string[] = [];
  const cast: Record<string, CastHint> = {};
  const lexicon: Record<string, string> = {};
  const chapters: string[] = [];
  const warnings: ParseResult["warnings"] = [];
  let title = "";
  let n = 0;
  let chapter = 0;
  let paragraphBreak = false;
  let chars = 0;

  const text = (script ?? "").replace(/\r\n?/g, "\n");
  if (text.length > MAX_SCRIPT_CHARS) warnings.push({ line: 1, message: `Kịch bản dài quá ${MAX_SCRIPT_CHARS} ký tự — phần sau bị bỏ` });
  const lines = text.slice(0, MAX_SCRIPT_CHARS).split("\n");

  // Lượt 1: @vai, @đọc (đặt ở đâu cũng áp cho cả kịch bản) + đếm tên dạng "Tên:" để nhận vai.
  const declared = new Set<string>([NARRATOR]);
  const speakerUses = new Map<string, number>();
  lines.forEach((raw, idx) => {
    const l = raw.trim();
    const mv = /^@vai\s+([^=]{1,40}?)\s*=\s*(.*)$/i.exec(l);
    if (mv) {
      const role = canonRole(mv[1]!);
      const [voicePart = "", ...rest] = mv[2]!.split("|");
      let persona = rest.join("|").trim();
      let speed: number | null = null;
      persona = persona.replace(/(?:^|\s)(?:speed|tốc_độ|tốc độ)\s*=\s*(\d+(?:[.,]\d+)?)/i, (_m, v: string) => ((speed = clampSpeed(num(v))), "")).trim();
      let vp = voicePart.trim();
      vp = vp.replace(/\s(?:speed|tốc_độ)\s*=\s*(\d+(?:[.,]\d+)?)/i, (_m, v: string) => ((speed = clampSpeed(num(v))), "")).trim();
      let provider: ProviderId | null = null;
      const pm = /^([a-z]+):(.*)$/i.exec(vp);
      if (pm && (PROVIDER_IDS as readonly string[]).includes(pm[1]!.toLowerCase())) {
        provider = pm[1]!.toLowerCase() as ProviderId;
        vp = pm[2]!.trim();
      }
      cast[role] = { provider, voice: vp, persona, speed };
      declared.add(role);
      return;
    }
    const md = /^@đọc\s+(.+?)\s*=\s*(.+)$/i.exec(l);
    if (md) {
      lexicon[md[1]!.trim()] = md[2]!.trim();
      return;
    }
    if (l.startsWith("@") && !/^@nhạc\b/i.test(l)) warnings.push({ line: idx + 1, message: "Lệnh @ không hiểu — dùng @vai, @nhạc hoặc @đọc" });
    const ms = RE_SPEAKER.exec(l);
    if (ms && !l.startsWith("[") && !l.startsWith("#") && ms[1]!.trim().split(/\s+/).length <= 4) {
      const name = canonRole(ms[1]!);
      speakerUses.set(name, (speakerUses.get(name) ?? 0) + 1);
      if (ms[2] !== undefined || ms[3] !== undefined) declared.add(name);
    }
  });
  for (const [name, count] of speakerUses) if (count >= 2) declared.add(name);

  const lastSpeech = (): Extract<ScriptItem, { type: "speech" }> | undefined => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      if (it.type === "speech") return it;
      if (it.type === "pause" || it.type === "chapter") return undefined; // đã có nghỉ tường minh
    }
    return undefined;
  };

  const pushPause = (line: number, seconds: number) => {
    const prev = lastSpeech();
    if (prev) prev.pauseAfter = 0; // nghỉ tường minh thay nghỉ tự động
    items.push({ type: "pause", line, seconds });
  };

  const pushSpeech = (line: number, role: string, emotion: string, direction: string, speed: number | null, shown: string, readOverride: string | null) => {
    const pieces = readOverride !== null ? [shown] : splitLong(shown);
    pieces.forEach((piece, i) => {
      const read = readOverride !== null ? readOverride : piece;
      const ttsText = normalizeVi(read, lexicon);
      if (!ttsText) return;
      const prev = lastSpeech();
      if (prev) {
        if (prev.role !== role) prev.pauseAfter = Math.max(prev.pauseAfter, PAUSE.speakerChange);
        if (paragraphBreak && i === 0) prev.pauseAfter = Math.max(prev.pauseAfter, PAUSE.paragraph);
      }
      paragraphBreak = false;
      if (!roles.includes(role)) roles.push(role);
      chars += ttsText.length;
      items.push({ type: "speech", n: n++, line, chapter, role, emotion, direction, speed, text: piece, ttsText, pauseAfter: pauseFor(piece) });
    });
  };

  /** Lời có thể chứa [nghỉ x] / (nghỉ x) giữa câu → tách. */
  const pushBody = (line: number, role: string, emotion: string, direction: string, speed: number | null, body: string, readOverride: string | null) => {
    if (readOverride !== null) {
      const shown = body.replace(RE_INLINE_PAUSE, " ").replace(/\s+/g, " ").trim();
      if (shown || readOverride) pushSpeech(line, role, emotion, direction, speed, shown || readOverride, readOverride);
      return;
    }
    let cursor = 0;
    let any = false;
    RE_INLINE_PAUSE.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = RE_INLINE_PAUSE.exec(body))) {
      const before = body.slice(cursor, pm.index).trim();
      if (before) pushSpeech(line, role, emotion, direction, speed, before, null), (any = true);
      const v = pm[1] ?? pm[2];
      pushPause(line, v ? Math.min(60, Math.max(0.05, num(v))) : 1);
      cursor = pm.index + pm[0].length;
    }
    const rest = body.slice(cursor).trim();
    if (rest) pushSpeech(line, role, emotion, direction, speed, rest, null), (any = true);
    if (!any && !/nghỉ/i.test(body)) warnings.push({ line, message: `Vai "${role}" chưa có lời` });
  };

  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const l = rawLine.trim();
    if (!l) {
      paragraphBreak = true;
      return;
    }
    if (l.startsWith("//") || /^@(vai|đọc)\b/i.test(l)) return;
    if (l.startsWith("##")) {
      const t = l.replace(/^#+\s*/, "").trim() || `Chương ${chapters.length + 1}`;
      chapters.push(t);
      chapter = chapters.length;
      const prev = lastSpeech();
      if (prev) prev.pauseAfter = 0;
      if (items.length) items.push({ type: "pause", line, seconds: PAUSE.chapter });
      items.push({ type: "chapter", line, index: chapter, title: t });
      return;
    }
    if (l.startsWith("#")) {
      if (!title) title = l.replace(/^#+\s*/, "").trim();
      return;
    }
    if (/^-{3,}$|^\*{3,}$/.test(l)) {
      pushPause(line, PAUSE.scene);
      return;
    }

    // @nhạc tên vol= fade=   (nhạc nền từ chỗ này)
    const mn = /^@nhạc\s+(.*)$/i.exec(l);
    // [nghỉ 1.2] / [sfx …] / [nhạc …]
    const mc = RE_CMD.exec(l);
    // {nhạc: …} / {hiệu ứng: …} (dạng cũ)
    const ml = RE_LEGACY_CUE.exec(l);
    if (mn || mc || ml) {
      const kindRaw = (mn ? "nhạc" : mc ? mc[1]! : ml![1]!).toLowerCase();
      const argStr = (mn ? mn[1]! : mc ? mc[2]! : ml![2]!).replace(/^\s*:\s*/, "");
      if (/^(nghỉ|nghi|pause)$/.test(kindRaw)) {
        const v = /(\d+(?:[.,]\d+)?)/.exec(argStr)?.[1];
        pushPause(line, v ? Math.min(60, Math.max(0.05, num(v))) : 1);
        return;
      }
      const a = parseArgs(argStr);
      if (/^(nhạc|nhac|music)$/.test(kindRaw)) {
        const name = a.name.toLowerCase();
        if (!name || /^(tắt|tat|dừng|dung|hết|het|off|stop|không)$/.test(name)) {
          items.push({ type: "music", line, action: "stop", asset: null, volume: null, fade: a.fade, db: null });
        } else if (/^(giảm|tăng|giam|tang)\b/.test(name)) {
          // [nhạc giảm -6 trong 4] / [nhạc tăng 3]
          const db = num(/(-?\d+(?:[.,]\d+)?)/.exec(name)?.[1] ?? "0");
          const over = /trong\s+(\d+(?:[.,]\d+)?)/.exec(name)?.[1];
          const signed = name.startsWith("gi") ? -Math.abs(db) : Math.abs(db);
          items.push({ type: "music", line, action: "gain", asset: null, volume: null, fade: over ? num(over) : a.fade ?? 1, db: Math.max(-40, Math.min(12, signed)) });
        } else {
          items.push({ type: "music", line, action: "start", asset: name, volume: a.volume, fade: a.fade, db: null });
        }
      } else if (!a.name) warnings.push({ line, message: "Hiệu ứng thiếu tên, vd. [sfx mưa-rơi vol=0.3]" });
      else items.push({ type: "sfx", line, asset: a.name.toLowerCase(), volume: a.volume, seconds: a.seconds, loop: a.loop, untilChapter: a.untilChapter });
      return;
    }
    if (/^\{.*\}$/.test(l) || /^\[(nghỉ|sfx|nhạc)/i.test(l)) {
      warnings.push({ line, message: "Không hiểu lệnh — xem FORMAT.md ([nghỉ 1.2], [sfx tên], [nhạc tên])" });
      return;
    }

    // [Vai|cảm xúc|tốc độ] lời (dạng cũ)
    const lr = RE_LEGACY_ROLE.exec(l);
    if (lr) {
      const parts = lr[1]!.split("|").map((p) => p.trim());
      const d = parseDirection(parts.slice(1).join(", "));
      if (!d.known) warnings.push({ line, message: `Chỉ dẫn "${d.direction}" không khớp cảm xúc chuẩn — vẫn gửi nguyên văn cho Gemini` });
      const read = RE_READ.exec(lr[2] ?? "");
      pushBody(line, canonRole(parts[0] || NARRATOR), d.emotion, d.direction, d.speed, (lr[2] ?? "").replace(RE_READ, "").trim(), read ? read[1]!.trim() : null);
      return;
    }

    // Vai (cảm xúc) {đọc: …}: lời
    const ms = RE_SPEAKER.exec(l);
    if (ms && ms[1]!.trim().split(/\s+/).length <= 4 && declared.has(canonRole(ms[1]!))) {
      const role = canonRole(ms[1]!);
      const d = parseDirection(ms[2] ?? "");
      if (!d.known) warnings.push({ line, message: `Chỉ dẫn "${d.direction}" không khớp cảm xúc chuẩn — vẫn gửi nguyên văn cho Gemini` });
      pushBody(line, role, d.emotion, d.direction, d.speed, ms[4] ?? "", ms[3] !== undefined ? ms[3].trim() : null);
      return;
    }
    if (ms && ms[1]!.trim().split(/\s+/).length <= 4 && !declared.has(canonRole(ms[1]!)) && /^\p{Lu}/u.test(ms[1]!.trim())) {
      warnings.push({ line, message: `"${ms[1]!.trim()}:" được coi là lời dẫn. Nếu là vai, khai báo "@vai ${ms[1]!.trim()} = …" hoặc thêm (cảm xúc)` });
    }

    // Còn lại: lời người dẫn
    const read = RE_READ.exec(l);
    pushBody(line, NARRATOR, "", "", null, l.replace(RE_READ, "").trim(), read ? read[1]!.trim() : null);
  });

  const speech = items.filter((i): i is Extract<ScriptItem, { type: "speech" }> => i.type === "speech");
  if (speech.length > MAX_SEGMENTS) warnings.push({ line: 1, message: `Quá ${MAX_SEGMENTS} lời — hãy chia kịch bản thành nhiều phần` });
  const last = speech[speech.length - 1];
  if (last) last.pauseAfter = 0;
  for (const role of Object.keys(cast)) if (!roles.includes(role)) warnings.push({ line: 1, message: `Vai "${role}" khai báo nhưng chưa có lời` });

  let est = 0;
  for (const it of items) {
    if (it.type === "speech") est += estimateSeconds(it.ttsText, it.speed ?? cast[it.role]?.speed ?? 1) + it.pauseAfter;
    else if (it.type === "pause") est += it.seconds;
  }
  return { title, items, roles, cast, lexicon, chapters, speechCount: speech.length, chars, estSeconds: Math.round(est * 10) / 10, warnings };
}
