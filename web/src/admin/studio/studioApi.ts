// Client API Xưởng audio (/api/admin/studio) + nhập kịch bản từ Trợ lý viết (/api/admin/writer/scripts).
// Kiểu sao từ worker/src/tts/types.ts — đổi bên đó nhớ sửa ở đây.

export type ProviderId = "mock" | "gemini" | "azure" | "elevenlabs";

export type ScriptItem =
  | {
      type: "speech";
      n: number;
      line: number;
      chapter: number;
      role: string;
      emotion: string;
      direction: string;
      speed: number | null;
      text: string;
      ttsText: string;
      pauseAfter: number;
    }
  | { type: "pause"; line: number; seconds: number }
  | { type: "chapter"; line: number; index: number; title: string }
  | { type: "music"; line: number; action: "start" | "stop" | "gain"; asset: string | null; volume: number | null; fade: number | null; db: number | null }
  | { type: "sfx"; line: number; asset: string; volume: number | null; seconds: number | null; loop: boolean; untilChapter: boolean };

export interface CastHint {
  provider: ProviderId | null;
  voice: string;
  persona: string;
  speed: number | null;
}

export interface ParseResult {
  title: string;
  items: ScriptItem[];
  roles: string[];
  cast: Record<string, CastHint>;
  lexicon: Record<string, string>;
  chapters: string[];
  speechCount: number;
  chars: number;
  estSeconds: number;
  warnings: { line: number; message: string }[];
}

export interface RoleVoice {
  voice: string;
  speed: number;
  persona: string;
}

export interface StudioJob {
  id: string;
  title: string;
  script: string;
  provider: ProviderId;
  voices: Record<string, RoleVoice>;
  status: "draft" | "generating" | "ready" | "error" | "published";
  trackId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StudioSegment {
  n: number;
  role: string;
  emotion: string;
  style: string;
  text: string;
  ttsText: string;
  provider: ProviderId;
  voice: string;
  speed: number;
  hash: string;
  status: "pending" | "generating" | "done" | "error";
  error: string | null;
  qc: string | null;
  durationMs: number;
  bytes: number;
  costUsd: number;
  cached: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  unavailable: string | null;
  model: string;
  voices: { id: string; label: string; gender?: "nam" | "nữ" }[];
  defaultVoice: { narrator: string; female: string; male: string; elderFemale?: string; elderMale?: string };
}

export interface ProvidersResponse {
  live: boolean;
  providers: ProviderInfo[];
  emotions: { id: string; label: string }[];
  narrator: string;
  budgetUsd: number;
}

export interface JobPayload {
  job: StudioJob;
  segments: StudioSegment[];
  items: ScriptItem[];
  parse?: ParseResult;
}

export interface Estimate {
  live: boolean;
  provider: ProviderId;
  pending: number;
  chars: number;
  seconds: number;
  cachedChars: number;
  usd: number;
  budgetUsd: number;
  spentUsd: number;
}

export interface LibraryItem {
  kind: "music" | "sfx";
  name: string;
  key: string;
  size: number;
}

/** Gói kịch bản từ Trợ lý viết (worker/src/writer/types.ts StudioScript). */
export interface WriterCharacter {
  name: string;
  gender: "nam" | "nữ";
  age: string;
  role: string;
  voice: string;
}
export interface WriterScript {
  id: string;
  projectId: string;
  projectTitle: string;
  epNo: number;
  episodeCount: number;
  title: string;
  script: string;
  teaser: string;
  characters: WriterCharacter[];
  roles: string[];
  estSeconds: number;
  sentAt: number | null;
  updatedAt: number;
}

export class StudioError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "include", ...init });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new StudioError("Không kết nối được máy chủ", 0);
  }
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try {
      const d = (await res.json()) as { error?: string };
      if (d?.error) msg = d.error;
    } catch {
      /* không phải JSON */
    }
    throw new StudioError(msg, res.status);
  }
  return (await res.json()) as T;
}

