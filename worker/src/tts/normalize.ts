// Chuẩn hoá chữ tiếng Việt trước khi đưa vào TTS: số, ngày, giờ, tiền, đơn vị, viết tắt, ký hiệu.
// Chỉ ảnh hưởng chữ đưa vào giọng đọc; kịch bản gốc giữ nguyên để hiển thị.

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/** Đọc một nhóm 3 chữ số. full = đọc đủ "không trăm" (nhóm không đứng đầu). */
function read3(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (h > 0 || full) out.push(DIGITS[h]!, "trăm");
  if (t === 0) {
    if (u > 0) {
      if (h > 0 || full) out.push("linh");
      out.push(DIGITS[u]!);
    }
  } else if (t === 1) {
    out.push("mười");
    if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]!);
  } else {
    out.push(DIGITS[t]!, "mươi");
    if (u === 1) out.push("mốt");
    else if (u === 4) out.push("tư");
    else if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]!);
  }
  return out.join(" ");
}

/** Đọc chuỗi chữ số. Bắt đầu bằng 0 và dài ≥ 2 (số điện thoại, mã) → đọc từng chữ số. */
export function readNumber(digits: string): string {
  const s = digits.replace(/\D/g, "");
  if (!s) return "";
  if (s.length > 1 && s.startsWith("0")) return [...s].map((d) => DIGITS[+d]).join(" ");
  if (s.length > 18) return [...s].map((d) => DIGITS[+d]).join(" ");
  const groups: number[] = [];
  for (let end = s.length; end > 0; end -= 3) groups.unshift(Number(s.slice(Math.max(0, end - 3), end)));
  if (groups.every((g) => g === 0)) return "không";
  const units = ["", "nghìn", "triệu"];
  const parts: string[] = [];
  groups.forEach((g, i) => {
    const pos = groups.length - 1 - i; // 0 = hàng đơn vị
    if (g === 0) return;
    let unit = units[pos % 3]!;
    const ty = Math.floor(pos / 3);
    if (ty > 0) unit = [unit, ...Array(ty).fill("tỷ")].filter(Boolean).join(" ");
    parts.push([read3(g, parts.length > 0), unit].filter(Boolean).join(" "));
  });
  return parts.join(" ");
}

/** Số thập phân kiểu Việt "3,5" → "ba phẩy năm"; phần lẻ có số 0 đầu đọc từng chữ số. */
function readDecimal(intPart: string, frac: string): string {
  const f = frac.startsWith("0") ? [...frac].map((d) => DIGITS[+d]).join(" ") : readNumber(frac);
  return `${readNumber(intPart)} phẩy ${f}`;
}

function readMonth(m: number): string {
  return m === 4 ? "tư" : readNumber(String(m));
}

function readOrdinal(n: string): string {
  if (n === "1") return "nhất";
  if (n === "4") return "tư";
  return readNumber(n);
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function romanToInt(r: string): number | null {
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]!];
    const next = ROMAN[r[i + 1] ?? ""] ?? 0;
    if (!v) return null;
    total += v < next ? -v : v;
  }
  return total > 0 && total < 400 ? total : null;
}

/** Viết tắt → cách đọc. Khoá có chữ hoa khớp đúng hoa thường; khoá thường khớp không phân biệt. */
const ABBREV: [string, string][] = [
  ["TP.HCM", "thành phố Hồ Chí Minh"],
  ["TP. HCM", "thành phố Hồ Chí Minh"],
  ["TPHCM", "thành phố Hồ Chí Minh"],
  ["HCM", "Hồ Chí Minh"],
  ["HN", "Hà Nội"],
  ["TP.", "thành phố"],
  ["Q.", "quận"],
  ["P.", "phường"],
  ["UBND", "ủy ban nhân dân"],
  ["THPT", "trung học phổ thông"],
  ["THCS", "trung học cơ sở"],
  ["ĐH", "đại học"],
  ["CEO", "xi i âu"],
  ["GS.", "giáo sư"],
  ["PGS.", "phó giáo sư"],
  ["TS.", "tiến sĩ"],
  ["ThS.", "thạc sĩ"],
  ["BS.", "bác sĩ"],
  ["v.v.", "vân vân"],
  ["v.v", "vân vân"],
  ["vs", "với"],
  ["ko", "không"],
  ["k0", "không"],
  ["kh", "không"],
  ["đc", "được"],
  ["dc", "được"],
  ["ng", "người"],
  ["mn", "mọi người"],
  ["ok", "ô kê"],
  ["OK", "ô kê"],
  ["USD", "đô la Mỹ"],
  ["VNĐ", "đồng"],
  ["VND", "đồng"],
];

