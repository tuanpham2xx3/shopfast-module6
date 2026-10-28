import { FormEvent, useEffect, useState } from "react";
type Api = <T>(
  path: string,
  options?: RequestInit,
  token?: string,
) => Promise<T>;
type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  category: string;
  assignedTo: string | null;
  version: number;
  needsReview?: boolean;
  classificationStatus?: string;
  messages?: { items: { id: string; authorId: string; body: string }[] };
};
type Proposal = {
  id: string;
  payload: { category: string; reason: string; previousCategory: string };
  expectedVersion: number;
  status: string;
  expiresAt: string;
};
type Answer = {
  aiMessageId: string;
  answer: string;
  status: string;
  evidence: {
    tool: string;
    resourceId: string;
    observedAt: string;
    resultSummary: unknown;
  }[];
  proposal: Proposal | null;
};
const categories = [
  "ORDER_STATUS",
  "PAYMENT",
  "INVENTORY",
  "DELIVERY",
  "CANCELLATION",
  "OTHER",
];
export function Tickets({
  api,
  token,
  staff,
  userId,
  routeId,
  basePath,
  onNavigate,
}: {
  api: Api;
  token: string;
  staff: boolean;
  userId: string;
  routeId?: string;
  basePath?: string;
  onNavigate?: (path: string) => void;
}) {
  const [items, setItems] = useState<Ticket[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [draft, setDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lookup, setLookup] = useState<unknown>(null);
  const prefix = staff ? "/staff/tickets" : "/tickets";
  useEffect(() => {
    setTicket(null);
    setError("");
    setSession("");
    setAnswer(null);
    setDraft("");
    setLookup(null);
  }, [prefix, routeId]);
  useEffect(() => {
    let active = true;
    if (routeId)
      api<Ticket>(`${prefix}/${encodeURIComponent(routeId)}`, {}, token)
        .then((result) => {
          if (active) setTicket(result);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [api, token, prefix, routeId]);
  useEffect(() => {
    let active = true;
    api<{ items: Ticket[]; total: number }>(
      `${prefix}?page=${page}&pageSize=20${statusFilter ? `&status=${statusFilter}` : ""}`,
      {},
      token,
    )
      .then((r) => {
        if (active) {
          setItems(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, token, prefix, page, revision, statusFilter]);
  async function open(id: string) {
    if (onNavigate) {
      onNavigate(`${basePath ?? prefix}/${encodeURIComponent(id)}`);
      return;
    }
    setError("");
    try {
      setTicket(await api<Ticket>(`${prefix}/${id}`, {}, token));
      setSession("");
      setAnswer(null);
      setDraft("");
      setLookup(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function mutate(path: string, data: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const result = await api<unknown>(
        path,
        { method, body: JSON.stringify(data) },
        token,
      );
      setRevision((v) => v + 1);
      if (ticket)
        setTicket(await api<Ticket>(`${prefix}/${ticket.id}`, {}, token));
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (!data.orderId) delete data.orderId;
    const created = (await mutate("/tickets", data)) as Ticket | null;
    if (created) {
      form.reset();
      await open(created.id);
    }
  }
  async function chat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket) return;
    const message = String(new FormData(e.currentTarget).get("message"));
    setBusy(true);
    setError("");
    try {
      let id = session;
      if (!id) {
        id = (
          await api<{ sessionId: string }>(
            `/staff/tickets/${ticket.id}/ai-sessions`,
            { method: "POST", body: "{}" },
            token,
          )
        ).sessionId;
        setSession(id);
      }
      setAnswer(
        await api<Answer>(
          `/staff/ai-sessions/${id}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              message,
              clientMessageId: crypto.randomUUID(),
            }),
          },
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <header className="store-heading">
        <h1 className="workspace-title">
          {staff ? "Bàn hỗ trợ" : "Yêu cầu hỗ trợ"}
        </h1>
        <span>{total} yêu cầu</span>
      </header>
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      {!staff && (
        <form className="panel" onSubmit={create}>
          <h2>Tạo yêu cầu mới</h2>
          <label>
            Tiêu đề
            <input name="subject" minLength={5} maxLength={150} required />
          </label>
          <label>
            Nội dung
            <textarea name="body" minLength={1} maxLength={4000} required />
          </label>
          <label>
            ID đơn liên quan (tùy chọn)
            <input name="orderId" />
          </label>
          <button disabled={busy}>Gửi yêu cầu</button>
        </form>
      )}
      <div className="support-layout">
        <section>
          <label>
            Lọc trạng thái
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {items.length === 0 && <p>Chưa có yêu cầu.</p>}
          {items.map((t) => (
            <button
              className="ticket-row"
              key={t.id}
              onClick={() => open(t.id)}
            >
              <strong>{t.subject}</strong>
              <span>
                {t.status} · {t.category}
              </span>
              {(t.needsReview || t.classificationStatus === "FAILED") && (
                <span>Cần nhân viên kiểm tra nhãn</span>
              )}
            </button>
          ))}
          <nav className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Trước
            </button>
            <span>{page}</span>
            <button
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </button>
          </nav>
        </section>
        {ticket && (
          <section className="panel">
            <h2>{ticket.subject}</h2>
            <p>{ticket.body}</p>
            <p>
              {ticket.status} · {ticket.category} · phiên bản {ticket.version}
            </p>
            {staff && !ticket.assignedTo && (
              <button
                disabled={busy}
                onClick={() =>
                  mutate(`/staff/tickets/${ticket.id}/claim`, {
                    expectedVersion: ticket.version,
                  })
                }
              >
                Nhận xử lý
              </button>
            )}
            {staff && ticket.assignedTo && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = Object.fromEntries(new FormData(e.currentTarget));
                  void mutate(
                    `/staff/tickets/${ticket.id}`,
                    { ...d, expectedVersion: ticket.version },
                    "PATCH",
                  );
                }}
              >
                <label>
                  Trạng thái
                  <select
                    name="status"
                    defaultValue={ticket.status}
                    key={`s${ticket.id}${ticket.version}`}
                  >
                    {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Nhãn
                  <select
                    name="category"
                    defaultValue={ticket.category}
                    key={`c${ticket.id}${ticket.version}`}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Cập nhật yêu cầu</button>
              </form>
            )}
            <div className="conversation">
              {ticket.messages?.items.map((m) => (
                <article key={m.id}>
                  <strong>
                    {m.authorId === userId ? "Bạn" : "Người tham gia"}
                  </strong>
                  <p>{m.body}</p>
                </article>
              ))}
            </div>
            {ticket.status !== "CLOSED" && (!staff || ticket.assignedTo) && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const sent = await mutate(`${prefix}/${ticket.id}/messages`, {
                    body: draft,
                    ...(staff && answer && draft === answer.answer
                      ? { approvedAiMessageId: answer.aiMessageId }
                      : {}),
                  });
                  if (sent) setDraft("");
                }}
              >
                <label>
                  {staff ? "Trả lời khách hàng" : "Tin nhắn"}
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    required
                    maxLength={4000}
                  />
                </label>
                <button disabled={busy}>Gửi tin nhắn</button>
              </form>
            )}
            {!staff && ticket.status === "RESOLVED" && (
              <button
                disabled={busy}
                onClick={() =>
                  mutate(`/tickets/${ticket.id}/reopen`, {
                    expectedVersion: ticket.version,
                  })
                }
              >
                Mở lại yêu cầu
              </button>
            )}
            {staff && ticket.assignedTo && (
              <section className="ai-panel">
                <h3>Trợ lý Gemini</h3>
                <p>
                  Gợi ý được giữ ở đây. Chỉ nút gửi tin nhắn phía trên mới gửi
                  câu trả lời cho khách.
                </p>
                <form onSubmit={chat}>
                  <label>
                    Hỏi trợ lý
                    <textarea name="message" maxLength={4000} required />
                  </label>
                  <button disabled={busy}>Hỏi Gemini</button>
                </form>
                {answer && (
                  <>
                    <p role="status">{answer.status}</p>
                    <p>{answer.answer}</p>
                    <button onClick={() => setDraft(answer.answer)}>
                      Dùng làm bản nháp
                    </button>
                    <ul>
                      {answer.evidence?.map((e, i) => (
                        <li key={i}>
                          {e.tool} · {e.observedAt} ·{" "}
                          {typeof e.resultSummary === "string"
                            ? e.resultSummary
                            : JSON.stringify(e.resultSummary)}
                        </li>
                      ))}
                    </ul>
                    {answer.proposal && (
                      <div className="proposal">
                        <h4>Đề xuất đổi nhãn</h4>
                        <p>
                          {answer.proposal.payload.previousCategory} →{" "}
                          {answer.proposal.payload.category}
                        </p>
                        <p>{answer.proposal.payload.reason}</p>
                        <p>
                          Hết hạn:{" "}
                          {new Date(answer.proposal.expiresAt).toLocaleString(
                            "vi-VN",
                          )}
                        </p>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const result = await mutate(
                              `/staff/ai-proposals/${answer.proposal!.id}/confirm`,
                              {
                                confirm: true,
                                expectedVersion:
                                  answer.proposal!.expectedVersion,
                              },
                            );
                            if (result)
                              setAnswer({ ...answer, proposal: null });
                          }}
                        >
                          Xác nhận đổi nhãn
                        </button>
                        <button
                          className="switch"
                          disabled={busy}
                          onClick={async () => {
                            await mutate(
                              `/staff/ai-proposals/${answer.proposal!.id}/reject`,
                              {},
                            );
                            setAnswer({ ...answer, proposal: null });
                          }}
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const code = String(
                        new FormData(e.currentTarget).get("code"),
                      );
                      setLookup(
                        await api(
                          `/staff/tickets/${ticket.id}/orders/${encodeURIComponent(code)}`,
                          {},
                          token,
                        ),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <label>
                    Tra đơn của chủ ticket
                    <input name="code" maxLength={40} required />
                  </label>
                  <button>Tra cứu đơn</button>
                </form>
                {lookup !== null && (
                  <pre>{JSON.stringify(lookup, null, 2)}</pre>
                )}
              </section>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