const json = <T>(method: string, path: string, body?: unknown, signal?: AbortSignal) =>
  req<T>(path, {
    method,
    signal,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const B = "/api/admin/studio";

export const studioApi = {
  providers: () => json<ProvidersResponse>("GET", `${B}/providers`),
  parse: (script: string, signal?: AbortSignal) => json<ParseResult>("POST", `${B}/parse`, { script }, signal),
  usage: () => json<{ month: string; budgetUsd: number; spentUsd: number }>("GET", `${B}/usage`),
  jobs: () => json<{ jobs: StudioJob[] }>("GET", `${B}/jobs`),
  job: (id: string) => json<JobPayload>("GET", `${B}/jobs/${encodeURIComponent(id)}`),
  createJob: (body: { title: string; script: string; provider: ProviderId; voices: Record<string, RoleVoice> }) => json<JobPayload>("POST", `${B}/jobs`, body),
  saveJob: (id: string, body: Partial<{ title: string; script: string; provider: ProviderId; voices: Record<string, RoleVoice> }>) =>
    json<JobPayload>("PUT", `${B}/jobs/${encodeURIComponent(id)}`, body),
  deleteJob: (id: string) => json<{ ok: boolean }>("DELETE", `${B}/jobs/${encodeURIComponent(id)}`),
  estimate: (id: string) => json<Estimate>("POST", `${B}/jobs/${encodeURIComponent(id)}/estimate`),
  generate: (id: string, n: number, force = false, signal?: AbortSignal) =>
    json<{ segment: StudioSegment; job: StudioJob }>("POST", `${B}/jobs/${encodeURIComponent(id)}/segments/${n}/generate${force ? "?force=1" : ""}`, undefined, signal),
  segmentUrl: (id: string, n: number, hash: string) => `${B}/jobs/${encodeURIComponent(id)}/segments/${n}/audio?h=${encodeURIComponent(hash)}`,

  library: () => json<{ items: LibraryItem[] }>("GET", `${B}/library`),
  libraryUrl: (kind: string, name: string) => `${B}/library/${kind}/${encodeURIComponent(name)}`,
  uploadLibrary: (kind: "music" | "sfx", name: string, file: File) =>
    req<{ kind: string; name: string; key: string }>(`${B}/library/${kind}/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "content-type": file.type || "audio/mpeg" },
      body: file,
    }),
  deleteLibrary: (kind: string, name: string) => json<{ ok: boolean }>("DELETE", `${B}/library/${kind}/${encodeURIComponent(name)}`),

  /** Đăng WAV đã ghép vào track (XHR để có tiến độ tải lên). */
  publish(jobId: string, trackId: string, wav: Blob, durationSeconds: number, onProgress?: (frac: number) => void) {
    return new Promise<{ trackId: string; entry: string; key: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${B}/jobs/${encodeURIComponent(jobId)}/publish/${encodeURIComponent(trackId)}?duration=${Math.max(1, Math.round(durationSeconds))}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("content-type", "audio/wav");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data: { error?: string } & Record<string, unknown> = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* bỏ qua */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as unknown as { trackId: string; entry: string; key: string });
        else reject(new StudioError(data.error || `Lỗi ${xhr.status}`, xhr.status));
      };
      xhr.onerror = () => reject(new StudioError("Lỗi mạng khi tải tệp", 0));
      xhr.send(wav);
    });
  },

  writerScripts: () => json<{ items: WriterScript[] }>("GET", "/api/admin/writer/scripts"),
  writerScript: (id: string) => json<WriterScript>("GET", `/api/admin/writer/scripts/${encodeURIComponent(id)}`),
};

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Slug không dấu giống máy chủ (slugify) — để khớp tên nhạc / hiệu ứng trong thư viện. */
export function libSlug(s: string): string {
  const f = s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return f.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "audio";
}