const UNITS: [string, string][] = [
  ["km/h", "ki lô mét trên giờ"],
  ["m/s", "mét trên giây"],
  ["km²", "ki lô mét vuông"],
  ["km2", "ki lô mét vuông"],
  ["m²", "mét vuông"],
  ["m2", "mét vuông"],
  ["m³", "mét khối"],
  ["m3", "mét khối"],
  ["km", "ki lô mét"],
  ["cm", "xăng ti mét"],
  ["mm", "mi li mét"],
  ["kg", "ki lô gam"],
  ["mg", "mi li gam"],
  ["ml", "mi li lít"],
  ["ha", "héc ta"],
  ["°C", "độ C"],
  ["độ C", "độ C"],
  ["tr", "triệu"],
  ["triệu", "triệu"],
  ["tỷ", "tỷ"],
  ["k", "nghìn"],
  ["m", "mét"],
  ["g", "gam"],
  ["l", "lít"],
];

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "Chữ cái" tiếng Việt cho ranh giới từ (\b của JS không hiểu chữ có dấu).
const L = "A-Za-zÀ-ỹĐđ";
const NB = `(?<![${L}0-9])`;
const NA = `(?![${L}0-9])`;

const ABBREV_RES = ABBREV.sort((a, b) => b[0].length - a[0].length).map(([k, v]) => {
  const ci = k === k.toLowerCase();
  const tail = /\.$/.test(k) ? "" : NA;
  return [new RegExp(NB + escRe(k) + tail, ci ? "gi" : "g"), v] as const;
});

// Số: chấp nhận "1.000.000" (dấu chấm ngăn nghìn) và "3,5" (dấu phẩy thập phân).
const NUM = String.raw`\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?`;
const UNIT_RE = new RegExp(
  `(${NUM})\\s?(${UNITS.map(([u]) => escRe(u)).join("|")})${NA}`,
  "g",
);

function readAnyNumber(raw: string): string {
  if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) return readNumber(raw.replace(/\./g, ""));
  const dec = /^(\d+),(\d+)$/.exec(raw);
  if (dec) return readDecimal(dec[1]!, dec[2]!);
  return readNumber(raw);
}

/** Thẻ diễn trong câu (Gemini hiểu; nhà khác bị lọc ở providers.ts) — giữ nguyên qua chuẩn hoá. */
export const INLINE_TAGS = ["sigh", "laugh", "gasp", "short pause", "long pause"] as const;
const TAG_RE = new RegExp(`<\\s*(${INLINE_TAGS.join("|")})\\s*>`, "gi");
const TAG_VI: Record<string, string> = { "thở dài": "sigh", cười: "laugh", "hít hà": "gasp", "nghỉ ngắn": "short pause", "nghỉ dài": "long pause" };
const TAG_VI_RE = new RegExp(`<\\s*(${Object.keys(TAG_VI).join("|")})\\s*>`, "gi");

/** Áp từ điển đọc (khớp nguyên từ, khoá dài trước; khoá chữ thường thì không phân biệt hoa thường). */
export function applyLexicon(s: string, lexicon: Record<string, string>): string {
  const keys = Object.keys(lexicon).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const ci = k === k.toLowerCase();
    s = s.replace(new RegExp(NB + escRe(k) + NA, ci ? "gi" : "g"), () => lexicon[k]!);
  }
  return s;
}

/** Phiên bản bộ chuẩn hoá — đưa vào hash bộ đệm; đổi luật thì tăng số. */
export const NORMALIZE_VERSION = 2;

