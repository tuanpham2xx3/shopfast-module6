import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Api, Product, Stock, Taxonomy } from "./catalog.types";
import { ProductDetailDialog } from "./product-detail-dialog";
import { ProductMedia } from "./product-media";
export function Catalog({
  api,
  token,
  staff,
  customer,
  onCartChange,
  productId,
  onOpenProduct,
  onCloseProduct,
  inventoryOnly = false,
}: {
  api: Api;
  token: string;
  staff: boolean;
  customer: boolean;
  onCartChange: () => void;
  productId?: string;
  onOpenProduct: (id: string) => void;
  onCloseProduct: () => void;
  inventoryOnly?: boolean;
}) {
  const [items, setItems] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [brands, setBrands] = useState<Taxonomy[]>([]);
  const [search, setSearch] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(
    () => matchMedia("(min-width: 761px)").matches,
  );
  const parsedPage = Number(search.get("page") ?? 1);
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const filters = new URLSearchParams(search);
  filters.delete("page");
  const query = filters.toString();
  const setPage = (next: number) => {
    const params = new URLSearchParams(search);
    params.set("page", String(next));
    setSearch(params);
    if (matchMedia("(max-width: 760px)").matches) setFiltersOpen(false);
  };
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const loaded = useRef(false);
  const [detailError, setDetailError] = useState("");
  useEffect(() => {
    let active = true;
    setDetailError("");
    if (!productId) {
      setSelected(null);
      return;
    }
    api<Product>(`/products/${encodeURIComponent(productId)}`)
      .then((result) => {
        if (active) setSelected(result);
      })
      .catch((e) => {
        if (active) {
          setSelected(null);
          setDetailError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [api, productId]);
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
          loaded.current = true;
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
    params.set("page", "1");
    setSearch(params);
    if (matchMedia("(max-width: 760px)").matches) setFiltersOpen(false);
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
      {!inventoryOnly && (
        <>
          <header className="store-heading">
            <div>
              <h2 id="catalog-title">Sản phẩm</h2>
            </div>
            <span className="count-badge">{total} sản phẩm</span>
          </header>
          <details
            className="filter-panel"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>Bộ lọc và sắp xếp</summary>
            <form
              key={`${query}:${categories.length}:${brands.length}`}
              className="filters"
              onSubmit={filter}
            >
              <label>
                Danh mục
                <select
                  name="categoryId"
                  defaultValue={search.get("categoryId") ?? ""}
                >
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
                <select
                  name="brandId"
                  defaultValue={search.get("brandId") ?? ""}
                >
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
                <input
                  name="minPrice"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={search.get("minPrice") ?? ""}
                />
              </label>
              <label>
                Giá đến
                <input
                  name="maxPrice"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={search.get("maxPrice") ?? ""}
                />
              </label>
              <label>
                Sắp xếp
                <select
                  name="sort"
                  defaultValue={search.get("sort") ?? "newest"}
                >
                  <option value="newest">Mới nhất</option>
                  <option value="price_asc">Giá tăng dần</option>
                  <option value="price_desc">Giá giảm dần</option>
                </select>
              </label>
              <button>Lọc</button>
            </form>
          </details>
          {error && (
            <p role="alert">
              {error}{" "}
              <button type="button" onClick={() => setRevision((v) => v + 1)}>
                Tải lại
              </button>
            </p>
          )}
          {loading && !loaded.current ? (
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
              Chưa có sản phẩm phù hợp. Thử thay đổi bộ lọc để tìm thêm lựa
              chọn.
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
                  <div className="product-actions">
                    <button
                      type="button"
                      className="switch product-detail-link"
                      aria-label={`Xem ${item.name}`}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setSelected(item);
                        onOpenProduct(item.id);
                      }}
                    >
                      Xem chi tiết
                    </button>
                    {customer && (
                      <button
                        disabled={item.available < 1}
                        aria-label={`Thêm ${item.name} vào giỏ`}
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
                            onCartChange();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Thêm vào giỏ
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {total > 12 && (
            <nav className="pagination" aria-label="Phân trang">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Trang trước
              </button>
              <span>Trang {page}</span>
              <button
                disabled={page * 12 >= total}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </button>
            </nav>
          )}
          <p className="catalog-credit">
            Ảnh dùng để minh họa sản phẩm.{" "}
            <a
              href="/images/products/credits.html"
              target="_blank"
              rel="noreferrer"
            >
              Nguồn ảnh
            </a>
          </p>
          {detailError && (
            <p role="alert">Không thể mở sản phẩm: {detailError}</p>
          )}
          {productId && selected && selected.id === productId && (
            <ProductDetailDialog
              key={selected.id}
              product={selected}
              onDismiss={onCloseProduct}
            />
          )}
        </>
      )}
      {staff && inventoryOnly && (
        <section>
          <h2 id="catalog-title">Điều chỉnh tồn kho</h2>
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
    </section>
  );
}
