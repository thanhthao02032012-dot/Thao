# High-Performance Hex Editor (WebHexed)

Một ứng dụng phân tích tệp nhị phân và dịch ngược (Reverse Engineering) toàn diện, hiệu năng cao và thông minh, được tích hợp các công nghệ phân tích nhị phân hiện đại cùng Trí tuệ nhân tạo Gemini.

## 🚀 Tính năng nổi bật

### 1. Trình biên tập Hex hiệu năng cao (Interactive Hex Editor)
- Trình bày trực quan dữ liệu nhị phân dưới dạng lưới Hexadecimal và ASCII.
- Hỗ trợ xem trước thời gian thực (real-time stream previewing) các thay đổi dữ liệu mà không làm giảm tốc độ xử lý của trình duyệt.
- Chỉnh sửa byte trực tiếp với độ chính xác cao.

### 2. Hệ thống kiểm soát phiên bản nhị phân (Binary Version Control System - BVCS)
- **Binary Git**: Đóng vai trò như Git dành riêng cho các tệp nhị phân.
- **Quản lý Nhánh (Branch Manager)**: Hỗ trợ tạo và chuyển đổi linh hoạt giữa các nhánh phát triển độc lập (ví dụ: `main`, `experimental`, `logo-test`).
- **Lịch sử Commit**: Theo dõi từng bước chỉnh sửa dưới dạng sơ đồ dòng thời gian trực quan.
- **Smart AI Message**: Tự động phân tích các vùng byte đã chỉnh sửa để tạo thông điệp Commit bằng Tiếng Việt súc tích qua AI.
- **Cross-Commit Compare**: So sánh chênh lệch (visual & binary delta diffs) giữa các phiên bản commit để phát hiện sự thay đổi cấu trúc tệp.

### 3. Phân tích & Trợ lý thông minh AI (AI Chat & Analysis)
- Trợ lý AI tích hợp sẵn (sử dụng **Gemini API**) chuyên môn hóa trong lĩnh vực dịch ngược mã nguồn, phát hiện lỗ hổng bảo mật và giải thích cấu trúc tệp nhị phân.
- Gợi ý cách vá lỗi, chỉnh sửa các phần đầu (headers) tệp tin bị hỏng.

### 4. Pipeline Quét Sâu & Xác Minh (Deep Scan & Verification Pipeline)
- Tự động kiểm tra tính hợp lệ của Header Magic Bytes, kiểm soát Checksum băm và tính toàn vẹn cấu trúc của tệp khi tải lên hoặc sau mỗi phiên chỉnh sửa.
- Xuất log chi tiết về tiến trình phân tích.

### 5. Engine Hub Đa Dạng
- Trung tâm quản lý các bộ engine phân tích phụ trợ, tối ưu hóa tài nguyên RAM và thời gian phản hồi.

---

## 🛠️ Cài đặt & Khởi chạy dự án

Dự án sử dụng kiến trúc Full-stack kết hợp giữa **React (Vite)** cho giao diện và **Express (Node.js)** cho máy chủ proxy API bảo mật.

1. **Cài đặt các gói phụ thuộc:**
   ```bash
   npm install
   ```

2. **Chạy ứng dụng trong môi trường phát triển (Development Mode):**
   ```bash
   npm run dev
   ```

3. **Biên dịch dự án:**
   ```bash
   npm run build
   ```

4. **Khởi chạy môi trường Production:**
   ```bash
   npm run start
   ```

---

## 🔮 Kế hoạch cập nhật trong tương lai

Dự án này liên tục được tối ưu hóa và phát triển để mở rộng khả năng dịch ngược. Các tính năng dự kiến sẽ được cập nhật trong tương lai bao gồm:
- **Bộ tháo gỡ mã (Disassembler/Decompiler)** hỗ trợ các kiến trúc vi xử lý phổ biến như x86, x64, ARM, MIPS trực tiếp trên trình duyệt.
- **Tích hợp mẫu chữ ký YARA** tùy chỉnh để phát hiện mã độc hại trực tiếp.
- **Nâng cao khả năng phục hồi dữ liệu** (File carving) cho các tệp tin hình ảnh, âm thanh và tài liệu bị lỗi phần đầu.
- **Tính năng Cộng tác thời gian thực** (Multi-user Collaboration) cho phép nhiều kỹ sư cùng phân tích một tệp nhị phân cùng một lúc.

---

*Cảm ơn bạn đã sử dụng High-Performance Hex Editor. Dự án sẽ tiếp tục nhận được nhiều bản cập nhật nâng cấp hiệu năng và tính năng thông minh hơn nữa trong thời gian tới!*
