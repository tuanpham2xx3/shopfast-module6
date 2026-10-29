import { FormEvent, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { OperationsSummary } from "./operations-summary";
type Api = <T>(
  path: string,
  options?: RequestInit,
  token?: string,
) => Promise<T>;
type Product = {
  id: string;
  name: string;
  price: number;
  version: number;
  sku: string;
};
type Taxonomy = { id: string; name: string };
type Failed = {
  id: string;
  type?: string;
  reason?: string;
  businessKey?: string;
};
export function Admin({
  api,
  token,
  panel = "catalog",
}: {
  api: Api;
  token: string;
  panel?: string;
}) {
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [brands, setBrands] = useState<Taxonomy[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ops, setOps] = useState<unknown>(null);
  const [queues, setQueues] = useState<unknown>(null);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const [failedLoaded, setFailedLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Taxonomy[]>("/categories"),
      api<Taxonomy[]>("/brands"),
      api<{ items: Product[] }>("/products?pageSize=100"),
    ])
      .then(([c, b, p]) => {
        if (active) {
          setCategories(c);
          setBrands(b);
          setProducts(p.items);
        }
      })
      .catch((e) => setMessage(e.message));
    return () => {
      active = false;
    };
  }, [api, revision]);
  async function save(path: string, data: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(
        path,
        { method, body: JSON.stringify(data) },
        token,
      );
      setMessage("Đã lưu thay đổi.");
      setRevision((v) => v + 1);
      return result;
    } catch (e) {
      setMessage((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function taxonomy(e: FormEvent<HTMLFormElement>, kind: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const id = String(data.id ?? "");
    delete data.id;
    if (id) {
      delete data.slug;
      data.active = data.active === "true" ? "true" : "false";
      await save(
        `/admin/${kind}/${id}`,
        { name: data.name, active: data.active === "true" },
        "PATCH",
      );
    } else await save(`/admin/${kind}`, { name: data.name, slug: data.slug });
  }
  async function product(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const id = String(data.id ?? "");
    delete data.id;
    const fields: Record<string, unknown> = {
      ...data,
      price: Number(data.price),
    };
    if (id) {
      delete fields.sku;
      fields.expectedVersion = Number(data.expectedVersion);
      fields.active = data.active === "true";
    } else {
      delete fields.expectedVersion;
      delete fields.active;
    }
    await save(
      id ? `/admin/products/${id}` : "/admin/products",
      fields,
      id ? "PATCH" : "POST",
    );
  }
  async function promotion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    await save("/admin/promotions", {
      code: d.code,
      amount: Number(d.amount),
      minOrderAmount: Number(d.minOrderAmount),
      totalQuota: Number(d.totalQuota),
      startsAt: new Date(String(d.startsAt)).toISOString(),
      endsAt: new Date(String(d.endsAt)).toISOString(),
    });
  }
  async function refreshOps() {
    if (checking) return;
    setChecking(true);
    setMessage("");
    for (const [path, setter] of [
      ["/admin/health", setOps],
      ["/admin/queues", setQueues],
    ] as const) {
      try {
        setter(await api(path, {}, token));
      } catch (e) {
        setter({ status: "UNAVAILABLE", message: (e as Error).message });
      }
    }
    try {
      const r = await api<{ items: Failed[] }>("/admin/failed-jobs", {}, token);
      setFailed(r.items);
      setFailedLoaded(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setChecking(false);
  }
  return (
    <main className="workspace">
      <h1 className="workspace-title">Quản trị ShopFast</h1>
      <nav className="section-nav" aria-label="Khu vực quản trị">
        <NavLink to="/admin/catalog">Danh mục và sản phẩm</NavLink>
        <NavLink to="/admin/promotions">Khuyến mãi</NavLink>
        <NavLink to="/admin/operations">Vận hành</NavLink>
      </nav>
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
      <div className="admin-grid">
        {panel === "catalog" && (
          <>
            {["categories", "brands"].map((kind) => (
              <form
                className="panel"
                key={kind}
                onSubmit={(e) => taxonomy(e, kind)}
              >
                <h2>{kind === "categories" ? "Danh mục" : "Thương hiệu"}</h2>
                <p>
                  Để tạo mới, để trống ID. Khi sửa, điền ID và tên; trạng thái
                  ảnh hưởng toàn bộ sản phẩm liên quan.
                </p>
                <label>
                  ID khi sửa
                  <input name="id" />
                </label>
                <label>
                  Tên
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Slug khi tạo
                  <input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                </label>
                <label>
                  Trạng thái
                  <select name="active">
                    <option value="true">Hoạt động</option>
                    <option value="false">Ngừng hoạt động</option>
                  </select>
                </label>
                <button disabled={busy}>
                  Lưu {kind === "categories" ? "danh mục" : "thương hiệu"}
                </button>
                <ul>
                  {(kind === "categories" ? categories : brands).map((t) => (
                    <li key={t.id}>
                      {t.name} <code>{t.id}</code>
                    </li>
                  ))}
                </ul>
              </form>
            ))}
            <form className="panel" onSubmit={product}>
              <h2>Sản phẩm</h2>
              <label>
                ID khi sửa
                <input name="id" />
              </label>
              <label>
                Phiên bản khi sửa
                <input name="expectedVersion" type="number" min={1} />
              </label>
              <label>
                SKU khi tạo
                <input name="sku" />
              </label>
              <label>
                Slug
                <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
              </label>
              <label>
                Tên sản phẩm
                <input name="name" required maxLength={200} />
              </label>
              <label>
                Mô tả
                <textarea name="description" maxLength={10000} />
              </label>
              <label>
                URL ảnh
                <input name="imageUrl" type="url" required />
              </label>
              <label>
                Danh mục
                <select name="categoryId" required>
                  {categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Thương hiệu
                <select name="brandId" required>
                  {brands.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Giá VND
                <input
                  name="price"
                  type="number"
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  required
                />
              </label>
              <label>
                Trạng thái
                <select name="active">
                  <option value="true">Hoạt động</option>
                  <option value="false">Ngừng bán</option>
                </select>
              </label>
              <button disabled={busy}>Lưu sản phẩm</button>
            </form>
            <section className="panel">
              <h2>Sản phẩm đang bán</h2>
              {products.map((p) => (
                <article key={p.id}>
                  <strong>{p.name}</strong>
                  <p>
                    {p.sku} · {p.price.toLocaleString("vi-VN")} ₫ · v{p.version}
                  </p>
                  <code>{p.id}</code>
                </article>
              ))}
            </section>
          </>
        )}
        {panel === "promotions" && (
          <>
            <form className="panel" onSubmit={promotion}>
              <h2>Tạo khuyến mãi</h2>
              <p>
                Giảm cố định. Mỗi khách dùng tối đa một lần; hủy/hết hạn không
                hoàn quota.
              </p>
              <label>
                Mã
                <input name="code" required maxLength={80} />
              </label>
              <label>
                Số tiền giảm
                <input name="amount" type="number" min={1} required />
              </label>
              <label>
                Giá trị đơn tối thiểu
                <input
                  name="minOrderAmount"
                  type="number"
                  min={0}
                  defaultValue={0}
                  required
                />
              </label>
              <label>
                Tổng lượt
                <input name="totalQuota" type="number" min={1} required />
              </label>
              <label>
                Bắt đầu
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label>
                Kết thúc
                <input name="endsAt" type="datetime-local" required />
              </label>
              <button disabled={busy}>Tạo khuyến mãi</button>
            </form>
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void save(
                  `/admin/promotions/${d.get("id")}`,
                  { active: d.get("active") === "true" },
                  "PATCH",
                );
              }}
            >
              <h2>Trạng thái khuyến mãi</h2>
              <label>
                ID khuyến mãi
                <input name="id" required />
              </label>
              <label>
                Trạng thái
                <select name="active">
                  <option value="true">Hoạt động</option>
                  <option value="false">Dừng</option>
                </select>
              </label>
              <button disabled={busy}>Lưu trạng thái mã</button>
            </form>
          </>
        )}
      </div>
      {panel === "operations" && (
        <section className="panel">
          <h2>Vận hành và tác vụ nền</h2>
          <button
            disabled={checking}
            aria-label="Kiểm tra dịch vụ và queue"
            onClick={refreshOps}
          >
            {checking ? "Đang kiểm tra…" : "Kiểm tra dịch vụ"}
          </button>
          <OperationsSummary health={ops} queues={queues} />
          <h3>Tác vụ lỗi</h3>
          {failed.length === 0 ? (
            <p>
              {failedLoaded
                ? "Không có tác vụ lỗi."
                : "Kiểm tra dịch vụ để xem tác vụ lỗi."}
            </p>
          ) : (
            failed.map((job) => (
              <article key={job.id}>
                <p>
                  {job.type} · {job.reason}
                </p>
                <button
                  disabled={busy}
                  onClick={async () => {
                    await save(`/admin/failed-jobs/${job.id}/retry`, {});
                    await refreshOps();
                  }}
                >
                  Thử lại tác vụ {job.id}
                </button>
              </article>
            ))
          )}
        </section>
      )}
    </main>
  );
}
