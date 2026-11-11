import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { trackEvent } from "../lib/events";
import { useTheme } from "../lib/theme";
import { STATIC_PAGES } from "../pages/StaticPage";
import { GateModal, GateReminder } from "../player/GateModal";
import { PlayerBar } from "../player/PlayerBar";
import { ResumeToast } from "../player/ResumeToast";
import { useSite } from "../site";
import { BrandMark, IconHistory, IconLogout, IconMoon, IconSearch, IconSettings, IconSun, IconUser } from "./Icons";
import { InstallPrompt } from "./InstallPrompt";
import { Popover } from "./Popover";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
    >
      {theme === "dark" ? <IconSun size={19} /> : <IconMoon size={19} />}
    </button>
  );
}

function AccountMenu() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  if (!ready) return <span className="skeleton h-10 w-10 rounded-full" aria-hidden="true" />;
  if (!user) {
    const next = loc.pathname === "/" ? "" : `?next=${encodeURIComponent(loc.pathname + loc.search)}`;
    return (
      <Link to={`/login${next}`} className="btn btn-ghost min-h-10 px-4 text-sm">
        Đăng nhập
      </Link>
    );
  }
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  return (
    <Popover
      label="Tài khoản"
      placement="down"
      align="end"
      buttonClassName="grid h-10 w-10 place-items-center rounded-full bg-accent/15 font-semibold text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/25"
      button={() => initial || <IconUser size={18} />}
    >
      {(close) => (
        <div className="-m-1">
          <div className="border-b border-border px-2 pb-3">
            <p className="truncate text-sm font-semibold text-text">{user.name || "Người nghe"}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <nav className="mt-2 flex flex-col">
            <Link to="/history" onClick={close} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-text/6">
              <IconHistory size={18} /> Lịch sử nghe
            </Link>
            {user.isAdmin && (
              <Link to="/admin" onClick={close} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm text-accent hover:bg-text/6">
                <IconSettings size={18} /> Quản trị
              </Link>
            )}
            <button
              type="button"
              onClick={async () => {
                close();
                await logout();
                navigate("/");
              }}
              className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-text/6"
            >
              <IconLogout size={18} /> Đăng xuất
            </button>
          </nav>
        </div>
      )}
    </Popover>
  );
}

function Header() {
  const site = useSite();
  const { user } = useAuth();
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${isActive ? "bg-text/8 text-text" : "text-muted hover:text-text"}`;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/75 backdrop-blur-xl">
      <div className="wrap flex h-16 items-center gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${site.brandName} — Trang chủ`}>
          <BrandMark size={32} />
          <span className="truncate font-display text-lg font-bold tracking-tight text-text">{site.brandName}</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
          <NavLink to="/" end className={navCls}>
            Khám phá
          </NavLink>
          <NavLink to="/tim-kiem" className={navCls}>
            Tìm kiếm
          </NavLink>
          {user && (
            <NavLink to="/history" className={navCls}>
              Lịch sử
            </NavLink>
          )}
          {user?.isAdmin && (
            <Link to="/admin" className="inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium text-accent hover:bg-accent/10">
              Quản trị
            </Link>
          )}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link to="/tim-kiem" className="icon-btn md:hidden" aria-label="Tìm truyện">
            <IconSearch size={19} />
          </Link>
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const site = useSite();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="wrap py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <BrandMark size={28} />
              <span className="font-display text-base font-bold">{site.brandName}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{site.tagline}</p>
          </div>
          <nav aria-label="Thông tin" className="grid grid-cols-2 gap-x-6 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-5">
            {STATIC_PAGES.map((p) => (
              <Link key={p.slug} to={`/${p.slug}`} className="inline-flex min-h-10 items-center text-sm text-muted hover:text-text">
                {p.title}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-6 text-xs text-muted">
          © {new Date().getFullYear()} {site.brandName}. Nghe miễn phí, không cần tài khoản.
        </p>
      </div>
    </footer>
  );
}

export function Layout() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    // Lượt xem trang (trang truyện tự gửi kèm trackId khi tải xong).
    if (!loc.pathname.startsWith("/track/")) trackEvent("view");
  }, [loc.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Bỏ qua tới nội dung
      </a>
      <Header />
      <main id="main" key={loc.pathname} className="page-enter flex-1">
        <Outlet />
      </main>
      <Footer />
      <ResumeToast />
      <GateReminder />
      <InstallPrompt />
      <PlayerBar />
      <GateModal />
    </div>
  );
}
