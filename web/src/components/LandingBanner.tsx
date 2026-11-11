// Dải chào ngắn cho lần vào đầu từ link có UTM (clip TikTok / Facebook…). Không phải popup, đóng được.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Track } from "@shared/types";
import { apiGet } from "../api";
import { clearLanding, getLanding } from "../lib/events";
import { IconPlay, IconX } from "./Icons";

const SOURCE_NAMES: Record<string, string> = {
  tiktok: "TikTok",
  facebook: "Facebook",
  instagram: "Instagram",
  zalo: "Zalo",
  youtube: "YouTube",
  share: "link chia sẻ",
};

function useLandingHere() {
  const loc = useLocation();
  const [landing, setLanding] = useState(() => getLanding());
  const here = landing && landing.path === loc.pathname ? landing : null;
  const dismiss = () => {
    clearLanding();
    setLanding(null);
  };
  return { landing: here, dismiss };
}

function Strip({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      role="status"
      className="pop-in flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 py-2 pl-4 pr-1.5 text-sm text-text"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" className="icon-btn h-10 w-10 shrink-0" onClick={onClose} aria-label="Ẩn lời chào">
        <IconX size={16} />
      </button>
    </div>
  );
}

/** Trên trang truyện: "Đây đúng là truyện trong clip" + gợi ý bấm Nghe. */
export function TrackLandingBanner({ hidden, atSec }: { hidden?: boolean; atSec?: number }) {
  const { landing, dismiss } = useLandingHere();
  if (!landing || hidden) return null;
  const from = SOURCE_NAMES[landing.source];
  return (
    <Strip onClose={dismiss}>
      <p>
        {from ? <>Chào bạn đến từ {from}! </> : <>Chào bạn! </>}
        <strong className="font-semibold">Đây đúng là truyện trong clip</strong> — bấm{" "}
        <span className="font-semibold text-accent">{atSec ? "Nghe tiếp đoạn được chia sẻ" : "Nghe ngay"}</span> để nghe trọn, miễn phí.
      </p>
    </Strip>
  );
}

/** Trên trang chủ: utm_campaign = slug truyện → dẫn thẳng tới truyện đó. */
export function HomeLandingBanner() {
  const { landing, dismiss } = useLandingHere();
  const [track, setTrack] = useState<Track | null>(null);
  const slug = landing?.campaign ?? "";
  useEffect(() => {
    if (!slug) return;
    const ac = new AbortController();
    apiGet<{ track: Track }>(`/api/public/tracks/${encodeURIComponent(slug)}`, ac.signal)
      .then((r) => setTrack(r.track ?? null))
      .catch(() => {});
    return () => ac.abort();
  }, [slug]);
  if (!landing || !track) return null;
  return (
    <Strip onClose={dismiss}>
      <Link to={`/track/${track.slug}`} onClick={dismiss} className="flex min-h-10 items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <IconPlay size={14} className="translate-x-[1px]" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted">Truyện trong clip bạn vừa xem</span>
          <span className="block truncate font-semibold">{track.title}</span>
        </span>
      </Link>
    </Strip>
  );
}

