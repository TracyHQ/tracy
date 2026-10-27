---
title: Khái niệm
description: Site và site key, ghế, vai và bộ công cụ, bản đồ nội dung (content, block, field, slot, native), revision và version, hoàn tác, và phiên bản plugin.
---

## Site và site key

Một **site** là một website khách hàng mà Tracy lưu trữ hoặc đã nhập về: một bản cài Joomla, WordPress
hay EmDash với địa chỉ riêng. **Site key** của nó là tên chuẩn (ví dụ `shop.example.com`) và xuất hiện
trong mọi đường dẫn: `/v1/sites/{key}/…`. Một site cũng có thể được gọi qua bí danh; Tracy chuẩn hoá
key trước khi cấp quyền, nên câu trả lời là một dù bạn dùng tên nào. Key không tồn tại trả lời `404`.

## Ghế, vai và bộ công cụ

Một **ghế** là tư cách thành viên của một người trên một site, kèm một **vai**: `owner`, `admin`,
`developer` hoặc `editor`. Vai cấp các **bộ công cụ** — bốn họ mà mọi action đều thuộc về:

| Bộ công cụ | Bao gồm |
|---|---|
| `content` | chữ, hình và liên kết: record, content, lượt áp theo hợp đồng, tải media lên, hoàn tác |
| `code` | template, module, extension, theme, plugin và bố cục chúng định ra |
| `site` | dữ liệu của site nói chung: bảng cơ sở dữ liệu, dump, snapshot |
| `lifecycle` | dựng, phát hành, khôi phục và xoá site |

Mỗi action cần bộ công cụ nào được ghi ngay bên cạnh nó trong [tham chiếu API](/vi/reference/).
Sàn mặc định là: editor → `content`; developer → `content`, `code`; admin → `content`, `code`,
`site`; owner → tất cả. Chính sách của site hay workspace có thể thu hẹp một vai xuống dưới sàn, không
bao giờ nới rộng. Khoá API thêm một lớp thu hẹp nữa: các scope của nó (xem [Xác thực](/vi/authentication/)).

## Bản đồ nội dung

Content API mô tả một site theo một hình dạng duy nhất, bất kể CMS nào. Từ ngoài vào trong:

- **Page** — một địa chỉ của site đang chạy, trong một locale, liệt kê các content nó hiển thị.
  `GET /v1/sites/{key}/pages` trả lời mọi page đã xuất bản kèm một `version` của danh sách.
- **Content** — một đơn vị sửa được: một bài post, một article, một menu, một vùng dùng chung. Nó có
  `id`, `type` (các kiểu nội dung của site — `describe` của site liệt kê chúng), `locale`, `revision`,
  các `blocks`, và `native`.
- **Block** — một phần của content: một tiêu đề, một đoạn văn, một hình, một lời kêu gọi hành động.
  Block mang `fields`, và một `visibility` (`visible`, `hidden`, `unknown`) cho biết trang đang chạy
  có hiển thị nó không.
- **Field** — một giá trị trong block: một đoạn chữ, một liên kết, một đường dẫn hình — cấp mà chữ
  được đọc và, qua record nó thuộc về, được ghi.
- **Slot** — trên site dựng từ một quickstart của Tracy, một vị trí có tên mà thiết kế luôn giữ đầy
  (`hero.0`, `footer.contact`). Slot là địa chỉ của `POST …/contract/apply`, lệnh kiểm tra mọi thay
  đổi theo hợp đồng nội dung của site trước khi ghi bất cứ gì.
- **`native`** — các hàng CMS mà content lấy ra từ đó: `kind` và `id` của record (và trên WordPress
  là `key`) mà một `PATCH …/records/{kind}/{id}` sửa. Đó là cầu nối từ bản đồ thống nhất tới dữ liệu
  riêng của site; các hướng dẫn liệt kê kind của từng CMS.

`GET /v1/sites/{key}/contents` liệt kê content (lọc theo `type` và `locale`, phân trang bằng `limit`
và `cursor`, gọt bằng `fields`, chặn cỡ câu trả lời bằng `maxBytes`); `GET …/contents/{id}` đọc chi
tiết một content, block phân trang bằng `blockId` và `blocksCursor`.

## Record

Một **record** là một hàng của CMS đúng như site đang giữ — bề mặt nằm dưới bản đồ nội dung. Trên
Joomla: `article`, `category`, `menuItem`, `module`, `templateStyle` và nhiều hơn; trên WordPress:
`post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`. `GET …/records/{kind}` liệt kê một
trang, `GET …/records/{kind}/{id}` đọc một hàng (các kind WordPress không có id số nhận `?key=`),
`PATCH` ghi field, `DELETE` chuyển nó vào thùng rác. Record không có kiểm tra revision — một `PATCH`
ghi đúng cái bạn gửi; hãy đọc trước, và giữ mỗi lượt ghi nhỏ.

## Revision, version và `changedSince`

- **`revision`** của một content đổi khi content đó đổi. `GET …/contents/{id}` trả nó về làm `ETag`;
  `If-None-Match` với cùng giá trị trả lời `304`.
