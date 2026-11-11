// Kiểm thử tích hợp API worker qua `wrangler dev` cục bộ (D1 + R2 --local trong tests/.state).
// Chạy: node --test tests/   (cổng mặc định 8788, đổi bằng TEST_PORT)
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startServer } from "./helpers/server.mjs";

const SETUP_TOKEN = "tok-kiem-thu-" + Math.random().toString(36).slice(2);
let srv;
let BASE;

/** Một "trình duyệt" giữ cookie sid. */
class Client {
  constructor() {
    this.cookies = new Map();
  }
  async req(method, path, { json, body, headers = {} } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload = body;
    if (json !== undefined) {
      h["content-type"] = "application/json";
      payload = JSON.stringify(json);
    }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(sc)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    return res;
  }
  async j(method, path, opts) {
    const res = await this.req(method, path, opts);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, res };
  }
}

const anon = new Client();
const admin = new Client();
const user = new Client();

const ADMIN = { email: "quantri@test.vn", password: "matkhau-quantri-1", name: "Quản trị" };
const USER = { email: "nguoinghe@test.vn", password: "matkhau-nguoinghe-1", name: "Người nghe" };
const TITLE = "Mẹ chồng nàng dâu";
const AUDIO = new Uint8Array(1024).map((_, i) => i % 256);

const st = {}; // trạng thái chia sẻ giữa các ca (chạy tuần tự)

before(async () => {
  srv = await startServer({ setupToken: SETUP_TOKEN });
  BASE = srv.base;
}, { timeout: 180_000 });

after(async () => {
  await srv?.stop();
});

describe("tài khoản", () => {
  test("đăng ký bằng setupToken đúng → admin, có cookie sid httpOnly", async () => {
    const r = await admin.j("POST", "/api/auth/register", { json: { ...ADMIN, setupToken: SETUP_TOKEN } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.user.isAdmin, true);
    assert.equal(r.data.user.email, ADMIN.email);
    const sc = r.res.headers.getSetCookie().find((c) => c.startsWith("sid="));
    assert.ok(sc, "thiếu cookie sid");
    assert.match(sc, /HttpOnly/i);
    assert.match(sc, /SameSite=Lax/i);
  });

  test("setupToken sai → 403, không tạo tài khoản", async () => {
    const r = await anon.j("POST", "/api/auth/register", { json: { email: "sai@test.vn", password: "12345678", setupToken: "sai" } });
    assert.equal(r.status, 403);
    assert.ok(r.data.error);
    const l = await new Client().j("POST", "/api/auth/login", { json: { email: "sai@test.vn", password: "12345678" } });
    assert.equal(l.status, 401);
  });

  test("đã có admin thì setupToken đúng cũng không tạo admin thứ hai", async () => {
    const r = await new Client().j("POST", "/api/auth/register", { json: { email: "admin2@test.vn", password: "12345678", setupToken: SETUP_TOKEN } });
    assert.equal(r.status, 403);
  });

  test("đăng ký thường không thành admin", async () => {
    const r = await user.j("POST", "/api/auth/register", { json: USER });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.user.isAdmin, false);
  });

  test("đăng ký trùng email (khác hoa thường) → 409", async () => {
    const r = await new Client().j("POST", "/api/auth/register", { json: { ...USER, email: USER.email.toUpperCase() } });
    assert.equal(r.status, 409);
  });

  test("đăng ký mật khẩu < 8 ký tự / email sai → 400", async () => {
    assert.equal((await new Client().j("POST", "/api/auth/register", { json: { email: "x@test.vn", password: "1234567" } })).status, 400);
    assert.equal((await new Client().j("POST", "/api/auth/register", { json: { email: "khong-phai-email", password: "12345678" } })).status, 400);
  });

  test("đăng nhập sai mật khẩu / email không tồn tại → 401", async () => {
    const c = new Client();
    const a = await c.j("POST", "/api/auth/login", { json: { email: USER.email, password: "sai-mat-khau" } });
    assert.equal(a.status, 401);
    assert.ok(a.data.error);
    const b = await c.j("POST", "/api/auth/login", { json: { email: "khongco@test.vn", password: "12345678" } });
    assert.equal(b.status, 401);
    assert.equal(c.cookies.size, 0, "đăng nhập sai không được đặt cookie");
  });

  test("đăng nhập đúng → /auth/me trả user; đăng xuất → null", async () => {
    const c = new Client();
    const l = await c.j("POST", "/api/auth/login", { json: { email: USER.email, password: USER.password } });
    assert.equal(l.status, 200);
    const me = await c.j("GET", "/api/auth/me");
    assert.equal(me.data.user.email, USER.email);
    assert.equal(me.data.user.isAdmin, false);
    const o = await c.j("POST", "/api/auth/logout");
    assert.equal(o.status, 200);
    assert.deepEqual(o.data, { ok: true });
    assert.equal((await c.j("GET", "/api/auth/me")).data.user, null);
  });

  test("/auth/me: khách → null; admin → isAdmin", async () => {
    assert.deepEqual((await anon.j("GET", "/api/auth/me")).data, { user: null });
    const me = await admin.j("GET", "/api/auth/me");
    assert.equal(me.data.user.isAdmin, true);
    assert.equal(me.data.user.email, ADMIN.email);
  });

  test("cookie sid giả → coi như khách", async () => {
    const c = new Client();
    c.cookies.set("sid", "gia-mao-123");
    assert.equal((await c.j("GET", "/api/auth/me")).data.user, null);
  });
});

