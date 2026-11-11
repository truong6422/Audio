import { IconX } from "../components/Icons";
import { fmtTime } from "../lib/format";
import { usePlayer } from "./PlayerContext";

/** "Nghe tiếp từ mm:ss?" khi mở lại một bài đã nghe dở. */
export function ResumeToast() {
  const { resumeOffer, current, acceptResume, declineResume, gate } = usePlayer();
  if (!resumeOffer || !current || current.id !== resumeOffer.trackId || gate.open || gate.dismissed) return null;
  return (
    <div
      className="pop-in fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(var(--player-h) + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div
        role="alertdialog"
        aria-label="Nghe tiếp"
        className="flex max-w-full items-center gap-2 rounded-2xl border border-border bg-surface/95 py-1.5 pl-4 pr-1.5 shadow-[var(--shadow)] backdrop-blur"
      >
        <span className="text-sm text-text">
          Nghe tiếp từ <span className="font-mono font-semibold text-accent">{fmtTime(resumeOffer.position)}</span>?
        </span>
        <button type="button" className="btn btn-primary min-h-10 px-4 text-sm" onClick={acceptResume}>
          Nghe tiếp
        </button>
        <button type="button" className="icon-btn h-10 w-10" onClick={declineResume} aria-label="Nghe từ đầu">
          <IconX size={16} />
        </button>
      </div>
    </div>
  );
}
