# Defense deck redesign verification — 2026-11-02

Scope: rebuild the existing HTML/PDF deck, retaining ten slides. Narrative now
follows customer need, live product flow, correctness, realtime/jobs, AI,
architecture, verification, recovery and outcome. The ten-minute script and
speaker notes use the same slide order and time boundaries.

## Sources

- Catalog screenshot captured from the public production site.
- AI panel screenshot captured with Chromium from the real demo ticket. Real
  Gemini response and order evidence were asserted before capture. No synthetic
  screenshot was presented as application output.
- Product photo and local font files retain attribution/licenses in
  `docs/defense/assets/README.md` and `assets/fonts/OFL.txt`.
- CI log for `378b747` was read: 153 combined unit/integration tests and 19
  browser cases passed. Restore 7 seconds remains labeled 29/10, source ffcb599;
  it is not reassigned to the current application release.

## Executed verification

- Rendered and visually reviewed all ten original slides before replacement.
- `node tools/scripts/render-defense.mjs`: PASS. Ten HTML slides, ten PDF pages,
  no screen/print bounds violations, no failed resources or JavaScript errors.
- Images loaded and Be Vietnam Pro font verified; assets are local for offline
  viewing. Keyboard navigation, notes and 960×540 / 1366×768 viewport fit passed.
- Reviewed all ten final HTML/print layouts. Independently rasterized the final
  PDF with PyMuPDF at 1280×720 per page and visually reviewed all ten pages.
- PDF has ten 960×540 pt pages (16:9) and extractable text on every page.
- `npm run docs:check --prefix tools`: PASS.
- `npm run format:check --prefix tools`: PASS.

Generated slide/print/PDF PNGs and the detailed renderer receipt remain in ignored
`harness/reports/defense/`. Final deliverables are the checked-in HTML, CSS, assets,
PDF and script. No timed human rehearsal is claimed. Existing AuthService changes
remain outside this task; no product deployment was performed.
