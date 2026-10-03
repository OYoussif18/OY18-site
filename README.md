# OY18

A personal technology identity — not a résumé.

Dark, minimal, and interactive, built as a single static page with no framework and no build step.

```bash
open index.html
# or
python3 -m http.server 8000
```

There is nothing to install and nothing to compile. Serve the folder and it works.

---

## The idea

OY18 is treated as a handle on a system rather than a person. That idea drives the visual language of the site.

| Element         | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| **Lattice**     | A reactive field of nodes that responds to the cursor.                          |
| **Depth rail**  | A vertical instrument scale that fills as you move through the page.            |
| **Signal plot** | A deliberately irregular trace representing what is currently taking attention. |
| **ABC loop**    | Read → tear down → rebuild → put it in a loop.                                  |
| **Ports**       | The open channels into the identity — GitHub, WhatsApp, Email, and Discord.     |

One accent colour only: **signal amber `#FFAE2E`** on warm near-black.

---

## Structure

```text
index.html
site.webmanifest
robots.txt
sitemap.xml

assets/
  css/style.css
  js/main.js
  fonts/
  img/
```

The site has no framework, package manager, or build pipeline.

The JavaScript handles the interactive systems: navigation, cursor behavior, lattice rendering, section reveals, filters, and other page interactions.

---

## Design

**No framework.**
The page is intentionally built from standard HTML, CSS, and JavaScript. There is no abstraction layer between the design and the browser.

**Self-hosted fonts.**
Geist and Geist Mono are served locally rather than loaded from a third-party CDN.

**Interactive lattice.**
The hero uses Canvas to create a responsive node field that reacts to pointer movement.

**Custom cursor.**
The cursor enhancement is only active for devices with a fine pointer and hover capability. Touch devices keep their native interaction model.

**Static by design.**
There is no backend, database, analytics layer, or runtime dependency.

---

## Editing content

Most copy lives directly in `index.html`.

### Adding an interest

Copy an existing:

```html
<li class="stack__row">
```

block and update its number, title, description, and glyph.

### Updating the ports

The Ports section contains four live channels:

* GitHub
* WhatsApp
* Email
* Discord

Each port is a full clickable card.

### Changing the accent

Change `--accent` in `assets/css/style.css`.

The interactive elements use the same accent variable so the visual system remains consistent.

---

## Deployment

The site is designed to be deployed as a static site.

It can be served directly by any static hosting provider, including Vercel.

No build command is required.

---

## Philosophy

The site deliberately avoids presenting unfinished work as finished work.

The Ledger separates experiments from completed work, while the In Progress section shows what is currently being explored or built.

The site is intended to evolve with the work rather than pretend the work is already complete.
