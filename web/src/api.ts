// Client gọi API: luôn gửi cookie phiên, lỗi ném Error với message lấy từ { error }.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Body = Record<string, unknown> | unknown[] | undefined;

export async function api<T>(path: string, init: { method?: string; body?: Body; signal?: AbortSignal } = {}): Promise<T> {
  const { method = "GET", body, signal } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
    throw new ApiError(typeof err === "string" && err ? err : `Lỗi ${res.status}`, res.status);
  }
  return data as T;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T>(path: string, body?: Body) => api<T>(path, { method: "POST", body: body ?? {} });
export const apiPut = <T>(path: string, body?: Body) => api<T>(path, { method: "PUT", body: body ?? {} });

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Đã có lỗi xảy ra.";
}

export const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";
