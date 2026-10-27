# QA `20261003a` · develop `8e65e80` → `a1b2c3d` (stand: `a1b2c3d`, đã đối chiếu) · 37 PR, 1 commit không qua PR

**Cần anh xem: 1 PR** (sonnet đỏ 2, sol đỏ 3, trùng 1; astra xác nhận 2)
Chưa kết luận 1 · Quan sát thấy đúng tại T 1 · Không kiểm được 1 · Chỉ docs 2 · Chưa tới lượt 0 · Chưa phân loại 0
baseline `valid` · hàng rào và canary phía stand đạt · chat: mồi đạt, 29 lượt, 1 treo · 4 giờ 12 phút
Model: `opus` · `sonnet` · sol = `gpt-6.1-sol` effort `low` · verify = `gpt-6-astra` effort `high`

## Cần anh xem

| PR | Ai | Ca | PR nói | Stand tại T cho thấy | Khác B? | Làn đỏ | Issue | Tự xem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #745 | `leeknowsai` | `pr745-k3` | `''' </td> @TracyHQ/all [x](https://evil.example) \| <img src=x>` | `GET /api/sites returned 500` | có | `sonnet`, `sol` | #812 | `qa-tool/scripts/qa/rerun sonnet 745 pr745-k3` |

## Hai làn khác nhau trên cùng ca

| PR | Ca | sonnet | sol |
| --- | --- | --- | --- |
| #750 | `pr750-k1` | đỏ | không viết được test |

## Chưa kết luận · Chưa phân loại (hết quỹ) · Đang theo dõi

**Chưa kết luận**

- #751 `pr751-k2`: `verify could not log in`

**Chưa phân loại (hết quỹ)**

Không có.

**Đang theo dõi**

- #700 `pr700-k1` (issue #790), đêm thứ 3

## Quan sát thấy đúng tại T

| PR | Ca | Câu trích | Làn |
| --- | --- | --- | --- |
| #752 | `pr752-k1` | `The tab title shows the site name.` | `sonnet` |

## Không kiểm được · Chỉ docs · Commit không qua PR · Chưa tới lượt · reverted / superseded / skipped

**Không kiểm được**

- #753: `needs a Stripe account`

**Chỉ docs**

#754, #755

**Commit không qua PR**

- `ffee001` `chore: bump [x](https://evil.example)`

**Chưa tới lượt**

Không có.

**reverted / superseded / skipped**

- #756 `reverted`: `Revert of 1a2b3c4`

## Issue: mới, thêm ca, không mở · xác nhận / báo sai theo làn

**Mới**

- #812 ← PR #745: `pr745-k3`

**Thêm ca**

Không có.

**Không mở**

- PR #757 (`pr757-k1`): dính bộ quét: `JWT shape`

**Chưa gán**

Không có.

**Issue chưa rõ (P0 đêm sau đối chiếu)**

Không có.

| Làn | Người xác nhận | Báo sai |
| --- | --- | --- |
| sonnet | 1 | 0 |
| sol | 0 | 1 |

## So hai làn (đêm này) và hai ca hiệu chỉnh

| Chỉ số | sonnet | sol |
| --- | --- | --- |
| calib-true (mong xanh) | xanh | xanh |
| calib-false (mong đỏ, astra differs) | đỏ, `differs` | đỏ, `differs` |
| Ca có test chạy được / ca Opus giao | 31 / 40 | 35 / 40 |
| Ca đỏ trên T | 4 | 6 |
| trong đó differs | 2 | 3 |
| trong đó test-wrong | 1 | 2 |
| Người xác nhận | 1 | 0 |
| Người báo sai | 0 | 1 |
| PR hết giờ | 1 | 0 |
| Phút mỗi PR | 9 | 7 |
| Chi phí (nguyên dạng) | `$31.20` | `8.1M tokens` |

Mẫu số nhỏ (4 ca): chưa đủ để kết luận.

## Hồi quy · bộ lõi · cách ly

Bộ lõi: `green`

Bộ hồi quy: 11/12 xanh, 1 đỏ

**Cách ly**

- `pr690-k2`: `flaky twice in 7 nights`

## Chat của stand

Lượt theo làn: sonnet 14 · sol 11 · verify 4

Lượt hỏng: treo 1 · QUOTA 402 0 · MISSING_CREDENTIAL 0 · lỗi nhà cung cấp 0

Số dư DeepSeek: đầu đêm `41.20 USD`, cuối đêm `39.85 USD`

## Trục trặc của lượt chạy

Site: tạo 8, xoá 8, orphan 1

```
build: ok
orphan site qa-x1 removed
```

## Đường vào

- Vào stand: `http://qa.tracy.test:36080/__qa/human?k=abc` rồi /login
- Mã OTP: `qa-tool/scripts/qa/otp <email>`
- Chạy lại một test trong hàng rào: `qa-tool/scripts/qa/rerun <lane> <pr> [case]`
