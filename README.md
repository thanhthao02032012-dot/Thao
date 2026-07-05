# WebHexed - High-Performance Interactive Hex Editor & Binary Analysis Suite

<p align="center">
  <strong>Một ứng dụng phân tích tệp nhị phân, dịch ngược (Reverse Engineering) và biên tập mã máy thông minh, toàn diện, hiệu năng cao và bảo mật tuyệt đối, tích hợp Trí tuệ nhân tạo Gemini tiên tiến nhất.</strong>
</p>

<p align="center">
  <a href="#-tính-năng-nổi-bật">Tính năng</a> •
  <a href="#-kiến-trúc-hệ-thống">Kiến trúc</a> •
  <a href="#-cấu-hình-môi-trường">Cấu hình</a> •
  <a href="#-hướng-dẫn-triển-khai-github--domain">Hướng dẫn Triển khai</a> •
  <a href="#-cài-đặt-phát-triển">Cài đặt Phát triển</a>
</p>

---

## 🚀 Tính năng nổi bật

### 1. Trình biên tập Hex hiệu năng cao (Interactive Hex Editor)
*   **Trực quan hóa Dữ liệu**: Hiển thị lưới Hexadecimal và ASCII với tốc độ cực nhanh, phân chia màu sắc thông minh cho các nhóm Byte đặc biệt (Null bytes, Printable ASCII, Control characters).
*   **Bộ chỉnh sửa nhanh (Quick Value Editor)**: Hỗ trợ sửa đổi giá trị byte trực tiếp theo thời gian thực ở 3 định dạng: **Hex (00-FF)**, **Decimal (0-255)**, hoặc **Ký tự (ASCII/Char)** thông qua bảng điều khiển nhanh ở phía dưới.
*   **Bit Toggles & Phép toán Bitwise**: Cho phép lật từng bit trong byte (Bit-flipping) và thực hiện nhanh các phép toán dịch trái, dịch phải, phủ định logic (`NOT`) ngay lập tức.
*   **Tìm kiếm mạnh mẽ**: Tìm kiếm chuỗi Hex, ASCII, hoặc Unicode trong toàn bộ tệp với định vị chính xác vị trí offset.

### 2. Hệ thống kiểm soát phiên bản nhị phân (Binary Version Control - BVCS)
*   **Binary Git**: Quản lý lịch sử thay đổi của tệp nhị phân thông qua hệ thống nhánh (**Branch Manager**) độc lập (ví dụ: `main`, `experimental`, `patch-v1`).
*   **Dòng thời gian Commits**: Lưu lại các mốc chỉnh sửa dưới dạng đồ thị commit trực quan, hỗ trợ so sánh khác biệt (**Visual Delta Diff**) giữa các commit để phát hiện chính xác các byte bị chỉnh sửa.
*   **AI Commit Message**: Tự động phân tích các vùng byte đã chỉnh sửa, so sánh giá trị cũ và mới để tạo thông điệp Commit bằng Tiếng Việt tự động thông qua AI.

### 3. Trợ lý Trí tuệ Nhân tạo thông minh (AI Chat & Analysis)
*   **Hỗ trợ đa luồng trò chuyện (Chat Threads)**: Tạo và lưu trữ nhiều luồng hội thoại với Trợ lý AI để phân tích các tệp tin hoặc khía cạnh khác nhau mà không bị mất dữ liệu.
*   **Phân tích chuyên sâu**: Tích hợp mô hình **Gemini API** tối tân, am hiểu sâu sắc về kiến trúc tệp tin (PE, ELF, Mach-O, ZIP, PNG, MP4, v.v.), tháo gỡ mã máy (Decompilation), định vị mã độc hại, và đề xuất mã vá (Patches).
*   **Vá lỗi tự động**: AI có thể đề xuất các bản vá (Patches) và người dùng có thể áp dụng bản vá đó trực tiếp vào Hex Editor chỉ bằng một cú click chuột.

