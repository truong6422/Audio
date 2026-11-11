import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getAttribution } from "../lib/events";
import { session } from "../lib/storage";
import { useSite } from "../site";
import { BrandMark, IconCheck, IconCopy, IconExternal, IconMore } from "./Icons";

const STAY_KEY = "kd_inapp_stay";

const APPS: [RegExp, string][] = [
  [/Messenger|FBAN\/Messenger|MessengerLite/i, "Messenger"],
  [/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i, "Facebook"],
  [/Instagram/i, "Instagram"],
  [/Zalo/i, "Zalo"],
  [/Bytedance|musical_ly|TikTok|trill|BytedanceWebview/i, "TikTok"],
  [/\bLine\//i, "LINE"],
  [/MicroMessenger/i, "WeChat"],
  [/Snapchat/i, "Snapchat"],
];

export function detectInApp(ua = navigator.userAgent): string | null {
  for (const [re, name] of APPS) if (re.test(ua)) return name;
  return null;
}

const isIOS = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(navigator.userAgent);

async function copyText(text: string): Promise<boolean> {
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

/** Màn "Mở trong trình duyệt" cho trình duyệt nhúng trong app (Facebook, Zalo, TikTok…). */
export function InAppPrompt() {
  const site = useSite();
  const loc = useLocation();
  const [app] = useState(() => detectInApp());
  const [stay, setStay] = useState(() => session.get(STAY_KEY) === "1");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const visible = !!app && site.inAppBrowserPrompt && !stay && !loc.pathname.startsWith("/admin");

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    btnRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  if (!visible || !app) return null;

  // Giữ nguồn (utm_source) khi chuyển sang Chrome / Safari — ở đó không còn nhận diện được app.
  const url = (() => {
    const u = new URL(location.origin + loc.pathname + loc.search + loc.hash);
    const attr = getAttribution();
    if (!u.searchParams.get("utm_source") && attr.source && attr.source !== "khac") u.searchParams.set("utm_source", attr.source);
    if (!u.searchParams.get("utm_campaign") && attr.campaign) u.searchParams.set("utm_campaign", attr.campaign);
    return u.toString();
  })();
  const android = isAndroid() && app !== "TikTok" && !isIOS();
  const browser = isIOS() ? "Safari" : "Chrome";

  const openChrome = () => {
    const noScheme = url.replace(/^https?:\/\//, "");
    location.href = `intent://${noScheme}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  };

  const doCopy = async () => {
    const ok = await copyText(url);
    if (ok) setCopied(true);
    else inputRef.current?.select();
  };

  const stayHere = () => {
    session.set(STAY_KEY, "1");
    setStay(true);
  };

  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-overlay p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inapp-title"
        className="pop-in w-full max-w-[420px] rounded-3xl border border-border bg-surface p-6 text-center shadow-[var(--shadow)]"
      >
        <div className="mx-auto w-fit">
          <BrandMark size={52} />
        </div>
        <h2 id="inapp-title" className="mt-4 font-display text-xl font-bold text-text">
          Bạn đang mở trong {app}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Trình duyệt bên trong {app} hay ngắt âm thanh khi tắt màn hình. Mở bằng <strong className="text-text">{browser}</strong> để nghe{" "}
          {site.brandName} mượt và không bị gián đoạn.
        </p>

        {android ? (
          <button ref={btnRef} type="button" onClick={openChrome} className="btn btn-primary mt-5 w-full">
            <IconExternal size={18} />
            Mở bằng Chrome
          </button>
        ) : (
          <ol className="mt-5 space-y-2.5 text-left">
            <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">1</span>
              <span className="text-sm text-text">
                Bấm nút <span className="inline-flex translate-y-[3px] rounded-md border border-border px-1"><IconMore size={16} /></span> ở góc
                trên bên phải
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">2</span>
              <span className="text-sm text-text">
                Chọn <strong>“Mở bằng trình duyệt”</strong> {isIOS() ? "(Safari)" : ""}
              </span>
            </li>
          </ol>
        )}

        <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          hoặc sao chép liên kết
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex gap-2">
          <label className="sr-only" htmlFor="inapp-url">
            Liên kết trang đang xem
          </label>
          <input
            id="inapp-url"
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            onClick={doCopy}
            className="input min-h-11 flex-1 truncate font-mono text-xs"
          />
          <button
            ref={android ? undefined : btnRef}
            type="button"
            onClick={doCopy}
            className={`btn min-h-11 shrink-0 px-4 text-sm ${copied ? "btn-ghost text-success" : "btn-ghost"}`}
            aria-live="polite"
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? "Đã chép" : "Sao chép"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">Dán vào {browser} để mở đúng trang này.</p>

        <button type="button" onClick={stayHere} className="mt-5 min-h-11 text-sm text-muted underline underline-offset-4 hover:text-text">
          Vẫn tiếp tục ở đây
        </button>
      </div>
    </div>
  );
}
