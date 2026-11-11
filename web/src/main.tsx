import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { PlayerProvider } from "./player/PlayerContext";
import { SiteProvider } from "./site";
import "./lib/events"; // chốt nguồn truy cập (utm / app) ngay lần vào đầu
import { initPwa } from "./lib/pwa";
import "./index.css";

// Khối SEO máy chủ chèn cho bot — gỡ khi ứng dụng chạy.
document.querySelectorAll(".ssr-seo").forEach((el) => el.remove());
initPwa();

// Chunk nạp lười thiếu (vừa deploy bản mới, trang đang mở là bản cũ) → tải lại 1 lần để lấy bản mới, không trắng trang.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("kd_chunk_reload")) return;
    sessionStorage.setItem("kd_chunk_reload", "1");
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SiteProvider>
        <AuthProvider>
          <PlayerProvider>
            <App />
          </PlayerProvider>
        </AuthProvider>
      </SiteProvider>
    </BrowserRouter>
  </StrictMode>,
);