### 4. Hệ thống Xác minh & Quét Sâu (Deep Scan Pipeline)
*   **Định dạng Tệp**: Nhận dạng tự động cấu trúc tệp dựa trên cơ sở dữ liệu Magic Bytes nâng cao.
*   **Tính toán Checksum**: Hỗ trợ băm tốc độ cao MD5, SHA-1, SHA-256 ngay trên trình duyệt để kiểm tra tính toàn vẹn và đối chiếu mẫu mã độc.
*   **Kiểm soát cấu trúc**: Đảm bảo tệp nhị phân sau chỉnh sửa không bị lỗi cấu trúc nghiêm trọng trước khi xuất bản.

### 5. Lưu trữ & Bảo mật nâng cao
*   **Firebase Integration**: Lưu trữ an toàn hồ sơ người dùng, các luồng trò chuyện AI (Chat Threads), lịch sử bản vá (Patches), và cấu hình cá nhân.
*   **Quy tắc Bảo mật Firestore (Security Rules)**: Hệ thống rules chặt chẽ phân quyền chi tiết, đảm bảo người dùng chỉ có thể đọc/ghi dữ liệu của chính họ.
*   **IndexedDB Smart Cache**: Cơ chế lưu trữ đệm tối ưu hóa tài nguyên RAM, cho phép chỉnh sửa mượt mà các tệp dung lượng lớn mà không làm chậm trình duyệt.

---

## 🛠️ Kiến trúc hệ thống

Ứng dụng được thiết kế theo kiến trúc **Full-stack (Server-Side Proxy)** hiện đại:
*   **Frontend (Client)**: Xây dựng bằng **React**, **Vite**, **TypeScript**, **Tailwind CSS**, và **Lucide Icons**. Đảm bảo giao diện mượt mà, phản hồi nhạy bén và tương thích tốt trên cả thiết bị di động (Mobile Responsive).
*   **Backend (Server)**: Chạy trên nền tảng **Express (Node.js)** làm cổng Proxy trung gian an toàn. Mọi cuộc gọi đến Gemini API đều được thực hiện ở phía máy chủ để bảo mật hoàn toàn API Key, tránh rò rỉ ra trình duyệt Client.
*   **Database**: Sử dụng **Firebase Firestore** để đồng bộ hóa và lưu trữ dữ liệu bền vững của người dùng.

---

## ⚙️ Cấu hình môi trường

Để chạy dự án, bạn cần tạo file `.env` ở thư mục gốc (hoặc cấu hình Environment Variables trên Hosting của bạn) với các tham số sau:

