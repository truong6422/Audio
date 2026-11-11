// Bao localStorage / sessionStorage an toàn (chế độ riêng tư có thể ném lỗi).
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const local = {
  get: (k: string) => safe(() => localStorage.getItem(k), null),
  set: (k: string, v: string) => safe(() => localStorage.setItem(k, v), undefined),
  remove: (k: string) => safe(() => localStorage.removeItem(k), undefined),
  getJSON<T>(k: string, fallback: T): T {
    const raw = safe(() => localStorage.getItem(k), null);
    if (!raw) return fallback;
    return safe(() => JSON.parse(raw) as T, fallback);
  },
  setJSON: (k: string, v: unknown) => safe(() => localStorage.setItem(k, JSON.stringify(v)), undefined),
};

export const session = {
  get: (k: string) => safe(() => sessionStorage.getItem(k), null),
  set: (k: string, v: string) => safe(() => sessionStorage.setItem(k, v), undefined),
};
