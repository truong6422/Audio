// Ô soạn kịch bản có tô màu: textarea chữ trong suốt đè lên lớp <pre> tô màu (cùng phông, cùng lề, cuộn đồng bộ).
import { useMemo, useRef, type ReactNode } from "react";

/** Bảng màu vai — trộn từ biến chủ đề, không viết cứng mã màu. */
const ROLE_COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--success)",
  "color-mix(in oklab, var(--accent) 50%, var(--accent-2))",
  "color-mix(in oklab, var(--success) 55%, var(--accent))",
  "color-mix(in oklab, var(--accent-2) 55%, var(--success))",
  "color-mix(in oklab, var(--accent) 60%, var(--text))",
  "color-mix(in oklab, var(--accent-2) 60%, var(--text))",
];
export const roleColor = (i: number) => (i < 0 ? "var(--text)" : ROLE_COLORS[i % ROLE_COLORS.length]!);

const RE_CMD_LINE = /^\s*(\[\s*(nghỉ|nghi|pause|sfx|hiệu ứng|nhạc|nhac|music)(?=[\s:\]])[^\]]*\]|\{[^}]*\}|\(\s*nghỉ[^)]*\)|-{3,}|@nhạc\b.*)\s*$/i;
const RE_INLINE = /(\[\s*nghỉ[^\]]*\]|\(\s*nghỉ[^)]*\)|<[^>]{1,20}>|\{\s*đọc\s*:[^}]*\})/gi;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(RE_INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`${key}-${i++}`} style={{ color: "var(--muted)" }}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function highlightLine(line: string, idx: number, roleIndex: (name: string) => number): ReactNode {
  const k = `l${idx}`;
  const t = line.trim();
  if (!t) return line;
  if (t.startsWith("##")) return <span style={{ color: "var(--accent)", fontWeight: 700 }}>{line}</span>;
  if (t.startsWith("#") || t.startsWith("//")) return <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{line}</span>;
  if (/^@(vai|đọc)\b/i.test(t)) return <span style={{ color: "var(--accent-2)" }}>{line}</span>;
  if (RE_CMD_LINE.test(line)) return <span style={{ color: "var(--success)" }}>{line}</span>;
  // [Vai|cảm xúc] lời
  let m = /^(\s*\[)([^\]|]+)((?:\|[^\]]*)?)(\])(.*)$/.exec(line);
  if (m) {
    const ri = roleIndex(m[2]!.trim());
    return (
      <>
        <span style={{ color: "var(--muted)" }}>{m[1]}</span>
        <span style={{ color: roleColor(ri), fontWeight: 700 }}>{m[2]}</span>
        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{m[3]}</span>
        <span style={{ color: "var(--muted)" }}>{m[4]}</span>
        {inline(m[5]!, k)}
      </>
    );
  }
  // Vai (cảm xúc) {đọc: …}: lời
  m = /^(\s*)([^:()[\]{}<>]{1,40}?)(\s*\([^)]*\))?(\s*\{[^}]*\})?(\s*:)(.*)$/.exec(line);
  if (m) {
    const ri = roleIndex(m[2]!.trim());
    if (ri >= 0) {
      return (
        <>
          {m[1]}
          <span style={{ color: roleColor(ri), fontWeight: 700 }}>{m[2]}</span>
          <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{m[3]}</span>
          <span style={{ color: "var(--muted)" }}>{m[4]}</span>
          <span style={{ color: roleColor(ri) }}>{m[5]}</span>
          {inline(m[6]!, k)}
        </>
      );
    }
  }
  return <>{inline(line, k)}</>;
}

const NARRATOR_ALIASES = ["dẫn", "người dẫn", "dẫn chuyện", "người kể", "kể"];

export default function ScriptEditor({
  value,
  onChange,
  roles,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  roles: string[];
  placeholder?: string;
}) {
  const pre = useRef<HTMLPreElement>(null);
  const roleIndex = useMemo(() => {
    const map = new Map(roles.map((r, i) => [r.toLowerCase(), i]));
    const narr = roles.findIndex((r) => NARRATOR_ALIASES.includes(r.toLowerCase()));
    return (name: string) => {
      const k = name.toLowerCase().replace(/\s+/g, " ");
      if (NARRATOR_ALIASES.includes(k)) return narr >= 0 ? narr : 0;
      return map.get(k) ?? -1;
    };
  }, [roles]);
  const lines = useMemo(() => value.split("\n"), [value]);
  const shared =
    "m-0 box-border w-full whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-6 [overflow-wrap:anywhere] [scrollbar-gutter:stable] [tab-size:2]";

  return (
    <div className="relative h-[55vh] min-h-72 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]">
      <pre ref={pre} aria-hidden className={`${shared} pointer-events-none absolute inset-0 overflow-y-scroll text-[var(--text)]`}>
        {lines.map((l, i) => (
          <span key={i}>
            {highlightLine(l, i, roleIndex)}
            {"\n"}
          </span>
        ))}
        {"\n"}
      </pre>
      <textarea
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        aria-label="Kịch bản"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (pre.current) pre.current.scrollTop = e.currentTarget.scrollTop;
        }}
        className={`${shared} absolute inset-0 h-full resize-none overflow-y-scroll border-0 bg-transparent text-transparent caret-[var(--text)] outline-none placeholder:text-[var(--muted)] selection:bg-[color-mix(in_oklab,var(--accent)_35%,transparent)] selection:text-transparent`}
      />
    </div>
  );
}
