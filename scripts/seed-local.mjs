// Seed dữ liệu mẫu cho môi trường CỤC BỘ: D1 --local + R2 --local. Không đụng tới Cloudflare thật.
// Cách chạy: node scripts/seed-local.mjs   (sau khi đã chạy npm run db:migrate:local)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "ke-dem-media";
const DB = "audio_db";
const TRACK_IDS = ["seed-track-1", "seed-track-2", "seed-track-3"];

/** WAV PCM 16-bit mono im lặng. */
function silentWav(seconds = 10, sampleRate = 8000) {
  const dataLen = seconds * sampleRate * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // cỡ khối fmt
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte/giây
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bit/mẫu
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

const outDir = join(root, ".wrangler", "seed");
mkdirSync(outDir, { recursive: true });
const wavPath = join(outDir, "silence.wav");
writeFileSync(wavPath, silentWav());
console.log("Đã tạo", wavPath);

const isWin = process.platform === "win32";
function wrangler(args) {
  console.log("> wrangler", args.join(" "));
  execFileSync(isWin ? "npx.cmd" : "npx", ["wrangler", ...args], { cwd: root, stdio: "inherit", shell: isWin });
}

wrangler(["d1", "execute", DB, "--local", "--file", join("scripts", "seed.sql")]);
for (const id of TRACK_IDS) {
  wrangler(["r2", "object", "put", `${BUCKET}/tracks/${id}/audio.wav`, "--local", "--file", wavPath, "--content-type", "audio/wav"]);
}
console.log("Xong: 3 track mẫu (format file, 10 giây im lặng).");
