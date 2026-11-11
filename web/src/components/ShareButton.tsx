import { useEffect, useState } from "react";
import type { Track } from "@shared/types";
import { trackEvent } from "../lib/events";
import { fmtTime } from "../lib/format";
import { canNativeShare, copyText, shareTrack, shortUrl, trackShareUrl } from "../lib/share";
import { usePlayer, usePlayerTime } from "../player/PlayerContext";
import { IconCheck, IconLink, IconShare } from "./Icons";
import { Popover } from "./Popover";

type Status = { kind: "ok" | "err"; text: string } | null;

function SharePanel({ track, close }: { track: Track; close: () => void }) {
  const { current } = usePlayer();
  const { currentTime } = usePlayerTime();
  const [status, setStatus] = useState<Status>(null);
  const isCurrent = current?.id === track.id;
  const at = isCurrent && currentTime > 5 ? Math.floor(currentTime) : 0;
  const short = shortUrl(track);
  const native = canNativeShare();

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 2500);
    return () => window.clearTimeout(id);
  }, [status]);

  const doShare = async (sec: number) => {
    const r = await shareTrack(track, sec);
    if (r === "shared") close();
    else if (r === "copied") setStatus({ kind: "ok", text: "Đã sao chép liên kết" });
    else if (r === "fail") setStatus({ kind: "err", text: "Không sao chép được — giữ lâu để chép tay." });
  };

  const copyShort = async () => {
    if (!short) return;
    if (await copyText(`${short}?utm_source=share`)) {
      trackEvent("share", { trackId: track.id });
      setStatus({ kind: "ok", text: "Đã sao chép link ngắn" });
    } else setStatus({ kind: "err", text: "Không sao chép được." });
  };

  const item = "flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm text-text hover:bg-text/6";
  return (
    <div className="-m-1">
      {at > 0 && (
        <button type="button" className={item} onClick={() => doShare(at)}>
          <IconShare size={18} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            {native ? "Chia sẻ đoạn đang nghe" : "Sao chép link đoạn đang nghe"}
            <span className="block font-mono text-xs text-muted">bắt đầu từ {fmtTime(at)}</span>
          </span>
        </button>
      )}
      <button type="button" className={item} onClick={() => doShare(0)}>
        <IconShare size={18} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">{native ? "Chia sẻ truyện" : "Sao chép link truyện"}</span>
      </button>
      {short && (
        <button type="button" className={item} onClick={copyShort}>
          <IconLink size={18} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            Sao chép link ngắn
            <span className="block truncate font-mono text-xs text-muted">{short.replace(/^https?:\/\//, "")}</span>
          </span>
        </button>
      )}
      <p
        className={`mt-1 min-h-5 px-2 text-xs ${status?.kind === "err" ? "text-danger" : "text-success"}`}
        role="status"
        aria-live="polite"
      >
        {status && (
          <>
            {status.kind === "ok" && <IconCheck size={13} className="mr-1 inline align-[-2px]" />}
            {status.text}
          </>
        )}
      </p>
      {status?.kind === "err" && (
        <input
          readOnly
          value={trackShareUrl(track, at)}
          onFocus={(e) => e.currentTarget.select()}
          className="input mt-1 min-h-10 font-mono text-xs"
          aria-label="Liên kết để chép tay"
        />
      )}
    </div>
  );
}

export function ShareButton({
  track,
  placement = "down",
  align = "start",
  compact = false,
}: {
  track: Track;
  placement?: "up" | "down";
  align?: "start" | "center" | "end";
  compact?: boolean;
}) {
  return (
    <Popover
      label="Chia sẻ"
      title="Chia sẻ"
      placement={placement}
      align={align}
      buttonClassName={
        compact
          ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-sm text-text transition-colors hover:bg-text/8"
          : "btn btn-ghost"
      }
      button={() => (
        <>
          <IconShare size={18} />
          {!compact && <span>Chia sẻ</span>}
        </>
      )}
    >
      {(close) => <SharePanel track={track} close={close} />}
    </Popover>
  );
}
