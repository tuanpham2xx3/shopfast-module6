import { FormEvent, useEffect, useState } from "react";
const mutationKeys = new Map<string, string>();
function mutationKey(identity: string) {
  let key = mutationKeys.get(identity);
  if (!key) {
    key = crypto.randomUUID();
    mutationKeys.set(identity, key);
  }
  return key;
}
type Api = <T>(
  path: string,
  options?: RequestInit,
  token?: string,
) => Promise<T>;
type CartItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  available: number;
  active: boolean;
};
type Order = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  total: number;
  version: number;
  items?: { name: string; quantity: number; unitPrice: number }[];
  history?: { toStatus: string; version: number }[];
};
export function Orders({
  api,
  token,
  staff,
  revision,
  onChange,
}: {
  api: Api;
  token: string;
  staff: boolean;
  revision: number;
  onChange: () => void;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const prefix = staff ? "/staff/orders" : "/orders";
  useEffect(() => {
    let active = true;
    api<{ items: Order[] }>(prefix, {}, token)
      .then((r) => {
        if (active) setOrders(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (!staff)
      api<{ items: CartItem[] }>("/cart", {}, token)
        .then((r) => {
          if (active) setCart(r.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [api, token, staff, prefix, revision]);
  async function remove(id: string) {
    try {
      await api(`/cart/items/${id}`, { method: "DELETE" }, token);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const attempt = JSON.stringify({
      token,
      cart,
      address: Object.fromEntries(data),
    });
    try {
      const order = await api<Order>(
        "/orders",
        {
          method: "POST",
          headers: {
            "Idempotency-Key": mutationKey(attempt),
          },
          body: JSON.stringify({
            items: cart.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              expectedUnitPrice: i.price,
            })),
            shippingAddress: {
              recipientName: data.get("recipientName"),
              addressLine: data.get("address"),
              ward: data.get("ward"),
              province: data.get("province"),
              phone: data.get("phone"),
            },
            ...(data.get("promoCode")
              ? { promoCode: data.get("promoCode") }
              : {}),
          }),
        },
        token,
      );
      setSelected(order);
      mutationKeys.delete(attempt);
      onChange();
    } catch (e) {
      setError((e as Error).message);
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function detail(order: Order) {
    try {
      setSelected(await api<Order>(`${prefix}/${order.id}`, {}, token));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(order: Order, target: string, reason?: string) {
    setBusy(true);
    setError("");
    try {
      const path =
        target === "CONFIRMED"
          ? `/orders/${order.id}/mock-payment`
          : target === "CANCELLED"
            ? `/orders/${order.id}/cancel`
            : `/staff/orders/${order.id}/status`;
      const result = await api<Order>(
        path,
        {
          method: staff ? "PATCH" : "POST",
          headers: {
            "Idempotency-Key": mutationKey(
              JSON.stringify({
                id: order.id,
                version: order.version,
                target,
                reason,
              }),
            ),
          },
          body: JSON.stringify({
            expectedVersion: order.version,
            ...(staff ? { targetStatus: target } : {}),
            ...(reason ? { reason } : {}),
          }),
        },
        token,
      );
      setSelected(result);
      onChange();
    } catch (e) {
      setError((e as Error).message);
      onChange();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="orders-panel">
      <h2>{staff ? "Xử lý đơn hàng" : "Giỏ hàng và đơn của bạn"}</h2>
      {error && <p role="alert">{error}</p>}
      {!staff && (
        <>
          <div>
            {cart.length === 0 ? (
              <p>Giỏ hàng đang trống.</p>
            ) : (
              cart.map((item) => (
                <div className="cart-row" key={item.productId}>
                  <span>
                    {item.name} × {item.quantity} ·{" "}
                    {(item.quantity * item.price).toLocaleString("vi-VN")} ₫
                  </span>
                  <button
                    className="switch"
                    onClick={() => remove(item.productId)}
                  >
                    Xóa {item.name}
                  </button>
                </div>
              ))
            )}
          </div>
          {cart.length > 0 && (
            <form className="checkout-form" onSubmit={checkout}>
              <h3>Thông tin nhận hàng</h3>
              <label>
                Người nhận
                <input name="recipientName" required maxLength={100} />
              </label>
              <label>
                Địa chỉ nhận hàng
                <input name="address" required minLength={5} maxLength={300} />
              </label>
              <label>
                Phường / Xã
                <input name="ward" required maxLength={100} />
              </label>
              <label>
                Tỉnh / Thành phố
                <input name="province" required maxLength={100} />
              </label>
              <label>
                Số điện thoại
                <input name="phone" required minLength={8} maxLength={20} />
              </label>
              <label>
                Mã khuyến mãi
                <input name="promoCode" maxLength={80} />
              </label>
              <p>
                Giá và tồn kho được xác nhận khi đặt đơn. Mỗi mã dùng một lần;
                hủy đơn không hoàn lượt khuyến mãi.
              </p>
              <button
                disabled={
                  busy ||
                  cart.some((i) => !i.active || i.available < i.quantity)
                }
              >
                Đặt đơn hàng
              </button>
            </form>
          )}
        </>
      )}
      <div className="order-list">
        {orders.length === 0 ? (
          <p>Chưa có đơn hàng.</p>
        ) : (
          orders.map((order) => (
            <button
              className="order-row"
              key={order.id}
              onClick={() => detail(order)}
            >
              <strong>{order.code}</strong>
              <span>{order.status}</span>
              <span>{order.total.toLocaleString("vi-VN")} ₫</span>
            </button>
          ))
        )}
      </div>
      {selected && (
        <section className="product-detail" aria-label="Chi tiết đơn hàng">
          <h3>Đơn {selected.code}</h3>
          <p>
            Trạng thái: <strong>{selected.status}</strong> · Thanh toán:{" "}
            {selected.paymentStatus}
          </p>
          {selected.items?.map((i, index) => (
            <p key={index}>
              {i.name} × {i.quantity}
            </p>
          ))}
          <p>Tổng: {selected.total.toLocaleString("vi-VN")} ₫</p>
          <ol>
            {selected.history?.map((h) => (
              <li key={h.version}>{h.toStatus}</li>
            ))}
          </ol>
          {!staff && selected.status === "PENDING_PAYMENT" && (
            <button
              disabled={busy}
              onClick={() => action(selected, "CONFIRMED")}
            >
              Xác nhận thanh toán mô phỏng
            </button>
          )}
          {!staff &&
            ["PENDING_PAYMENT", "CONFIRMED"].includes(selected.status) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = String(
                    new FormData(e.currentTarget).get("reason"),
                  );
                  void action(selected, "CANCELLED", reason);
                }}
              >
                <label>
                  Lý do hủy
                  <input name="reason" minLength={5} maxLength={500} required />
                </label>
                <button disabled={busy}>Hủy đơn hàng</button>
              </form>
            )}
          {staff &&
            (
              {
                CONFIRMED: "PROCESSING",
                PROCESSING: "SHIPPING",
                SHIPPING: "DELIVERED",
              } as Record<string, string>
            )[selected.status] && (
              <button
                disabled={busy}
                onClick={() =>
                  action(
                    selected,
                    (
                      {
                        CONFIRMED: "PROCESSING",
                        PROCESSING: "SHIPPING",
                        SHIPPING: "DELIVERED",
                      } as Record<string, string>
                    )[selected.status]!,
                  )
                }
              >
                Chuyển sang{" "}
                {
                  (
                    {
                      CONFIRMED: "PROCESSING",
                      PROCESSING: "SHIPPING",
                      SHIPPING: "DELIVERED",
                    } as Record<string, string>
                  )[selected.status]
                }
              </button>
            )}
        </section>
      )}
    </section>
  );
}
