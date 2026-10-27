---
title: Bắt đầu nhanh
description: Năm lời gọi curl — tạo khoá, kiểm tra khoá, liệt kê page của một site, đổi một tiêu đề, rồi hoàn tác.
---

Bạn cần một ghế trên một site do Tracy lưu trữ (vai nào cũng được) và `curl`. Mọi lời gọi dưới đây
đều đi tới `https://api.tracy.ai` (trên môi trường phát triển là `https://api.tracy.site`) và mang
khoá dưới dạng Bearer token. Không bước nào ở đây dùng phiên trình duyệt.

## 1. Tạo khoá

Mở site trong Tracy, vào **Settings → API keys**, rồi tạo một khoá cho site đó. Chọn một nhãn (ví dụ
`demo laptop`) và các scope khoá được dùng — `content` là đủ cho trang này.

Khoá đầy đủ chỉ hiện **một lần**: `trk_<16 characters>.<32 characters>`. Cất nó ở nơi bạn giữ bí mật;
Tracy chỉ giữ một hash của nó. Danh sách khoá hiện một gợi ý của từng khoá, không bao giờ hiện bí mật.

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. Kiểm tra khoá hành động với tư cách ai

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

Một khoá gắn với một tài khoản và một site. `siteKey` là tên chuẩn của site và là giá trị của
`{key}` trong mọi đường dẫn bên dưới.

## 3. Liệt kê page của site

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

Câu trả lời là tài liệu `pages` của Content API: mọi page đã xuất bản cùng `contentId`, `locale`,
`url` và `revision` của nó, kèm một `version` cho cả danh sách. Phản hồi mang một `ETag` bằng đúng
version ấy; gửi lại nó trong `If-None-Match` và câu trả lời sẽ là `304 Not Modified` khi không có gì
thay đổi.

Đọc trọn một content (block, field, các hàng CMS mà nó lấy ra từ đó):

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

Mỗi content nêu tên record `native` của nó — loại và id trong CMS nơi chữ thật sự nằm. Đó là thứ bước
tiếp theo sẽ sửa.

## 4. Đổi một tiêu đề

Record là chính các hàng dữ liệu của site: một `article` Joomla, một `post` WordPress, và tương tự.
Một `PATCH` ghi các field được chỉ định của một record và ghi lại cách hoàn tác dưới một `apply_id` do
bạn chọn (header `Tracy-Apply-Id`; Tracy tự sinh `api-<keyId>-<timestamp>` khi bạn bỏ trống).

```bash
curl -s -X PATCH "$TRACY_API/sites/shop.example.com/records/post/42" \
  -H "Authorization: Bearer $TRACY_KEY" \
  -H "Content-Type: application/json" \
  -H "Tracy-Apply-Id: quickstart-title-1" \
  -H "Idempotency-Key: quickstart-title-1-try-1" \
  -d '{ "fields": { "post_title": "Fresh bread every morning" } }'
```

```json
{ "kind": "post", "id": 42, "created": false }
```

Trên Joomla, cùng thay đổi ấy là `records/article/<id>` với `{ "fields": { "title": "…" } }`. Thay
đổi có hiệu lực ngay. Thử lại với cùng `Idempotency-Key` sau khi mất phản hồi sẽ nhận lại kết quả đã
lưu thay vì ghi hai lần.

## 5. Hoàn tác

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

Mọi thứ đã ghi dưới `quickstart-title-1` được trả lại như cũ, mới nhất trước. `GET
…/applies/quickstart-title-1` liệt kê những gì biên nhận đang giữ trước khi bạn hoàn tác.

## Đọc gì tiếp

- [Xác thực](/vi/authentication/) — một khoá được làm gì, và không bao giờ được làm gì.
- [Khái niệm](/vi/concepts/) — page, content, block, field, slot, record, revision và hoàn tác.
- [Hướng dẫn](/vi/guides/joomla/) — điểm khác nhau trên Joomla, WordPress và EmDash.
- [Tham chiếu API](/vi/reference/) — mọi route, tham số và câu trả lời, có nút **Test request**.
