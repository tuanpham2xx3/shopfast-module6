import { FormEvent, useEffect, useState } from "react";
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
export function Catalog({
  api,
  token,
  staff,
  customer,
}: {
  api: Api;
  token: string;
  staff: boolean;
  customer: boolean;
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
        <span>{total} sản phẩm</span>
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
        <p role="status">Đang tải sản phẩm…</p>
      ) : items.length === 0 ? (
        <p>Chưa có sản phẩm phù hợp.</p>
      ) : (
        <div className="product-grid">
          {items.map((item) => (
            <article key={item.id}>
              <div className="product-art" aria-hidden="true">
                {item.category.name.slice(0, 1)}
              </div>
              <p className="product-meta">
                {item.brand.name} / {item.sku}
              </p>
              <h3>{item.name}</h3>
              <p>{item.price.toLocaleString("vi-VN")} ₫</p>
              <p className="product-meta">
                {item.available > 0
                  ? `Còn ${item.available} sản phẩm`
                  : "Tạm hết hàng"}
              </p>
              <button className="switch" onClick={() => setSelected(item)}>
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
        <section className="product-detail" aria-label="Chi tiết sản phẩm">
          <button className="switch" onClick={() => setSelected(null)}>
            Đóng chi tiết
          </button>
          <h3>{selected.name}</h3>
          <p>{selected.description}</p>
          <p>
            {selected.price.toLocaleString("vi-VN")} ₫ · Còn{" "}
            {selected.available}
          </p>
        </section>
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
          revision={revision}
          onChange={() => setRevision((v) => v + 1)}
        />
      )}
    </section>
  );
}
