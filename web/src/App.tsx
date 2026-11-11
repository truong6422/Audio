import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { InAppPrompt } from "./components/InAppPrompt";
import { Layout } from "./components/Layout";
import { BrandMark } from "./components/Icons";
import { Login, Register } from "./pages/Auth";
import { History } from "./pages/History";
import { CategoryPage, SearchPage, TagPage } from "./pages/Browse";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { STATIC_PAGES, StaticPage } from "./pages/StaticPage";
import { TrackPage } from "./pages/TrackPage";

const AdminApp = lazy(() => import("./admin/AdminApp"));

function FullLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Đang tải">
      <div className="animate-pulse">
        <BrandMark size={48} />
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="track/:slug" element={<TrackPage />} />
          <Route path="the-loai/:slug" element={<CategoryPage />} />
          <Route path="tag/:tag" element={<TagPage />} />
          <Route path="tim-kiem" element={<SearchPage />} />
          <Route path="history" element={<History />} />
          {STATIC_PAGES.map((p) => (
            <Route key={p.slug} path={p.slug} element={<StaticPage slug={p.slug} />} />
          ))}
          <Route path="dieu-khoan-su-dung" element={<Navigate to="/dieu-khoan" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route
          path="admin/*"
          element={
            <Suspense fallback={<FullLoader />}>
              <AdminApp />
            </Suspense>
          }
        />
      </Routes>
      <InAppPrompt />
    </>
  );
}
