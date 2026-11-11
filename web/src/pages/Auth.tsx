import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { BrandMark, IconChevronLeft } from "../components/Icons";
import { useSeo } from "../lib/seo";
import { useSite } from "../site";

/** Chỉ cho phép đường dẫn nội bộ (chống chuyển hướng mở). */
function safeNext(v: string | null): string | null {
  if (!v || !v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const site = useSite();
  return (
    <div className="flex min-h-dvh flex-col px-4 py-6">
      <Link to="/" className="inline-flex min-h-10 w-fit items-center gap-1 rounded-full pr-3 text-sm text-muted hover:text-text">
        <IconChevronLeft size={18} /> {site.brandName}
      </Link>
      <main className="page-enter flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandMark size={48} />
            <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
          <div className="panel p-5 shadow-[var(--shadow)] sm:p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

function Field(props: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={props.id} className="mb-1.5 block text-sm font-medium text-text">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? "text"}
        className="input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required={props.required}
        minLength={props.minLength}
        autoFocus={props.autoFocus}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
      />
      {props.hint && (
        <p id={`${props.id}-hint`} className="mt-1 text-xs text-muted">
          {props.hint}
        </p>
      )}
    </div>
  );
}

function FormError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {msg}
    </p>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useSeo({ title: "Đăng nhập", noindex: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const u = await login(email.trim(), password);
      navigate(next ?? (u.isAdmin ? "/admin" : "/"), { replace: true });
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Chào mừng trở lại" subtitle="Đăng nhập để đồng bộ chỗ nghe dở giữa các thiết bị.">
      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        <FormError msg={err} />
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required autoFocus />
        <Field id="password" label="Mật khẩu" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Chưa có tài khoản?{" "}
        <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent hover:underline">
          Đăng ký miễn phí
        </Link>
      </p>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useSeo({ title: "Đăng ký", noindex: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setErr("Mật khẩu cần ít nhất 8 ký tự.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const u = await register({ email: email.trim(), password, name: name.trim(), setupToken: setupToken.trim() || undefined });
      navigate(u.isAdmin ? "/admin" : (next ?? "/"), { replace: true });
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Tạo tài khoản" subtitle="Không bắt buộc — chỉ để lưu lịch sử và chỗ nghe dở.">
      <form onSubmit={submit} className="space-y-4">
        <FormError msg={err} />
        <Field id="name" label="Tên hiển thị (không bắt buộc)" value={name} onChange={setName} autoComplete="nickname" autoFocus />
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <Field
          id="password"
          label="Mật khẩu"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          minLength={8}
          hint="Ít nhất 8 ký tự."
        />
        {showToken && (
          <Field
            id="setupToken"
            label="Mã thiết lập quản trị"
            value={setupToken}
            onChange={setSetupToken}
            autoComplete="off"
            hint="Chỉ dùng khi tạo tài khoản quản trị đầu tiên."
          />
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Đang tạo tài khoản…" : "Đăng ký"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Đã có tài khoản?{" "}
        <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent hover:underline">
          Đăng nhập
        </Link>
      </p>
      {!showToken && (
        <p className="mt-3 text-center">
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => setShowToken(true)}>
            Có mã thiết lập?
          </button>
        </p>
      )}
    </Shell>
  );
}
