**English** | [简体中文](README.md)

# NFLSHC Open Platform · Developer Site

The **developer frontend** of the NFLSHC OAuth open platform (pure static HTML/CSS/JS — no build step, no npm dependencies, no external CDN frameworks),
deployed on GitHub Pages with the custom domain **platform.nflshcchat.cc.cd**.

- Authorization center (user consent page): `accounts.nflshcchat.cc.cd`
- API base (Worker): `https://worker.nflshcchat.cc.cd`
- Account system: shares the same accounts as the nflshcchat main site (passwords hashed with SHA-256; APIs never return passwords)

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Developer sign-in page. The password is SHA-256 hashed in the browser before being submitted to `/api/auth/login`; on success the token and user info are stored and the user is redirected to the Dashboard. If already signed in (`/api/auth/me` succeeds), it redirects automatically. |
| `dashboard.html` | Application management. Lists all my OAuth applications (name / client_id / authorized user count / status / creation time), supports creating applications (the returned `clientSecret` is shown in a prominent dialog and only once) and deleting applications. |
| `app.html` | Application details (`?id=<client_id>`). Basic info and editing (PATCH), copying the client_id, resetting the secret (`clientSecret` also shown only once), callback URL and a fallback display of requested scopes; includes an "Authorized users" table (project-level ban / unban) plus an "Apply for site-wide ban" form and a list of application statuses. |
| `guide.html` | Integration guide. Authorization-code flow, configuration steps on the platform, available scopes, **one-click-copy examples** (Node.js/Express, Python/Flask, PHP, pure frontend), usage of the `/api/oauth/check` endpoint, error codes and security advice. |
| `bans.html` | Ban management. Aggregates the "project-level ban lists" of all my applications (queried per application, with unban) and "site-wide ban applications" (status pending/approved/rejected, admin notes, full reason). |
| `js/api.js` | API wrapper and shared UI: `API_BASE`, `apiGet/apiPost/apiPatch/apiDelete` (adds `Authorization: Bearer`, redirects to login on 401, throws the server `error` text on non-2xx), `escapeHtml`, navbar / dialogs / toasts / copy / date formatting, response normalization and scope list loading. |
| `js/theme.js` | (Already present, unchanged) `ThemeManager` theme switching and `AuthToken` storage. |
| `css/themes.css` | (Already present, unchanged) Theme variables switched via `<html data-theme>`, default dark (midnight black-gold `#ffd700`). |

## Highlights

- **Theme switching**: every page has a theme dropdown in the top-right corner that calls `ThemeManager.setTheme()`: Midnight Black-Gold / Dawn White / Deep Sea Blue / Violet Night / Emerald Green; the choice is persisted in `localStorage`.
- **Security**: all user-controlled text is escaped with `escapeHtml()` before being rendered to the DOM; passwords never leave the browser in plain text; `client_secret` is shown only once, upon creation or reset.
- **Ban boundaries**: project-level bans only affect the developer's own applications and **do not change the user's status on the nflshcchat main site**; site-wide bans must be reviewed and approved by the main-site administrator `huangzhiyuan`. The UI states this explicitly.
- **API contract**: every request follows `API.md` in the repository root (a read-only contract, left unchanged).

## Local preview

There is no build step — just open `index.html` in a browser (the login hash prefers WebCrypto and automatically falls back to a bundled pure-JS SHA-256 implementation outside HTTPS).
To preview over HTTP (avoiding `file://` CORS restrictions), use any static server:

```bash
python -m http.server 8080
# or
npx serve .
```

## Deployment (GitHub Pages + custom domain)

1. Push the contents of this directory to the repository's default branch (`main`).
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. `.github/workflows/deploy.yml` builds and publishes automatically on pushes to `main` (or manually via `workflow_dispatch` on the Actions page):
   `actions/checkout@v4` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` (`path: '.'`) → `actions/deploy-pages@v4`.
4. The `CNAME` file in the repository root already contains `platform.nflshcchat.cc.cd`; point the subdomain's `CNAME` DNS record at `<username>.github.io` and enable **Enforce HTTPS** in the Pages settings.
5. `.nojekyll` is an empty file that skips Jekyll processing, ensuring directories such as `js/` and `css/` are published as-is.

> The site is pure static content and contains no secrets; `client_secret` only exists on the developer's server.