/** Chuẩn hoá một câu / đoạn lời. lexicon = từ điển đọc của tập (áp trước luật hệ thống). */
export function normalizeVi(input: string, lexicon: Record<string, string> = {}): string {
  let s = (input ?? "").normalize("NFC").replace(/\r\n?/g, "\n");
  if (!s.trim()) return "";

  // Giữ thẻ diễn <sigh>… bằng ký tự giữ chỗ (vùng dùng riêng Unicode, không luật nào chạm tới).
  const tags: string[] = [];
  s = s.replace(TAG_VI_RE, (_m, t: string) => `<${TAG_VI[t.toLowerCase()]}>`);
  s = s.replace(TAG_RE, (_m, t: string) => {
    tags.push(`<${t.toLowerCase().replace(/\s+/g, " ")}>`);
    return ` ${String.fromCharCode(97 + ((tags.length - 1) % 26))} `;
  });

  s = applyLexicon(s, lexicon);

  // Ký tự trang trí, ngoặc kép kiểu khác
  s = s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/\.{3,}/g, "…");

  // Viết tắt
  for (const [re, v] of ABBREV_RES) s = s.replace(re, v);

  // Thế kỷ / chương số La Mã
  s = s.replace(new RegExp(`(thế kỷ|thế kỉ|chương|phần|tập)\\s+([IVXLC]+)${NA}`, "gi"), (m, w: string, r: string) => {
    const n = romanToInt(r.toUpperCase());
    return n ? `${w} ${readNumber(String(n))}` : m;
  });

  // Ngày dd/mm/yyyy, dd-mm-yyyy, dd/mm
  // (đã có chữ "ngày" / "tháng" đứng trước thì không thêm lần nữa)
  s = s.replace(/((?:ngày|Ngày)\s+)?(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/g, (m, pre: string | undefined, d: string, mo: string, y: string) => {
    const dn = +d, mn = +mo;
    if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return m;
    return `${pre ?? "ngày "}${readNumber(String(dn))} tháng ${readMonth(mn)} năm ${readNumber(y)}`;
  });
  // tháng mm/yyyy (trước dd/mm để "4/2023" không thành ngày)
  s = s.replace(/((?:tháng|Tháng)\s+)?(?<!\d)(\d{1,2})\/(\d{4})(?!\d)/g, (m, pre: string | undefined, mo: string, y: string) => {
    const mn = +mo;
    if (mn < 1 || mn > 12) return m;
    return `${pre ?? "tháng "}${readMonth(mn)} năm ${readNumber(y)}`;
  });
  s = s.replace(/((?:ngày|Ngày)\s+)?(?<!\d)(\d{1,2})\/(\d{1,2})(?![\d/])/g, (m, pre: string | undefined, d: string, mo: string) => {
    const dn = +d, mn = +mo;
    if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return m;
    return `${pre ?? "ngày "}${readNumber(String(dn))} tháng ${readMonth(mn)}`;
  });
  // "tháng 4" → "tháng tư"; "ngày 1" giữ "một"
  s = s.replace(new RegExp(`${NB}(tháng)\\s+(\\d{1,2})(?!\\d)`, "gi"), (m, w: string, mo: string) => {
    const mn = +mo;
    return mn >= 1 && mn <= 12 ? `${w} ${readMonth(mn)}` : m;
  });

  // Giờ: 21:15, 9h30, 9g30, 9h
  s = s.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![\d:])/g, (m, h: string, mi: string, se?: string) => {
    if (+h > 24 || +mi > 59) return m;
    let out = `${readNumber(String(+h))} giờ`;
    if (+mi > 0) out += ` ${readNumber(String(+mi))} phút`;
    if (se && +se > 0) out += ` ${readNumber(String(+se))} giây`;
    return out;
  });
  s = s.replace(new RegExp(`(?<!\\d)(\\d{1,2})\\s?[hg](\\d{2})?${NA}`, "gi"), (m, h: string, mi?: string) => {
    if (+h > 24 || (mi && +mi > 59)) return m;
    return `${readNumber(String(+h))} giờ` + (mi && +mi > 0 ? ` ${readNumber(String(+mi))} phút` : "");
  });

  // Số điện thoại "0912-345-678" / "0912 345 678" / "0912.345.678" → đọc từng chữ số
  s = s.replace(/(?<![\d.,])0\d{2,4}(?:[-. ]\d{2,4}){1,3}(?![\d,])/g, (m) => readNumber(m.replace(/\D/g, "")));

  // Khoảng số "3-5", "2008–2009", "10 - 20%" → "3 đến 5" (số đọc ở bước sau nên đơn vị phía sau vẫn khớp).
  // Chuỗi nhiều gạch như "0912-345-678" (số điện thoại) không coi là khoảng.
  s = s.replace(new RegExp(`(?<![\\d.,-])(${NUM})\\s?[–—-]\\s?(${NUM})(?!\\d|[.,-]\\d)`, "g"), (_m, a: string, b: string) => `${a} đến ${b}`);
  s = s.replace(/(\d)-(?=\d)/g, "$1 "); // phần còn lại: gạch giữa các nhóm số → đọc liền

  // Tiền
  s = s.replace(new RegExp(`(${NUM})\\s?(đ|đồng|₫)${NA}`, "g"), (_m, n: string) => `${readAnyNumber(n)} đồng`);
  s = s.replace(new RegExp(`\\$\\s?(${NUM})`, "g"), (_m, n: string) => `${readAnyNumber(n)} đô la`);
  s = s.replace(new RegExp(`(${NUM})\\s?\\$`, "g"), (_m, n: string) => `${readAnyNumber(n)} đô la`);

  // Phần trăm
  s = s.replace(new RegExp(`(${NUM})\\s?%`, "g"), (_m, n: string) => `${readAnyNumber(n)} phần trăm`);

  // Đơn vị đo sau số
  s = s.replace(UNIT_RE, (_m, n: string, u: string) => {
    const name = UNITS.find(([k]) => k === u)?.[1] ?? u;
    return `${readAnyNumber(n)} ${name}`;
  });

  // Số thứ tự: "thứ 2", "hạng 1", "lần thứ 4"
  s = s.replace(new RegExp(`${NB}(thứ|hạng)\\s+(\\d+)(?!\\d)`, "gi"), (_m, w: string, n: string) => `${w} ${readOrdinal(n)}`);


  // Thập phân kiểu Anh "3.5" (1–2 chữ số sau dấu chấm; 3 chữ số là ngăn nghìn)
  s = s.replace(/(?<![\d.,])(\d+)\.(\d{1,2})(?![\d.])/g, (_m, a: string, b: string) => readDecimal(a, b));

  // Số còn lại
  s = s.replace(new RegExp(`(?<![\\d.,])(${NUM})(?![\\d])`, "g"), (_m, n: string) => readAnyNumber(n));
  s = s.replace(/\d+/g, (n) => readNumber(n)); // phần sót (vd. "1.2.3")

  // Ký hiệu
  s = s
    .replace(/\s&\s/g, " và ")
    .replace(/\s\+\s/g, " cộng ")
    .replace(/\s=\s/g, " bằng ")
    .replace(/[*_#~^`|<>[\]{}]/g, " ")
    .replace(/\s*[—–]\s*/g, ", ") // gạch dài giữa câu = ngắt nhẹ
    .replace(/(^|\s)-\s+/g, "$1"); // gạch đầu lời thoại

  // Gom khoảng trắng, sửa dấu câu
  s = s
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,]+/, "");
  s = s.replace(/([a-z])/g, (_m, c: string) => tags[c.charCodeAt(0) - 97] ?? "");
  return s.replace(/\s+/g, " ").trim();
}

/** Bỏ thẻ diễn (cho nhà cung cấp không hiểu thẻ). */
export function stripTags(s: string): string {
  return s.replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
}

/** Số âm tiết (≈ số từ tiếng Việt) để ước lượng thời lượng. */
export function syllableCount(s: string): number {
  return (s.match(new RegExp(`[${L}0-9]+`, "g")) ?? []).length;
}

/** Ước lượng giây đọc: tiếng Việt kể chuyện ~4,2 âm tiết/giây ở tốc độ 1. */
export function estimateSeconds(text: string, speed = 1): number {
  const syl = syllableCount(text);
  const commas = (text.match(/[,;:]/g) ?? []).length;
  const stops = (text.match(/[.!?…]/g) ?? []).length;
  return Math.max(0.4, (syl / 4.2 + commas * 0.15 + stops * 0.25) / Math.max(0.5, speed));
}
