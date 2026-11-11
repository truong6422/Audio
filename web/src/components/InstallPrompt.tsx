// Lời mời "Thêm vào màn hình chính" kín đáo: chỉ sau khi đã nghe ≥ 2 bài, không che popup / thẻ khác, ẩn được 3 tuần.
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { dismissInstall, promptInstall, useInstallMode } from "../lib/pwa";
import { usePlayer } from "../player/PlayerContext";
import { useSite } from "../site";
import { BrandMark, IconDownload, IconShareIOS, IconX } from "./Icons";

export function InstallPrompt() {
  const mode = useInstallMode();
  const site = useSite();
  const loc = useLocation();
  const { gate, resumeOffer, upNext } = usePlayer();
  const [showIos, setShowIos] = useState(false);
  const busy = gate.open || gate.dismissed || !!resumeOffer || !!upNext;
  if (!mode || busy || loc.pathname.startsWith("/admin")) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(var(--player-h) + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div
        role="dialog"
        aria-label="Thêm vào màn hình chính"
        className="pop-in pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-surface/95 p-2 pl-3 shadow-[var(--shadow)] backdrop-blur"
      >
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <p className="min-w-0 flex-1 text-sm leading-snug text-text">
            Thêm {site.brandName} vào màn hình chính để mở nhanh mỗi đêm.
          </p>
          {mode === "android" ? (
            <button type="button" className="btn btn-primary min-h-10 shrink-0 px-3.5 text-sm" onClick={() => void promptInstall()}>
              <IconDownload size={16} /> Thêm
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary min-h-10 shrink-0 px-3.5 text-sm"
              onClick={() => setShowIos((v) => !v)}
              aria-expanded={showIos}
            >
              Cách thêm
            </button>
          )}
          <button type="button" className="icon-btn h-10 w-10 shrink-0" onClick={dismissInstall} aria-label="Để sau">
            <IconX size={16} />
          </button>
        </div>
        {mode === "ios" && showIos && (
          <ol className="mt-2 space-y-1.5 border-t border-border px-1 pb-1 pt-2 text-sm text-text">
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent">1</span>
              <span>
                Bấm nút Chia sẻ <IconShareIOS size={16} className="inline align-[-3px] text-accent" /> ở thanh dưới Safari
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent">2</span>
              <span>
                Chọn <strong>“Thêm vào MH chính”</strong> rồi bấm <strong>Thêm</strong>
              </span>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
