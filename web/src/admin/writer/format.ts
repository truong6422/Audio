// Bản sao bộ kiểm ĐỊNH DẠNG XƯỞNG AUDIO của worker/src/writer/format.ts (kiểm tại chỗ khi soạn) — đổi thì sửa cả hai.
export const NARRATOR = "Người dẫn";

/** Cảm xúc Xưởng audio hiểu (khoá của EMOTION_ALIASES trong worker/src/tts/script.ts). */
export const EMOTIONS = [
  "giận", "giận dữ", "tức giận", "quát", "hét", "buồn", "buồn bã", "khóc", "nghẹn ngào", "vui", "vui vẻ", "cười",
  "sợ", "sợ hãi", "run", "thì thầm", "nói nhỏ", "mỉa mai", "châm chọc", "lạnh lùng", "dịu dàng", "nhẹ nhàng",
  "hồi hộp", "căng thẳng", "ngạc nhiên", "bất ngờ", "mệt mỏi", "bình thường", "kể chuyện",
];

export type ScriptLine =
  | { kind: "speech"; line: number; role: string; emotion: string | null; text: string }
  | { kind: "pause"; line: number; seconds: number }
  | { kind: "music"; line: number; value: string }
  | { kind: "sfx"; line: number; value: string }
  | { kind: "scene"; line: number };

export interface ScriptIssue {
  line: number;
  raw: string;
  message: string;
}

export interface ParsedScript {
  lines: ScriptLine[];
  /** lỗi chặn gửi Xưởng */
  issues: ScriptIssue[];
  /** lưu ý, không chặn (vd. cảm xúc ngoài danh sách) */
  warnings: ScriptIssue[];
  roles: string[];
  /** số tiếng (âm tiết) trong lời */
  words: number;
  /** ước lượng thời lượng (giây): ~150 tiếng/phút + khoảng nghỉ */
  estSeconds: number;
}

const ROLE = /^\[([^[\]]{1,80})\]\s*:?\s*(.*)$/;
const PAUSE_ANY = /\(\s*nghỉ(?:\s+(\d+(?:[.,]\d+)?)\s*(?:s|giây|g)?)?\s*\)/gi;
const CUE = /^\{\s*(nhạc|hiệu ứng)\s*:\s*([^{}]*)\}$/i;
const SPEED = /^\d+(?:[.,]\d+)?x?$/;

export function parseScript(src: string): ParsedScript {
  const lines: ScriptLine[] = [];
  const issues: ScriptIssue[] = [];
  const warnings: ScriptIssue[] = [];
  const roles = new Set<string>();
  let words = 0;
  let pauses = 0;
  src
    .normalize("NFC")
    .split(/\r?\n/)
    .forEach((rawLine, i) => {
      const n = i + 1;
      const raw = rawLine.trim();
      if (!raw || raw.startsWith("#") || raw.startsWith("//")) return;
      const bad = (message: string) => void issues.push({ line: n, raw, message });
      if (/^-{3,}$|^\*{3,}$/.test(raw)) return void lines.push({ kind: "scene", line: n });

      const cue = CUE.exec(raw);
      if (cue) {
        const value = cue[2].trim();
        const isMusic = cue[1].toLowerCase() === "nhạc";
        if (!value) return bad(isMusic ? "Thiếu tên nhạc, vd. {nhạc: buồn}" : "Thiếu tên hiệu ứng, vd. {hiệu ứng: mưa}");
        return void lines.push({ kind: isMusic ? "music" : "sfx", line: n, value });
      }
      if (raw.startsWith("{")) return bad("Lệnh {…} không hợp lệ — dùng {nhạc: …} hoặc {hiệu ứng: …}");

      let role = NARRATOR;
      let emotion: string | null = null;
      let body = raw;
      const m = ROLE.exec(raw);
      if (m) {
        const parts = m[1].split("|").map((p) => p.trim());
        role = parts[0];
        if (!role) return bad("Thiếu tên vai trong [ ]");
        if (role.length > 40) return bad("Tên vai quá dài (tối đa 40 ký tự)");
        for (const p of parts.slice(1)) {
          if (!p) continue;
          if (SPEED.test(p)) {
            const v = Number(p.replace(/x$/, "").replace(",", "."));
            if (!(v >= 0.5 && v <= 2)) bad("Tốc độ phải từ 0.5 đến 2");
            continue;
          }
          emotion = p;
          if (!EMOTIONS.includes(p.toLowerCase())) warnings.push({ line: n, raw, message: `Cảm xúc "${p}" ngoài danh sách chuẩn — Xưởng vẫn gửi nguyên văn` });
        }
        body = m[2];
      } else if (raw.startsWith("[")) {
        return bad("Thiếu dấu ] đóng tên vai");
      }

      // Tách (nghỉ …) trong câu.
      let text = "";
      let any = false;
      PAUSE_ANY.lastIndex = 0;
      let cursor = 0;
      for (let pm = PAUSE_ANY.exec(body); pm; pm = PAUSE_ANY.exec(body)) {
        text += " " + body.slice(cursor, pm.index);
        const sec = pm[1] ? Number(pm[1].replace(",", ".")) : 1;
        if (!(sec >= 0.1 && sec <= 10)) bad("Khoảng nghỉ nên từ 0.1 đến 10 giây");
        pauses += sec;
        lines.push({ kind: "pause", line: n, seconds: sec });
        cursor = pm.index + pm[0].length;
        any = true;
      }
      text = (text + " " + body.slice(cursor)).replace(/\s+/g, " ").trim();
      if (!text) {
        if (m && !any) bad(`Vai "${role}" chưa có lời`);
        return;
      }
      if (/[[\]{}]/.test(text)) return bad("Lời còn ngoặc [ ] hoặc { } — Xưởng sẽ đọc thành tiếng");
      if (/^\(.*\)$/.test(text)) warnings.push({ line: n, raw, message: "Dòng trong ( ) sẽ được đọc thành lời — chỉ (nghỉ …) là lệnh" });
      roles.add(role);
      words += text.split(/\s+/).filter(Boolean).length;
      lines.push({ kind: "speech", line: n, role, emotion, text });
    });
  return { lines, issues, warnings, roles: [...roles], words, estSeconds: Math.round((words / 150) * 60 + pauses) };
}

/** Dọn đầu ra của mô hình: bỏ rào ```, in đậm, gạch đầu dòng, "[Vai]:" → "[Vai]". */
export function cleanScript(src: string): string {
  return src
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^```\w*$/, "")
        .replace(/^[-*•]\s+(?=[[({])/, "")
        .replace(/\*\*/g, "")
        .replace(/^\[\s*([^\]]+?)\s*\]\s*:\s*/, "[$1] "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
