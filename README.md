# Trình theo dõi tài chính cá nhân 💰

Ứng dụng React Native (Expo) giúp quản lý tài chính cá nhân, tối ưu cho người dùng Việt Nam, có AI hỗ trợ và nhiều tính năng tiện dụng hằng ngày.

## ✨ Tính năng chính

- 📝 **Ghi giao dịch thông minh**: nhập thủ công với nhận dạng ký hiệu +/-, đơn vị k/tr/tỷ; nút ✨ tự điền từ mô tả.
- 🎙️ **Giọng nói → văn bản**: dùng mic của bàn phím để nói, nội dung sẽ được parse để tự điền số tiền, loại (thu/chi), ngày.
- 🧠 **Gợi ý danh mục tự động**: khi bấm ✨, app suy luận danh mục (Ăn uống, Di chuyển, Lương, Hóa đơn, …). Theo tuỳ chọn B: nếu danh mục hiện là `Khác` thì tự set; nếu đã chọn danh mục khác, mở picker và highlight gợi ý để bạn xác nhận.
- 📸 **Quét sao kê bằng AI**: chụp ảnh/chọn ảnh sao kê ngân hàng Việt Nam, AI trích xuất giao dịch (có chế độ dự phòng khi chưa cấu hình API key).
- 🏠 **Trang chủ**: thẻ Nhật ký 14 ngày (streak), số dư, tóm tắt nhanh, xu hướng; skeleton loader mượt mà, cache SWR để hạn chế “đang tải”.
- 💳 **Vay & Cho vay**: tạo từ giao dịch danh mục Vay/Cho vay, nhập Người liên quan và Ngày đến hạn (tùy chọn), có danh sách và tóm tắt 3 khoản sắp đến hạn.
- 🧩 **Gamification thói quen**: streak hằng ngày, +10 xu/lần/ngày, thưởng mốc, lịch 14 ngày 2×7, đổi thưởng (theme/style/AI tips – bản đầu).
- 🔔 **Nhắc nhở hằng ngày**: bật/tắt và chọn giờ trong `Cài đặt`; deep link mở nhanh màn hình Thêm giao dịch.
- 🤖 **Trợ lý tài chính (tab Trợ lý)**: tổng hợp 90 ngày gần nhất, chỉ trả lời chủ đề tài chính; có nút gợi ý nhanh (sticky) và chế độ fallback khi thiếu API key.
- 🎯 **Mục tiêu & Kế hoạch tài chính (MVP)**: tạo/cập nhật mục tiêu, xem tiến độ; kế hoạch tài chính đơn giản và gợi ý tỷ lệ ví.
- 🔄 **Realtime & đồng bộ**: dùng Supabase Realtime cho `transactions`, `category_budgets`, `loans`; cache tại chỗ + refresh nền; hỗ trợ SQLite offline.
- 🎨 **Theme-aware**: sáng/tối, màu theo theme, tránh nền trắng trong dark mode; icon thống nhất.
- 🇻🇳 **Nội địa hoá Việt Nam**: ngôn ngữ, định dạng ngày/tiền tệ (VND), từ khóa phổ biến VN.

## 🚀 Bắt đầu nhanh

1) Cài đặt phụ thuộc

```bash
npm install
```

2) Tạo file `.env` (tuỳ chọn nhưng khuyến nghị)

```ini
EXPO_PUBLIC_OPENAI_API_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

3) Chạy ứng dụng

```bash
npx expo start
```

4) Mở trên thiết bị
- Web: nhấn `w`
- iOS: Expo Go hoặc iOS Simulator
- Android: Expo Go hoặc Android Emulator

> Không có OpenAI API key: app sẽ dùng logic dự phòng (heuristic) để minh hoạ.

## 📖 Cách sử dụng nhanh

### Thêm giao dịch
- Nhập mô tả như: “-45k cafe hôm qua”, “+15tr lương 30/9”; bấm ✨ để tự điền.
- Tuỳ chọn B cho danh mục: nếu danh mục hiện `Khác` → auto set; nếu đã chọn danh mục → mở picker và highlight gợi ý.
- Chọn ngày, danh mục, loại Thu/Chi rồi Lưu.

### Vay & Cho vay
- Chọn danh mục `Vay` (Thu) hoặc `Cho vay` (Chi) khi thêm giao dịch.
- Nhập “Người liên quan” và “Ngày đến hạn” (tùy chọn).
- Xem danh sách và các khoản sắp đến hạn trên thẻ Vay & Cho vay.

### Trợ lý tài chính
- Mở tab `Trợ lý`, chọn gợi ý nhanh hoặc chat tự do (chỉ chủ đề tài chính).
- Trợ lý dùng ngữ cảnh 90 ngày gần nhất.

### Nhắc nhở thói quen
- Vào `Cài đặt` để bật/tắt và chọn giờ nhắc ghi chép hằng ngày.

## 🏗️ Công nghệ

- React Native + Expo, TypeScript, Expo Router.
- SQLite (offline) + Supabase (Postgres, Realtime, Edge – tuỳ cấu hình).
- OpenAI (gpt-4o-mini hoặc tương đương) cho AI parsing/assistant khi có API key.

## ⚙️ Ghi chú cấu hình

- Web cần `metro.config.js` để nạp `.wasm` cho `expo-sqlite` (đã cấu hình sẵn).
- Supabase là tuỳ chọn; nếu cấu hình URL/ANON KEY, app sẽ đồng bộ realtime.

## 🛠️ Khắc phục nhanh (FAQ)

- Lỗi typed routes khi `router.push('/settings')`: khởi động lại với `npx expo start -c` hoặc ép kiểu `as Href`.
- Lỗi `.wasm` trên web (expo-sqlite): đã xử lý qua `metro.config.js`. Hãy chạy lại `npx expo start -c`.
- Nút/khung trắng ở dark mode: đã dùng `tintColor` và màu theo theme. Nếu gặp, xoá cache và chạy lại.

## 📚 Tài liệu thêm

Xem chi tiết thiết lập và mẹo debug tại [SETUP.md](./SETUP.md).
