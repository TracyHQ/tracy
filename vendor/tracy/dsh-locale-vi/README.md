# dsh-locale-vi

Gói ngôn ngữ tiếng Việt cho giao diện web của [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), gồm cả DSH Desktop.

Plugin đăng ký locale `vi` vào registry `locale` của client, kèm **1487 chuỗi trên 34 namespace** — toàn bộ dictionary của những client plugin đang được mount. Mỗi chuỗi được dịch thủ công theo đúng ngữ cảnh UI nơi nó xuất hiện, không dùng dịch máy.

Sau khi cài, "Tiếng Việt" xuất hiện trong Settings → General → Language, cạnh English và 中文.

> Gói này phát hành qua GitHub, không qua npm. Tên `dsh-locale-vi` trên npm registry thuộc về một gói khác của tác giả khác.

## Cài đặt

Một lệnh, chạy ở đâu cũng được:

```bash
dsh plugin --profile desktop add github:PhuVinhAI/dsh-locale-vi
```

Rồi khởi động lại DSH. Xong.

Lệnh này tải package từ GitHub, cài vào profile, và tự thêm `dsh-locale-vi` vào `dsh.profile.bundles` — vì package khai báo `dsh.bundle.patch`, nên `dsh` nhận ra đây là một layer plugin chứ không phải thư viện thường. Bạn không phải sửa `cordis.patch.yml` bằng tay.

Đổi `desktop` thành tên profile bạn dùng nếu khác. Trên DSH Desktop, lệnh `dsh` có sẵn trong PATH sau khi cài app.

Cập nhật khi có bản mới:

```bash
dsh plugin --profile desktop update dsh-locale-vi
```

Bỏ cài:

```bash
dsh plugin --profile desktop remove dsh-locale-vi
```

Sau khi khởi động lại, "Tiếng Việt" nằm ở Settings → General → Language. Chỉ tải lại trang là không đủ: bảng plugin phía trình duyệt được host quét lúc boot.

### Cài từ bản checkout cục bộ

Nếu bạn muốn sửa bản dịch tại chỗ và thấy kết quả ngay:

```bash
git clone https://github.com/PhuVinhAI/dsh-locale-vi.git
cd dsh-locale-vi
dsh plugin --profile desktop add link:.
```

`link:` giữ liên kết tới thư mục làm việc, nên sau khi sửa `locales/` và chạy `npm run build`, chỉ cần khởi động lại app là thấy.

### Mount bằng tay

Nếu bạn không dùng `dsh plugin` mà tự quản lý profile, hãy thêm vào `cordis.patch.yml` của profile:

```yaml
- insert:
    - id: locale-vi
      name: 'dsh-locale-vi'
```

Hàng này phải nằm sau hàng `locale` (do `@deepseek-ai/dsh-web-app` cung cấp); patch của profile áp dụng sau mọi bundle nên điều đó được đảm bảo sẵn.

## Cách hoạt động

`lib/index.js` là nửa host: một `apply` rỗng, chỉ để hàng plugin xuất hiện trong Loader và trong lần quét `dsh.client`.

`lib/client.js` là nửa trình duyệt, được sinh ra từ `locales/`. Nó gọi:

- `locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` — thêm mục ngôn ngữ. Fallback là `en` vì mọi chuỗi fallback phải kết thúc ở tiếng Anh, locale terminal duy nhất của registry.
- `locale.register(ns, 'vi', dict)` cho từng namespace — dùng dạng per-locale untyped, đúng dạng dành cho gói ngôn ngữ.

Mỗi lượt đăng ký nằm trong `ctx.effect` riêng và trả về disposer, nên khi hàng plugin bị dừng hoặc nạp lại, mọi thứ nó thêm vào đều được thu hồi và giao diện quay về tiếng Anh.

Khi một khoá không có trong `vi`, registry đi tiếp theo chuỗi fallback (`vi` → `en`) trong namespace đó, rồi lặp lại chuỗi ấy trong namespace `common`, cuối cùng mới hiển thị chính tên khoá. Nghĩa là một khoá thiếu sẽ suy giảm về tiếng Anh chứ không làm hỏng giao diện.

