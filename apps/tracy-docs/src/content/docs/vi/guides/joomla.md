---
title: Joomla
description: Bên trả lời trên site Joomla — component Claude Cowork — release tối thiểu, các kind record, và những gì chỉ Joomla có.
---

## Bên trả lời lời gọi

Một site Joomla trả lời qua **component Claude Cowork** cài trên nó (gói `joomla-v…`). Tracy cấp quyền
cho khoá và ghế của bạn, rồi chuyển action tới component qua cửa riêng của site; component đọc và ghi
cơ sở dữ liệu Joomla qua chính API của Joomla và trả lời điều đã xảy ra. Không gì chạm tới file hay
cơ sở dữ liệu của site bằng con đường nào khác.

Bản tham chiếu mà tài liệu này viết theo là component release **0.18.4**. `GET /v1/sites/{key}`
(`describe` của site) báo release site thật sự đang chạy.

## Release tối thiểu

Bảng đầy đủ được sinh ở trang [Tương thích](/vi/reference/compatibility/). Những release mà các
route `/v1` phụ thuộc:

| Route | Action | Component Joomla |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.18.0 (`native` 0.18.2, nhiều id trong một lượt đọc 0.18.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0 (`If-Match` → `expected_content_revisions` 0.18.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

Một action mà release đang cài không có trả lời `400 bad_action`. Cập nhật component từ Tracy (agent
có thể cài release mới hơn qua `extension.install`), hoặc từ trình quản lý Extensions của chính Joomla.

## Các kind record

`{kind}` trong các route `records` là một trong các kind ghi được của Joomla: `article`, `category`,
`tag`, `field`, `menuItem`, `menutype`, `redirect`, `banner`, `bannerClient`, `contact`, `newsfeed`,
`language`, `articleAssociation`, `menuAssociation`, `moduleAssignment`, `languageFilter`, `module`,
`templateStyle`, `user`, `extensionParams`. `content.list` mặc định là `article`.

Record được định địa chỉ bằng `id` số. Field là các cột của bảng: `title`, `introtext`, `fulltext`,
`state`, `catid` của một article; `title`, `alias`, `parent_id` của một menu item. Trên một menu
item, category hay tag đã có, `parent_id` hoặc `move_after` dời nó cùng mọi thứ bên dưới.

## Những gì chỉ Joomla có

- **Giao dịch.** `content.batch` ghi tới 100 record trong một giao dịch cơ sở dữ liệu với các kiểm tra
  trước `expected` — tất cả cùng vào hoặc không gì vào. Đây là một action của cửa Apply, (chưa) phải là
  route `/v1`.
- **Các phép hợp đồng đa ngôn ngữ và cắt demo.** Mọi phép `multilingual.*`, `demoTrim.*`,
  `siteLanguage.*` và `sourceLanguage.*` của `POST …/contract/{operation}` được trả lời khi quickstart
  của site có kèm profile đó; WordPress chỉ trả lời `multilingual.retire` và `multilingual.restore`.
- **Snapshot cơ sở dữ liệu** (`db.snapshot`, `db.rollback`) và **nâng cấp core** (`core.upgrade`) có
  trên cửa Apply cho bộ công cụ `site` và `code`; chúng không được mở ra trên `/v1`.

## Cần lưu ý

- **Record bị khoá.** Một record đang mở trong trình soạn thảo của Joomla (checked out) từ chối lượt
  ghi bằng `409 locked` và nêu `lockedBy`. Nhờ người đó đóng lại; không có cách ghi đè.
- **Thùng rác, không xoá hẳn.** `DELETE …/records/{kind}/{id}` đặt trạng thái thùng rác của kind đó;
  `revert` đưa nó trở lại. Kind không có trạng thái thùng rác bị từ chối.
- **Site có hợp đồng.** Site dựng từ một quickstart của Tracy mang một hợp đồng nội dung. Ưu tiên
  `POST …/contract/apply` cho các slot của thiết kế: nó kiểm tra giới hạn, bằng chứng và khoá trước
  khi ghi, và từ chối theo kiểu tất cả hoặc không gì.
