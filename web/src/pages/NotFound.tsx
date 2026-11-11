import { Link } from "react-router-dom";
import { BrandMark } from "../components/Icons";
import { useSeo } from "../lib/seo";

export function NotFound({ what = "trang" }: { what?: string }) {
  useSeo({ title: "Không tìm thấy", noindex: true });
  return (
    <div className="wrap flex flex-col items-center py-20 text-center md:py-28">
      <div className="relative">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
        <BrandMark size={72} />
      </div>
      <p className="mt-6 font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">Câu chuyện này lạc mất rồi</h1>
      <p className="mt-3 max-w-md text-base text-muted">
        Không tìm thấy {what} bạn cần — có thể đường dẫn đã đổi hoặc nội dung đã được gỡ. Còn rất nhiều truyện khác đang chờ bạn.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn btn-primary">
          Về tủ truyện
        </Link>
        <button type="button" className="btn btn-ghost" onClick={() => history.back()}>
          Quay lại
        </button>
      </div>
    </div>
  );
}
