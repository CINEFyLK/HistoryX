import {
  KEYS,
  getSettings,
  getDomains,
  saveDomains,
  setDomainAdded,
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
  urlFilter: document.getElementById("urlFilter"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  addToList: document.getElementById("addToList"),
  clearBtn: document.getElementById("clearBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  result: document.getElementById("result"),
  versionLabel: document.getElementById("versionLabel")
};

let domain = null;
try {
  domain = normalizeDomain(new URLSearchParams(location.search).get("domain") || "");
} catch {}

const state = {
  urls: [],
  excluded: new Set(),
  domains: [],
  settings: {},
  busy: false,
  loading: true,
  filter: "",
  addToList: false,
  done: false
};

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === "light" ? "light" : "dark";
}

function selectedUrls() {
  return state.urls.filter(url => !state.excluded.has(url));
}

function visibleUrls() {
  const query = state.filter.trim().toLowerCase();
  return query ? state.urls.filter(url => url.toLowerCase().includes(query)) : state.urls;
}

function showResult(message, type = "success") {
  el.result.textContent = message;
  el.result.className = `result-banner ${type}`;
  el.result.hidden = false;
}

function render() {
  if (!domain) {
    el.siteName.textContent = "Invalid site";
    el.siteSummary.textContent = "Open this page from HistoryX's right-click menu.";
    el.clearBtn.disabled = true;
    el.selectAllBtn.disabled = true;
    el.urlFilter.disabled = true;
    el.urlList.innerHTML = '<div class="empty">No valid domain was provided.</div>';
    return;
  }

  el.siteName.textContent = domain;
  const selected = selectedUrls().length;
  const visible = visibleUrls();
  const visibleSelected = visible.filter(url => !state.excluded.has(url)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  el.siteSummary.textContent = `${plural(state.urls.length, "URL")} found · ${plural(selected, "URL")} selected`
    + (state.filter ? ` · ${plural(visible.length, "match")}` : "")
    + (state.urls.length > 200 ? " · showing up to 200" : "");

  el.selectAllBtn.textContent = state.filter
    ? (allVisibleSelected ? "Deselect shown" : "Select shown")
    : (allVisibleSelected ? "Deselect all" : "Select all");
  el.selectAllBtn.disabled = state.done || state.busy || !visible.length;
  el.urlFilter.disabled = state.done || state.busy || !state.urls.length;
  el.refreshBtn.disabled = state.busy || state.done;
  el.addToList.disabled = state.done || state.busy || state.domains.includes(domain);
  el.addToList.checked = state.addToList && !state.domains.includes(domain);

  if (state.done) {
    el.clearBtn.innerHTML = `${icon("check")} Done`;
    el.clearBtn.disabled = state.busy;
  } else {
    el.clearBtn.innerHTML = `${icon("trash")} Clear selected history`;
    el.clearBtn.disabled = state.busy || !selected;
  }

  if (state.loading) {
    el.urlList.innerHTML = '<div class="skeleton"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>';
    return;
  }

  el.urlList.replaceChildren();
  for (const url of visible.slice(0, 200)) {
    const row = document.createElement("label");
    row.className = "url-row";
    row.title = url;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !state.excluded.has(url);
    checkbox.disabled = state.done || state.busy;
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
  if (!visible.length) {
    el.urlList.innerHTML = state.urls.length
      ? '<div class="empty">No URLs match that filter.</div>'
      : '<div class="empty">No history found for this site.</div>';
  }
}

el.selectAllBtn.addEventListener("click", () => {
  const visible = visibleUrls();
  if (!visible.length) return;
  const allSelected = visible.every(url => !state.excluded.has(url));
  for (const url of visible) {
    if (allSelected) state.excluded.add(url);
    else state.excluded.delete(url);
  }
  render();
});

el.urlFilter.addEventListener("input", () => {
  state.filter = el.urlFilter.value;
  render();
});

el.addToList.addEventListener("change", () => {
  state.addToList = el.addToList.checked;
});

async function closeTab() {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.remove(tab.id);
    else window.close();
  } catch {
    window.close();
  }
}

el.cancelBtn.addEventListener("click", closeTab);

async function loadUrls(force = false, silent = false) {
  if (!silent) {
    state.loading = true;
    render();
  }
  try {
    let result = await syncCache({ force });
    let urls = urlsForDomains(result.items, domain ? [domain] : []);
    if (!urls.length && !force && !result.updated) {
      result = await syncCache({ force: true });
      urls = urlsForDomains(result.items, domain ? [domain] : []);
    }
    state.urls = urls;
  } catch (error) {
    showResult(`Could not read history: ${error.message}`, "error");
  } finally {
    state.loading = false;
    render();
  }
}

el.refreshBtn.addEventListener("click", () => loadUrls(true));

el.clearBtn.addEventListener("click", async () => {
  if (state.done) {
    await closeTab();
    return;
  }
  const selected = selectedUrls();
  if (!selected.length || state.busy) return;
  state.busy = true;
  render();
  try {
    const deleted = await cleanAndLog([domain], selected, "Context menu");
    if (state.addToList && !state.domains.includes(domain)) {
      state.domains = [...state.domains, domain].sort();
      await saveDomains(state.domains);
      await setDomainAdded(domain);
    }
    state.excluded = new Set(selected);
    state.done = true;
    showResult(`Cleared ${plural(deleted, "URL")} from ${domain} history.`, "success");
  } catch (error) {
    showResult(`Failed: ${error.message}`, "error");
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
  el.versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
  const [settings, domains, cached] = await Promise.all([getSettings(), getDomains(), readCache()]);
  state.settings = settings;
  state.domains = domains;
  state.addToList = domain ? !domains.includes(domain) : false;
  applyTheme();
  if (cached.hasCache) {
    state.urls = urlsForDomains(cached.items, domain ? [domain] : []);
    state.loading = false;
    render();
  }
  await loadUrls(false, state.urls.length > 0);
})();
