import {
  KEYS,
  getSettings,
  getDomains,
  saveDomains,
  normalizeDomain,
  urlsForDomains,
  plural,
  readCache,
  syncCache,
  cleanAndLog
} from "./core.js";

const el = {
  siteName: document.getElementById("siteName"),
  siteSummary: document.getElementById("siteSummary"),
  urlList: document.getElementById("urlList"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  addToList: document.getElementById("addToList"),
  clearBtn: document.getElementById("clearBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  result: document.getElementById("result")
};

let domain = null;
try {
  domain = normalizeDomain(new URLSearchParams(location.search).get("domain") || "");
} catch {}

const state = { urls: [], excluded: new Set(), domains: [], settings: {}, busy: false };

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === "light" ? "light" : "dark";
}

function selectedUrls() {
  return state.urls.filter(url => !state.excluded.has(url));
}

function render() {
  if (!domain) {
    el.siteName.textContent = "Invalid site";
    el.siteSummary.textContent = "Open this page from HistoryX's right-click menu.";
    el.clearBtn.disabled = true;
    return;
  }

  el.siteName.textContent = domain;
  const selected = selectedUrls().length;
  el.siteSummary.textContent = `${plural(state.urls.length, "URL")} found · ${plural(selected, "URL")} selected${state.urls.length > 200 ? " · showing first 200" : ""}`;
  el.selectAllBtn.textContent = selected === state.urls.length ? "Deselect all" : "Select all";
  el.clearBtn.disabled = state.busy || !selected;
  el.addToList.checked = !state.domains.includes(domain);
  el.addToList.disabled = state.domains.includes(domain);

  el.urlList.replaceChildren();
  for (const url of state.urls.slice(0, 200)) {
    const row = document.createElement("label");
    row.className = "url-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !state.excluded.has(url);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.excluded.delete(url);
      else state.excluded.add(url);
      render();
    });
    const text = document.createElement("span");
    text.className = "url-text";
    text.textContent = url;
    row.append(checkbox, text);
    el.urlList.append(row);
  }
  if (!state.urls.length) {
    el.urlList.innerHTML = '<div class="empty">No history found for this site.</div>';
  }
}

el.selectAllBtn.addEventListener("click", () => {
  state.excluded = selectedUrls().length === state.urls.length ? new Set(state.urls) : new Set();
  render();
});

el.cancelBtn.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.remove(tab.id);
  } catch {
    window.close();
  }
});

el.clearBtn.addEventListener("click", async () => {
  const selected = selectedUrls();
  if (!selected.length || state.busy) return;
  state.busy = true;
  render();
  try {
    const deleted = await cleanAndLog([domain], selected, "Context menu");
    if (el.addToList.checked && !state.domains.includes(domain)) {
      state.domains = [...state.domains, domain].sort();
      await saveDomains(state.domains);
    }
    state.excluded = new Set(selected);
    el.result.textContent = `Cleared ${plural(deleted, "URL")} from ${domain} history.`;
  } catch (error) {
    el.result.textContent = `Failed: ${error.message}`;
  } finally {
    state.busy = false;
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[KEYS.settings]) return;
  state.settings = { ...state.settings, ...changes[KEYS.settings].newValue };
  applyTheme();
});

(async function init() {
  const [settings, domains, cached] = await Promise.all([getSettings(), getDomains(), readCache()]);
  state.settings = settings;
  state.domains = domains;
  applyTheme();
  if (cached.hasCache) {
    state.urls = urlsForDomains(cached.items, domain ? [domain] : []);
    render();
  }
  const synced = await syncCache();
  state.urls = urlsForDomains(synced.items, domain ? [domain] : []);
  render();
})();
