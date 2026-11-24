import {
  KEYS,
  getSettings,
  saveSettings,
  getDomains,
  saveDomains,
  getActivity,
  setStored,
  takeNotice,
  normalizeDomain,
  matchesDomain,
  plural,
  compact,
  relativeTime,
  urlsForDomains,
  restoreUrls,
  readCache,
  syncCache,
  cleanAndLog
} from "./core.js";

const el = {
  addForm: document.getElementById("addForm"),
  domainInput: document.getElementById("domainInput"),
  clearInputBtn: document.getElementById("clearInputBtn"),
  inputError: document.getElementById("inputError"),
  currentSiteBtn: document.getElementById("currentSiteBtn"),
  domainList: document.getElementById("domainList"),
  domainTotal: document.getElementById("domainTotal"),
  visitTotal: document.getElementById("visitTotal"),
  lastClean: document.getElementById("lastClean"),
  listCount: document.getElementById("listCount"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  refreshBtn: document.getElementById("refreshBtn"),
  cleanAllBtn: document.getElementById("cleanAllBtn"),
  cleanAllCount: document.getElementById("cleanAllCount"),
  activitySection: document.getElementById("activitySection"),
  activityList: document.getElementById("activityList"),
  clearActivityBtn: document.getElementById("clearActivityBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  settingsClose: document.getElementById("settingsClose"),
  confirmToggle: document.getElementById("confirmToggle"),
  activityToggle: document.getElementById("activityToggle"),
  cacheInfo: document.getElementById("cacheInfo"),
  cacheAgeSelect: document.getElementById("cacheAgeSelect"),
  resyncBtn: document.getElementById("resyncBtn"),
  rulesBtn: document.getElementById("rulesBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  confirmOverlay: document.getElementById("confirmOverlay"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmDetails: document.getElementById("confirmDetails"),
  confirmCancel: document.getElementById("confirmCancel"),
  confirmAccept: document.getElementById("confirmAccept"),
  toastRegion: document.getElementById("toastRegion")
};

const state = {
  domains: [],
  history: [],
  matches: new Map(),
  settings: {},
  activity: [],
  cacheMeta: null,
  filter: "",
  sort: "name",
  pendingClean: null,
  busy: false,
  lastFocused: null
};

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function monogramColor(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const light = document.documentElement.dataset.theme === "light";
  return `background:hsl(${hue} 70% ${light ? "92%" : "24%"});color:hsl(${hue} 78% ${light ? "34%" : "78%"});`;
}

async function loadState() {
  const [settings, domains, activity] = await Promise.all([getSettings(), getDomains(), getActivity()]);
  state.settings = settings;
  state.domains = domains;
  state.activity = activity;
  applyTheme();
}

async function loadHistory({ force = false } = {}) {
  const result = await syncCache({ force });
  state.history = result.items;
  state.cacheMeta = result.meta;
  return result;
}

function buildMatches() {
  state.matches = new Map(state.domains.map(domain => [domain, []]));
  for (const item of state.history) {
    if (!item.url) continue;
    for (const domain of state.domains) {
      if (matchesDomain(item.url, domain)) state.matches.get(domain).push(item);
    }
  }
}

function statsFor(domain) {
  const items = state.matches.get(domain) || [];
  return {
    urls: items.length,
    visits: items.reduce((sum, item) => sum + (item.visitCount || 1), 0)
  };
}

function totalMatching() {
  const seen = new Set();
  let urls = 0;
  let visits = 0;
  for (const item of state.history) {
    if (!item.url || seen.has(item.url)) continue;
    if (state.domains.some(domain => matchesDomain(item.url, domain))) {
      seen.add(item.url);
      urls++;
      visits += item.visitCount || 1;
    }
  }
  return { urls, visits };
}

function urlsFor(domains) {
  return urlsForDomains(state.history, domains);
}

function visitsForUrls(urls) {
  const set = new Set(urls);
  return state.history.reduce((sum, item) => sum + (set.has(item.url) ? (item.visitCount || 1) : 0), 0);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === "light" ? "light" : "dark";
  document.querySelectorAll(".segmented button").forEach(button => {
    button.classList.toggle("active", button.dataset.theme === document.documentElement.dataset.theme);
  });
}

function renderCacheInfo() {
  el.cacheInfo.textContent = state.cacheMeta
    ? `${plural(state.history.length, "URL")} cached · synced ${relativeTime(state.cacheMeta.at)} · full scan ${relativeTime(state.cacheMeta.fullAt)}`
    : "No cache yet — run a full resync.";
  el.cacheAgeSelect.value = String(state.settings.cacheMaxAgeMs || 1800000);
}

function renderSettings() {
  el.confirmToggle.checked = state.settings.confirmBeforeClean !== false;
  el.activityToggle.checked = state.settings.showActivity !== false;
  applyTheme();
  renderCacheInfo();
}

function renderActivity() {
  el.activityList.replaceChildren();
  el.activitySection.hidden = !state.settings.showActivity || state.activity.length === 0;
  if (!state.settings.showActivity) return;

  for (const entry of state.activity.slice(0, 4)) {
    const row = document.createElement("div");
    row.className = "activity-row";

    const main = document.createElement("div");
    main.className = "activity-main";
    const title = document.createElement("div");
    title.className = "activity-title";
    title.textContent = entry.domains.length > 1
      ? `${plural(entry.domains.length, "domain")} cleaned`
      : (entry.domains[0] || "History cleaned");
    const meta = document.createElement("div");
    meta.className = "activity-meta";
    meta.textContent = `${plural(entry.count || entry.urls.length || 0, "URL")} · ${relativeTime(entry.at)}${entry.source !== "Manual" ? ` · ${entry.source}` : ""}`;
    main.append(title, meta);

    const restore = document.createElement("button");
    restore.className = "activity-restore";
    restore.type = "button";
    restore.textContent = "Restore";
    restore.disabled = state.busy || !entry.urls.length;
    restore.title = entry.count > ACTIVITY_LIMIT ? `Re-adds up to ${ACTIVITY_LIMIT} URLs` : "Re-add these URLs to history";
    restore.addEventListener("click", () => restoreEntry(entry.id));

    row.append(main, restore);
    el.activityList.append(row);
  }
}

const ACTIVITY_LIMIT = 500;

function renderList() {
  el.domainList.replaceChildren();
  const query = state.filter.trim().toLowerCase();
  let domains = state.domains.filter(domain => !query || domain.includes(query));

  if (state.sort === "visits") {
    domains = domains.slice().sort((a, b) => statsFor(b).visits - statsFor(a).visits || a.localeCompare(b));
  } else if (state.sort === "recent") {
    domains = domains.slice().reverse();
  }

  if (!domains.length) {
    el.domainList.innerHTML = state.domains.length
      ? `${icon("search")}<strong>No matching domains</strong><span>Try a different filter.</span>`
      : `${icon("spark")}<strong>No domains yet</strong><span>Add one above, use your current site, or right-click any page.</span>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const domain of domains) {
    const stats = statsFor(domain);
    const card = document.createElement("div");
    card.className = "domain-card";

    const monogram = document.createElement("span");
    monogram.className = "monogram";
    monogram.style.cssText = monogramColor(domain);
    monogram.textContent = domain.charAt(0).toUpperCase();

    const info = document.createElement("div");
    info.className = "domain-info";
    const name = document.createElement("div");
    name.className = "domain-name";
    name.textContent = domain;
    name.title = domain;
    const meta = document.createElement("div");
    meta.className = "domain-meta";
    meta.textContent = `${plural(stats.urls, "URL")} · ${plural(stats.visits, "visit")}`;
    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "domain-actions";

    const pill = document.createElement("span");
    pill.className = "visit-pill";
    pill.textContent = compact(stats.visits);
    pill.title = `${stats.visits} visits across ${stats.urls} URLs`;

    const clean = document.createElement("button");
    clean.className = "mini-btn clean";
    clean.type = "button";
    clean.disabled = state.busy || stats.urls === 0;
    clean.title = `Clear all history for ${domain}`;
    clean.innerHTML = icon("trash");
    clean.append(document.createTextNode("Clear"));
    clean.addEventListener("click", () => requestClean([domain]));

    const remove = document.createElement("button");
    remove.className = "mini-btn icon-only";
    remove.type = "button";
    remove.title = `Remove ${domain} from your list`;
    remove.setAttribute("aria-label", `Remove ${domain} from your list`);
    remove.innerHTML = icon("close");
    remove.addEventListener("click", () => removeDomain(domain));

    actions.append(pill, clean, remove);
    card.append(monogram, info, actions);
    fragment.append(card);
  }
  el.domainList.append(fragment);
}

function render() {
  buildMatches();
  const totals = totalMatching();
  el.domainTotal.textContent = state.domains.length;
  el.visitTotal.textContent = compact(totals.visits);
  el.listCount.textContent = state.domains.length;
  el.cleanAllCount.textContent = compact(totals.urls);
  el.cleanAllBtn.disabled = state.busy || !state.domains.length || !totals.urls;
  el.lastClean.textContent = state.activity.length ? relativeTime(state.activity[0].at) : "—";
  renderList();
  renderActivity();
  renderSettings();
}

function toast(message, type = "info") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = icon(type === "error" ? "close" : type === "warn" ? "shield" : "spark");
  const text = document.createElement("span");
  text.textContent = message;
  node.append(text);
  el.toastRegion.append(node);
  while (el.toastRegion.children.length > 3) el.toastRegion.firstElementChild.remove();
  setTimeout(() => node.remove(), 3600);
}

function showInputError(message) {
  el.inputError.textContent = message;
  el.domainInput.classList.add("invalid");
}

function clearInputError() {
  el.inputError.textContent = "";
  el.domainInput.classList.remove("invalid");
}

function updateClearButton() {
  el.clearInputBtn.hidden = !el.domainInput.value;
}

function openOverlay(overlay, focusTarget) {
  state.lastFocused = document.activeElement;
  overlay.hidden = false;
  (focusTarget || overlay.querySelector("button"))?.focus();
}

function closeOverlay(overlay) {
  overlay.hidden = true;
  if (state.lastFocused?.isConnected) state.lastFocused.focus();
}

function openConfirm(domains, urls, visits) {
  el.confirmTitle.textContent = domains.length > 1
    ? `Clean ${plural(domains.length, "domain")}?`
    : `Clear history for ${domains[0]}?`;
  el.confirmMessage.textContent = `Permanently delete ${plural(urls.length, "URL")} (${plural(visits, "visit")}) from Chrome history? A partial restore is available in Recent cleanups.`;
  el.confirmDetails.replaceChildren();

  for (const domain of domains.slice(0, 8)) {
    const chip = document.createElement("span");
    chip.className = "detail-chip";
    chip.textContent = domain;
    el.confirmDetails.append(chip);
  }
  if (domains.length > 8) {
    const chip = document.createElement("span");
    chip.className = "detail-chip";
    chip.textContent = `+${domains.length - 8} more`;
    el.confirmDetails.append(chip);
  }
  for (const url of urls.slice(0, 8)) {
    const chip = document.createElement("span");
    chip.className = "detail-chip url";
    chip.textContent = url.length > 54 ? `${url.slice(0, 51)}…` : url;
    chip.title = url;
    el.confirmDetails.append(chip);
  }
  if (urls.length > 8) {
    const chip = document.createElement("span");
    chip.className = "detail-chip url";
    chip.textContent = `+${urls.length - 8} more URLs`;
    el.confirmDetails.append(chip);
  }
  openOverlay(el.confirmOverlay, el.confirmAccept);
}

function requestClean(domains) {
  if (state.busy) return;
  const selected = domains[0] === "*" ? state.domains.slice() : domains;
  const urls = urlsFor(selected);
  if (!urls.length) {
    toast("No matching history found.", "warn");
    return;
  }
  state.pendingClean = { domains: selected, urls };
  if (state.settings.confirmBeforeClean) {
    openConfirm(selected, urls, visitsForUrls(urls));
  } else {
    performClean();
  }
}

async function performClean() {
  const pending = state.pendingClean;
  if (!pending) return;
  closeOverlay(el.confirmOverlay);
  state.busy = true;
  el.refreshBtn.disabled = true;
  el.refreshBtn.classList.add("spin");
  render();

  try {
    const deleted = await cleanAndLog(pending.domains, pending.urls, "Manual");
    state.activity = await getActivity();
    await loadHistory();
    toast(`Cleared ${plural(deleted, "URL")} from history.`, "success");
  } catch (error) {
    toast(`Cleaning failed: ${error.message}`, "error");
  } finally {
    state.pendingClean = null;
    state.busy = false;
    el.refreshBtn.disabled = false;
    el.refreshBtn.classList.remove("spin");
    render();
  }
}

async function restoreEntry(id) {
  const entry = state.activity.find(item => item.id === id);
  if (!entry || state.busy) return;
  state.busy = true;
  render();
  try {
    const restored = await restoreUrls(entry.urls);
    await loadHistory();
    toast(`Re-added ${plural(restored, "URL")}. Original visit times cannot be restored.`, "warn");
  } catch (error) {
    toast(`Restore failed: ${error.message}`, "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function addDomain(raw) {
  clearInputError();
  try {
    const domain = normalizeDomain(raw);
    if (state.domains.includes(domain)) {
      showInputError("That domain is already in your list.");
      return;
    }
    state.domains.push(domain);
    state.domains.sort();
    await saveDomains(state.domains);
    el.domainInput.value = "";
    updateClearButton();
    await loadHistory();
    render();
    toast(`${domain} added to your list.`, "success");
  } catch (error) {
    showInputError(error.message);
  }
}

async function removeDomain(domain) {
  state.domains = state.domains.filter(item => item !== domain);
  await saveDomains(state.domains);
  render();
  toast(`${domain} removed from your list.`, "info");
}

async function clearActivity() {
  state.activity = [];
  await setStored(KEYS.activity, []);
  render();
  toast("Cleanup log cleared.", "info");
}

async function refresh(force = false) {
  if (state.busy) return;
  state.busy = true;
  el.refreshBtn.disabled = true;
  el.refreshBtn.classList.add("spin");
  try {
    const result = await loadHistory({ force });
    render();
    toast(force
      ? `Full scan complete: ${plural(result.items.length, "URL")} in cache.`
      : "History cache updated.");
  } catch (error) {
    toast(`Refresh failed: ${error.message}`, "error");
  } finally {
    state.busy = false;
    el.refreshBtn.disabled = false;
    el.refreshBtn.classList.remove("spin");
    render();
  }
}

async function currentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      toast("No usable page URL on this tab.", "warn");
      return;
    }
    await addDomain(tab.url);
  } catch (error) {
    toast(`Could not read the current tab: ${error.message}`, "error");
  }
}

function exportDomains() {
  const payload = JSON.stringify({ app: "HistoryX", version: 3, managedDomains: state.domains }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `historyx-domains-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Domain list exported.", "success");
}

async function importDomains(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const list = Array.isArray(parsed) ? parsed : parsed.managedDomains;
    if (!Array.isArray(list)) throw new Error("File does not contain a domain list.");

    const imported = [];
    for (const item of list) {
      try { imported.push(normalizeDomain(item)); } catch {}
    }
    if (!imported.length) throw new Error("No valid domains found.");

    state.domains = [...new Set([...state.domains, ...imported])].sort();
    await saveDomains(state.domains);
    await loadHistory();
    render();
    toast(`Imported ${plural(imported.length, "domain")}.`, "success");
  } catch (error) {
    toast(`Import failed: ${error.message}`, "error");
  }
}

el.addForm.addEventListener("submit", event => {
  event.preventDefault();
  addDomain(el.domainInput.value);
});
el.domainInput.addEventListener("input", () => {
  updateClearButton();
  clearInputError();
});
el.clearInputBtn.addEventListener("click", () => {
  el.domainInput.value = "";
  updateClearButton();
  clearInputError();
  el.domainInput.focus();
});
el.currentSiteBtn.addEventListener("click", currentSite);
el.refreshBtn.addEventListener("click", () => refresh(false));
el.cleanAllBtn.addEventListener("click", () => requestClean(["*"]));
el.searchInput.addEventListener("input", () => {
  state.filter = el.searchInput.value;
  render();
});
el.sortSelect.addEventListener("change", () => {
  state.sort = el.sortSelect.value;
  render();
});
el.clearActivityBtn.addEventListener("click", clearActivity);

el.confirmCancel.addEventListener("click", () => {
  closeOverlay(el.confirmOverlay);
  state.pendingClean = null;
});
el.confirmAccept.addEventListener("click", performClean);
el.confirmOverlay.addEventListener("click", event => {
  if (event.target === el.confirmOverlay) {
    closeOverlay(el.confirmOverlay);
    state.pendingClean = null;
  }
});

el.settingsBtn.addEventListener("click", () => {
  renderSettings();
  openOverlay(el.settingsOverlay);
});
el.settingsClose.addEventListener("click", () => closeOverlay(el.settingsOverlay));
el.settingsOverlay.addEventListener("click", event => {
  if (event.target === el.settingsOverlay) closeOverlay(el.settingsOverlay);
});
el.confirmToggle.addEventListener("change", async () => {
  state.settings.confirmBeforeClean = el.confirmToggle.checked;
  await saveSettings(state.settings);
  toast(el.confirmToggle.checked ? "Confirmation enabled." : "Confirmation disabled.");
});
el.activityToggle.addEventListener("change", async () => {
  state.settings.showActivity = el.activityToggle.checked;
  await saveSettings(state.settings);
  render();
});
el.cacheAgeSelect.addEventListener("change", async () => {
  state.settings.cacheMaxAgeMs = Number(el.cacheAgeSelect.value);
  await saveSettings(state.settings);
  renderCacheInfo();
  toast("Cache refresh interval saved.");
});
el.resyncBtn.addEventListener("click", () => refresh(true));
el.rulesBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelectorAll(".segmented button").forEach(button => {
  button.addEventListener("click", async () => {
    state.settings.theme = button.dataset.theme;
    applyTheme();
    await saveSettings(state.settings);
    render();
  });
});
el.exportBtn.addEventListener("click", exportDomains);
el.importBtn.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", () => {
  const file = el.importFile.files?.[0];
  if (file) importDomains(file);
  el.importFile.value = "";
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!el.confirmOverlay.hidden) {
      closeOverlay(el.confirmOverlay);
      state.pendingClean = null;
    } else if (!el.settingsOverlay.hidden) {
      closeOverlay(el.settingsOverlay);
    }
    return;
  }
  const tag = document.activeElement?.tagName || "";
  if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(tag)) {
    event.preventDefault();
    el.searchInput.focus();
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes[KEYS.domains]) {
    state.domains = await getDomains();
    render();
  }
  if (changes[KEYS.activity]) {
    state.activity = await getActivity();
    render();
  }
});

(async function init() {
  try {
    el.domainList.innerHTML = `${icon("refresh")}<strong>Loading history…</strong><span>Reading the local cache.</span>`;
    await loadState();
    const cached = await readCache();
    if (cached.hasCache) {
      state.history = cached.items;
      state.cacheMeta = cached.meta;
      render();
    }
    await loadHistory();
    render();
    const notice = await takeNotice();
    if (notice) toast(notice.text, notice.type);
  } catch (error) {
    toast(`Could not start HistoryX: ${error.message}`, "error");
  }
})();
