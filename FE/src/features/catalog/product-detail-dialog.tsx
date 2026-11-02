import { useEffect, useId, useRef } from "react";
import { Product } from "./catalog.types";
import { ProductMedia } from "./product-media";
export function ProductDetailDialog({
  product,
  onDismiss,
}: {
  product: Product;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="product-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onDismiss();
      }}
    >
      <div className="product-dialog-header">
        <span className="eyebrow">Chi tiết sản phẩm</span>
        <button
          type="button"
          className="switch product-dialog-close"
          aria-label="Đóng chi tiết"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <div className="product-dialog-content">
        <div>
          <ProductMedia
            name={product.name}
            url={product.imageUrl}
            sku={product.sku}
            credit
          />
        </div>
        <div>
          <h2 id={titleId}>{product.name}</h2>
          <p className="product-price">
            {product.price.toLocaleString("vi-VN")} ₫
          </p>
          <p
            className={`stock-label ${product.available > 0 ? "in-stock" : "out-of-stock"}`}
          >
            {product.available > 0
              ? `Còn ${product.available} sản phẩm`
              : "Tạm hết hàng"}
          </p>
          <dl className="product-dialog-facts">
            <div>
              <dt>Mã sản phẩm</dt>
              <dd>{product.sku}</dd>
            </div>
            <div>
              <dt>Thương hiệu</dt>
              <dd>{product.brand.name}</dd>
            </div>
            <div>
              <dt>Danh mục</dt>
              <dd>{product.category.name}</dd>
            </div>
          </dl>
          <h3>Mô tả</h3>
          <p className="product-dialog-description">
            {product.description?.trim() ||
              "Thông tin sản phẩm đang được cập nhật."}
          </p>
        </div>
      </div>
    </dialog>
  );
}
