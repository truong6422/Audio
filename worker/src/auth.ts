// Phiên cookie "sid" (httpOnly, SameSite=Lax, Secure trừ localhost) + đăng ký / đăng nhập / đăng xuất.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import { toUser, type UserRow } from "./data";
import {
  HttpError,
  bad,
  constantTimeEqualStr,
  hashPassword,
  isLocalHost,
  nowSec,
  randomToken,
  readJson,
  sha256Hex,
  str,
  verifyPassword,
} from "./lib";

const COOKIE = "sid";
const SESSION_TTL = 30 * 24 * 3600;
const RENEW_BEFORE = 15 * 24 * 3600;

function writeCookie(c: Context<AppEnv>, sid: string) {
  setCookie(c, COOKIE, sid, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !isLocalHost(c.req.url),
    path: "/",
    maxAge: SESSION_TTL,
  });
}

async function startSession(c: Context<AppEnv>, userId: string) {
  const sid = randomToken(32);
  const t = nowSec();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(userId, t),
    c.env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(
      await sha256Hex(sid),
      userId,
      t,
      t + SESSION_TTL,
    ),
  ]);
  writeCookie(c, sid);
}

/** Nạp người dùng từ cookie vào c.var.user (null nếu chưa đăng nhập). Tự gia hạn phiên sắp hết. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  const sid = getCookie(c, COOKIE);
  if (sid && sid.length <= 100) {
    const id = await sha256Hex(sid);
    const t = nowSec();
    const row = await c.env.DB.prepare(
      "SELECT u.id, u.email, u.name, u.is_admin, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?",
    )
      .bind(id, t)
      .first<Pick<UserRow, "id" | "email" | "name" | "is_admin"> & { expires_at: number }>();
    if (row) {
      c.set("user", toUser(row));
      if (row.expires_at - t < RENEW_BEFORE) {
        await c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(t + SESSION_TTL, id).run();
        writeCookie(c, sid);
      }
    }
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw new HttpError(401, "Bạn cần đăng nhập");
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = c.get("user");
  if (!u) throw new HttpError(401, "Bạn cần đăng nhập");
  if (!u.isAdmin) throw new HttpError(403, "Chỉ quản trị viên được dùng chức năng này");
  await next();
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/me", (c) => c.json({ user: c.get("user") }));

authRoutes.post("/register", async (c) => {
  const body = await readJson(c.req.raw);
  const email = str(body.email, "Email", { min: 1, max: 200 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad("Email không hợp lệ");
  if (typeof body.password !== "string") throw bad("Thiếu mật khẩu");
  const password = body.password;
  if (password.length < 8) throw bad("Mật khẩu phải có ít nhất 8 ký tự");
  if (password.length > 200) throw bad("Mật khẩu quá dài");
  const name = str(body.name, "Tên hiển thị", { max: 80 }) || email.split("@")[0]!;

  let isAdmin = false;
  if (body.setupToken !== undefined && body.setupToken !== null && body.setupToken !== "") {
    const token = str(body.setupToken, "Mã thiết lập", { max: 500 });
    const expected = c.env.SETUP_TOKEN ?? "";
    if (!expected || !constantTimeEqualStr(token, expected)) throw new HttpError(403, "Mã thiết lập không đúng");
    const hasAdmin = await c.env.DB.prepare("SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1").first();
    if (hasAdmin) throw new HttpError(403, "Đã có quản trị viên, không dùng mã thiết lập được nữa");
    isAdmin = true;
  }

  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new HttpError(409, "Email này đã được đăng ký");

  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(id, email, name, await hashPassword(password), isAdmin ? 1 : 0, nowSec())
      .run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) throw new HttpError(409, "Email này đã được đăng ký");
    throw e;
  }
  await startSession(c, id);
  return c.json({ user: { id, email, name, isAdmin } });
});

authRoutes.post("/login", async (c) => {
  const body = await readJson(c.req.raw);
  const email = str(body.email, "Email", { min: 1, max: 200 }).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 200) throw bad("Thiếu mật khẩu");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  // Băm cả khi không có tài khoản để thời gian phản hồi tương đương.
  const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
  if (!row || !ok) throw new HttpError(401, "Email hoặc mật khẩu không đúng");
  await startSession(c, row.id);
  return c.json({ user: toUser(row) });
});

authRoutes.post("/logout", async (c) => {
  const sid = getCookie(c, COOKIE);
  if (sid && sid.length <= 100) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(sid)).run();
  deleteCookie(c, COOKIE, { path: "/", secure: !isLocalHost(c.req.url), httpOnly: true, sameSite: "Lax" });
  return c.json({ ok: true });
});
