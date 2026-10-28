import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Orders } from "./orders";

type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  available: number;
  description: string;
  imageUrl: string;
  category: { name: string };
  brand: { name: string };
};
type Stock = {
  productId: string;
  name: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
};
type Taxonomy = { id: string; name: string };
type Api = <T>(
  path: string,
  options?: RequestInit,
  token?: string,
) => Promise<T>;
function ProductMedia({
  name,
  url,
  sku,
}: {
  name: string;
  url: string;
  sku: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  let usable = false;
  try {
    const image = new URL(url);
    usable =
      image.protocol === "https:" &&
      !["example.com", "example.test"].includes(image.hostname);
  } catch {
    /* Missing image uses the explicit placeholder below. */
  }
  const illustration =
    (
      {
        "SF-AUDIO-1": "headphones",
        "SF-AUDIO-2": "speaker",
        "SF-AUDIO-3": "microphone",
      } as Record<string, string>
    )[sku] ??
    (/micro|\bmic\b/i.test(name)
      ? "microphone"
      : /loa|speaker/i.test(name)
        ? "speaker"
        : /tai nghe|headphone/i.test(name)
          ? "headphones"
          : null);
  const source =
    usable && !failed
      ? url
      : illustration
        ? `/images/products/${illustration}.jpg`
        : null;
  return (
    <>
      <div className="product-art">
        {source ? (
          <img
            src={source}
            alt={`${name}, ảnh minh họa`}
            width="640"
            height="480"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <div
            className="product-placeholder"
            role="img"
            aria-label={`Chưa có ảnh ${name}`}
          >
            <span aria-hidden="true">SF</span>
            <small>Hình ảnh đang cập nhật</small>
          </div>
        )}
      </div>
      {source && (
        <a
          className="media-note"
          href="/images/products/credits.html"
          target="_blank"
          rel="noreferrer"
        >
          Ảnh minh họa · Nguồn ảnh
        </a>
      )}
    </>
  );
}
function ProductDetailDialog({
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
export function Catalog({
  api,
  token,
  staff,
  customer,
  onCartChange,
}: {
  api: Api;
  token: string;
  staff: boolean;
  customer: boolean;
  onCartChange: () => void;
}) {
  const [items, setItems] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [brands, setBrands] = useState<Taxonomy[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    Promise.all([api<Taxonomy[]>("/categories"), api<Taxonomy[]>("/brands")])
      .then(([c, b]) => {
        setCategories(c);
        setBrands(b);
      })
      .catch((e) => setError(e.message));
  }, [api]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ items: Product[]; total: number }>(
      `/products?page=${page}&pageSize=12&${query}`,
    )
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, query, page, revision]);
  useEffect(() => {
    if (!staff) return;
    api<{ items: Stock[] }>("/staff/inventory?pageSize=100", {}, token)
      .then((result) => setStock(result.items))
      .catch((e) => setError(e.message));
  }, [api, token, staff, revision]);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (value) params.set(key, String(value));
    });
    setPage(1);
    setQuery(params.toString());
  }
  async function adjust(event: FormEvent<HTMLFormElement>, item: Stock) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    try {
      await api(
        `/staff/inventory/${item.productId}/adjustments`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            delta: Number(data.get("delta")),
            reason: data.get("reason"),
            expectedVersion: item.version,
          }),
        },
        token,
      );
      form.reset();
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
      setRevision((v) => v + 1);
    }
  }
  return (
    <section className="store" aria-labelledby="catalog-title">
      <header className="store-heading">
        <div>
          <p className="eyebrow">Bộ sưu tập</p>
          <h2 id="catalog-title">Chọn món bạn cần.</h2>
        </div>
        <span className="count-badge">{total} sản phẩm</span>
      </header>
      <form className="filters" onSubmit={filter}>
        <label>
          Danh mục
          <select name="categoryId">
            <option value="">Tất cả</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thương hiệu
          <select name="brandId">
            <option value="">Tất cả</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Giá từ
          <input name="minPrice" type="number" min="0" step="1" />
        </label>
        <label>
          Giá đến
          <input name="maxPrice" type="number" min="0" step="1" />
        </label>
        <label>
          Sắp xếp
          <select name="sort">
            <option value="newest">Mới nhất</option>
            <option value="price_asc">Giá tăng dần</option>
            <option value="price_desc">Giá giảm dần</option>
          </select>
        </label>
        <button>Lọc</button>
      </form>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRevision((v) => v + 1)}>
            Tải lại
          </button>
        </p>
      )}
      {loading ? (
        <div className="catalog-loading" role="status">
          <span>Đang tải sản phẩm…</span>
          <div className="product-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="product-skeleton" key={i}>
                <div />
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="empty-state">
          Chưa có sản phẩm phù hợp. Thử thay đổi bộ lọc để tìm thêm lựa chọn.
        </p>
      ) : (
        <div className="product-grid">
          {items.map((item) => (
            <article className="product-card" key={item.id}>
              <ProductMedia
                name={item.name}
                url={item.imageUrl}
                sku={item.sku}
              />
              <p className="product-meta">
                {item.brand.name} / {item.sku}
              </p>
              <h3>{item.name}</h3>
              <p className="product-price">
                {item.price.toLocaleString("vi-VN")} ₫
              </p>
              <p
                className={`stock-label ${item.available > 0 ? "in-stock" : "out-of-stock"}`}
              >
                {item.available > 0
                  ? `Còn ${item.available} sản phẩm`
                  : "Tạm hết hàng"}
              </p>
              <button
                type="button"
                className="switch"
                aria-haspopup="dialog"
                onClick={() => setSelected(item)}
              >
                Xem {item.name}
              </button>
              {customer && (
                <button
                  disabled={item.available < 1}
                  onClick={async () => {
                    try {
                      await api(
                        "/cart/items",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            productId: item.id,
                            quantity: 1,
                          }),
                        },
                        token,
                      );
                      setRevision((v) => v + 1);
                      onCartChange();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Thêm {item.name} vào giỏ
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      <nav className="pagination" aria-label="Phân trang">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Trang trước
        </button>
        <span>Trang {page}</span>
        <button
          disabled={page * 12 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Trang sau
        </button>
      </nav>
      {selected && (
        <ProductDetailDialog
          key={selected.id}
          product={selected}
          onDismiss={() => setSelected(null)}
        />
      )}
      {staff && (
        <section>
          <h2>Điều chỉnh tồn kho</h2>
          <p>
            Nhập số dương để nhập hàng, số âm để xuất điều chỉnh. Tồn đang giữ
            cho đơn hàng được bảo vệ.
          </p>
          {stock.map((item) => (
            <form
              className="stock-row"
              key={`${item.productId}-${item.version}`}
              onSubmit={(event) => adjust(event, item)}
            >
              <div>
                <strong>{item.sku}</strong>
                <p>
                  {item.name} · Tồn {item.onHand} · Đang giữ {item.reserved} ·
                  Phiên bản {item.version}
                </p>
              </div>
              <label>
                Thay đổi
                <input name="delta" type="number" step="1" required />
              </label>
              <label>
                Lý do
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
              <button>Lưu điều chỉnh</button>
            </form>
          ))}
        </section>
      )}
      {(customer || staff) && (
        <Orders
          api={api}
          token={token}
          staff={staff}
          showCart={false}
          revision={revision}
          onChange={() => setRevision((v) => v + 1)}
        />
      )}
    </section>
  );
}
