// Danh sách thể loại: lấy từ cấu hình máy chủ chèn; trống thì hỏi GET /api/public/categories (một lần).
import { useEffect, useState } from "react";
import type { Category } from "@shared/types";
import { apiGet } from "../api";
import { useSite } from "../site";

let cache: Category[] | null = null;
let pending: Promise<Category[]> | null = null;

function fetchCategories(): Promise<Category[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= apiGet<Category[]>("/api/public/categories")
    .then((r) => (cache = Array.isArray(r) ? r.filter((c) => c && c.slug && c.name) : []))
    .catch(() => {
      pending = null;
      return [];
    });
  return pending;
}

/** { list, ready }: ready = đã biết chắc danh sách (để quyết định "không tìm thấy"). */
export function useCategories(): { list: Category[]; ready: boolean } {
  const site = useSite();
  const fromSite = site.categories ?? [];
  const [fetched, setFetched] = useState<Category[] | null>(cache);
  useEffect(() => {
    if (fromSite.length || fetched) return;
    let alive = true;
    fetchCategories().then((r) => alive && setFetched(r));
    return () => {
      alive = false;
    };
  }, [fromSite.length, fetched]);
  if (fromSite.length) return { list: fromSite, ready: true };
  return { list: fetched ?? [], ready: fetched !== null };
}

export const tagLabel = (tag: string) => tag.replace(/-/g, " ");
