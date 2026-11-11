// Client API nhỏ cho trang quản trị — bám hợp đồng trong shared/types.ts.
import type { FunnelStats, Page, SiteSettings, Track, User } from "@shared/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, { credentials: "include", ...init });
  } catch {
    throw new ApiError("Không kết nối được máy chủ", 0);
  }
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data && typeof data.error === "string" && data.error) msg = data.error;
    } catch {
      /* phản hồi không phải JSON */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Mã hoá từng đoạn đường dẫn, giữ dấu "/". */
export function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export interface AdminStats {
  tracks: number;
  plays: number;
  users: number;
  unlocksToday: number;
}

export type TrackPatch = Partial<Pick<Track, "title" | "description" | "episodeCount" | "coverUrl" | "durationSeconds" | "category" | "tags">>;

export const adminApi = {
  me: () => json<{ user: User | null }>("GET", "/auth/me"),
  stats: () => json<AdminStats>("GET", "/admin/stats"),

  listTracks: (page: number, q: string, category = "") =>
    json<Page<Track>>(
      "GET",
      `/admin/tracks?page=${page}&q=${encodeURIComponent(q)}${category ? `&category=${encodeURIComponent(category)}` : ""}`,
    ),
  createTrack: (body: { title: string; description: string; format: Track["format"]; episodeCount: number }) =>
    json<{ track: Track }>("POST", "/admin/tracks", body),
  updateTrack: (id: string, patch: TrackPatch) => json<{ track: Track }>("PATCH", `/admin/tracks/${id}`, patch),
  deleteTrack: (id: string) => json<{ ok: boolean }>("DELETE", `/admin/tracks/${id}`),
  completeTrack: (id: string, body: { durationSeconds: number; entry: string }) =>
    json<{ track: Track }>("POST", `/admin/tracks/${id}/complete`, body),

  /** PUT một tệp; dùng XHR để có tiến độ theo byte. */
  uploadFile(id: string, relPath: string, file: Blob, contentType: string, onProgress?: (loaded: number) => void, signal?: AbortSignal) {
    return new Promise<{ key: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/admin/upload/${id}/${encodePath(relPath)}`);
      xhr.withCredentials = true;
      if (contentType) xhr.setRequestHeader("content-type", contentType);
      xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { key: string });
          } catch {
            resolve({ key: relPath });
          }
          return;
        }
        let msg = `Lỗi ${xhr.status}`;
        try {
          const d = JSON.parse(xhr.responseText) as { error?: string };
          if (d.error) msg = d.error;
        } catch {
          /* bỏ qua */
        }
        reject(new ApiError(msg, xhr.status));
      };
      xhr.onerror = () => reject(new ApiError("Lỗi mạng khi tải tệp", 0));
      xhr.onabort = () => reject(new ApiError("Đã huỷ", 0));
      signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(file);
    });
  },

  uploadAsset: (file: File) =>
    request<{ url: string }>("/admin/assets", {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    }),

  getSettings: () => json<SiteSettings>("GET", "/admin/settings"),
  saveSettings: (patch: Partial<SiteSettings>) => json<SiteSettings>("PUT", "/admin/settings", patch),
  funnel: (days: number) => json<FunnelStats>("GET", `/admin/funnel?days=${days}`),
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
