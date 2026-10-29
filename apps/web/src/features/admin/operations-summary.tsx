function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function OperationsSummary({
  health,
  queues,
}: {
  health: unknown;
  queues: unknown;
}) {
  const h = record(health),
    q = record(queues),
    queue = record(q.redisQueue),
    counts = record(queue.counts);
  const services = [
    ["PostgreSQL", h.database ?? (health === null ? undefined : "unavailable")],
    ["Redis", h.redis ?? (health === null ? undefined : "unavailable")],
    ["Hàng đợi", queue.status ?? (queues === null ? undefined : "unavailable")],
  ];
  const state = (value: unknown) =>
    value === "ok"
      ? "Sẵn sàng"
      : value === undefined
        ? "Chưa kiểm tra"
        : "Không sẵn sàng";
  const circuit = record(h.gemini).status;
  return (
    <>
      <div className="service-list" aria-label="Tình trạng dịch vụ">
        {services.map(([name, status]) => (
          <div key={String(name)}>
            <span>{String(name)}</span>
            <strong
              className={`service-state ${status === "ok" ? "is-ready" : ""}`}
            >
              {state(status)}
            </strong>
          </div>
        ))}
      </div>
      <div className="queue-stats" aria-label="Số lượng tác vụ">
        {[
          ["waiting", "Đang chờ"],
          ["active", "Đang chạy"],
          ["completed", "Hoàn tất"],
          ["failed", "Thất bại"],
          ["delayed", "Lên lịch"],
        ].map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>
              {typeof counts[key!] === "number"
                ? Number(counts[key!]).toLocaleString("vi-VN")
                : "—"}
            </strong>
          </div>
        ))}
      </div>
      <p className="muted">
        Gemini:{" "}
        {circuit === "OPEN"
          ? "tạm ngắt sau lỗi"
          : circuit === "CLOSED"
            ? "cho phép gửi yêu cầu; chưa xác minh phản hồi"
            : "chưa kiểm tra"}
        .
      </p>
      <details className="technical-details">
        <summary>Chi tiết kỹ thuật</summary>
        <div className="admin-grid">
          <pre>
            {health === null
              ? "Chưa kiểm tra dịch vụ"
              : JSON.stringify(health, null, 2)}
          </pre>
          <pre>
            {queues === null
              ? "Chưa kiểm tra hàng đợi"
              : JSON.stringify(queues, null, 2)}
          </pre>
        </div>
      </details>
    </>
  );
}
