export const KEYS = {
  domains: "managedDomains",
  settings: "hxSettings",
  activity: "hxActivity",
  rules: "hxRules",
  notice: "hxNotice"
};

export const DEFAULT_SETTINGS = {
  confirmBeforeClean: true,
  theme: "dark",
  showActivity: true,
  cacheMaxAgeMs: 30 * 60 * 1000
};

export const ACTIVITY_URL_LIMIT = 500;
export const FULL_RESYNC_MS = 24 * 60 * 60 * 1000;

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function compact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function relativeTime(timestamp) {
  const diff = Date.now() - Number(timestamp || 0);
  if (!Number.isFinite(diff) || diff < 0) return "never";
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function normalizeDomain(raw) {
  let value = String(raw).trim().toLowerCase();
  if (!value) throw new Error("Enter a domain first.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;

  let url;
  try { url = new URL(value); } catch { throw new Error("That doesn't look like a valid domain."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites are supported.");
  if (url.username || url.password) throw new Error("Remove credentials from the URL.");

  const host = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".") || host.length > 253 ||
      !host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("Enter a valid domain, such as example.com.");
  }
  return host;
}

export function matchesDomain(urlString, rootDomain) {
  try {
    const host = new URL(urlString).hostname.toLowerCase().replace(/\.$/, "");
    return host === rootDomain || host.endsWith(`.${rootDomain}`);
  } catch {
    return false;
  }
}

export function urlsForDomains(items, domains) {
  const urls = new Set();
  for (const item of items) {
    if (!item.url) continue;
    for (const domain of domains) {
      if (matchesDomain(item.url, domain)) {
        urls.add(item.url);
        break;
      }
    }
  }
  return [...urls];
}

export async function getStored(key, fallback) {
  const result = await chrome.storage.local.get({ [key]: fallback });
  return result[key];
}

export function setStored(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await getStored(KEYS.settings, {})) };
}

export function saveSettings(settings) {
  return setStored(KEYS.settings, settings);
}

export async function getDomains() {
  const stored = await getStored(KEYS.domains, []);
  return [...new Set(Array.isArray(stored) ? stored.filter(value => typeof value === "string") : [])].sort();
}

export function saveDomains(domains) {
  return setStored(KEYS.domains, domains);
}

export async function getActivity() {
  const stored = await getStored(KEYS.activity, []);
  return Array.isArray(stored) ? stored : [];
}

export async function addActivity(entry) {
  const current = await getActivity();
  await setStored(KEYS.activity, [entry, ...current].slice(0, 8));
}

export function setNotice(text, type = "info") {
  return setStored(KEYS.notice, { text, type, at: Date.now() });
}

export async function takeNotice() {
  const notice = await getStored(KEYS.notice, null);
  if (notice) await chrome.storage.local.remove(KEYS.notice);
  return notice;
}

export async function scanHistory({ startTime = 0, endTime = Date.now(), pageSize = 400, maxPages = 2000, onChunk } = {}) {
  const items = [];
  const seen = new Set();
  let cursorEnd = endTime;

  for (let page = 0; page < maxPages; page++) {
    const chunk = await chrome.history.search({ text: "", startTime, endTime: cursorEnd, maxResults: pageSize });
    if (!chunk.length) break;

    let oldest = Infinity;
    for (const item of chunk) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
      const time = Number(item.lastVisitTime || 0);
      if (time && time < oldest) oldest = time;
    }
    if (onChunk) onChunk(chunk.length, items.length, page + 1);
    if (chunk.length < pageSize || !Number.isFinite(oldest)) break;

    const next = oldest - 1;
    if (next >= cursorEnd || next < startTime) break;
    cursorEnd = next;
  }
  return items;
}

export function makeActivityEntry(domains, urls, deleted, source) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    domains: domains.slice(),
    urls: urls.slice(0, ACTIVITY_URL_LIMIT),
    count: urls.length,
    deleted,
    source: source || "Manual",
    at: Date.now()
  };
}

