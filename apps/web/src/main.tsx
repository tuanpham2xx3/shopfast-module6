import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main>
      <h1>ShopFast</h1>
      <p>Cửa hàng đang được chuẩn bị. Vui lòng quay lại sau.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