## Kiểm tra sau khi app cập nhật

Bản dịch không tự hỏng khi DSH lên phiên bản mới — nó *lệch âm thầm*. Khoá mới thì hiện tiếng Anh, khoá bị bỏ thì bản dịch nằm lại vô dụng, và tệ nhất là khi upstream **sửa lại câu tiếng Anh** của một khoá đã dịch: giao diện vẫn hiện tiếng Việt, không có lỗi nào, nhưng nội dung đã sai so với cái nó đang mô tả.

Quy trình này biến cả ba thành một danh sách việc cụ thể.

```bash
npm run check
```

Bằng hai bước: `scan` xác định app đang cài những bundle nào, `audit` đối chiếu bản dịch với chúng. Sạch thì im lặng và thoát 0.

### Khi có thay đổi

`npm run scan` xử lý tầng gói: nó dò mọi package đã cài có `dsh.client.platform === "web"`, export `./client`, và trong bundle có gọi `locale.register(` — đúng điều kiện mà `@deepseek-ai/dsh-client-modules` dùng lúc boot. So với `baseline/mounted.json`, nó báo:

- **NEW BUNDLE** — plugin mới mang theo namespace chưa ai dịch. Bạn quyết: dịch, hoặc ghi vào `excluded` kèm lý do.
- **COVERED BUNDLE no longer installed** — plugin đã bị bỏ.
- **version changed** — package lên phiên bản; câu chữ có thể đã đổi, `audit` sẽ nói rõ.

`npm run audit` xử lý tầng chuỗi, mỗi phát hiện kèm sẵn ngữ cảnh để bạn dịch ngay:

| Nhóm | Nghĩa |
|---|---|
| `NEW KEY` | Upstream thêm chuỗi. Đang hiện tiếng Anh. |
| `REWORDED UPSTREAM` | Câu tiếng Anh sau lưng một khoá đã dịch đã đổi. In cả `en` mới và `vi` hiện có để bạn so. |
| `REMOVED UPSTREAM` | Khoá không còn; xoá mục tiếng Việt. |
| `NEW NAMESPACE` | Cả một namespace mới. |
| `NAMESPACE GONE` | Bundle không còn đăng ký namespace đó. |
| `PLACEHOLDER MISMATCH` | Lệch `{tên}` — chuỗi sẽ hiện nguyên dấu ngoặc. |
| `NEWLINE COUNT MISMATCH` | Lệch số `\n` — layout khác bản gốc. |
| `STILL ENGLISH` | Còn nguyên tiếng Anh, mà không nằm trong whitelist. |

Thêm `--json` khi danh sách dài hoặc muốn xử lý bằng script.

### Vòng làm việc

```bash
npm run check                                   # xem cần làm gì
node tools/dump-reference.mjs --bilingual chat   # lấy tham chiếu en+zh cho namespace cần sửa
# sửa locales/chat.json ...
npm run build                                    # sinh lại lib/client.js
npm run check                                    # phải sạch
npm run accept                                   # chốt baseline mới
git add -A && git commit
```

`npm run accept` từ chối chạy khi `audit` còn phát hiện — chốt baseline lúc còn việc dở sẽ chôn luôn đúng thứ mà baseline sinh ra để phát hiện. Muốn nhận nguyên trạng bản cài (lần đầu, hoặc khi cố tình bỏ qua một namespace) thì dùng `node tools/accept-baseline.mjs --init`.

### Baseline hoạt động thế nào

`baseline/fingerprints.json` lưu **digest SHA-256 rút gọn 16 ký tự cho từng khoá tiếng Anh**, không lưu chính câu chữ. Đó là điều kiện để phát hiện `REWORDED`: khoá vẫn còn, bản dịch vẫn render, chỉ có digest đổi mới tố giác rằng bản gốc đã dịch chuyển. Lưu digest thay vì chuỗi cũng giữ cho repo không phát hành lại nội dung của upstream.

