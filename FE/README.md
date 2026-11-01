# Frontend ShopFast

React + TypeScript + Vite. Frontend gọi backend qua HTTP/Socket.IO, không nhận provider key Gemini/Resend.

```text
FE/
  src/
    main.tsx       Mount React
    app/           App, routing và navigation
    features/      Auth, account, catalog, cart, orders, tickets, admin
    shared/        API client, presentation và styles
  public/          Ảnh và license
```

Cài dependency một lần bằng `npm ci` tại gốc repository. Sau đó chạy từ gốc:

```powershell
npm run dev:web
npm run build:web
```

Hoặc trong thư mục `FE`, dùng `npm run dev` / `npm run build`. Chỉ dùng một trang `/login`; workspace hiển thị chức năng theo vai trò. Xem [hướng dẫn đọc dự án](../docs/23-huong-dan-doc-du-an.md).
