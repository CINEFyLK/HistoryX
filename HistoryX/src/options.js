import {
  KEYS,
  getSettings,
  saveSettings,
  getRules,
  saveRules,
  normalizeDomain,
  relativeTime,
  plural,
  readCache,
  syncCache
} from "./core.js";

const el = {
  ruleList: document.getElementById("ruleList"),
  newRuleBtn: document.getElementById("newRuleBtn"),
  ruleForm: document.getElementById("ruleForm"),
  formTitle: document.getElementById("formTitle"),
  ruleName: document.getElementById("ruleName"),
  ruleSchedule: document.getElementById("ruleSchedule"),
  ruleInterval: document.getElementById("ruleInterval"),
  ruleHour: document.getElementById("ruleHour"),
  ruleMinute: document.getElementById("ruleMinute"),
  ruleDomains: document.getElementById("ruleDomains"),
  ruleEnabled: document.getElementById("ruleEnabled"),
  intervalField: document.getElementById("intervalField"),
  dailyField: document.getElementById("dailyField"),
  ruleError: document.getElementById("ruleError"),
  saveRuleBtn: document.getElementById("saveRuleBtn"),
  cancelRuleBtn: document.getElementById("cancelRuleBtn"),
  cacheItems: document.getElementById("cacheItems"),
  cacheSynced: document.getElementById("cacheSynced"),
  cacheFull: document.getElementById("cacheFull"),
  cacheStatus: document.getElementById("cacheStatus"),
  cacheAgeSelect: document.getElementById("cacheAgeSelect"),
  fullResyncBtn: document.getElementById("fullResyncBtn"),
  versionLabel: document.getElementById("versionLabel")
};

const state = { rules: [], settings: {}, editingId: null, runningIds: new Set(), cacheMeta: null };

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function scheduleLabel(rule) {
  if (rule.schedule === "startup") return "On browser startup";
  if (rule.schedule === "daily") {
    const hour = String(Math.min(23, Math.max(0, Number(rule.hour) || 0))).padStart(2, "0");
    const minute = String(Math.min(59, Math.max(0, Number(rule.minute) || 0))).padStart(2, "0");
    return `Daily at ${hour}:${minute}`;
  }
  return `Every ${plural(Number(rule.intervalHours) || 6, "hour")}`;
}

function applyTheme() {
  const theme = state.settings.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("button[data-theme]").forEach(button => {
    button.classList.toggle("primary", button.dataset.theme === theme);
  });
}

function showFormError(message) {
  el.ruleError.textContent = message;
  el.ruleError.hidden = !message;
}

function renderRules() {
  el.ruleList.replaceChildren();
  if (!state.rules.length) {
    el.ruleList.innerHTML = `<div class="empty">${icon("spark")}<span>No rules yet. Create one to clean selected domains automatically.</span></div>`;
    return;
  }

  for (const rule of state.rules) {
    const running = state.runningIds.has(rule.id);
    const row = document.createElement("div");
    row.className = `rule${rule.enabled ? "" : " off"}`;

    const head = document.createElement("div");
    head.className = "rule-head";
    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "rule-title";
    title.innerHTML = `<span class="status-dot${rule.enabled ? "" : " off"}"></span>`;
    title.append(document.createTextNode(rule.name || "Unnamed rule"));
    const meta = document.createElement("div");
    meta.className = "rule-meta";
    const last = rule.lastRun ? relativeTime(rule.lastRun) : "never run";
    meta.textContent = `${scheduleLabel(rule)} · last: ${last}${rule.lastDeleted ? ` · ${plural(rule.lastDeleted, "URL")} removed` : ""}`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const run = document.createElement("button");
    run.className = `btn small${running ? " spin" : ""}`;
    run.type = "button";
    run.innerHTML = icon("play");
    run.title = "Run this rule now";
    run.setAttribute("aria-label", `Run ${rule.name} now`);
    run.disabled = running;
    run.addEventListener("click", () => runRuleNow(rule.id));

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    toggle.title = rule.enabled ? "Disable rule" : "Enable rule";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = rule.enabled;
    checkbox.addEventListener("change", () => updateRule(rule.id, { enabled: checkbox.checked }));
    const track = document.createElement("span");
    track.className = "toggle-track";
    toggle.append(checkbox, track);

    const edit = document.createElement("button");
    edit.className = "btn small";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editRule(rule.id));

    const remove = document.createElement("button");
    remove.className = "btn small danger";
    remove.type = "button";
    remove.innerHTML = icon("trash");
    remove.title = "Delete rule";
    remove.setAttribute("aria-label", `Delete ${rule.name}`);
    remove.addEventListener("click", () => deleteRule(rule.id));

    actions.append(run, toggle, edit, remove);
    head.append(info, actions);

    const chips = document.createElement("div");
    chips.className = "chips";
    for (const domain of (rule.domains || []).slice(0, 12)) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = domain;
      chips.append(chip);
    }
    if ((rule.domains?.length || 0) > 12) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `+${rule.domains.length - 12} more`;
      chips.append(chip);
    }

    row.append(head, chips);
    el.ruleList.append(row);
  }
}

