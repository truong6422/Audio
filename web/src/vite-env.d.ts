/// <reference types="vite/client" />

// Bản nhẹ của hls.js (không phụ đề / DRM) — dùng chung kiểu với bản đầy đủ.
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
