import {
  KEYS,
  getStored,
  setStored,
  getDomains,
  saveDomains,
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

async function getRules() {
  const rules = await getStored(KEYS.rules, []);
  return Array.isArray(rules) ? rules : [];
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

async function alarmName(id) {
  return `${ALARM_PREFIX}${id}`;
}

async function syncAlarms(rules) {
  const existing = await chrome.alarms.getAll();
  for (const alarm of existing) {
    if (alarm.name.startsWith(ALARM_PREFIX)) await chrome.alarms.clear(alarm.name);
  }

  for (const rule of rules) {
    if (!rule.enabled || rule.schedule === "startup") continue;
    const name = await alarmName(rule.id);
    if (rule.schedule === "interval") {
      const minutes = Math.max(1, Math.round((Number(rule.intervalHours) || 6) * 60));
      await chrome.alarms.create(name, { periodInMinutes: minutes });
    } else if (rule.schedule === "daily") {
      const now = new Date();
      const target = new Date(now);
      target.setHours(Number(rule.hour) || 0, Number(rule.minute) || 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const delay = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
      await chrome.alarms.create(name, { delayInMinutes: delay, periodInMinutes: 1440 });
    }
  }
}

async function runRule(rule) {
  if (running || !rule.domains?.length) return;
  running = true;
  try {
    const items = await scanHistory({ startTime: 0 });
    const urls = urlsForDomains(items, rule.domains);
    const deleted = await cleanAndLog(rule.domains, urls, `Rule: ${rule.name}`);
    const rules = await getRules();
    await setStored(KEYS.rules, rules.map(item => item.id === rule.id
      ? { ...item, lastRun: Date.now(), lastDeleted: deleted }
      : item));
    await setNotice(
      deleted
        ? `Rule "${rule.name}" cleared ${plural(deleted, "URL")}.`
        : `Rule "${rule.name}" found no matching history.`,
      deleted ? "success" : "info"
    );
  } catch (error) {
    await setNotice(`Rule "${rule.name}" failed: ${error.message}`, "error");
  } finally {
    running = false;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    [KEYS.domains]: [],
    [KEYS.settings]: {
      confirmBeforeClean: true,
      theme: "dark",
      showActivity: true,
      cacheMaxAgeMs: 30 * 60 * 1000
    },
    [KEYS.activity]: [],
    [KEYS.rules]: []
  });
  await createMenus();
  await syncBadge();
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
    await setNotice(`${domain} added to HistoryX.`, "success");
    return;
  }

  if (info.menuItemId === MENU_CLEAN) {
    const url = `${chrome.runtime.getURL("src/confirm.html")}?domain=${encodeURIComponent(domain)}`;
    await chrome.tabs.create({ url });
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  const rule = (await getRules()).find(item => item.id === id);
  if (rule && rule.enabled) await runRule(rule);
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes[KEYS.domains]) await syncBadge();
  if (changes[KEYS.rules]) await syncAlarms(await getRules());
});

syncBadge();
