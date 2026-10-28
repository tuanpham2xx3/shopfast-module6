import { useEffect, useId, useRef, useState } from "react";
import { api } from "./client";

type Item = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  available: number;
  active: boolean;
};
const money = (value: number) => `${value.toLocaleString("vi-VN")} ₫`;

export function CartDropdown({
  token,
  canShop,
  count,
  revision,
  onChange,
  onCheckout,
  onLogin,
}: {
  token: string;
  canShop: boolean;
  count: number | null;
  revision: number;
  onChange: () => void;
  onCheckout: () => void;
  onLogin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => {
    let active = true;
    if (open && canShop) {
      setLoading(true);
      setError("");
      api<{ items: Item[] }>("/cart", {}, token)
        .then((result) => {
          if (active) setItems(result.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [open, canShop, token, revision, retry]);
  async function update(item: Item, quantity: number) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/cart/items/${item.productId}`,
        {
          method: quantity === 0 ? "DELETE" : "PATCH",
          ...(quantity ? { body: JSON.stringify({ quantity }) } : {}),
        },
        token,
      );
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="cart-menu"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="cart-link"
        aria-label={count === null ? "Giỏ hàng" : `Giỏ hàng, ${count} sản phẩm`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3h2l2.5 12h10l3-9H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </svg>
        <span className="cart-text">Giỏ hàng</span>
        {count !== null && count > 0 && (
          <span className="cart-count" aria-hidden="true">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          className="cart-dropdown"
          aria-label="Giỏ hàng nhanh"
        >
          <header>
            <div>
              <p className="eyebrow">SHOPFAST</p>
              <h2>Giỏ hàng của bạn</h2>
            </div>
            <button
              type="button"
              className="switch"
              aria-label="Đóng giỏ hàng"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              ×
            </button>
          </header>
          {!canShop ? (
            <div className="cart-menu-empty">
              <p>Đăng nhập và xác minh email để xem giỏ hàng.</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLogin();
                }}
              >
                Đăng nhập
              </button>
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="cart-menu-error">
                  {error}{" "}
                  <button
                    type="button"
                    className="switch"
                    disabled={busy}
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {loading ? (
                <p role="status" className="cart-menu-empty">
                  Đang tải giỏ hàng…
                </p>
              ) : !error && items.length === 0 ? (
                <div className="cart-menu-empty">
                  <p>Giỏ hàng đang trống.</p>
                  <small>Chọn món bạn thích để bắt đầu.</small>
                </div>
              ) : (
                <ul className="cart-menu-items">
                  {items.map((item) => (
                    <li key={item.productId}>
                      <div className="cart-item-top">
                        <strong>{item.name}</strong>
                        <button
                          type="button"
                          className="switch"
                          aria-label={`Xóa ${item.name} khỏi giỏ nhanh`}
                          disabled={busy || loading}
                          onClick={() => void update(item, 0)}
                        >
                          Xóa
                        </button>
                      </div>
                      <span className="cart-item-price">
                        {money(item.price)}
                      </span>
                      <div className="cart-item-bottom">
                        <div className="cart-stepper">
                          <button
                            type="button"
                            aria-label={`Giảm số lượng ${item.name}`}
                            disabled={busy || loading || item.quantity <= 1}
                            onClick={() => void update(item, item.quantity - 1)}
                          >
                            −
                          </button>
                          <span aria-label={`Số lượng ${item.name}`}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Tăng số lượng ${item.name}`}
                            disabled={
                              busy ||
                              loading ||
                              !item.active ||
                              item.quantity >= item.available
                            }
                            onClick={() => void update(item, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                        <strong>{money(item.price * item.quantity)}</strong>
                      </div>
                      {(!item.active || item.quantity > item.available) && (
                        <small role="status">
                          Sản phẩm cần kiểm tra lại tồn kho.
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!loading && items.length > 0 && (
                <footer>
                  <div>
                    <span>Tạm tính</span>
                    <strong>
                      {money(
                        items.reduce(
                          (sum, item) => sum + item.price * item.quantity,
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                  <small>Giá và ưu đãi được xác nhận khi đặt hàng.</small>
                  <button
                    type="button"
                    className="cart-checkout"
                    disabled={busy || Boolean(error)}
                    onClick={() => {
                      setOpen(false);
                      onCheckout();
                    }}
                  >
                    Tiến hành thanh toán <span aria-hidden="true">→</span>
                  </button>
                </footer>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
