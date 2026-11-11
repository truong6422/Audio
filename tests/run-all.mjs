// Điểm vào khi chạy `node --test tests/` trên Node 22.x: Node 22.11 không quét thư mục mà nạp nó như module
// (qua tests/package.json "main") → tệp này import mọi tests/*.test.mjs.
// Một số tệp kiểm thử import thẳng mã .ts của worker → cần --experimental-strip-types; nếu chưa bật thì
// tự chạy lại chính tệp này với cờ đó (kế thừa stdio + NODE_TEST_CONTEXT nên kết quả vẫn báo về test runner).
// Bản Node tự quét thư mục sẽ không chạy tệp này (tên không khớp mẫu *.test.*), nên không chạy trùng.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const self = fileURLToPath(import.meta.url);
const here = dirname(self);
const tsOn = Boolean(process.features?.typescript) || process.execArgv.includes("--experimental-strip-types");

if (!tsOn) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", ...process.execArgv, self], { stdio: "inherit" });
  process.exitCode = r.status ?? 1;
} else {
  for (const f of readdirSync(here).filter((n) => /\.test\.m?js$/.test(n)).sort()) {
    await import(pathToFileURL(`${here}/${f}`).href);
  }
}
