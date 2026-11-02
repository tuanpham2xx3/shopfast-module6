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

## Production verification

On 02/11, the append-only `catalog-v2` media directory from commit `af219ad` was
placed in both active release `d4bb8f8` and previous release `378b747` before any
database URL changed. Existing JS/CSS and image files were not overwritten. This
explicit media addition means those release asset folders now include this new
directory beyond their original image contents. The next normal web image also
packages the same files, so later deployments retain them.

Backup `shopfast-20261102T093128Z.dump` completed before the update. The updater
HEAD gate verified every target image; dry-run found 42 pending, then authenticated
Admin PATCH calls changed 42 image URLs with expectedVersion checks. A sequential
second dry-run returned **pending 0, changed 0**.

Fresh public HTTP GETs verified all 42 hashes against the manifest, all returned
HTTP 200 with image content types, and the full 45-product public price/available
stock snapshot matched the one taken before updates. The first verification
script compared in-memory undefined fields to JSON-serialized data and failed;
normalizing serialization fixed that check without changing product data. The
rerun passed. This public check does not inspect private stock internals.

Real Chromium checks passed: catalog pages **12/12/12/9**, final next button
disabled, category pages **12/2**, and visible final-page images decoded.
[Fresh page-four screenshot](2026-11-02-catalog-page4.png). The defense catalog
screenshot and ten-page PDF were refreshed; deck renderer reported no layout,
resource or page errors and all image/font assets loaded.

[PR #28](https://github.com/tuanpham2xx3/shopfast-module6/pull/28) passed
[Application CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41420988185)
and Docs checks before merge. Static media and API data were verified above;
the final image-packaged release receipt is recorded separately after deployment.

## Packaged release

[Release](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41421802883)
succeeded for `6e305cb5602637f3a8dd854f45aa997ebe30de7a`; receipt duration 18 seconds,
previous `d4bb8f8fb7d42cc6ffda846c8b5cb2b620e9cf24`, app image ID
`sha256:10cf6f1c290d09d0097241c71b54c7fc708a894b69c261ec9abb00ca6013d354`.
After that deployment, the real browser pagination/image check passed again and
the updater still returned pending 0. No additional cloud resources were created.
