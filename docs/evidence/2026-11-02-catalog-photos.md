# Distinct catalog photos — 2026-11-02

## Local verification

- 42 demo SKUs map to 42 distinct Wikimedia Commons product photos; the original
  three catalog records are not changed by the image updater.
- Each downloaded file matches its recorded SHA-256. All 42 decode in Chromium;
  the contact sheet was visually inspected for headphone/speaker/microphone type.
- Sources, authors and individual licenses are retained in
  `FE/public/images/products/catalog-v2/sources.json` and the adjacent credits page.
  These remain illustrative photos for fictional demo variants, not claims that
  ShopFast sells the exact commercial models at the fictional prices/specifications.
- Downloader/updater syntax checks and scoped Prettier checks passed. No generated
  images or runtime third-party hotlinks are used.

## Production gate

Production rollout and API image changes have not been verified in this receipt.
Deploy static files first, check every replacement URL, back up the DB, then use
`update-demo-images.cjs --apply`. Preserve the new media directory in the previous
release for rollback compatibility. Check public image hashes, pagination, stock
and the updater's second run before declaring the image replacement complete.