function renderCache(meta, updating = false) {
  state.cacheMeta = meta || state.cacheMeta;
  el.cacheItems.textContent = meta ? plural(meta.count || 0, "URL") : "—";
  el.cacheSynced.textContent = meta ? relativeTime(meta.at) : "never";
  el.cacheFull.textContent = meta ? relativeTime(meta.fullAt) : "never";
  if (updating) el.cacheStatus.textContent = "Scanning history in pages…";
}

function updateScheduleFields() {
  el.intervalField.hidden = el.ruleSchedule.value !== "interval";
  el.dailyField.hidden = el.ruleSchedule.value !== "daily";
}

function showForm(show) {
  el.ruleForm.hidden = !show;
  if (show) el.ruleName.focus();
}

function resetForm() {
  state.editingId = null;
  el.formTitle.textContent = "New rule";
  el.ruleName.value = "";
  el.ruleSchedule.value = "startup";
  el.ruleInterval.value = "6";
  el.ruleHour.value = "3";
  el.ruleMinute.value = "0";
  el.ruleDomains.value = "";
  el.ruleEnabled.checked = true;
  el.saveRuleBtn.textContent = "Save rule";
  showFormError("");
  updateScheduleFields();
}

function editRule(id) {
  const rule = state.rules.find(item => item.id === id);
  if (!rule) return;
  state.editingId = id;
  el.formTitle.textContent = "Edit rule";
  el.ruleName.value = rule.name || "";
  el.ruleSchedule.value = rule.schedule || "startup";
  el.ruleInterval.value = rule.intervalHours || 6;
  el.ruleHour.value = rule.hour ?? 3;
  el.ruleMinute.value = rule.minute ?? 0;
  el.ruleDomains.value = (rule.domains || []).join("\n");
  el.ruleEnabled.checked = rule.enabled !== false;
  el.saveRuleBtn.textContent = "Save changes";
  showFormError("");
  updateScheduleFields();
  showForm(true);
  el.ruleForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function parseDomains(raw) {
  const domains = new Set();
  let invalid = 0;
  for (const part of raw.split(/[\n,;]+/)) {
    const value = part.trim();
    if (!value) continue;
    try { domains.add(normalizeDomain(value)); } catch { invalid++; }
  }
  return { domains: [...domains], invalid };
}

async function persist(rules) {
  state.rules = rules;
  await saveRules(state.rules);
  renderRules();
}

async function updateRule(id, changes) {
  await persist(state.rules.map(rule => rule.id === id ? { ...rule, ...changes } : rule));
}

async function deleteRule(id) {
  await persist(state.rules.filter(rule => rule.id !== id));
  if (state.editingId === id) {
    resetForm();
    showForm(false);
  }
}

async function runRuleNow(id) {
  const rule = state.rules.find(item => item.id === id);
  if (!rule || state.runningIds.has(id)) return;
  state.runningIds.add(id);
  el.cacheStatus.textContent = `Running "${rule.name || "rule"}"…`;
  renderRules();
  try {
    const response = await chrome.runtime.sendMessage({ type: "hx:runRule", id });
    if (!response?.ok) throw new Error(response?.error || "Could not run the rule.");
    el.cacheStatus.textContent = response.deleted
      ? `Rule cleared ${plural(response.deleted, "URL")}.`
      : "Rule found no matching history.";
  } catch (error) {
    el.cacheStatus.textContent = `Run failed: ${error.message}`;
  } finally {
    state.runningIds.delete(id);
    renderRules();
  }
}

el.newRuleBtn.addEventListener("click", () => {
  resetForm();
  showForm(true);
  el.ruleForm.scrollIntoView({ behavior: "smooth", block: "center" });
});
el.cancelRuleBtn.addEventListener("click", () => {
  resetForm();
  showForm(false);
});
el.ruleSchedule.addEventListener("change", updateScheduleFields);
el.ruleForm.addEventListener("input", () => showFormError(""));

el.ruleForm.addEventListener("submit", async event => {
  event.preventDefault();
  const name = el.ruleName.value.trim();
  if (!name) {
    showFormError("Give the rule a name so you can recognise it later.");
    el.ruleName.focus();
    return;
  }
  const { domains, invalid } = parseDomains(el.ruleDomains.value);
  if (!domains.length) {
    showFormError("Add at least one valid domain, such as youtube.com.");
    el.ruleDomains.focus();
    return;
  }

  const values = {
    name,
    domains,
    schedule: el.ruleSchedule.value,
    intervalHours: Math.max(1, Number(el.ruleInterval.value) || 6),
    hour: Math.min(23, Math.max(0, Number(el.ruleHour.value) || 0)),
    minute: Math.min(59, Math.max(0, Number(el.ruleMinute.value) || 0)),
    enabled: el.ruleEnabled.checked
  };

  if (state.editingId) {
    await updateRule(state.editingId, values);
  } else {
    await persist([...state.rules, {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      lastRun: null,
      lastDeleted: 0,
      ...values
    }]);
  }
  resetForm();
  showForm(false);
  el.cacheStatus.textContent = invalid
    ? `Rule saved. ${plural(invalid, "invalid entry")} skipped.`
    : "Rule saved.";
});

el.cacheAgeSelect.addEventListener("change", async () => {
  state.settings.cacheMaxAgeMs = Number(el.cacheAgeSelect.value);
  await saveSettings(state.settings);
  el.cacheStatus.textContent = "Cache refresh interval saved.";
});

el.fullResyncBtn.addEventListener("click", async () => {
  el.fullResyncBtn.disabled = true;
  renderCache(state.cacheMeta, true);
  try {
    const result = await syncCache({ force: true });
    renderCache(result.meta);
    el.cacheStatus.textContent = "Full scan complete.";
  } catch (error) {
    el.cacheStatus.textContent = `Full scan failed: ${error.message}`;
  } finally {
    el.fullResyncBtn.disabled = false;
  }
});

document.querySelectorAll("button[data-theme]").forEach(button => {
  button.addEventListener("click", async () => {
    state.settings.theme = button.dataset.theme === "light" ? "light" : "dark";
    await saveSettings(state.settings);
    applyTheme();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[KEYS.rules]) {
    state.rules = Array.isArray(changes[KEYS.rules].newValue) ? changes[KEYS.rules].newValue : [];
    renderRules();
  }
  if (changes[KEYS.settings]) {
    state.settings = { ...state.settings, ...changes[KEYS.settings].newValue };
    el.cacheAgeSelect.value = String(state.settings.cacheMaxAgeMs ?? 1800000);
    applyTheme();
  }
});

(async function init() {
  el.versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
  const [rules, settings, cache] = await Promise.all([getRules(), getSettings(), readCache()]);
  state.rules = rules;
  state.settings = settings;
  el.cacheAgeSelect.value = String(settings.cacheMaxAgeMs ?? 1800000);
  resetForm();
  applyTheme();
  renderRules();
  renderCache(cache.meta);
  el.cacheStatus.textContent = cache.hasCache
    ? "Cached results are used until the refresh interval expires."
    : "No cache yet — run a full resync to speed up the popup.";
})();