- Danh sách page có một **`version`**. `GET …/changes?since=<version>` trả lời những gì đã đổi từ đó:
  các content đã sửa, thêm hay bỏ, và một `version` mới để tiếp tục. Gửi lại `version` cuối trong
  `If-None-Match` để biết nhanh và rẻ rằng không có gì thay đổi.
- **Giới hạn của `changedSince`, nói thẳng.** Version được giữ trong bộ nhớ của tiến trình Tracy trong
  **30 phút** và tối đa **500 bước**; chúng không phải nhật ký bền. Khi một version quá cũ, có từ trước
  một lần khởi động lại, hay thuộc một ghế khác, câu trả lời là `409 CONTENT_SNAPSHOT_EXPIRED` — đọc
  lại `/pages` không kèm `since` và tiếp tục từ `version` mới của nó.
- **`If-Match`** chỉ được tôn trọng ở nơi site bảo đảm phép kiểm tra: `POST …/contract/apply` chuyển
  nó thành các revision content được kỳ vọng, và revision cũ trả lời `409` kèm `REVISION_STALE`.
  `PATCH`/`DELETE` của record không nhận `If-Match`.

## Hoàn tác: `apply_id` và revert

Mọi lượt ghi được ghi lại dưới một **`apply_id`** — một biên nhận bạn đặt tên trong header
`Tracy-Apply-Id` (hoặc Tracy đặt cho bạn: `api-<keyId>-<timestamp>`). Nhiều lượt ghi có thể dùng
chung một biên nhận; một `DELETE` buộc bạn phải nêu tên một biên nhận.

- `GET /v1/sites/{key}/applies` — vết audit các lượt áp của site.
- `GET …/applies/{id}` — các bước ghi dưới một biên nhận (kind, id, đường dẫn media, created).
- `POST …/applies/{id}/revert` — trả lại mọi bước, mới nhất trước; một record đang mở trong trình
  soạn thảo của CMS từ chối hoàn tác và câu trả lời nêu tên người đang giữ nó (`lockedBy`).

Lượt áp theo hợp đồng (`POST …/contract/apply`) hoàn tác theo cùng cách; biên nhận của chúng bắt đầu
bằng `contract-`.

## Idempotency

`PATCH …/records/{kind}/{id}` nhận header **`Idempotency-Key`**. Thử lại với cùng giá trị sau khi mất
phản hồi sẽ nhận lại kết quả đã lưu thay vì ghi lần nữa. Nó được chuyển cho site làm `request_id`
của plugin, nên chỉ tồn tại với những action mà plugin có lưu kết quả — `content.update` (`PATCH`
record) và, trên Joomla, `content.batch`. Không route nào khác hứa điều này.

## Phiên bản plugin

Trên Joomla và WordPress, site trả lời qua **plugin Claude Cowork** cài trên nó, và mỗi action tồn tại
từ một release nhất định của plugin đó. `GET /v1/sites/{key}` (`describe` của site) báo site đang chạy
gì; trang [Tương thích](/vi/reference/compatibility/) liệt kê release tối thiểu cho từng action,
và mỗi hướng dẫn nói cách cập nhật. Một action mà release đang cài không có trả lời `400 bad_action`;
một lượt đọc Content API trên plugin cũ hơn Content API trả lời `501 CONTENT_ADAPTER_UNSUPPORTED`.

Site EmDash không có plugin: Tracy đọc chúng qua bộ đọc riêng của mình (xem
[hướng dẫn EmDash](/vi/guides/emdash/)).

## Design system

Mỗi site Tracy dựng đều mặc một **design system**: bảng màu, thang chữ và khoảng cách có tên, giữ
dưới dạng biến CSS (token). `GET /v1/sites/{key}/design` cho biết site mặc hệ nào, hệ ấy từ đâu ra
(`source`: một hệ trong catalog, `brand` riêng của khách, token riêng của một `quickstart`, của
`template`, hoặc `none`) và giá trị các token site đang mặc. Tracy ghi lại khi dựng site và mỗi lần
`theme.style` đổi giao diện, nên câu trả lời đi theo site chứ không theo template ban đầu. Dùng các
token để giữ nội dung bạn viết trong bảng màu và font của site — màu hay font nằm ngoài chúng là thứ
phép kiểm thiết kế của Tracy sẽ cảnh báo.

```json
{
  "design": {
    "id": "apple",
    "name": "Apple",
    "source": "catalog",
    "platform": "wordpress",
    "tokens": { "--accent": "#0071e3", "--font-body": "\"SF Pro Text\", sans-serif" },
    "tokensFrom": "tracy-web:design-tokens.json",
    "updatedAt": "2026-09-29T12:00:00.000Z"
  }
}
```

`{"design": null}` là một câu trả lời, không phải lỗi: site không mặc hệ nào Tracy biết. ETag đi
theo `updatedAt`, nên `If-None-Match` trả `304` cho tới khi giao diện đổi.
