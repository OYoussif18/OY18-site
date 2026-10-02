# OY18

A personal technology identity — not a résumé. Dark, minimal, and interactive,
built as a single static page with no framework and no build step.

```
open index.html          # or: python3 -m http.server 8000
```

There is nothing to install and nothing to compile. Serve the folder and it works.

---

## The idea

OY18 is treated as a handle on a system rather than a person. That single idea
drives every visual decision:

| Element | Meaning |
|---|---|
| **Lattice** (hero) | A field of nodes that rewires itself. Your cursor is a field inside it — it pulls nearby nodes and energises the edges that tighten around it. |
| **Depth rail** (left edge) | A vertical instrument scale that fills as you descend, with a live depth readout. Navigation as a measurement, not a menu. |
| **Signal plot** | A self-reported trace of what is currently taking attention. Deliberately irregular — a smooth curve would imply data that does not exist. |
| **ABC loop** (Basis) | Read → tear down → rebuild → put in a loop. The stance, expressed as a circuit. |
| **Resolve** (ending) | The same lattice collapses into three settled clusters, one under each contact port. The open graph resolves into the ways in. |

One accent colour only: **signal amber `#FFAE2E`** on warm near-black. Chosen
because it is not the blue/green/purple every technology site reaches for.

---

## Structure

```
index.html                 semantic markup, all content inline
site.webmanifest
assets/
  css/style.css            one stylesheet, ~250 rules
  js/main.js               one script, no dependencies
  fonts/                   Geist + Geist Mono (self-hosted, latin subsets, 84 KB)
  img/                     favicon, app icons, social preview
verify.js                  screenshots every section at 4 widths
test.js                    interaction tests (nav, filters, a11y, touch)
perf.js                    frame-cost measurement under CPU throttling
```

`verify.js`, `test.js` and `perf.js` drive the local Chromium over the DevTools
Protocol and are development tools, not runtime dependencies. Delete them if you
only want the site.

---

## Design decisions worth knowing

**No framework.** The whole page is one HTML file, one stylesheet and one
script. Total transfer is about 120 KB, most of it the two font files. A
framework would have cost more than everything it replaced.

**Self-hosted fonts.** Geist and Geist Mono are subset to latin and
latin-ext and served from the same origin, so there is no third-party request
and no layout shift waiting on someone else's CDN.

**The lattice is batched, not just small.** The naive version issued one
`beginPath()`/`stroke()` per link — roughly 2,000 canvas state changes per
frame, which cost ~50 ms. Links are now bucketed by alpha and stroked as a
handful of paths, with an adaptive quality governor that thins the field if a
draw still exceeds its budget. Frame time dropped to a steady 16.7 ms
(unthrottled *and* at 4× CPU throttling).

**The custom cursor never appears on touch.** It is gated behind
`(hover: hover) and (pointer: fine)`. The native cursor is untouched otherwise,
so nothing is ever unclickable on a phone.

**Reduced motion is a real path, not a stub.** `prefers-reduced-motion: reduce`
freezes the caret, stops the lattice, shows all reveals immediately, and skips
the smooth scroll. There is no content that is only reachable by animating.

---

## Editing content

All copy lives in `index.html`.

**Adding an interest:** copy a `<li class="stack__row">` block. If you want the
hairline mark, add a key to `GLYPHS` in `assets/js/main.js` and point
`data-glyph` at it.

**Wiring up the contact ports:** the three `<li class="port">` items in the
Ports section. Each currently renders a placeholder with a dashed underline. To
make one live, replace the contents of `.port__val` with a real link and drop
the `data-placeholder` attribute:

```html
<p class="port__val">
  <a href="https://github.com/YOUR-HANDLE" data-cursor-label="Open">github.com/YOUR-HANDLE</a>
</p>
```

**Accent colour:** change `--accent` in `:root`. The canvases read it from CSS
at startup, so the hero, the rail and the ending all follow automatically.

---

## Before publishing

* [ ] Replace the three placeholders in the Ports section with real links
* [ ] Set the absolute `og:url` and `og:image` in the `<head>` (they currently
      use relative paths, which most platforms will not resolve)
* [ ] Decide whether Cairo belongs in the site — it is currently absent, on
      purpose, because it did not earn a place in the composition
* [ ] Replace the Completed column in the Ledger once there is something
      genuinely finished to put in it

Nothing on this site was invented. Where a fact was not supplied, it is either
omitted or rendered as a visibly marked placeholder.
