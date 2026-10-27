# Thuật ngữ chuẩn cho bản dịch tiếng Việt của DSH

Bảng này là nguồn tham chiếu duy nhất khi dịch. Mọi namespace phải dùng cùng
một từ cho cùng một khái niệm; sai lệch giữa các trang là lỗi dịch.

## Khái niệm lõi

| Tiếng Anh | Tiếng Việt | Ghi chú |
|---|---|---|
| Session | Phiên | "New Session" → "Phiên mới"; không dùng "buổi" |
| Workspace | Không gian làm việc | Rút gọn thành "Không gian" chỉ khi chỗ hiển thị quá hẹp |
| Agent | Agent | Giữ nguyên: là danh từ kỹ thuật của sản phẩm |
| Subagent | Agent con | |
| Tool | Công cụ | "Tool call" → "lượt gọi công cụ" |
| Plugin | Plugin | Giữ nguyên |
| Skill | Skill | Giữ nguyên: tên thực thể cài được, không dịch thành "kỹ năng" |
| Model | Mô hình | |
| Provider | Nhà cung cấp | Nhà cung cấp mô hình |
| Prompt | Prompt | Giữ nguyên |
| Goal | Mục tiêu | |
| Job | Tác vụ nền | Rút gọn "Tác vụ" khi ngữ cảnh đã rõ |
| Approval | Phê duyệt | |
| Trajectory | Diễn tiến | Chuỗi bước thực thi của một lượt |
| Deliverables | Tệp kết quả | Tệp do một lượt tạo ra |
| Turn | Lượt | Một lượt hỏi–đáp |
| Step | Bước | |
| Run | Lần chạy | Danh từ; động từ là "chạy" |
| Fork | Tách nhánh | |
| Archive | Lưu trữ | |
| Compact | Nén ngữ cảnh | Chỉ hành động compaction |
| Steer | Chỉnh hướng | Gửi thêm chỉ dẫn khi đang chạy |

## Hành động

| Tiếng Anh | Tiếng Việt |
|---|---|
| Copy | Sao chép |
| Retry | Thử lại |
| Cancel | Huỷ |
| Close | Đóng |
| Delete | Xoá |
| Remove | Xoá / Loại bỏ (khỏi danh sách) |
| Edit | Sửa |
| Save | Lưu |
| Submit | Gửi |
| Send | Gửi |
| Stop | Dừng |
| Expand / Collapse | Mở rộng / Thu gọn |
| Enable / Disable | Bật / Tắt |
| Select / Choose | Chọn |
| Open | Mở |
| Reset | Đặt lại |
| Refresh | Làm mới |
| Apply | Áp dụng |
| Confirm | Xác nhận |
| Dismiss | Bỏ qua |

## Trạng thái

| Tiếng Anh | Tiếng Việt |
|---|---|
| Loading… | Đang tải… |
| Failed to load | Không tải được |
| Unavailable | Không khả dụng |
| Unknown | Không rõ |
| Pending | Đang chờ |
| Running | Đang chạy |
| Completed / Done | Hoàn tất |
| Blocked | Bị chặn |
| Truncated | Đã cắt bớt |
| Read-only | Chỉ đọc |

## Quy ước hành văn

- Dấu ba chấm: theo đúng bản gốc. Bản gốc dùng `…` thì dùng `…`; bản gốc dùng
  `...` thì giữ `...` (ví dụ `chat/chat.deepDiving`, `workspace/search.placeholder`).
  Phần lớn chuỗi upstream dùng `…`, nên đó là mặc định khi tự viết chuỗi mới.
- Giữ nguyên mọi placeholder `{tên}`, `{0}`, và tên khoá kỹ thuật.
- Nhãn nút, mục menu, tiêu đề: viết hoa chữ đầu, không viết hoa toàn bộ từ.
- Câu mô tả (description, hint) viết đủ câu; không thêm dấu chấm nếu bản gốc
  không có.
- Nhãn `aria-*` và tooltip mô tả hành động, dịch thành cụm động từ.
- Không dịch: tên tệp, đường dẫn, tên cờ dòng lệnh, tên lệnh `/slash`,
  định danh gói npm, mã lỗi, tên khoá cấu hình.
- Giữ nguyên `DSH`, `DeepSeek Harness`, `Cordis`, `MCP`, `ACP`, `API`, `JSON`,
  `YAML`, `URL`, `HTTP`, `SSE`, `token`, `git`, `npm`, `pnpm`.
