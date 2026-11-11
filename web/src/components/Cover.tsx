import { useState } from "react";
import { BrandMark } from "./Icons";

/** Ảnh bìa tỉ lệ cố định, nạp lười; không có ảnh / lỗi → nền chuyển màu + ký hiệu. */
export function Cover({
  src,
  alt = "",
  className = "",
  rounded = "rounded-2xl",
  eager = false,
  markSize = 36,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  rounded?: string;
  eager?: boolean;
  markSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const show = src && !failed;
  return (
    <div className={`relative aspect-square overflow-hidden bg-surface-2 ${rounded} ${className}`}>
      {!show || !loaded ? (
        <div
          className="absolute inset-0 grid place-items-center"
          style={{
            background:
              "radial-gradient(120% 90% at 85% 10%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 60%), radial-gradient(100% 80% at 0% 100%, color-mix(in srgb, var(--accent-2) 40%, transparent), transparent 60%), var(--surface-2)",
          }}
          aria-hidden="true"
        >
          {!show && <BrandMark size={markSize} />}
        </div>
      ) : null}
      {show && (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