export async function deleteUrls(urls) {
  let deleted = 0;
  for (let i = 0; i < urls.length; i += 25) {
    const results = await Promise.allSettled(urls.slice(i, i + 25).map(url => chrome.history.deleteUrl({ url })));
    deleted += results.filter(result => result.status === "fulfilled").length;
  }
  return deleted;
}

export async function restoreUrls(urls) {
  let restored = 0;
  for (let i = 0; i < urls.length; i += 25) {
    const results = await Promise.allSettled(urls.slice(i, i + 25).map(url => chrome.history.addUrl({ url })));
    restored += results.filter(result => result.status === "fulfilled").length;
  }
  return restored;
}

const DB_NAME = "historyx";
const DB_VERSION = 1;
let dbPromise;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function whenDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function idbClear() {
  const db = await openDb();
  const transaction = db.transaction("history", "readwrite");
  transaction.objectStore("history").clear();
  await whenDone(transaction);
}

export async function idbPut(items) {
  const db = await openDb();
  for (let start = 0; start < items.length; start += 1000) {
    const transaction = db.transaction("history", "readwrite");
    const store = transaction.objectStore("history");
    for (const item of items.slice(start, start + 1000)) store.put(item);
    await whenDone(transaction);
  }
}

export async function idbGetAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("history", "readonly").objectStore("history").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetMeta(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("meta", "readonly").objectStore("meta").get(key);
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
}

export async function idbSetMeta(key, value) {
  const db = await openDb();
  const transaction = db.transaction("meta", "readwrite");
  transaction.objectStore("meta").put({ key, value });
  await whenDone(transaction);
}

export async function idbDeleteUrls(urls) {
  if (!urls.length) return;
  const targets = new Set(urls);
  const db = await openDb();
  const transaction = db.transaction("history", "readwrite");
  const store = transaction.objectStore("history");
  await new Promise((resolve, reject) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return resolve();
      if (targets.has(entry.value.url)) entry.delete();
      entry.continue();
    };
    cursor.onerror = () => reject(cursor.error);
  });
  await whenDone(transaction);
}

export async function readCache() {
  try {
    const [items, meta] = await Promise.all([idbGetAll(), idbGetMeta("sync")]);
    return { items, meta, hasCache: !!meta };
  } catch {
    return { items: [], meta: null, hasCache: false };
  }
}

export async function syncCache({ force = false } = {}) {
  const settings = await getSettings();
  let meta = null;
  try { meta = await idbGetMeta("sync"); } catch {}

  const now = Date.now();
  const isFull = force || !meta || now - (meta.fullAt || 0) > FULL_RESYNC_MS;
  if (!isFull && meta && now - (meta.at || 0) < (settings.cacheMaxAgeMs || 1800000)) {
    try {
      return { items: await idbGetAll(), meta, updated: false };
    } catch {}
  }

  const startTime = isFull ? 0 : Math.max(0, (meta?.at || 0) - 5 * 60 * 1000);
  const scanned = await scanHistory({ startTime });
  let items = scanned;

  try {
    if (isFull) await idbClear();
    await idbPut(scanned);
    items = await idbGetAll();
    meta = {
      at: now,
      fullAt: isFull ? now : (meta?.fullAt || 0),
      count: items.length
    };
    await idbSetMeta("sync", meta);
  } catch {}

  return { items, meta, updated: true };
}

export async function updateCacheAfterDeletion(urls) {
  if (!urls.length) return;
  try {
    await idbDeleteUrls(urls);
    const meta = await idbGetMeta("sync");
    if (meta) await idbSetMeta("sync", { ...meta, count: Math.max(0, (meta.count || 0) - urls.length) });
  } catch {}
}

export async function cleanAndLog(domains, urls, source = "Manual") {
  const deleted = await deleteUrls(urls);
  await addActivity(makeActivityEntry(domains, urls, deleted, source));
  await updateCacheAfterDeletion(urls);
  return deleted;
}
