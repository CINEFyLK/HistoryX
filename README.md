<div align="center">

<img src="docs/assets/header.svg" alt="CINEFy-LK — Software Engineer, Sri Lanka" width="800">
<img src="docs/assets/badges.svg" alt="Manifest V3 · Version 3.0.0 · Chrome · 0 network calls · IndexedDB cache" width="800">

<h1>HistoryX</h1>

<p><strong>Clear browsing history by domain. Preview the exact URLs first, add sites from any page, and schedule automatic cleanups — all locally.</strong></p>

<p>
<a href="#overview">Overview</a> ·
<a href="#features">Features</a> ·
<a href="#how-it-works">How it works</a> ·
<a href="#automatic-cleaning-rules">Rules</a> ·
<a href="#large-histories">Large histories</a> ·
<a href="#privacy">Privacy</a> ·
<a href="#installation">Installation</a> ·
<a href="#permissions">Permissions</a> ·
<a href="#limitations">Limitations</a>
</p>

<sub>Artwork is animated; cards react on hover in supporting browsers. Expand the guides below to explore.</sub>

</div>

---

## Overview

HistoryX is a Chrome Manifest V3 extension for managing browsing history one domain at a time. Add a domain, see how many visits match, review the exact URLs, then delete only what you choose. A local IndexedDB cache keeps the popup responsive even with a large history profile.

<img src="docs/assets/popup-demo.svg" alt="Animated mockup of the HistoryX popup showing domain cards, visit counts, an add-domain field and a clean-all button" width="800">

## Features

<img src="docs/assets/features.svg" alt="Six illustrated feature cards: domain targeting, context menu, URL preview, rules engine, large histories and privacy" width="800">

- **Domain targeting** — root domain plus all subdomains (`youtube.com`, `www.youtube.com`, `music.youtube.com`), never lookalikes such as `notyoutube.com`.
- **Context menu** — "Add this site to HistoryX" and "Clear this site's history" on any page or link.
- **Preview before delete** — a confirmation tab lists the exact URLs with checkboxes.
- **Automatic rules** — clean on browser startup, every N hours, or daily at a set time.
- **Built for large profiles** — windowed history scanning and a local IndexedDB cache with adjustable refresh and full resync.
- **Reversible** — "Restore" in Recent cleanups re-adds up to 500 URLs from the last cleanup.
- **Private** — no server, analytics, or external network requests.

## How it works

<img src="docs/assets/flow.svg" alt="Animated four-step flow: right-click, preview exact URLs, clear selected history, restore if needed" width="800">

<details>
<summary><strong>Clearing one website — click to expand</strong></summary>

- In the popup: add the domain, then click **Clear** on its card to preview the matching URLs.
- From any page: right-click → **Clear this site's history** → review the list → **Clear selected history**.
- Optionally check **Also add this domain to my HistoryX list** on the confirmation page.
- Matching includes the root domain and all subdomains, but not lookalikes. Cookies, cache, and site data are untouched.

</details>

<details>
<summary><strong>Context menu actions — click to expand</strong></summary>

- **Add this site to HistoryX** adds the page's or link's domain to your managed list.
- **Clear this site's history** opens a safe confirmation page for that single site.
- Right-click the extension icon → **Options** for rules, cache settings, appearance, and the full domain tools.

</details>

<details>
<summary><strong>Restoring a cleanup — click to expand</strong></summary>

Recent cleanups are logged locally and can be toggled off in Settings. **Restore** re-adds up to 500 URLs from the last cleanup with a new visit time; original visit times cannot be recovered.

</details>

## Automatic cleaning rules

<img src="docs/assets/rules.svg" alt="Animated illustration of three rule schedules: on startup, every N hours, and daily at a set time" width="800">

Rules run in the background and only delete history for the domains listed in that rule.

| Schedule | Meaning |
| --- | --- |
| On browser startup | Runs once each time Chrome starts. |
| Every N hours | Repeats on an interval you choose. |
| Daily at HH:MM | Runs at a fixed 24-hour time each day. |

<details>
<summary><strong>Creating and managing a rule — click to expand</strong></summary>

Open **Options** from the extension's details page, or **Settings → Rules** in the popup, then choose **New rule**:

```text
Rule name:      Weekly distraction cleanup
When to run:    Daily at 03:00
Domains:        youtube.com
                www.reddit.com
                https://news.ycombinator.com
Enabled:        on
```

- Each rule records its last run and result.
- Toggle a rule off or on without deleting it; edit and delete are available too.
- Subdomains are included automatically and invalid entries are skipped.

</details>

<details>
<summary><strong>Why there is no "last 7 days" filter — click to expand</strong></summary>

Chrome's history API cannot delete only recent visits of a URL, so rules delete **all** visits for matching URLs. This limitation is intentional and is also noted on the Options page.

</details>

## Large histories

- History is scanned in windows of up to **400 URLs** using last-visit-time cursors instead of one huge query.
- Results are cached in **IndexedDB**, so the popup opens fast even with large profiles.
- Incremental updates run after the refresh interval; a full scan runs automatically once a day or when you press **Full resync**.
- **Refresh cached data after** is adjustable: 15 minutes, 30 minutes, 2 hours, or 6 hours.
- The Options page shows cached URL count, last sync, and last full scan.

<details>
<summary><strong>Cache behaviour — click to expand</strong></summary>

The cache lives only in this browser profile. Incremental refreshes keep it current between full scans; a manual **Full resync** forces a complete walk of history. Because scanning is windowed, very large histories do not require a single oversized history query.

</details>

## Privacy

<img src="docs/assets/privacy.svg" alt="Animated shield with a checkmark and the text 100% local, no network requests" width="800">

- No server, analytics, or external network requests.
- Domains, settings, rules, cleanup log, and cached history stay in this browser profile.
- Only browsing history is removed — no cookies, cache, downloads, or site data.

## Installation

<img src="docs/assets/install.svg" alt="Six illustrated installation steps for loading the unpacked extension in Google Chrome" width="800">

1. Extract the HistoryX folder or zip.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the **HistoryX** folder — the one containing `manifest.json`.
6. Pin HistoryX from Chrome's Extensions menu.

After updating the files, click the reload icon on the extension card.

## Permissions

| Permission | Why HistoryX needs it |
| --- | --- |
| `history` | Read matching history and delete selected history URLs. |
| `storage` | Save domains, settings, rules, and the cleanup log locally. |
| `activeTab` | Read the current tab URL for **Use current site**. |
| `tabs` | Open the confirmation page and close it from the context menu. |
| `contextMenus` | Add the two right-click actions. |
| `alarms` | Run scheduled cleaning rules. |

## Limitations

- Only browsing history is removed. Cookies, cache, downloads, and site data remain.
- Synced history may reappear from other devices or accounts.
- Restoring re-creates URLs with a new visit time; original visit times cannot be recovered.
- Chrome limits extension popups to 600px in height — use Options for larger views.

## Project

**HistoryX by CINEFyLK** · Version 3.0.0
