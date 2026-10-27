---
title: WordPress
description: Plugin Claude Cowork xử lý lời gọi trên site WordPress — release tối thiểu, các kind record và key, và điểm khác với Joomla.
---

## Plugin xử lý lời gọi

Site WordPress xử lý lời gọi qua **plugin Claude Cowork** cài trên site (gói `wordpress-v…`). Tracy
kiểm tra API key và seat của bạn, rồi chuyển action tới plugin qua endpoint riêng của site; plugin
đọc, ghi bằng chính các hàm của WordPress và trả về kết quả.

Tài liệu này được viết theo plugin release **0.14.3**. `GET /v1/sites/{key}` (`describe` của site)
cho biết release mà site đang thực sự chạy.

## Release tối thiểu

Bảng đầy đủ được sinh tự động ở trang [Tương thích](/vi/reference/compatibility/). Các release
mà route `/v1` cần:

| Route | Action | Plugin WordPress |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.14.0 (`native` 0.14.2, đọc nhiều id trong một lần gọi 0.14.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0 (`If-Match` → `expected_content_revisions` 0.14.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

Nếu release đang cài chưa có action được gọi, site trả về `400 bad_action`. Hãy cập nhật plugin từ
Tracy (agent có thể cài release mới hơn qua `plugin.install`) hoặc từ màn hình Plugins của site.

## Các kind record và key

`{kind}` là một trong `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`.

- **`post`** gồm mọi post type — page, post và các kiểu tuỳ biến. `GET …/records/post` chỉ liệt kê
  post; lọc theo `?post_type=` hoặc tìm một slug bằng `?name=`. Các kind khác chỉ đọc được từng
  record một.
- **Key đi kèm id.** `option` (theo tên) và `templatePart` (theo slug: `header`, `footer`) không có
  id số: dùng `0` cho `{id}` và chỉ định record bằng key. Với `postmeta`, `{id}` là ID của post và
  key là meta key; với `term`, `{id}` là ID của term và key là taxonomy; với `menuItem`, `{id}` là
  ID của chính nó và key là menu chứa nó (slug hoặc tên). `GET` và `DELETE` nhận key
  qua query `?key=` (`GET …/records/option/0?key=blogname`); `PATCH` nhận key là trường `"key"`
  trong body.
- **Những gì xoá được.** `DELETE` hỗ trợ `post`, `templatePart` và `menuItem`. Khi xoá `menuItem`,
  hãy truyền menu của nó qua `?key=`: thiếu key thì lệnh xoá vẫn thành công, nhưng `revert` không
  ghi lại được mục đó. Không xoá được `option` và `postmeta`: hãy ghi giá trị rỗng thay vì xoá.
  `term` cũng không xoá được: dùng `PATCH` để sửa, hoặc tạo mới với `{id}` là `0` kèm `name`
  (các field: `name`, `slug`, `description`, `parent`).
- Field giữ nguyên tên của WordPress: `post_title`, `post_content`, `post_status`, `post_name` với
  post; `value` với option.

## Điểm khác với Joomla

- **Không có transaction.** WordPress không có `content.batch`: nhiều thay đổi là nhiều request; hãy
  gửi chúng với cùng một `apply_id` nếu muốn hoàn tác một lần. Nếu một request lỗi, các thay đổi
  trước đó vẫn giữ nguyên cho tới khi bạn hoàn tác theo `apply_id` đó.
- **Các thao tác contract.** `POST …/contract/{operation}` hỗ trợ `inspect`, `bind`, `apply`,
  `demoTrim.*` (`plan`, `apply`, `revert`), `siteLanguage.*` và `sourceLanguage.*`; với nhóm đa ngôn
  ngữ chỉ có `multilingual.retire` và `multilingual.restore`. `inspect`/`bind` nhận `contract`, tức
  profile dùng để đối chiếu.
- **Bản dịch.** Ngôn ngữ do plugin dịch của site (Polylang) xử lý qua action Apply
  `content.language` (plugin 0.9.0); bản dịch core qua `language.install` (0.11.0). Cả hai hiện
  chưa có route `/v1`.
- **Theme.** `theme.style` áp một style variation của block theme đang dùng (0.8.1); theme và plugin
  được cài từ URL của gói. Các action này cần bộ công cụ `code` và chỉ gọi được qua endpoint Apply.
- **Lỗi fatal.** Lỗi PHP fatal bên trong plugin trả về `500 fatal` kèm tên file và số dòng; lời gọi có
  thể đã chạy một phần, nên hãy đọc lại site trước khi thử lại.

## Cần lưu ý

- **Record đang bị khoá.** Post đang mở trong block editor sẽ từ chối thay đổi với `409 locked` và
  cho biết người giữ khoá qua `lockedBy`.
- **Chỉ post vào thùng rác.** `DELETE` với `post` dùng thùng rác của WordPress. `templatePart` và
  `menuItem` bị xoá vĩnh viễn; `revert` ghi lại chúng từ bản sao được lưu cùng apply.
- **`itemsCursor`** trên `GET …/contents/{id}` được nhận diện nhưng WordPress chưa hỗ trợ
  (`501 CONTENT_ADAPTER_UNSUPPORTED`); hãy phân trang block bằng `blocksCursor`.
