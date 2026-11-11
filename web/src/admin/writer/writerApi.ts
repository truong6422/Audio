// Client API Trợ lý viết kịch bản — /api/admin/writer/*.
import { ApiError } from "../adminApi";
import type { ParsedScript } from "./format";
import type { Outline, WriterCharacter, WriterEpisode, WriterProject } from "./types";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/admin/writer" + path, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Không kết nối được máy chủ", 0);
  }
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try {
      const d = (await res.json()) as { error?: string };
      if (d?.error) msg = d.error;
    } catch {
      /* không phải JSON */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ProviderInfo {
  provider: "mock" | "claude" | "gemini";
  model: string;
  ready: boolean;
}

export type ProjectInput = {
  title: string;
  genre: string;
  idea: string;
  characters: WriterCharacter[];
  episodeMinutes: number;
  episodeCount: number;
  pov: WriterProject["pov"];
  ending: WriterProject["ending"];
  notes: string;
};

export type ProjectListItem = WriterProject & { written: number; sent: number };
export type EpisodeData = Pick<WriterEpisode, "title" | "script" | "cliffhanger" | "teaser" | "seoTitle" | "seoDescription" | "hashtags">;
export interface EpisodeResult {
  episode: WriterEpisode;
  check: ParsedScript;
}

const P = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const writerApi = {
  config: () => call<ProviderInfo>("GET", "/config"),
  list: () => call<{ items: ProjectListItem[] }>("GET", "/projects"),
  create: (b: ProjectInput) => call<WriterProject>("POST", "/projects", b),
  get: (id: string) => call<{ project: WriterProject; episodes: WriterEpisode[] }>("GET", P(id)),
  update: (id: string, b: Partial<ProjectInput> & { outline?: Outline | null }) => call<WriterProject>("PATCH", P(id), b),
  remove: (id: string) => call<void>("DELETE", P(id)),
  genOutline: (id: string) => call<WriterProject>("POST", `${P(id)}/outline`),
  genEpisode: (id: string, no: number) => call<EpisodeResult>("POST", `${P(id)}/episodes/${no}/generate`),
  saveEpisode: (id: string, no: number, b: EpisodeData) => call<EpisodeResult>("PUT", `${P(id)}/episodes/${no}`, b),
  sendEpisode: (id: string, no: number) =>
    call<{ id: string; status: "sent"; sentAt: number; roles: string[]; estSeconds: number }>("POST", `${P(id)}/episodes/${no}/send`),
};
