import { useEffect } from "react";
import { useSite } from "../site";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Cập nhật document.title + vài meta cơ bản khi đổi trang (máy chủ đã đặt bản đầu). */
export function useSeo(opts: { title?: string; description?: string; noindex?: boolean; image?: string | null }) {
  const site = useSite();
  const { title, description, noindex, image } = opts;
  useEffect(() => {
    const brand = site.brandName;
    const full = !title ? site.siteTitle || `${brand} — ${site.tagline}` : title.includes(brand) ? title : `${title} — ${brand}`;
    document.title = full;
    setMeta("property", "og:title", full);
    if (description) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
    }
    if (image) setMeta("property", "og:image", image);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const url = location.origin + location.pathname;
    if (canonical) canonical.href = url;
    setMeta("property", "og:url", url);
  }, [title, description, noindex, image, site.brandName, site.siteTitle, site.tagline]);
}
