HistoryX — by CINEFyLK
Version 3.1.0

WHAT'S NEW IN 3.1
- Fixed: updating the extension no longer wipes your domains, rules, settings or log.
- Fixed: pasting a subdomain URL now manages its root domain (co.uk and similar suffixes included).
- Fixed: URL selection on the clear page no longer resets the "add to list" checkbox.
- Fixed: Cancel closes the correct confirmation tab; scheduled alarms are no longer reset by log updates.
- Added: quick theme toggle, keyboard shortcuts (N and /), search clear button, inline undo after cleaning.
- Added: filterable URL review on the confirmation page and "Run now" for rules.
- Upgraded: refreshed popup, options and confirmation page UI with loading and empty states.

WHAT'S NEW IN 3.0
- Right-click any page or link: "Add this site to HistoryX" or "Clear this site's history".
- The clear-site action opens a confirmation tab with a checkbox list of the exact URLs.
- Rules engine: automatic cleanup on browser startup, every N hours, or daily at a set time.
- Rules page (right-click the extension → Options) to create, edit, enable and delete rules.
- Windowed history scanning reads history in small pages instead of one huge query.
- IndexedDB cache keeps history data local so the popup opens fast, even with large profiles.
- Full resync and adjustable cache refresh interval.
- "Clear" on each domain card gives a preview of the URLs before deleting.

INSTALLATION (Google Chrome)
1. Extract the HistoryX folder/zip.
2. Open chrome://extensions in Chrome.
3. Turn on Developer mode (top-right).
4. Click "Load unpacked".
5. Select the HistoryX folder (the folder containing manifest.json).
6. Pin HistoryX from Chrome's Extensions menu.
7. After updating, click the reload icon on the extension card.

CLEARING ONE WEBSITE
- In the popup: add the domain, then click "Clear" on its card.
- From any page: right-click → "Clear this site's history" → review the URL list → Clear selected history.
- Optionally check "Also add this domain to my HistoryX list" on the confirmation page.
- Matching includes the root domain and all subdomains (youtube.com, www.youtube.com,
  music.youtube.com) but not lookalikes (notyoutube.com).

CONTEXT MENU
- "Add this site to HistoryX": adds the page's or link's domain to your managed list.
- "Clear this site's history": opens a safe confirmation page for that single site.

RULES (AUTOMATIC CLEANING)
- Open Options from the extension's details page or Settings → Rules in the popup.
- Create a rule with a name, domain list and schedule:
  - On browser startup
  - Every N hours
  - Daily at HH:MM
- Toggle rules on/off without deleting them. Each rule records its last run and result.
- Use "Run now" on any rule card to execute it immediately without waiting for its schedule.
- Rules only delete history for the domains listed in that rule.
- Chrome's history API cannot delete only recent visits of a URL, so rules delete all
  visits for matching URLs. There is intentionally no "last 7 days" filter.

LARGE HISTORY
- History is scanned in windows of up to 400 URLs using last-visit-time cursors.
- Results are cached in IndexedDB. Incremental updates run after the refresh interval;
  a full scan runs automatically once a day or when you press "Full resync".
- Adjust "Refresh cached data after" in Settings or on the Options page.
- "Restore" in Recent cleanups re-adds up to 500 URLs from the last cleanup.

PERMISSIONS
- history: read matching history and delete selected history URLs.
- storage: save domains, settings, rules and the cleanup log locally.
- activeTab: read the current tab URL when you click "Use current site".
- tabs: open the confirmation page and close it from the context menu.
- contextMenus: add the two right-click actions.
- alarms: run scheduled cleaning rules.

PRIVACY
- No server, analytics, or external network requests.
- Domains, settings, rules, cleanup log and cached history stay in this browser profile.

LIMITATIONS
- Only browsing history is removed. Cookies, cache, downloads and site data remain.
- Synced history may reappear from other devices or accounts.
- Restoring re-creates URLs with a new visit time; original visit times cannot be recovered.
- Chrome's extension popups have a 600px height limit; use Options for larger views.

PROJECT
HistoryX by CINEFyLK
