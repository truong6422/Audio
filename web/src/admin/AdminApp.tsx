// Trang quản trị — nạp lười ở route /admin/*. Tự chứa route con (tương đối).
import { Suspense, lazy, useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "@shared/types";
import { adminApi, errMsg } from "./adminApi";
import FunnelPage from "./FunnelPage";
import LibraryPage from "./LibraryPage";
import LockPage from "./LockPage";
import OverviewPage from "./OverviewPage";
import SettingsPage from "./SettingsPage";
import { Button, ErrorBox, Loading, ToastProvider, cx } from "./ui";

const TABS = [
  { to: "/admin", label: "Tổng quan", end: true },
  { to: "/admin/library", label: "Thư viện", end: false },
  { to: "/admin/lock", label: "Khoá audio", end: false },
  { to: "/admin/funnel", label: "Thống kê phễu", end: false },
  { to: "/admin/writer", label: "Viết kịch bản", end: false },
  { to: "/admin/studio", label: "Xưởng audio", end: false },
  { to: "/admin/settings", label: "Cài đặt & mã chèn", end: false },
];

/* Mục do agent khác làm: nạp lười qua import.meta.glob (đường dẫn tĩnh). Tệp chưa có → glob rỗng → "Đang phát triển",
   build không vỡ. Tệp có nhưng nạp lỗi → cũng hiện "Đang phát triển" kèm lỗi. */
type PageModule = { default: ComponentType };
const optionalPages = import.meta.glob<PageModule>(["./writer/WriterPage.tsx", "./studio/StudioPage.tsx"]);
function optionalPage(path: string, title: string) {
  return lazy(async (): Promise<PageModule> => {
    const loader = optionalPages[path];
    if (!loader) return { default: () => <InProgress title={title} /> };
    try {
      const mod = await loader();
      if (!mod.default) throw new Error("Thiếu export default");
      return mod;
    } catch (e) {
      return { default: () => <InProgress title={title} detail={errMsg(e)} /> };
    }
  });
}
const WriterPage = optionalPage("./writer/WriterPage.tsx", "Viết kịch bản");
const StudioPage = optionalPage("./studio/StudioPage.tsx", "Xưởng audio");

function Lazy({ C }: { C: ComponentType }) {
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  );
}

function InProgress({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-10 text-center">
      <h2 className="mb-1 text-base font-semibold text-[var(--text)]">{title}</h2>
      <p className="text-sm text-[var(--muted)]">Đang phát triển — mục này sẽ sớm có mặt.</p>
      {detail && <p className="mt-2 break-words text-xs text-[var(--danger)]">{detail}</p>}
    </div>
  );
}

type Gate = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; user: User | null };

export default function AdminApp() {
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const location = useLocation();

  const check = useCallback(async () => {
    setGate({ state: "loading" });
    try {
      const { user } = await adminApi.me();
      setGate({ state: "ok", user });
    } catch (e) {
      setGate({ state: "error", message: errMsg(e) });
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Quản trị";
    return () => {
      document.title = prev;
    };
  }, []);

  if (gate.state === "loading")
    return (
      <Shell>
        <Loading text="Đang kiểm tra đăng nhập…" />
      </Shell>
    );
  if (gate.state === "error")
    return (
      <Shell>
        <div className="mx-auto max-w-md py-10">
          <ErrorBox message={gate.message} onRetry={check} />
        </div>
      </Shell>
    );
  if (!gate.user)
    return (
      <Shell>
        <Notice title="Cần đăng nhập" text="Đăng nhập bằng tài khoản quản trị để vào trang này.">
          <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-5 text-sm font-medium text-[var(--on-accent)]">
            Đăng nhập
          </Link>
        </Notice>
      </Shell>
    );
  if (!gate.user.isAdmin)
    return (
      <Shell>
        <Notice title="Không có quyền" text={`Tài khoản ${gate.user.email} không phải quản trị viên.`}>
          <Link to="/" className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-5 text-sm text-[var(--text)]">
            Về trang chủ
          </Link>
        </Notice>
      </Shell>
    );

  const user = gate.user;
  return (
    <ToastProvider>
      <Shell>
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-[var(--text)]">Quản trị</h1>
            <p className="truncate text-xs text-[var(--muted)]">{user.name || user.email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/" className="inline-flex h-10 items-center rounded-lg px-3 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              Xem trang
            </Link>
            <Button small kind="ghost" onClick={logout}>
              Đăng xuất
            </Button>
          </div>
        </header>
        <nav className="-mx-4 mb-4 no-scrollbar overflow-x-auto border-b border-[var(--border)] px-4">
          <div className="flex min-w-max gap-1">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cx(
                    "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition",
                    isActive ? "border-[var(--accent)] font-medium text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]",
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="lock" element={<LockPage />} />
          <Route path="funnel" element={<FunnelPage />} />
          <Route path="writer/*" element={<Lazy C={WriterPage} />} />
          <Route path="studio/*" element={<Lazy C={StudioPage} />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Shell>
    </ToastProvider>
  );
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } finally {
    window.location.href = "/";
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">{children}</div>
    </div>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
      <h1 className="mb-2 text-lg font-semibold">{title}</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">{text}</p>
      {children}
    </div>
  );
}