```env
# Máy chủ Node.js chạy trên cổng 3000
PORT=3000

# API Key cho mô hình Gemini (Bắt buộc phía Server)
GEMINI_API_KEY=your_gemini_api_key_here

# (Tùy chọn) Cấu hình Firebase cho Web Client (nếu sử dụng Firebase riêng của bạn)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 🌐 Hướng dẫn triển khai (GitHub & Custom Domain)

Ứng dụng WebHexed là một ứng dụng **Full-stack (Node.js/Express + Vite)**, do đó bạn không thể triển khai dạng tĩnh như *GitHub Pages* thông thường. Bạn cần triển khai lên một nền tảng hỗ trợ chạy máy chủ Node.js (như **Render**, **Railway**, **Fly.io**, hoặc **VPS** riêng) và trỏ tên miền tùy chỉnh của bạn (ví dụ: DuckDNS) về máy chủ đó.

### Cách 1: Triển khai nhanh qua Render.com (Miễn phí & Cực dễ)

1.  **Đưa mã nguồn lên GitHub**: Tạo một Repo mới trên GitHub cá nhân của bạn và push toàn bộ mã nguồn của dự án này lên đó.
2.  **Đăng nhập Render.com**: Tạo tài khoản và chọn **New > Web Service**.
3.  **Kết nối kho chứa**: Chọn Repository chứa mã nguồn WebHexed bạn vừa tải lên.
4.  **Cấu hình bản dựng**:
    *   **Runtime**: `Node`
    *   **Build Command**: `npm run build`
    *   **Start Command**: `npm run start`
5.  **Cấu hình Biến môi trường**: Nhấp vào tab **Environment** trên Render và thêm biến:
    *   `GEMINI_API_KEY` = *[Khóa API Gemini của bạn]*
    *   `NODE_ENV` = `production`
6.  **Nhấn Deploy**: Render sẽ tự động kéo code từ GitHub, build dự án và chạy máy chủ.

#### Trỏ Tên miền tùy chỉnh (DuckDNS / Domain riêng) về Render:
1.  Trên trang quản lý dự án ở Render, đi tới phần **Settings > Custom Domains**.
2.  Thêm tên miền của bạn (ví dụ: `thaocute.duckdns.org`).
3.  Truy cập trang quản trị tên miền của bạn (ví dụ: DuckDNS hoặc Cloudflare) và cấu hình bản ghi:
    *   Tạo bản ghi **CNAME** trỏ từ tên miền của bạn tới địa chỉ do Render cấp (ví dụ: `webhexed.onrender.com`).
4.  Render sẽ tự động cấp chứng chỉ **SSL Let's Encrypt (HTTPS)** miễn phí cho tên miền của bạn sau vài phút.

---

### Cách 2: Triển khai trên VPS cá nhân (Ubuntu / Debian)

Nếu bạn sở hữu VPS riêng và muốn chạy ổn định thông qua PM2 và Nginx:

1.  **Clone mã nguồn về VPS**:
    ```bash
    git clone <URL_KHO_CHỨA_GITHUB_CỦA_BẠN>
    cd webhexed
    ```
2.  **Cài đặt Node.js và NPM**:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
3.  **Cài đặt các thư viện và Build dự án**:
    ```bash
    npm install
    npm run build
    ```
4.  **Cài đặt và cấu hình PM2 để ứng dụng chạy ngầm**:
    ```bash
    sudo npm install -g pm2
    GEMINI_API_KEY="your_key" NODE_ENV=production pm2 start dist/server.cjs --name "webhexed"
    pm2 startup
    pm2 save
    ```
5.  **Cấu hình Nginx Reverse Proxy (Cổng 3000)**:
    Tạo tệp cấu hình Nginx mới: `/etc/nginx/sites-available/webhexed`
    ```nginx
    server {
        listen 80;
        server_name thaocute.duckdns.org; # Thay bằng tên miền của bạn

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
    Kích hoạt cấu hình và khởi động lại Nginx:
    ```bash
    sudo ln -s /etc/nginx/sites-available/webhexed /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```
6.  **Cài đặt SSL miễn phí bằng Certbot (HTTPS)**:
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d thaocute.duckdns.org
    ```

---

## 💻 Cài đặt & Khởi chạy cục bộ (Local Development)

Nếu bạn muốn chạy thử nghiệm và phát triển thêm các tính năng trên máy tính cá nhân:

1.  **Cài đặt các gói phụ thuộc**:
    ```bash
    npm install
    ```
2.  **Khởi chạy máy chủ phát triển (Vite + Express Proxy)**:
    ```bash
    npm run dev
    ```
    Truy cập vào địa chỉ: `http://localhost:3000` trên trình duyệt để trải nghiệm ứng dụng.

3.  **Kiểm tra lỗi mã nguồn (Linting)**:
    ```bash
    npm run lint
    ```

---

## 🔒 Quy tắc bảo mật Firestore (firestore.rules)

Dưới đây là cấu hình phân quyền tối ưu đã được thiết lập sẵn trong tệp `firestore.rules` của dự án để bảo vệ cơ sở dữ liệu người dùng:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null && 
        (request.auth.token.email == 'thanhthao02032012@gmail.com' || 
         request.auth.token.email == 'admin@webhexed.com');
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }

    match /users/{userId}/files/{fileId}/chat_messages/{messageId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }

    match /users/{userId}/files/{fileId}/chat_threads/{threadId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }

    match /users/{userId}/files/{fileId}/chat_threads/{threadId}/messages/{messageId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if isAdmin();
    }

    match /public_profiles/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow write: if isAdmin();
    }

    match /sessions/{sessionId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

*Chúc bạn có những trải nghiệm tuyệt vời cùng WebHexed! Hãy sẵn sàng push mã nguồn lên GitHub và kết nối tới tên miền của riêng bạn ngay hôm nay.*