`baseline/mounted.json` lưu tập package được bao phủ kèm phiên bản, và tập cố tình loại trừ kèm lý do. Ví dụ `dsh-community-market` bị loại vì nó nằm trong store chung nhưng không được mount — `state.json` của desktop-market yêu cầu `dsh-market`, nên namespace của nó không bao giờ hiện.

Hai tệp này được commit; chúng chính là thứ khiến lần cập nhật app kế tiếp thành một diff đọc được.

Trên máy khác, hoặc profile khác:

```bash
npm run check -- --profile <tên> --install "<đường dẫn app.asar.unpacked>"
```

Mặc định là profile `desktop` và đường dẫn cài chuẩn của từng hệ điều hành; `DSH_HOME`, `DSH_PROFILE`, `DSH_INSTALL` cũng có tác dụng.

## Sửa bản dịch

Bản dịch nằm trong `locales/<namespace>.json`, một tệp cho mỗi namespace, khoá phẳng. Sau khi sửa phải chạy `npm run build` — `lib/client.js` là tệp sinh ra, không sửa tay.

Một số chuỗi *phải* giống tiếng Anh — `Beta`, `Mica`, `HTTP`, `WebDAV`, `Bash`, `{value}K` — và được liệt kê trong `tools/identical-allowed.json` để `audit` không báo động sai. Thêm vào đó phải là quyết định có cân nhắc, không phải cách làm im tiếng báo.

`docs/glossary.md` chốt thuật ngữ dùng xuyên suốt: Session → Phiên, Workspace → Không gian làm việc, Trajectory → Diễn tiến, Job → Tác vụ nền, và những từ giữ nguyên như Agent, Plugin, Skill, Prompt. Hãy đọc nó trước khi thêm chuỗi mới; dịch cùng một khái niệm bằng hai từ khác nhau ở hai trang là lỗi.

Quy ước bắt buộc khi dịch:

- Giữ nguyên từng placeholder `{name}` và `{0}`, cả tên và số lượng.
- Giữ nguyên số ký tự `\n`.
- Dấu ba chấm theo đúng bản gốc: `…` khi bản gốc dùng `…`, `...` khi bản gốc dùng `...`.
- Không dịch đường dẫn, tên cờ dòng lệnh, tên lệnh `/slash`, định danh gói npm, tên khoá cấu hình.

Với khoá mơ hồ, đọc chỗ gọi nó trong bundle. Tham chiếu song ngữ giúp nhiều vì có chỗ tiếng Anh mơ hồ mà tiếng Trung thì không: `apply` trong Settings → Models là `保存` (Lưu), không phải "áp dụng"; `Deep diving...` là cách chơi chữ trên tên DeepSeek.

## Bộ công cụ

| Tệp | Việc |
|---|---|
| `tools/build-client.mjs` | Sinh `lib/client.js` từ `locales/`. |
| `tools/scan-install.mjs` | Dò bundle đã cài, đối chiếu `baseline/mounted.json`, ghi `tools/bundles.json`. |
| `tools/audit-locale.mjs` | Đối chiếu bản dịch với chuỗi tiếng Anh đã trích và với baseline digest. |
| `tools/accept-baseline.mjs` | Chốt bản cài hiện tại thành baseline mới. |
| `tools/dump-reference.mjs` | Xuất tham chiếu tiếng Anh (`tools/en/`) và song ngữ en+zh (`tools/ref/`). |
| `tools/lib/discover.mjs` | Quy tắc dò package client theo manifest. |
| `tools/lib/extract-en.mjs` | Đọc dictionary ra khỏi bundle đã build (3 dạng đăng ký). |
| `tools/lib/fingerprint.mjs` | Digest chuỗi cho baseline. |

`tools/en/`, `tools/ref/`, `tools/bundles.json` và `baseline/last-audit.json` bị gitignore: hai cái đầu là nội dung của upstream, hai cái sau chứa đường dẫn và kết quả riêng của từng máy.

## Giấy phép

MIT

