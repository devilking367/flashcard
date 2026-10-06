# Flashcard (kiểu Quizlet đơn giản)

Node.js + Express + Turso (SQLite miễn phí) + frontend thuần JS. Deploy được thẳng lên Vercel.

## Chạy local
Cần Node.js >= 20.6.
```
npm install
npm start            # dùng file local.db, không cần cấu hình gì
npm run dev          # như trên, tự khởi động lại khi sửa code
npm run start:turso  # dùng DB Turso thật, đọc biến trong file .env
```
Mở http://localhost:3000.

File `.env` (chép từ `.env.example`): giá trị có ký tự đặc biệt như `#` hoặc `$` phải bọc trong nháy đơn,
ví dụ `JWT_SECRET='abc#123'`. Nếu không, Node sẽ cắt mất phần từ `#` trở đi.

## Deploy lên Vercel
1. Tạo DB miễn phí trên https://turso.tech (hoặc dùng CLI):
   ```
   turso db create flashcard
   turso db show flashcard --url
   turso db tokens create flashcard
   ```
2. Đẩy code lên GitHub, rồi trên Vercel chọn **Add New → Project** và import repo. Framework Preset để **Other**,
   không cần sửa Build/Output (đã cấu hình trong `vercel.json`).
3. Trong **Settings → Environment Variables**, thêm 3 biến: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`
   (chuỗi ngẫu nhiên, ít nhất 16 ký tự). Dán giá trị **không kèm dấu nháy**.
4. Deploy. Bảng dữ liệu tự được tạo ở lần gọi API đầu tiên. Nếu thiếu biến môi trường, API trả lỗi 500
   và log của function trên Vercel sẽ ghi rõ thiếu biến nào.

## Cấu trúc
- `app.js`: toàn bộ API (đăng ký/đăng nhập, bộ thẻ, thẻ)
- `api/index.js`: điểm vào cho Vercel; `server.js`: server chạy local
- `public/`: giao diện (index.html + app.js), Vercel phục vụ trực tiếp như file tĩnh
