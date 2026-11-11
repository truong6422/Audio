// Hook phân giải module cho Node khi nạp mã web/src (.ts) không qua Vite:
//  - "@shared/*"  → <gốc>/shared/*.ts (giống paths trong tsconfig.web.json)
//  - đường dẫn tương đối không đuôi → thử thêm ".ts" / ".tsx" / "/index.ts"
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTS = [".ts", ".tsx", "/index.ts"];

function tryFile(base) {
  if (existsSync(base) && /\.[cm]?[jt]sx?$/.test(base)) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@shared/")) {
    const f = tryFile(join(ROOT, "shared", specifier.slice("@shared/".length)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const f = tryFile(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(specifier, context);
}
