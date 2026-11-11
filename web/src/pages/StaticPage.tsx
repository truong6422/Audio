import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../lib/seo";
import { useSite } from "../site";

interface Ctx {
  brand: string;
  email: string;
}

interface StaticDef {
  slug: string;
  title: string;
  description: (brand: string) => string;
  body: (c: Ctx) => ReactNode;
}

const UPDATED = "11/11/2026";

function Mail({ email }: { email: string }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <span>biểu mẫu liên hệ trên trang</span>;
}

export const STATIC_PAGES: StaticDef[] = [
  {
    slug: "gioi-thieu",
    title: "Giới thiệu",
    description: (b) => `${b} là góc nghe truyện audio miễn phí cho những đêm dài — nhẹ nhàng, không cần tài khoản.`,
    body: ({ brand }) => (
      <>
        <p>
          <strong>{brand}</strong> ra đời từ một thói quen giản dị: trước khi ngủ, nhiều người muốn được ai đó kể cho nghe một câu chuyện. Chúng
          tôi gom những câu chuyện ấy về một nơi, trình bày gọn gàng để bạn chỉ việc chọn, bấm nghe và thả lỏng.
        </p>
        <h2>Bạn nhận được gì</h2>
        <ul>
          <li>Nghe miễn phí trên điện thoại và máy tính, không bắt buộc đăng ký.</li>
          <li>Trình phát nhớ chỗ bạn đang nghe dở, có hẹn giờ tắt và chỉnh tốc độ đọc.</li>
          <li>Truyện dài được chia thành từng tập để dễ theo dõi.</li>
          <li>Giao diện tối dịu mắt cho buổi đêm, có thể chuyển sang nền sáng.</li>
        </ul>
        <h2>Điều chúng tôi theo đuổi</h2>
        <p>
          Một trải nghiệm nghe yên tĩnh: ít thao tác, tải nhanh trên mạng di động, và tôn trọng thời gian của bạn. Chúng tôi duy trì trang bằng
          một số quảng cáo được ghi rõ — bạn luôn có lựa chọn đóng chúng lại.
        </p>
        <p>
          Có góp ý? Ghé trang <Link to="/lien-he">Liên hệ</Link> — mọi phản hồi đều được đọc.
        </p>
      </>
    ),
  },
  {
    slug: "lien-he",
    title: "Liên hệ",
    description: (b) => `Liên hệ đội ngũ ${b}: góp ý, báo lỗi, hợp tác và yêu cầu về bản quyền.`,
    body: ({ brand, email }) => (
      <>
        <p>
          Cảm ơn bạn đã ghé {brand}. Nếu cần trao đổi bất cứ điều gì, hãy gửi thư tới <Mail email={email} />.
        </p>
        <h2>Chúng tôi có thể hỗ trợ</h2>
        <ul>
          <li>Báo lỗi phát audio, trang không hiển thị đúng.</li>
          <li>Góp ý nội dung, đề xuất truyện muốn nghe.</li>
          <li>Hợp tác quảng cáo, tài trợ nội dung.</li>
          <li>Yêu cầu gỡ nội dung liên quan bản quyền (xem thêm <Link to="/mien-tru-trach-nhiem">Miễn trừ trách nhiệm</Link>).</li>
        </ul>
        <h2>Thời gian phản hồi</h2>
        <p>Thường trong 1–3 ngày làm việc. Yêu cầu về bản quyền được ưu tiên xử lý sớm nhất.</p>
        <p>Để xử lý nhanh, vui lòng ghi kèm đường dẫn trang liên quan và mô tả ngắn gọn vấn đề.</p>
      </>
    ),
  },
  {
    slug: "chinh-sach-bao-mat",
    title: "Chính sách bảo mật",
    description: (b) => `Cách ${b} thu thập, sử dụng và bảo vệ thông tin của người nghe.`,
    body: ({ brand, email }) => (
      <>
        <p>Cập nhật lần cuối: {UPDATED}</p>
        <p>
          Chính sách này giải thích {brand} xử lý thông tin của bạn thế nào khi bạn sử dụng trang. Khi tiếp tục sử dụng, bạn đồng ý với các nội
          dung dưới đây.
        </p>
        <h2>1. Thông tin chúng tôi thu thập</h2>
        <ul>
          <li>Khi đăng ký: email, tên hiển thị và mật khẩu (được lưu dạng băm, chúng tôi không đọc được).</li>
          <li>Khi nghe: bài đã nghe và vị trí nghe dở (để bạn nghe tiếp trên thiết bị khác).</li>
          <li>Dữ liệu kỹ thuật: loại trình duyệt, thiết bị, địa chỉ IP rút gọn phục vụ chống lạm dụng và thống kê.</li>
        </ul>
        <h2>2. Mục đích sử dụng</h2>
        <p>Vận hành dịch vụ, ghi nhớ tiến độ nghe, cải thiện chất lượng, phòng chống gian lận và liên hệ khi bạn yêu cầu hỗ trợ.</p>
        <h2>3. Lưu trữ trên trình duyệt</h2>
        <p>
          Chúng tôi dùng cookie phiên để giữ đăng nhập và bộ nhớ trình duyệt để lưu tốc độ phát, giao diện sáng/tối, vị trí nghe dở. Bạn có thể xoá
          chúng bất cứ lúc nào trong cài đặt trình duyệt.
        </p>
        <h2>4. Quảng cáo và liên kết bên thứ ba</h2>
        <p>
          Trang có thể hiển thị quảng cáo (ví dụ Google AdSense) và liên kết tiếp thị liên kết. Các bên này có thể dùng cookie theo chính sách riêng
          của họ. Khi bạn bấm vào liên kết quảng cáo, bạn rời khỏi {brand} và chịu điều chỉnh bởi điều khoản của trang đích.
        </p>
        <h2>5. Phân tích</h2>
        <p>Chúng tôi có thể dùng công cụ thống kê truy cập ẩn danh để hiểu nội dung nào được yêu thích.</p>
        <h2>6. Chia sẻ thông tin</h2>
        <p>Chúng tôi không bán dữ liệu cá nhân. Thông tin chỉ được cung cấp khi pháp luật yêu cầu hoặc để bảo vệ an toàn của dịch vụ.</p>
        <h2>7. Bảo mật</h2>
        <p>Kết nối được mã hoá HTTPS, mật khẩu được băm. Không hệ thống nào an toàn tuyệt đối, nhưng chúng tôi luôn cố gắng giảm thiểu rủi ro.</p>
        <h2>8. Quyền của bạn</h2>
        <p>Bạn có thể yêu cầu xem, sửa hoặc xoá tài khoản và dữ liệu liên quan bằng cách liên hệ với chúng tôi.</p>
        <h2>9. Trẻ em</h2>
        <p>Dịch vụ không hướng tới trẻ dưới 13 tuổi. Nếu phát hiện dữ liệu của trẻ em, chúng tôi sẽ xoá ngay.</p>
        <h2>10. Thay đổi chính sách</h2>
        <p>Chính sách có thể được cập nhật; ngày cập nhật được ghi ở đầu trang.</p>
        <h2>11. Liên hệ</h2>
        <p>
          Mọi câu hỏi về quyền riêng tư, vui lòng gửi tới <Mail email={email} />.
        </p>
      </>
    ),
  },
  {
    slug: "dieu-khoan",
    title: "Điều khoản sử dụng",
    description: (b) => `Điều khoản khi sử dụng ${b}: quyền, nghĩa vụ và giới hạn trách nhiệm.`,
    body: ({ brand }) => (
      <>
        <p>Cập nhật lần cuối: {UPDATED}</p>
        <h2>1. Chấp nhận điều khoản</h2>
        <p>Khi truy cập {brand}, bạn đồng ý tuân thủ các điều khoản này. Nếu không đồng ý, vui lòng ngừng sử dụng.</p>
        <h2>2. Dịch vụ</h2>
        <p>{brand} cung cấp nội dung audio để nghe trực tuyến cho mục đích giải trí cá nhân, phi thương mại.</p>
        <h2>3. Tài khoản</h2>
        <p>Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động dưới tài khoản của mình.</p>
        <h2>4. Hành vi bị cấm</h2>
        <ul>
          <li>Tải xuống, sao chép, phát lại nội dung nhằm mục đích thương mại khi chưa được phép.</li>
          <li>Can thiệp, dò quét, làm quá tải hệ thống hoặc vượt qua các cơ chế giới hạn truy cập.</li>
          <li>Sử dụng dịch vụ cho mục đích vi phạm pháp luật.</li>
        </ul>
        <h2>5. Sở hữu trí tuệ</h2>
        <p>Giao diện, thương hiệu và mã nguồn thuộc về {brand}. Nội dung audio thuộc về chủ sở hữu tương ứng.</p>
        <h2>6. Quảng cáo</h2>
        <p>Một số nội dung có thể yêu cầu xem quảng cáo trước khi nghe tiếp. Bạn luôn có thể đóng quảng cáo và rời trang.</p>
        <h2>7. Giới hạn trách nhiệm</h2>
        <p>Dịch vụ được cung cấp “như hiện có”. Chúng tôi không bảo đảm dịch vụ không bao giờ gián đoạn hay không có lỗi.</p>
        <h2>8. Chấm dứt</h2>
        <p>Chúng tôi có thể tạm khoá tài khoản vi phạm điều khoản mà không cần báo trước.</p>
        <h2>9. Thay đổi</h2>
        <p>Điều khoản có thể được cập nhật. Việc tiếp tục sử dụng sau khi cập nhật đồng nghĩa bạn chấp nhận bản mới.</p>
      </>
    ),
  },
  {
    slug: "mien-tru-trach-nhiem",
    title: "Miễn trừ trách nhiệm",
    description: (b) => `Tuyên bố miễn trừ trách nhiệm và quy trình gửi yêu cầu gỡ nội dung bản quyền trên ${b}.`,
    body: ({ brand, email }) => (
      <>
        <p>
          Nội dung trên {brand} được sưu tầm và chia sẻ nhằm mục đích giải trí. Chúng tôi tôn trọng quyền tác giả và sẵn sàng gỡ bỏ mọi nội dung
          khi có yêu cầu hợp lệ từ chủ sở hữu.
        </p>
        <h2>Về nội dung</h2>
        <p>
          Quan điểm trong các câu chuyện thuộc về tác giả / người đọc, không phản ánh quan điểm của {brand}. Thông tin chỉ mang tính tham khảo.
        </p>
        <h2>Về quảng cáo và liên kết</h2>
        <p>
          Các liên kết quảng cáo dẫn tới trang của bên thứ ba. Chúng tôi không chịu trách nhiệm về sản phẩm, giá cả hay chính sách của các trang
          đó. Hãy cân nhắc kỹ trước khi mua hàng.
        </p>
        <h2>Yêu cầu gỡ nội dung bản quyền</h2>
        <p>
          Gửi thư tới <Mail email={email} /> kèm:
        </p>
        <ul>
          <li>Thông tin chủ sở hữu hoặc người được uỷ quyền.</li>
          <li>Đường dẫn trang chứa nội dung cần gỡ.</li>
          <li>Bằng chứng quyền sở hữu hoặc mô tả tác phẩm gốc.</li>
          <li>Cam kết thông tin cung cấp là chính xác.</li>
        </ul>
        <p>Chúng tôi xác nhận trong 24 giờ và gỡ nội dung trong vòng 48–72 giờ khi yêu cầu hợp lệ.</p>
      </>
    ),
  },
];

export function StaticPage({ slug }: { slug: string }) {
  const site = useSite();
  const def = STATIC_PAGES.find((p) => p.slug === slug)!;
  useSeo({ title: def.title, description: def.description(site.brandName) });
  return (
    <article className="wrap max-w-3xl py-10 md:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{site.brandName}</p>
      <h1 className="mt-2 font-display text-3xl font-bold leading-tight md:text-4xl">{def.title}</h1>
      <p className="mt-3 text-base text-muted">{def.description(site.brandName)}</p>
      <div className="prose-kd mt-6 border-t border-border pt-4 text-[15px] leading-relaxed">{def.body({ brand: site.brandName, email: site.contactEmail })}</div>
    </article>
  );
}
