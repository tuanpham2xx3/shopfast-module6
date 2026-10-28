import { FormEvent, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API, getAccessToken, restoreSession } from "./client";
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
  showCart = true,
  routeId,
  basePath,
  onNavigate,
  checkoutEnabled = true,
}: {
  api: Api;
  token: string;
  staff: boolean;
  revision: number;
  onChange: () => void;
  showCart?: boolean;
  routeId?: string;
  basePath?: string;
  onNavigate?: (path: string) => void;
  checkoutEnabled?: boolean;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);
  const cartLoaded = useRef(false);
  const [cartError, setCartError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState("Chưa theo dõi đơn");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const selectedId = selected?.id;
  const prefix = staff ? "/staff/orders" : "/orders";
  useEffect(() => {
    if (!onNavigate) return;
    let active = true;
    setError("");
    if (!routeId) {
      setSelected(null);
      return;
    }
    setSelected((current) => (current?.id === routeId ? current : null));
    api<Order>(`${prefix}/${encodeURIComponent(routeId)}`, {}, token)
      .then((order) => {
        if (active)
          setSelected((current) =>
            current?.id === order.id && current.version > order.version
              ? current
              : order,
          );
      })
      .catch((e) => {
        if (active) {
          setSelected(null);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [api, token, prefix, routeId, Boolean(onNavigate)]);
  useEffect(() => {
    let active = true;
    api<{ items: Order[]; total: number }>(
      `${prefix}?page=${orderPage}&pageSize=20${statusFilter ? `&status=${statusFilter}` : ""}`,
      {},
      token,
    )
      .then((r) => {
        if (active) {
          setOrders(r.items);
          setOrderTotal(r.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (!staff && showCart) {
      setCartLoading(!cartLoaded.current);
      setCartError("");
      api<{ items: CartItem[] }>("/cart", {}, token)
        .then((r) => {
          if (active) {
            cartLoaded.current = true;
            setCart(r.items);
          }
        })
        .catch((e) => {
          if (active) setCartError(e.message);
        })
        .finally(() => {
          if (active) setCartLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [api, token, staff, prefix, revision, orderPage, statusFilter, showCart]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    let loading = false;
    let again = false;
    let seen = 0;
    setInvoiceStatus("");
    const resync = async () => {
      if (!active) return;
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      try {
        const order = await api<Order>(`${prefix}/${selectedId}`, {}, token);
        if (active && order.version >= seen) {
          seen = order.version;
          setSelected((current) => {
            if (
              current &&
              current.id === order.id &&
              current.version > order.version
            )
              return current;
            return JSON.stringify(current) === JSON.stringify(order)
              ? current
              : order;
          });
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        loading = false;
        if (again && active) {
          again = false;
          void resync();
        }
      }
    };
    const timer = setInterval(() => {
      void resync();
    }, 10000);
    if (staff) {
      setTracking("Tự cập nhật mỗi 10 giây");
      return () => {
        active = false;
        clearInterval(timer);
      };
    }
    const socket = io(`${new URL(API, window.location.origin).origin}/orders`, {
      auth: { token: getAccessToken() || token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      socket
        .timeout(3000)
        .emit(
          "order.subscribe",
          { orderId: selectedId },
          (error: unknown, ack: { ok?: boolean }) => {
            if (!active) return;
            if (error || !ack?.ok) {
              setTracking("Realtime chưa kết nối; cập nhật mỗi 10 giây");
              return;
            }
            setTracking("Đang theo dõi trực tiếp");
            void resync();
          },
        );
    });
    socket.on(
      "order.status.updated",
      (event: { orderId: string; version: number }) => {
        if (
          event.orderId === selectedId &&
          Number.isInteger(event.version) &&
          event.version > seen
        )
          void resync();
      },
    );
    socket.on("connect_error", () => {
      if (active) setTracking("Realtime chưa kết nối; cập nhật mỗi 10 giây");
    });
    socket.on("disconnect", (reason) => {
      if (!active) return;
      setTracking("Mất kết nối; cập nhật mỗi 10 giây");
      if (reason === "io server disconnect")
        void restoreSession()
          .then((result) => {
            if (active) {
              socket.auth = { token: result.accessToken };
              socket.connect();
            }
          })
          .catch(() => undefined);
    });
    return () => {
      active = false;
      clearInterval(timer);
      socket.emit("order.unsubscribe", { orderId: selectedId });
      socket.disconnect();
    };
  }, [api, selectedId, prefix, token, staff]);
  async function quantity(productId: string, value: number) {
    try {
      await api(
        `/cart/items/${productId}`,
        { method: "PATCH", body: JSON.stringify({ quantity: value }) },
        token,
      );
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function invoice(order: Order) {
    setBusy(true);
    try {
      const info = await api<{ status: string; downloadUrl?: string }>(
        `/orders/${order.id}/invoice`,
        {},
        token,
      );
      setInvoiceStatus(info.status);
      if (info.status === "READY" && info.downloadUrl) {
        const response = await fetch(`${API}${info.downloadUrl}`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${getAccessToken() || token}` },
        });
        if (!response.ok)
          throw new Error("Không tải được hóa đơn. Vui lòng thử lại.");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `invoice-${order.code}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
      onNavigate?.(`${basePath ?? "/orders"}/${encodeURIComponent(order.id)}`);
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
    if (onNavigate) {
      onNavigate(`${basePath ?? prefix}/${encodeURIComponent(order.id)}`);
      return;
    }
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
      <h2>
        {staff
          ? "Xử lý đơn hàng"
          : showCart
            ? "Giỏ hàng và đơn của bạn"
            : "Đơn hàng của bạn"}
      </h2>
      {error && <p role="alert">{error}</p>}
      {!staff && showCart && (
        <>
          <div>
            {cartLoading ? (
              <p role="status">Đang tải giỏ hàng…</p>
            ) : cartError ? (
              <p role="alert">
                {cartError}{" "}
                <button type="button" className="switch" onClick={onChange}>
                  Thử lại giỏ hàng
                </button>
              </p>
            ) : cart.length === 0 ? (
              <p>Giỏ hàng đang trống.</p>
            ) : (
              cart.map((item) => (
                <div className="cart-row" key={item.productId}>
                  <span>
                    {item.name} × {item.quantity} ·{" "}
                    {(item.quantity * item.price).toLocaleString("vi-VN")} ₫
                  </span>
                  <label>
                    Số lượng {item.name}
                    <input
                      aria-label={`Số lượng ${item.name}`}
                      type="number"
                      min={1}
                      max={99}
                      defaultValue={item.quantity}
                      key={`${item.productId}-${item.quantity}`}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== item.quantity)
                          void quantity(item.productId, value);
                      }}
                    />
                  </label>
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
          {!cartLoading &&
            !cartError &&
            cart.length > 0 &&
            !checkoutEnabled && (
              <button onClick={() => onNavigate?.("/checkout")}>
                Tiến hành thanh toán
              </button>
            )}
          {!cartLoading && !cartError && cart.length > 0 && checkoutEnabled && (
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
      <label>
        Lọc đơn theo trạng thái
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOrderPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {[
            "PENDING_PAYMENT",
            "CONFIRMED",
            "PROCESSING",
            "SHIPPING",
            "DELIVERED",
            "CANCELLED",
            "EXPIRED",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
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
      <nav className="pagination">
        <button
          disabled={orderPage === 1}
          onClick={() => setOrderPage((p) => p - 1)}
        >
          Đơn trước
        </button>
        <span>Trang {orderPage}</span>
        <button
          disabled={orderPage * 20 >= orderTotal}
          onClick={() => setOrderPage((p) => p + 1)}
        >
          Đơn sau
        </button>
      </nav>
      {selected && (
        <section className="product-detail" aria-label="Chi tiết đơn hàng">
          <h3>Đơn {selected.code}</h3>
          <p role="status">{tracking}</p>
          <button
            className="switch"
            onClick={() =>
              onNavigate ? onNavigate(basePath ?? prefix) : setSelected(null)
            }
          >
            Đóng đơn
          </button>
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
          {!staff && selected.paymentStatus === "PAID" && (
            <>
              <button disabled={busy} onClick={() => invoice(selected)}>
                Kiểm tra / tải hóa đơn
              </button>
              {invoiceStatus && (
                <p>
                  Hóa đơn:{" "}
                  {invoiceStatus === "PENDING"
                    ? "Đang tạo, vui lòng kiểm tra lại"
                    : invoiceStatus === "FAILED"
                      ? "Tạo hóa đơn lỗi, liên hệ hỗ trợ"
                      : invoiceStatus === "READY"
                        ? "Đã sẵn sàng"
                        : "Chưa khả dụng"}
                </p>
              )}
            </>
          )}
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
