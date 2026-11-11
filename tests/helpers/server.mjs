// Dựng wrangler dev CỤC BỘ cho kiểm thử tích hợp: dọn tests/.state, migrate D1 --local, chạy dev, chờ sẵn sàng.
// Không gọi Cloudflare thật (chỉ --local / --persist-to), không login, không deploy.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const STATE_DIR = join(ROOT, "tests", ".state");
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const isWin = process.platform === "win32";

const childEnv = () => ({
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG: process.env.WRANGLER_LOG ?? "info",
  NO_COLOR: "1",
  FORCE_COLOR: "0",
});

function portInUse(port) {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port });
    s.once("connect", () => (s.destroy(), res(true)));
    s.once("error", () => res(false));
  });
}

/** Diệt cả cây tiến trình (wrangler → workerd). Trên Windows kill() không diệt workerd con. */
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export async function startServer({ port = Number(process.env.TEST_PORT || 8788), setupToken }) {
  if (await portInUse(port)) {
    throw new Error(`Cổng ${port} đang bận — tắt tiến trình đang chiếm cổng (wrangler/workerd cũ) hoặc đặt TEST_PORT khác.`);
  }
  rmSync(STATE_DIR, { recursive: true, force: true });
  mkdirSync(STATE_DIR, { recursive: true });

  const mig = spawnSync(process.execPath, [WRANGLER, "d1", "migrations", "apply", "audio_db", "--local", "--persist-to", STATE_DIR], {
    cwd: ROOT,
    env: childEnv(),
    encoding: "utf8",
    timeout: 120_000,
  });
  if (mig.status !== 0) throw new Error(`Migrate D1 cục bộ lỗi:\n${mig.stdout}\n${mig.stderr}`);

  const logPath = join(ROOT, "tests", "wrangler-dev.log");
  const log = createWriteStream(logPath);
  const child = spawn(
    process.execPath,
    [
      WRANGLER, "dev",
      "--port", String(port),
      "--ip", "127.0.0.1",
      "--inspector-port", String(port + 1000),
      "--persist-to", STATE_DIR,
      "--var", `SETUP_TOKEN:${setupToken}`,
      "--show-interactive-dev-session=false",
    ],
    { cwd: ROOT, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], detached: !isWin },
  );
  let output = "";
  const collect = (d) => {
    output += d;
    log.write(d);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev thoát sớm (mã ${child.exitCode}):\n${output.slice(-4000)}`);
    try {
      const r = await fetch(`${base}/api/auth/me`, { signal: AbortSignal.timeout(3000) });
      if (r.status === 200) break;
    } catch {
      /* chưa lên */
    }
    if (Date.now() > deadline) {
      killTree(child);
      throw new Error(`wrangler dev không sẵn sàng sau 90 giây. Nhật ký: ${logPath}\n${output.slice(-4000)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return {
    base,
    logs: () => output,
    stop: async () => {
      killTree(child);
      log.end();
    },
  };
}
