// Logic tải lên: phân tích thư mục HLS, đọc thời lượng tệp audio, chạy song song có thử lại.
import { adminApi } from "./adminApi";

const HLS_EXT = ["m3u8", "ts", "m4s", "mp4", "m4a", "aac", "key", "vtt"];

export interface HlsFile {
  file: File;
  path: string; // đường dẫn tương đối trong thư mục (đã bỏ tên thư mục gốc)
}

export interface HlsPlan {
  folderName: string;
  files: HlsFile[];
  entry: string; // .m3u8 chính
  durationSeconds: number;
  totalBytes: number;
}

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function contentTypeFor(name: string, fallback = ""): string {
  switch (extOf(name)) {
    case "m3u8":
      return "application/vnd.apple.mpegurl";
    case "ts":
      return "video/mp2t";
    case "m4s":
    case "mp4":
      return "video/mp4";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "mp3":
      return "audio/mpeg";
    case "vtt":
      return "text/vtt";
    case "key":
      return "application/octet-stream";
    default:
      return fallback || "application/octet-stream";
  }
}

/** Tổng #EXTINF của một playlist; 0 nếu là master playlist. */
export function sumExtinf(text: string): number {
  let total = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = /^#EXTINF:\s*([0-9.]+)/.exec(line.trim());
    if (m) total += parseFloat(m[1]) || 0;
  }
  return total;
}

/** Từ danh sách tệp của input webkitdirectory → kế hoạch tải HLS. Ném lỗi kèm lý do khi thiếu. */
export async function planHls(list: FileList | File[]): Promise<HlsPlan> {
  const all = Array.from(list);
  if (all.length === 0) throw new Error("Thư mục trống");
  const firstRel = (all[0] as File & { webkitRelativePath?: string }).webkitRelativePath || all[0].name;
  const folderName = firstRel.includes("/") ? firstRel.split("/")[0] : "";

  const files: HlsFile[] = [];
  for (const f of all) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = rel.split("/");
    if (parts.length > 1) parts.shift();
    const path = parts.join("/");
    if (parts.some((p) => p.startsWith("."))) continue; // tệp ẩn (.DS_Store…)
    if (!HLS_EXT.includes(extOf(path))) continue;
    files.push({ file: f, path });
  }
  const playlists = files.filter((f) => extOf(f.path) === "m3u8");
  if (playlists.length === 0) throw new Error("Không thấy tệp .m3u8 trong thư mục");

  // Chọn .m3u8 chính: master.m3u8 / index.m3u8 / playlist.m3u8 ở gốc → .m3u8 nông nhất.
  const depth = (p: string) => p.split("/").length;
  const preferred = ["master.m3u8", "index.m3u8", "playlist.m3u8", "main.m3u8"];
  const sorted = [...playlists].sort((a, b) => {
    const pa = preferred.indexOf(a.path.toLowerCase());
    const pb = preferred.indexOf(b.path.toLowerCase());
    const ra = pa < 0 ? 99 : pa;
    const rb = pb < 0 ? 99 : pb;
    return ra - rb || depth(a.path) - depth(b.path) || a.path.localeCompare(b.path);
  });
  const main = sorted[0];

  // Thời lượng: playlist chính nếu có EXTINF; master thì lấy playlist con đầu tiên nó trỏ tới, rồi tới bất kỳ playlist nào có EXTINF.
  const texts = new Map<string, string>();
  const read = async (p: HlsFile) => {
    if (!texts.has(p.path)) texts.set(p.path, await p.file.text());
    return texts.get(p.path)!;
  };
  let duration = sumExtinf(await read(main));
  if (duration === 0) {
    const mainText = texts.get(main.path)!;
    const baseDir = main.path.includes("/") ? main.path.slice(0, main.path.lastIndexOf("/") + 1) : "";
    const refs = mainText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && extOf(l.split("?")[0]) === "m3u8")
      .map((l) => normalizePath(baseDir + l.split("?")[0]));
    const candidates = [
      ...refs.map((r) => playlists.find((p) => p.path === r)).filter((p): p is HlsFile => !!p),
      ...playlists.filter((p) => p !== main),
    ];
    for (const c of candidates) {
      duration = sumExtinf(await read(c));
      if (duration > 0) break;
    }
  }
  if (duration === 0) throw new Error("Không tính được thời lượng (playlist không có #EXTINF)");

  return {
    folderName,
    files,
    entry: main.path,
    durationSeconds: Math.round(duration),
    totalBytes: files.reduce((s, f) => s + f.file.size, 0),
  };
}

function normalizePath(p: string) {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** Đọc thời lượng tệp audio bằng phần tử Audio. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url);
      a.removeAttribute("src");
      fn();
    };
    a.onloadedmetadata = () => {
      const d = a.duration;
      if (Number.isFinite(d) && d > 0) done(() => resolve(Math.round(d)));
      else done(() => reject(new Error("Không đọc được thời lượng tệp audio")));
    };
    a.onerror = () => done(() => reject(new Error("Trình duyệt không đọc được tệp audio này")));
    a.src = url;
  });
}

/** Gợi ý số tập: ~1 tập / 10 phút. */
export function suggestEpisodes(durationSeconds: number) {
  return Math.max(1, Math.round(durationSeconds / 600));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tải danh sách tệp lên track, `concurrency` luồng, mỗi tệp thử tối đa `attempts` lần.
 * onProgress(bytesĐãTải, tệpXong).
 */
export async function uploadAll(
  trackId: string,
  files: HlsFile[],
  onProgress: (loadedBytes: number, doneFiles: number) => void,
  signal: AbortSignal,
  concurrency = 6,
  attempts = 3,
) {
  const loaded = new Array<number>(files.length).fill(0);
  let doneFiles = 0;
  let next = 0;
  const report = () => onProgress(loaded.reduce((s, n) => s + n, 0), doneFiles);

  let failed = false;
  const worker = async () => {
    while (next < files.length && !failed) {
      if (signal.aborted) throw new Error("Đã huỷ");
      const i = next++;
      const { file, path } = files[i];
      for (let attempt = 1; ; attempt++) {
        try {
          await adminApi.uploadFile(
            trackId,
            path,
            file,
            contentTypeFor(path, file.type),
            (b) => {
              loaded[i] = b;
              report();
            },
            signal,
          );
          loaded[i] = file.size;
          doneFiles++;
          report();
          break;
        } catch (e) {
          if (signal.aborted) throw new Error("Đã huỷ");
          loaded[i] = 0;
          report();
          if (failed) return; // luồng khác đã hỏng hẳn — dừng
          if (attempt >= attempts) {
            failed = true;
            throw new Error(`Tệp ${path}: ${e instanceof Error ? e.message : e}`);
          }
          await sleep(500 * attempt);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
