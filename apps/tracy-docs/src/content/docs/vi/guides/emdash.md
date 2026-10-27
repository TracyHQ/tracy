---
title: EmDash
description: Site EmDash không có plugin Claude Cowork — Tracy đọc nó qua bộ đọc riêng, còn lượt ghi đi qua REST và MCP API của chính site.
---

## Bên trả lời lời gọi

Một site **EmDash** không mang plugin Claude Cowork. Lượt đọc đi qua **bộ đọc riêng của Tracy**, vốn
nói chuyện với EmDash API của site và trả lời cùng những tài liệu Content API như hai CMS kia:
`GET /v1/sites/{key}` (describe), `…/pages`, `…/contents`, `…/contents/{id}` và `…/changes` đều hoạt
động, với cùng hành vi `ETag`, `version` và `changedSince`.

Bộ đọc không có release riêng để kiểm: nó đi kèm Tracy, nên bảng [Tương thích](/vi/reference/compatibility/)
không hiện phiên bản tối thiểu ở cột EmDash. Tracy đọc những gì site đang giữ và nói rõ khi một
collection không có site model.

## Ghi: API của chính site

Các route `records`, các phép `contract` và biên nhận hoàn tác do plugin Claude Cowork trên Joomla và
WordPress trả lời; site EmDash không có plugin, nên trên EmDash chúng trả lời
`501 CONTENT_ADAPTER_UNSUPPORTED` (các lượt đọc mà bộ đọc không phục vụ) hoặc `unsupported`.

Để sửa một site EmDash, dùng **REST và MCP API của chính nó**, do EmDash ghi thành tài liệu ngay trên
site tại `/_emdash/api/openapi.json`, với chứng thực site ấy cấp. Agent của Tracy ở đó cũng làm y như
vậy: đọc qua Tracy và ghi qua MCP của EmDash.

## Điểm khác với Joomla và WordPress

| | Joomla / WordPress | EmDash |
|---|---|---|
| Đọc (`content.read`) | plugin Claude Cowork, từ release 0.18.0 / 0.14.0 | bộ đọc của Tracy, luôn luôn |
| `content.locate` (record nào in ra một phần tử) | có | có |
| `PATCH` / `DELETE` record, lượt áp theo hợp đồng, hoàn tác | plugin | không qua Tracy — API của chính site |
| Kiểu nội dung | bản đồ CMS của plugin | một kiểu cho mỗi collection, từ `content-api-map.json` của template |
| `native` | kind + id của CMS | collection và entry của EmDash |

## Cần lưu ý

- Một template không kèm site model trả lời `describe` bằng những gì bộ đọc suy ra được, và nói rõ
  điều đó; đừng trông đợi slot trên site như vậy.
- `changedSince` có cùng giới hạn 30 phút / 500 bước như trên các nền tảng khác; gặp
  `409 CONTENT_SNAPSHOT_EXPIRED` thì đọc lại `/pages`.
