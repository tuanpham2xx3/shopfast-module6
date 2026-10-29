import { useEffect, useState } from "react";
export function ProductMedia({
  name,
  url,
  sku,
  credit = false,
}: {
  name: string;
  url: string;
  sku: string;
  credit?: boolean;
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
      {source && credit && (
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
