import {
  KEYS,
  DEFAULT_SETTINGS,
  getDomains,
  saveDomains,
  setDomainAdded,
  getRules,
  saveRules,
  normalizeDomain,
  scanHistory,
  urlsForDomains,
  cleanAndLog,
  setNotice,
  plural
} from "./core.js";

const MENU_ADD = "hx-add-site";
const MENU_CLEAN = "hx-clean-site";
const ALARM_PREFIX = "hx-rule-";
let running = false;

async function syncBadge() {
  const domains = await getDomains();
  await chrome.action.setBadgeBackgroundColor({ color: "#7c9cff" });
  await chrome.action.setBadgeText({ text: domains.length ? String(domains.length) : "" });
}

async function createMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ADD,
    title: "Add this site to HistoryX",
    contexts: ["page", "link"]
  });
  chrome.contextMenus.create({
    id: MENU_CLEAN,
    title: "Clear this site's history",
    contexts: ["page", "link"]
  });
}

function alarmName(id) {
  return `${ALARM_PREFIX}${id}`;
}

function nextDailyTime(rule) {
  const now = new Date();
  const target = new Date(now);
  const hour = Math.min(23, Math.max(0, Number(rule.hour) || 0));
  const minute = Math.min(59, Math.max(0, Number(rule.minute) || 0));
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

async function syncAlarms(rules) {
  const existing = await chrome.alarms.getAll();
  const byName = new Map(existing.map(alarm => [alarm.name, alarm]));
  const desired = new Set();

  for (const rule of rules) {
    if (!rule?.id) continue;
    const name = alarmName(rule.id);

    if (!rule.enabled || rule.schedule === "startup") {
      if (byName.has(name)) await chrome.alarms.clear(name);
      continue;
    }

    desired.add(name);
    const current = byName.get(name);

    if (rule.schedule === "interval") {
      const minutes = Math.max(1, Math.round((Number(rule.intervalHours) || 6) * 60));
      if (current && current.periodInMinutes === minutes) continue;
      await chrome.alarms.create(name, { delayInMinutes: minutes, periodInMinutes: minutes });
    } else if (rule.schedule === "daily") {
      const at = nextDailyTime(rule);
      if (current && Math.abs(current.scheduledTime - at) < 2 * 60 * 1000) continue;
      await chrome.alarms.create(name, { at, periodInMinutes: 1440 });
    } else if (current) {
      await chrome.alarms.clear(name);
      desired.delete(name);
    }
  }

  for (const alarm of existing) {
    if (alarm.name.startsWith(ALARM_PREFIX) && !desired.has(alarm.name)) await chrome.alarms.clear(alarm.name);
  }
}

async function runRule(rule, { ignoreEnabled = false } = {}) {
  if (running || !rule?.domains?.length) return null;
  if (!ignoreEnabled && rule.enabled === false) return null;
  running = true;
  try {
    const items = await scanHistory({ startTime: 0 });
    const urls = urlsForDomains(items, rule.domains);
    const deleted = await cleanAndLog(rule.domains, urls, `Rule: ${rule.name}`);
    const rules = await getRules();
    await saveRules(rules.map(item => item.id === rule.id
      ? { ...item, lastRun: Date.now(), lastDeleted: deleted }
      : item));
    await setNotice(
      deleted
        ? `Rule "${rule.name}" cleared ${plural(deleted, "URL")}.`
        : `Rule "${rule.name}" found no matching history.`,
      deleted ? "success" : "info"
    );
    return deleted;
  } catch (error) {
    await setNotice(`Rule "${rule.name}" failed: ${error.message}`, "error");
    return null;
  } finally {
    running = false;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  const defaults = {
    [KEYS.domains]: [],
    [KEYS.domainMeta]: {},
    [KEYS.settings]: { ...DEFAULT_SETTINGS },
    [KEYS.activity]: [],
    [KEYS.rules]: []
  };
  const missing = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (existing[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  await createMenus();
  await syncBadge();
  await syncAlarms(await getRules());
});

chrome.runtime.onStartup.addListener(async () => {
  await syncBadge();
  const rules = await getRules();
  await syncAlarms(rules);
  for (const rule of rules) {
    if (rule.enabled && rule.schedule === "startup") await runRule(rule);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const raw = info.linkUrl || tab?.url;
  let domain;
  try {
    domain = normalizeDomain(raw || "");
  } catch {
    await setNotice("That link is not a website that HistoryX can manage.", "warn");
    return;
  }

  if (info.menuItemId === MENU_ADD) {
    const domains = await getDomains();
    if (domains.includes(domain)) {
      await setNotice(`${domain} is already in your list.`, "info");
      return;
    }
    await saveDomains([...domains, domain].sort());
    await setDomainAdded(domain);
    await setNotice(`${domain} added to HistoryX.`, "success");
    return;
  }

  if (info.menuItemId === MENU_CLEAN) {
    const url = `${chrome.runtime.getURL("src/confirm.html")}?domain=${encodeURIComponent(domain)}`;
    await chrome.tabs.create({ url, active: true });
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  const rule = (await getRules()).find(item => item.id === id);
  if (rule && rule.enabled) await runRule(rule);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "hx:runRule") return false;
  (async () => {
    const rule = (await getRules()).find(item => item.id === message.id);
    if (!rule) {
      sendResponse({ ok: false, error: "Rule no longer exists." });
      return;
    }
    const deleted = await runRule(rule, { ignoreEnabled: true });
    sendResponse({ ok: deleted !== null, deleted: deleted || 0 });
  })();
  return true;
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes[KEYS.domains]) await syncBadge();
  if (changes[KEYS.rules]) await syncAlarms(await getRules());
});

syncBadge();
