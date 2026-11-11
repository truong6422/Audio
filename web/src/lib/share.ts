// Chia sẻ link truyện (đúng giây) — navigator.share, dự phòng sao chép.
import type { Track } from "@shared/types";
import { trackEvent } from "./events";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Link đầy đủ /track/<slug>?t=<giây>&utm_source=share (t chỉ gắn khi > 5 giây). */
export function trackShareUrl(track: Pick<Track, "slug">, atSec?: number): string {
  const u = new URL(`/track/${encodeURIComponent(track.slug)}`, location.origin);
  const t = Math.floor(atSec ?? 0);
  if (t > 5) u.searchParams.set("t", String(t));
  u.searchParams.set("utm_source", "share");
  return u.toString();
}

/** Link ngắn /s/<mã> (máy chủ chuyển 302 tới trang truyện, giữ utm). */
export function shortUrl(track: Pick<Track, "code">): string | null {
  if (!track.code || !Number.isFinite(track.code)) return null;
  return `${location.origin}/s/${track.code}`;
}

export const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** Trả "shared" | "copied" | "cancel" | "fail". */
export async function shareTrack(track: Track, atSec?: number): Promise<"shared" | "copied" | "cancel" | "fail"> {
  const url = trackShareUrl(track, atSec);
  if (canNativeShare()) {
    try {
      await navigator.share({ title: track.title, text: `Nghe “${track.title}”`, url });
      trackEvent("share", { trackId: track.id });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancel";
      // rơi xuống sao chép
    }
  }
  if (await copyText(url)) {
    trackEvent("share", { trackId: track.id });
    return "copied";
  }
  return "fail";
}
