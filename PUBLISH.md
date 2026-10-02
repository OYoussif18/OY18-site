# Publish to a private GitHub repository

The site is built, verified and committed on `main` at:

    /home/oy18/Work/oy18-identity

There is no remote yet — `gh` was not authenticated on this machine and no
credentials were available, so the repository was not created. Run the
following yourself to finish the last step.

## 1. Authenticate (one-time)

    gh auth login

Choose: GitHub.com → HTTPS → paste a token from https://github.com/settings/tokens
(the classic token needs the `repo` scope), or log in via the browser.

## 2. Create the private repo and push

    cd /home/oy18/Work/oy18-identity
    gh repo create oy18-identity --private --source=. --remote=origin --push

This creates `oy18-identity` as a **private** repo and pushes `main`.

## Or do it entirely from GitHub

Create an empty **private** repo named `oy18-identity` on GitHub (no README /
.gitignore — this project already has both), then:

    cd /home/oy18/Work/oy18-identity
    git remote add origin https://github.com/YOUR-HANDLE/oy18-identity.git
    git push -u origin main

---

## Before you deploy

* [ ] Replace the three placeholders in the Ports section (GitHub / Email /
      Discord) with real links — see "Editing content" in `README.md`
* [ ] Set the absolute `og:url` and `og:image` in `<head>`; they are currently
      relative paths that most social platforms will not resolve
* [ ] Decide whether Cairo belongs — it is intentionally absent because it did
      not earn a place in the composition

Deployment is not required to view the site: it is fully static, so any static
host (GitHub Pages, Netlify, Vercel, Cloudflare Pages) will serve it as-is with
no build step.