describe("phân quyền /api/admin/*", () => {
  const ROUTES = [
    ["GET", "/api/admin/tracks"],
    ["POST", "/api/admin/tracks", { title: "x", format: "file" }],
    ["PATCH", "/api/admin/tracks/khong-co", { title: "y" }],
    ["DELETE", "/api/admin/tracks/khong-co"],
    ["PUT", "/api/admin/upload/khong-co/audio.mp3", "raw"],
    ["POST", "/api/admin/tracks/khong-co/complete", { durationSeconds: 1, entry: "audio.mp3" }],
    ["POST", "/api/admin/assets", "img"],
    ["GET", "/api/admin/settings"],
    ["PUT", "/api/admin/settings", { tagline: "hack" }],
    ["GET", "/api/admin/stats"],
    ["GET", "/api/settings"],
    ["PUT", "/api/settings", { tagline: "hack" }],
  ];
  const call = (c, [m, p, b]) =>
    c.j(m, p, b === "raw" ? { body: AUDIO } : b === "img" ? { body: AUDIO, headers: { "content-type": "image/png" } } : b ? { json: b } : {});

  for (const r of ROUTES) {
    test(`${r[0]} ${r[1]}: khách 401, người thường 403`, async () => {
      const a = await call(anon, r);
      assert.equal(a.status, 401, `khách: ${JSON.stringify(a.data)}`);
      const u = await call(user, r);
      assert.equal(u.status, 403, `người thường: ${JSON.stringify(u.data)}`);
    });
  }

  test("cài đặt không bị đổi bởi các lời gọi trái phép", async () => {
    const s = await admin.j("GET", "/api/admin/settings");
    assert.notEqual(s.data.tagline, "hack");
  });

  test("ghi từ nguồn khác (Origin lạ) → 403", async () => {
    const r = await admin.j("POST", "/api/admin/tracks", { json: { title: "csrf", format: "file" }, headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });
});

describe("track: tạo → upload → complete → công khai", () => {
  test("tạo track → 201, processing, slug bỏ dấu", async () => {
    const r = await admin.j("POST", "/api/admin/tracks", { json: { title: TITLE, description: "Truyện gia đình", format: "file", episodeCount: 3 } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const t = r.data.track;
    assert.equal(t.status, "processing");
    assert.equal(t.slug, "me-chong-nang-dau");
    assert.equal(t.episodeCount, 3);
    assert.equal(t.playCount, 0);
    st.track = t;
  });

  test("track processing chưa hiện công khai, không phát được", async () => {
    const list = await anon.j("GET", "/api/public/tracks");
    assert.ok(!list.data.items.some((x) => x.id === st.track.id));
    assert.equal((await anon.j("GET", `/api/public/tracks/${st.track.slug}`)).status, 404);
    assert.equal((await anon.j("GET", `/api/playback/${st.track.id}`)).status, 404);
    const adm = await admin.j("GET", "/api/admin/tracks");
    assert.ok(adm.data.items.some((x) => x.id === st.track.id), "admin phải thấy mọi trạng thái");
  });

  test("tạo track sai định dạng / thiếu tên → 400", async () => {
    assert.equal((await admin.j("POST", "/api/admin/tracks", { json: { title: "x", format: "wav" } })).status, 400);
    assert.equal((await admin.j("POST", "/api/admin/tracks", { json: { title: "  ", format: "file" } })).status, 400);
  });

  test('upload chặn ".." (mã hoá %2F) và "\\"', async () => {
    const id = st.track.id;
    for (const p of ["a%2F..%2Faudio.mp3", "..%2F..%2Fassets%2Fx.mp3", "a%5C..%5Cx.mp3", "a%2F%2Fx.mp3"]) {
      const r = await admin.j("PUT", `/api/admin/upload/${id}/${p}`, { body: AUDIO });
      assert.equal(r.status, 400, `${p}: ${JSON.stringify(r.data)}`);
    }
  });

  test("upload chặn đuôi lạ", async () => {
    for (const p of ["virus.exe", "trang.html", "khongduoi", "x.mp3.js", "x.svg"]) {
      const r = await admin.j("PUT", `/api/admin/upload/${st.track.id}/${p}`, { body: AUDIO });
      assert.equal(r.status, 400, `${p}: ${JSON.stringify(r.data)}`);
    }
  });

  test("upload vào track không tồn tại → 404", async () => {
    const r = await admin.j("PUT", "/api/admin/upload/khong-ton-tai/audio.mp3", { body: AUDIO });
    assert.equal(r.status, 404);
  });

  test("complete trước khi có tệp → 400", async () => {
    const r = await admin.j("POST", `/api/admin/tracks/${st.track.id}/complete`, { json: { durationSeconds: 300, entry: "audio.mp3" } });
    assert.equal(r.status, 400);
  });

  test("upload hợp lệ → { key } đúng tiền tố", async () => {
    const r = await admin.j("PUT", `/api/admin/upload/${st.track.id}/audio.mp3`, { body: AUDIO, headers: { "content-type": "application/octet-stream" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.key, `tracks/${st.track.id}/audio.mp3`);
    const sub = await admin.j("PUT", `/api/admin/upload/${st.track.id}/sub/cover.jpg`, { body: AUDIO });
    assert.equal(sub.status, 200);
    assert.equal(sub.data.key, `tracks/${st.track.id}/sub/cover.jpg`);
  });

  test("complete: entry sai đuôi cho format file / có '..' → 400", async () => {
    const id = st.track.id;
    assert.equal((await admin.j("POST", `/api/admin/tracks/${id}/complete`, { json: { durationSeconds: 300, entry: "master.m3u8" } })).status, 400);
    assert.equal((await admin.j("POST", `/api/admin/tracks/${id}/complete`, { json: { durationSeconds: 300, entry: "../audio.mp3" } })).status, 400);
  });

  test("complete → ready, hiện trong /api/public/tracks và /public/tracks/:slug", async () => {
    const r = await admin.j("POST", `/api/admin/tracks/${st.track.id}/complete`, { json: { durationSeconds: 300, entry: "audio.mp3" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.track.status, "ready");
    assert.equal(r.data.track.durationSeconds, 300);
    const list = await anon.j("GET", "/api/public/tracks?page=1&pageSize=24&sort=new");
    assert.equal(list.status, 200);
    assert.ok(list.data.items.some((x) => x.id === st.track.id));
    assert.ok(list.data.total >= 1);
    assert.equal(list.data.page, 1);
    assert.equal(list.data.pageSize, 24);
    const one = await anon.j("GET", `/api/public/tracks/${st.track.slug}`);
    assert.equal(one.status, 200);
    assert.equal(one.data.track.id, st.track.id);
    assert.ok(Array.isArray(one.data.related));
    assert.ok(!one.data.related.some((x) => x.id === st.track.id), "related không chứa chính nó");
  });

  test("tạo track trùng tên → slug thêm -2, rồi -3", async () => {
    const a = await admin.j("POST", "/api/admin/tracks", { json: { title: TITLE, format: "hls" } });
    assert.equal(a.data.track.slug, "me-chong-nang-dau-2");
    const b = await admin.j("POST", "/api/admin/tracks", { json: { title: "MẸ CHỒNG — nàng dâu!", format: "hls" } });
    assert.equal(b.data.track.slug, "me-chong-nang-dau-3");
    st.dupIds = [a.data.track.id, b.data.track.id];
  });

  test("PATCH đổi tên → slug mới duy nhất; giữ nguyên tên thì giữ slug", async () => {
    const id = st.dupIds[1];
    const same = await admin.j("PATCH", `/api/admin/tracks/${id}`, { json: { title: "MẸ CHỒNG — nàng dâu!", description: "d" } });
    assert.equal(same.data.track.slug, "me-chong-nang-dau-3");
    const r = await admin.j("PATCH", `/api/admin/tracks/${id}`, { json: { title: "Đêm trăng" } });
    assert.equal(r.status, 200);
    assert.equal(r.data.track.slug, "dem-trang");
  });
});

describe("tìm kiếm không dấu", () => {
  for (const q of ["me chong", "ME CHONG", "mẹ chồng", "nang dau", "chong   me"]) {
    test(`"${q}" tìm ra "${TITLE}"`, async () => {
      const r = await anon.j("GET", `/api/search?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200);
      assert.ok(r.data.items.some((x) => x.id === st.track.id), JSON.stringify(r.data));
    });
  }

  test("chỉ trả track ready; từ khoá không khớp / rỗng → rỗng", async () => {
    const r = await anon.j("GET", `/api/search?q=${encodeURIComponent("me chong")}`);
    assert.ok(r.data.items.every((x) => x.status === "ready"));
    assert.equal((await anon.j("GET", "/api/search?q=zzzkhongco")).data.total, 0);
    assert.equal((await anon.j("GET", "/api/search?q=")).data.total, 0);
    assert.equal((await anon.j("GET", `/api/search?q=${encodeURIComponent("%_")}`)).data.total, 0, "ký tự LIKE phải được thoát");
  });
});

describe("phát & media", () => {
  test("playback trả URL /media và +1 playCount", async () => {
    const before = (await anon.j("GET", `/api/public/tracks/${st.track.slug}`)).data.track.playCount;
    const r = await anon.j("GET", `/api/playback/${st.track.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.trackId, st.track.id);
    assert.equal(r.data.format, "file");
    assert.equal(r.data.url, `/media/tracks/${st.track.id}/audio.mp3`);
    const afterCount = (await anon.j("GET", `/api/public/tracks/${st.track.slug}`)).data.track.playCount;
    assert.equal(afterCount, before + 1);
    st.mediaUrl = r.data.url;
  });

  test("/media không Range → 200 đủ byte, Content-Type audio/mpeg", async () => {
    const res = await anon.req("GET", st.mediaUrl);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^audio\/mpeg/);
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.match(res.headers.get("cache-control") ?? "", /max-age=\d+/);
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), AUDIO);
  });

  test("/media Range bytes=10-19 → 206 đúng 10 byte", async () => {
    const res = await anon.req("GET", st.mediaUrl, { headers: { range: "bytes=10-19" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 10-19/1024");
    assert.equal(res.headers.get("content-length"), "10");
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), AUDIO.slice(10, 20));
  });

  test("/media Range mở (bytes=1000-) và hậu tố (bytes=-4) → 206", async () => {
    const a = await anon.req("GET", st.mediaUrl, { headers: { range: "bytes=1000-" } });
    assert.equal(a.status, 206);
    assert.equal(a.headers.get("content-range"), "bytes 1000-1023/1024");
    assert.deepEqual(new Uint8Array(await a.arrayBuffer()), AUDIO.slice(1000));
    const b = await anon.req("GET", st.mediaUrl, { headers: { range: "bytes=-4" } });
    assert.equal(b.status, 206);
    assert.equal(b.headers.get("content-range"), "bytes 1020-1023/1024");
    assert.deepEqual(new Uint8Array(await b.arrayBuffer()), AUDIO.slice(1020));
  });

  test("/media Range vượt cỡ tệp → 416", async () => {
    const res = await anon.req("GET", st.mediaUrl, { headers: { range: "bytes=5000-5010" } });
    assert.equal(res.status, 416);
    await res.arrayBuffer();
  });

  test("/media chặn khoá ngoài tracks/ assets/ và tệp không có → 404", async () => {
    for (const p of ["/media/secret.txt", "/media/tracks%2F..%2F..%2Fx", `/media/tracks/${st.track.id}/khongco.mp3`]) {
      const res = await anon.req("GET", p);
      assert.equal(res.status, 404, p);
      await res.arrayBuffer();
    }
  });
});

describe("lịch sử nghe", () => {
  test("khách → 401", async () => {
    assert.equal((await anon.j("GET", "/api/history")).status, 401);
    assert.equal((await anon.j("PUT", `/api/history/${st.track.id}`, { json: { positionSeconds: 1 } })).status, 401);
  });

  test("PUT vị trí rồi GET thấy đúng, mới nhất trước", async () => {
    const p = await user.j("PUT", `/api/history/${st.track.id}`, { json: { positionSeconds: 42 } });
    assert.equal(p.status, 200);
    assert.deepEqual(p.data, { ok: true });
    const g = await user.j("GET", "/api/history");
    assert.equal(g.status, 200);
    assert.ok(Array.isArray(g.data));
    const it = g.data.find((x) => x.track.id === st.track.id);
    assert.ok(it, JSON.stringify(g.data));
    assert.equal(it.positionSeconds, 42);
    assert.equal(typeof it.updatedAt, "number");
    for (let i = 1; i < g.data.length; i++) assert.ok(g.data[i - 1].updatedAt >= g.data[i].updatedAt);
  });

  test("playback khi đã đăng nhập giữ vị trí nghe dở", async () => {
    await user.j("GET", `/api/playback/${st.track.id}`);
    const it = (await user.j("GET", "/api/history")).data.find((x) => x.track.id === st.track.id);
    assert.equal(it.positionSeconds, 42);
  });

  test("lịch sử tách theo người dùng", async () => {
    const g = await admin.j("GET", "/api/history");
    assert.ok(!g.data.some((x) => x.track.id === st.track.id && x.positionSeconds === 42));
  });

  test("PUT track không tồn tại → 404; vị trí âm → 400", async () => {
    assert.equal((await user.j("PUT", "/api/history/khong-co", { json: { positionSeconds: 1 } })).status, 404);
    assert.equal((await user.j("PUT", `/api/history/${st.track.id}`, { json: { positionSeconds: -5 } })).status, 400);
  });
});

describe("cài đặt", () => {
  test("GET trả đủ khoá SiteSettings", async () => {
    const r = await admin.j("GET", "/api/admin/settings");
    assert.equal(r.status, 200);
    for (const k of ["brand_name", "site_title", "tagline", "contact_email", "gate_enabled", "lock_points", "in_app_prompt", "head_html", "body_html", "ads_txt"]) {
      assert.ok(k in r.data, `thiếu ${k}`);
    }
    st.settings0 = r.data;
  });

  test("PUT một phần chỉ đổi khoá gửi lên", async () => {
    const r = await admin.j("PUT", "/api/admin/settings", { json: { tagline: "Khẩu hiệu mới" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.tagline, "Khẩu hiệu mới");
    assert.equal(r.data.brand_name, st.settings0.brand_name);
    assert.equal(r.data.in_app_prompt, st.settings0.in_app_prompt);
    const g = await admin.j("GET", "/api/admin/settings");
    assert.equal(g.data.tagline, "Khẩu hiệu mới");
  });

  test("PUT sai kiểu → 400 và không ghi", async () => {
    assert.equal((await admin.j("PUT", "/api/admin/settings", { json: { gate_enabled: "yes" } })).status, 400);
    assert.equal((await admin.j("PUT", "/api/admin/settings", { json: { brand_name: "" } })).status, 400);
    assert.equal((await admin.j("PUT", "/api/admin/settings", { json: { lock_points: [{ fromEp: 0 }] } })).status, 400);
    assert.equal((await admin.j("GET", "/api/admin/settings")).data.gate_enabled, st.settings0.gate_enabled);
  });

  test("lock_points được xếp tăng theo fromEp; /public/config lộ gate khi bật", async () => {
    const lp = [
      { id: "cpB", fromEp: 5, name: "b", title: "", link: "https://example.com/b", imageUrl: "", button: "", description: "" },
      { id: "cpA", fromEp: 2, name: "a", title: "", link: "https://example.com/a", imageUrl: "", button: "", description: "" },
    ];
    const r = await admin.j("PUT", "/api/admin/settings", { json: { lock_points: lp, gate_enabled: true } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(r.data.lock_points.map((x) => x.fromEp), [2, 5]);
    const cfg = await anon.j("GET", "/api/public/config");
    assert.deepEqual(cfg.data.gate.checkpoints.map((x) => x.id), ["cpA", "cpB"]);
    await admin.j("PUT", "/api/admin/settings", { json: { gate_enabled: false } });
    assert.equal((await anon.j("GET", "/api/public/config")).data.gate, null);
  });

  test("bí danh /api/settings hoạt động với admin", async () => {
    const r = await admin.j("GET", "/api/settings");
    assert.equal(r.status, 200);
    assert.equal(r.data.tagline, "Khẩu hiệu mới");
  });
});

describe("trang HTML & SEO", () => {
  const EVIL = 'Kể </script><img src=x onerror=alert(1)> & "q"';

  test("window.__SITE__ được chèn, escape '<' và giải mã đúng", async () => {
    const p = await admin.j("PUT", "/api/admin/settings", { json: { brand_name: EVIL } });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const res = await anon.req("GET", "/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const html = await res.text();
    const m = /<script>window\.__SITE__=(.*?)<\/script>/s.exec(html);
    assert.ok(m, "không thấy window.__SITE__");
    assert.ok(!m[1].includes("<"), "JSON trong <script> còn ký tự '<'");
    const cfg = JSON.parse(m[1]);
    assert.equal(cfg.brandName, EVIL);
    assert.ok("gate" in cfg && "inAppBrowserPrompt" in cfg);
    assert.ok(!html.includes("<img src=x onerror"), "tên thương hiệu chèn thô vào HTML");
  });

  test("trang chủ index + canonical; /admin, /login có noindex", async () => {
    const home = await (await anon.req("GET", "/")).text();
    // Mô-đun seo thêm max-image-preview:large, max-snippet:-1 cho trang được index.
    assert.match(home, /<meta name="robots" content="index, follow[,"]/);
    assert.match(home, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/);
    for (const p of ["/admin", "/admin/tracks", "/login", "/register", "/history"]) {
      const res = await anon.req("GET", p);
      const html = await res.text();
      // Mô-đun seo: trang riêng là "noindex, follow" (bot vẫn đi tiếp liên kết), không phát canonical.
      assert.match(html, /<meta name="robots" content="noindex, follow">/, p);
      assert.ok(!html.includes('rel="canonical"'), p);
      assert.match(res.headers.get("x-robots-tag") ?? "", /noindex/, p);
    }
  });

  test("trang track có title, og, JSON-LD AudioObject; slug không có → 404 noindex", async () => {
    await admin.j("PUT", "/api/admin/settings", { json: { brand_name: "Kể Đêm" } });
    const res = await anon.req("GET", `/track/${st.track.slug}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(`<title>${TITLE}`));
    assert.match(html, /"@type":"AudioObject"/);
    // Mô-đun seo dùng og:type music.song cho trang audio (trước là article).
    assert.match(html, /<meta property="og:type" content="music\.song">/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /<script type="application\/ld\+json">/);
    assert.match(html, /<div class="ssr-seo">/);
    // canonical bỏ ?t / utm
    const withT = await (await anon.req("GET", `/track/${st.track.slug}?t=30&utm_source=fb`)).text();
    assert.ok(new RegExp(`<link rel="canonical" href="http://127\\.0\\.0\\.1:\\d+/track/${st.track.slug}">`).test(withT), "canonical còn query");
    const nf = await anon.req("GET", "/track/khong-ton-tai");
    assert.equal(nf.status, 404);
    assert.match(nf.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.match(await nf.text(), /noindex/);
  });

  test("/og/<slug>.svg trả SVG; slug không có → 404", async () => {
    const res = await anon.req("GET", `/og/${st.track.slug}.svg`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /image\/svg\+xml/);
    const svg = await res.text();
    assert.ok(svg.startsWith("<svg") && svg.includes("Kể Đêm"), svg.slice(0, 200));
    const nf = await anon.req("GET", "/og/khong-ton-tai.svg");
    assert.equal(nf.status, 404);
    await nf.arrayBuffer();
  });

  test("thể loại / tag: trang HTML + GET /api/admin/tracks lọc category / tag ở máy chủ", async () => {
    const cats = [{ slug: "gia-dinh", name: "Drama gia đình", description: "Truyện gia đình" }];
    assert.equal((await admin.j("PUT", "/api/admin/settings", { json: { categories: cats } })).status, 200);
    const p = await admin.j("PATCH", `/api/admin/tracks/${st.track.id}`, { json: { category: "gia-dinh", tags: ["bao-thu"] } });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const all = await admin.j("GET", "/api/admin/tracks?pageSize=100");
    assert.ok(all.data.total >= 2, "cần ≥ 2 track để kiểm lọc");
    const byCat = await admin.j("GET", "/api/admin/tracks?category=gia-dinh&pageSize=1");
    assert.equal(byCat.status, 200);
    assert.equal(byCat.data.total, 1);
    assert.deepEqual(byCat.data.items.map((x) => x.id), [st.track.id]);
    assert.equal((await admin.j("GET", "/api/admin/tracks?category=khong-co")).data.total, 0);
    const byTag = await admin.j("GET", "/api/admin/tracks?tag=bao-thu");
    assert.equal(byTag.data.total, 1);
    assert.equal((await admin.j("GET", "/api/admin/tracks?tag=bao-thu&category=khong-co")).data.total, 0);
    assert.equal((await user.j("GET", "/api/admin/tracks?category=gia-dinh")).status, 403);

    const cat = await anon.req("GET", "/the-loai/gia-dinh");
    assert.equal(cat.status, 200);
    const ch = await cat.text();
    assert.match(ch, /"@type":"ItemList"/);
    assert.ok(ch.includes(`/track/${st.track.slug}`));
    const tag = await anon.req("GET", "/tag/bao-thu");
    assert.equal(tag.status, 200);
    await tag.arrayBuffer();
    const nf = await anon.req("GET", "/the-loai/khong-co");
    assert.equal(nf.status, 404);
    await nf.arrayBuffer();
    const search = await (await anon.req("GET", "/tim-kiem?q=ma")).text();
    assert.match(search, /noindex/);
  });

  test("GET /api/admin/funnel?days=7|30 trả FunnelStats; người thường 403", async () => {
    assert.equal((await anon.j("POST", "/api/public/events", { json: { type: "view", trackId: st.track.id, source: "kiemthu" } })).status, 200);
    for (const days of [7, 30]) {
      const r = await admin.j("GET", `/api/admin/funnel?days=${days}`);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.days, days);
      assert.ok(Array.isArray(r.data.rows));
      const row = r.data.rows.find((x) => x.source === "kiemthu");
      assert.ok(row, JSON.stringify(r.data.rows));
      for (const k of ["day", "source", "view", "play", "gate_shown", "unlock", "complete"]) assert.ok(k in row, k);
      assert.ok(row.view >= 1);
    }
    assert.equal((await user.j("GET", "/api/admin/funnel?days=7")).status, 403);
  });

  test("head_html / body_html được chèn", async () => {
    await admin.j("PUT", "/api/admin/settings", { json: { head_html: '<meta name="kt-head" content="1">', body_html: "<!--kt-body-->" } });
    const html = await (await anon.req("GET", "/")).text();
    assert.ok(html.includes('<meta name="kt-head" content="1">'));
    assert.ok(html.includes("<!--kt-body-->"));
    assert.ok(html.indexOf('name="kt-head"') < html.toLowerCase().indexOf("</head>"));
  });

  test("sitemap.xml là chỉ mục → sitemap-pages + sitemap-tracks-1", async () => {
    const res = await anon.req("GET", "/sitemap.xml");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /xml/);
    const idx = await res.text();
    assert.match(idx, /<sitemapindex /);
    assert.match(idx, /<loc>http:\/\/127\.0\.0\.1:\d+\/sitemap-pages\.xml<\/loc>/);
    assert.match(idx, /<loc>http:\/\/127\.0\.0\.1:\d+\/sitemap-tracks-1\.xml<\/loc>/);
    const pages = await (await anon.req("GET", "/sitemap-pages.xml")).text();
    assert.match(pages, /\/dieu-khoan<\/loc>/);
    assert.match(pages, /\/the-loai\/gia-dinh<\/loc>/);
    const nf = await anon.req("GET", "/sitemap-tracks-99.xml");
    assert.equal(nf.status, 404);
    await nf.arrayBuffer();
  });

  test("sitemap-tracks-1.xml có track ready, không có track processing", async () => {
    const res = await anon.req("GET", "/sitemap-tracks-1.xml");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /xml/);
    const x = await res.text();
    assert.ok(x.includes(`/track/${st.track.slug}</loc>`), x);
    assert.ok(!x.includes("/track/me-chong-nang-dau-2<"), "track processing lọt vào sitemap");
  });

  test("tệp tĩnh không tồn tại → 404 thật, không trả index.html (chống trắng trang sau deploy)", async () => {
    for (const p of ["/assets/index-khongco123.js", "/assets/x.css", "/khongco.png"]) {
      const res = await anon.req("GET", p);
      assert.equal(res.status, 404, p);
      assert.ok(!(res.headers.get("content-type") || "").includes("text/html"), `${p} trả HTML`);
      await res.arrayBuffer();
    }
  });

  test("robots.txt chặn /admin /api, khai báo Sitemap", async () => {
    const res = await anon.req("GET", "/robots.txt");
    assert.equal(res.status, 200);
    const t = await res.text();
    assert.match(t, /User-agent: \*/);
    assert.match(t, /Disallow: \/admin/);
    assert.match(t, /Disallow: \/api\//);
    assert.match(t, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
  });

  test("ads.txt: rỗng → 404; có nội dung → 200 text/plain", async () => {
    await admin.j("PUT", "/api/admin/settings", { json: { ads_txt: "" } });
    const a = await anon.req("GET", "/ads.txt");
    assert.equal(a.status, 404);
    await a.arrayBuffer();
    const line = "google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0";
    await admin.j("PUT", "/api/admin/settings", { json: { ads_txt: line } });
    const b = await anon.req("GET", "/ads.txt");
    assert.equal(b.status, 200);
    assert.match(b.headers.get("content-type"), /text\/plain/);
    assert.equal((await b.text()).trim(), line);
  });

  test("đổi tiêu đề → slug mới; /track/<slug cũ> 301 sang slug mới (giữ query)", async () => {
    const old = st.track.slug;
    const r = await admin.j("PATCH", `/api/admin/tracks/${st.track.id}`, { json: { title: "Mẹ chồng nàng dâu phần mới" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const slug = r.data.track.slug;
    assert.notEqual(slug, old);
    const res = await anon.req("GET", `/track/${old}?utm_source=fb`);
    assert.equal(res.status, 301);
    assert.ok((res.headers.get("location") ?? "").endsWith(`/track/${slug}?utm_source=fb`), res.headers.get("location"));
    await res.arrayBuffer();
    const nw = await anon.req("GET", `/track/${slug}`);
    assert.equal(nw.status, 200);
    await nw.arrayBuffer();
    // Đổi về tiêu đề cũ → slug cũ dùng lại, không chuyển hướng vòng.
    const back = await admin.j("PATCH", `/api/admin/tracks/${st.track.id}`, { json: { title: TITLE } });
    assert.equal(back.data.track.slug, old);
    const again = await anon.req("GET", `/track/${old}`);
    assert.equal(again.status, 200);
    await again.arrayBuffer();
    const fwd = await anon.req("GET", `/track/${slug}`);
    assert.equal(fwd.status, 301);
    await fwd.arrayBuffer();
  });
});

describe("trợ lý viết kịch bản (mock)", () => {
  test("/api/admin/writer: khách 401, người thường 403", async () => {
    assert.equal((await anon.j("GET", "/api/admin/writer/config")).status, 401);
    assert.equal((await user.j("GET", "/api/admin/writer/config")).status, 403);
    assert.equal((await user.j("POST", "/api/admin/writer/projects", { json: {} })).status, 403);
  });

  test("admin: provider mock, tạo dự án + sinh dàn ý + kịch bản tập 1 không gọi mạng", async () => {
    const cfg = await admin.j("GET", "/api/admin/writer/config");
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.provider, "mock");
    const p = await admin.j("POST", "/api/admin/writer/projects", {
      json: {
        title: "", genre: "drama gia đình", idea: "Nàng dâu mới về nhà chồng phát hiện bí mật dưới gian thờ.",
        characters: [], episodeMinutes: 5, episodeCount: 3, pov: "ngoi3", ending: "co-hau", notes: "",
      },
    });
    assert.equal(p.status, 201, JSON.stringify(p.data));
    const o = await admin.j("POST", `/api/admin/writer/projects/${p.data.id}/outline`);
    assert.equal(o.status, 200, JSON.stringify(o.data));
    assert.ok(o.data.outline && o.data.outline.episodes.length >= 1, JSON.stringify(o.data));
    const ep = await admin.j("POST", `/api/admin/writer/projects/${p.data.id}/episodes/1/generate`);
    assert.equal(ep.status, 200, JSON.stringify(ep.data));
  });
});

describe("xoá track", () => {
  test("DELETE xoá bản ghi + tệp R2 + lịch sử", async () => {
    const id = st.track.id;
    const r = await admin.j("DELETE", `/api/admin/tracks/${id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true });
    for (const k of ["audio.mp3", "sub/cover.jpg"]) {
      const m = await anon.req("GET", `/media/tracks/${id}/${k}`);
      assert.equal(m.status, 404, `tệp ${k} còn trên R2`);
      await m.arrayBuffer();
    }
    assert.equal((await anon.j("GET", `/api/public/tracks/${st.track.slug}`)).status, 404);
    assert.equal((await anon.j("GET", `/api/playback/${id}`)).status, 404);
    const h = await user.j("GET", "/api/history");
    assert.ok(!h.data.some((x) => x.track.id === id));
    assert.equal((await admin.j("DELETE", `/api/admin/tracks/${id}`)).status, 404);
  });

  test("stats đếm được", async () => {
    const r = await admin.j("GET", "/api/admin/stats");
    assert.equal(r.status, 200);
    for (const k of ["tracks", "plays", "users", "unlocksToday"]) assert.equal(typeof r.data[k], "number", k);
    assert.equal(r.data.users, 2);
  });
});
