---
title: Xác thực
description: Khoá API gắn với ghế — khoá là gì, được làm gì, gửi thế nào, bị thu hồi và giới hạn tần suất ra sao, và những gì API host không bao giờ chấp nhận.
---

## Một khoá là một ghế, thu hẹp lại

Mỗi khoá API thuộc về **một tài khoản và một site**. Người tạo khoá phải đang giữ một ghế còn hiệu lực
trên site đó, và khoá hành động **với tư cách chính người ấy**: mọi lượt đọc và ghi đều được cấp
quyền, giữ lease và ghi audit dưới tên họ. Không có khoá nào với tới "mọi site của tôi" — một site,
một khoá.

Khoá được làm gì là giao của hai thứ:

1. **Quyền hiệu lực của ghế** — các bộ công cụ mà chính sách của site hay workspace cấp cho vai
   (`owner`, `admin`, `developer`, `editor`). Một owner giữ mọi bộ công cụ; một editor, theo mặc
   định, chỉ có `content`.
2. **Các scope của khoá** — một tập con của `content`, `code`, `site`, `lifecycle`, chọn lúc tạo
   khoá.

Một khoá không bao giờ làm được nhiều hơn ghế của chủ nó. Thu hẹp một vai trong chính sách workspace
là thu hẹp mọi khoá người đó đã tạo; cấp cho khoá một scope mà chủ khoá không có thì không cấp thêm
gì (lời gọi trả lời `403 TOOLSET_NOT_GRANTED`). Ngay cả khoá của một owner với `scopes: ["content"]`
cũng không sửa được code.

Lượt đọc cần một khoá còn hiệu lực trên đúng site với ít nhất một scope. Các route `records` là bề mặt
thô (chính các hàng dữ liệu của CMS); các route `pages`, `contents` và `changes` là góc nhìn Content
API của cùng site ấy, và cả hai được kiểm tra theo cùng một cách.

## Gửi khoá

```http
GET /v1/sites/shop.example.com/pages HTTP/1.1
Host: api.tracy.ai
Authorization: Bearer trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

- Scheme là `Bearer`, header là `Authorization`, và khoá là trọn chuỗi `trk_<id>.<secret>`.
- **Chỉ Bearer, chỉ trên API host.** `api.tracy.ai` không đọc cookie phiên nào: một phiên trình duyệt
  trên `cowork.tracy.ai` không phải là chứng thực ở đây, và một yêu cầu mang cookie được coi như không
  mang gì. Khoá thiếu hoặc sai định dạng trả lời `401 KEY_INVALID`.
- Khoá gửi tới hostname riêng của Tracy (`cowork.tracy.ai`) bị bỏ qua: các route đó nhận cookie phiên
  hoặc assertion có chữ ký của agent, không bao giờ nhận khoá.
- Các header agent của Tracy dùng để đặt tên cuộc hội thoại (`x-tracy-session`, `x-tracy-actor`,
  `x-tracy-workspace-label`) bị **loại bỏ** khỏi yêu cầu `/v1`. Lease giữ cho hai bên ghi không đụng
  nhau trên một site được nắm dưới danh tính riêng của khoá (`key:<id>`), do máy chủ quyết định.

## Vòng đời

| Sự kiện | Hiệu ứng |
|---|---|
| Tạo | Khoá đầy đủ hiện một lần. Tracy lưu một hash (HMAC-SHA256 với pepper phía máy chủ); không thể hiện lại bí mật. |
| Dùng | `last_used_at` cập nhật, tối đa một lần mỗi phút. |
| Hết hạn (`expires_at`, tuỳ chọn) | Mọi lời gọi trả lời `401 KEY_EXPIRED`. |
| Bị chủ khoá thu hồi | Mọi lời gọi trả lời `401 KEY_REVOKED`. **Thu hồi là vĩnh viễn** — cấp lại ghế sau đó không đưa khoá trở lại. |
| Ghế của chủ khoá bị thu hồi | Mọi lời gọi trả lời `403 SEAT_NOT_AUTHORIZED` ngay lập tức; ghế được kiểm tra ở từng yêu cầu, không cache. |
| Site bị xoá | Khoá bị xoá cùng site. |

Khoá được quản lý trong Settings của Tracy, hoặc qua các cửa tài khoản trên hostname riêng của Tracy
(`GET /api/me/keys`, `POST /api/me/keys`, `DELETE /api/me/keys/{id}`), vốn nhận phiên trình duyệt —
không bao giờ nhận khoá.

## Không nhúng khoá vào frontend

Một khoá là một bí mật có tầm với bằng ghế của bạn. Giữ nó trên máy chủ, trong một secret của CI hay
trong một công cụ chạy tại máy; không bao giờ đặt trong một trang web, một ứng dụng di động hay một
repository công khai. Trên `/v1`, API chỉ trả lời trình duyệt từ đúng một origin — origin của bộ tài liệu này, cho nút
**Test request** của [tham chiếu](/vi/reference/) — và không bao giờ kèm thông tin đăng nhập
(credentials), nên một trang ở origin khác không thể gọi nó bằng khoá, kể cả vô tình. **Test request**
không lưu gì: khoá gõ vào đó chỉ sống trong tab ấy.

## Giới hạn tần suất

Giới hạn tính theo từng khoá, trong hai nhóm, đếm trước khi lời gọi đến site:

| Nhóm | Giới hạn | Tính những gì |
|---|---|---|
| read | 6.000 mỗi giờ | mọi route không thay đổi gì |
| write | 600 mỗi giờ | mọi route thay đổi site (`PATCH`, `DELETE`, `POST …/contract/*`, `POST …/revert`) |

Vượt giới hạn, câu trả lời là `429 RATE_LIMITED` với header `Retry-After` cho biết số giây đến khi cửa
sổ tiếp theo mở. Bộ đếm là fail-closed: nếu không đọc được nó, lời gọi bị từ chối thay vì được cho
qua.

## Mã lỗi của tầng này

| Status | Mã | Nghĩa |
|---|---|---|
| 401 | `KEY_INVALID` | Không có `Authorization: Bearer trk_…`, hoặc khoá không tồn tại, hoặc bí mật của nó không khớp. |
| 401 | `KEY_REVOKED` | Khoá đã bị thu hồi. Tạo khoá mới. |
| 401 | `KEY_EXPIRED` | `expires_at` của khoá đã qua. Tạo khoá mới. |
| 403 | `SEAT_NOT_AUTHORIZED` | Chủ khoá không giữ ghế còn hiệu lực trên site này (ghế đã bị thu hồi, hoặc đường dẫn nêu tên site khác). |
| 403 | `TOOLSET_NOT_GRANTED` | Action cần một bộ công cụ nằm ngoài scope của khoá ∩ quyền của ghế; câu trả lời nêu `toolset` và `role`. |
| 429 | `RATE_LIMITED` | Vượt một trong hai nhóm; chờ `Retry-After` giây. |

Mọi lời từ chối khác — kể cả câu trả lời của chính site — nằm ở trang [Lỗi](/vi/reference/errors/).
