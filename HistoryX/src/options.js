import {
  KEYS,
  getStored,
  setStored,
  getSettings,
  saveSettings,
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
  ruleName: document.getElementById("ruleName"),
  ruleSchedule: document.getElementById("ruleSchedule"),
  ruleInterval: document.getElementById("ruleInterval"),
  ruleHour: document.getElementById("ruleHour"),
  ruleMinute: document.getElementById("ruleMinute"),
  ruleDomains: document.getElementById("ruleDomains"),
  ruleEnabled: document.getElementById("ruleEnabled"),
  intervalField: document.getElementById("intervalField"),
  dailyField: document.getElementById("dailyField"),
  saveRuleBtn: document.getElementById("saveRuleBtn"),
  cancelRuleBtn: document.getElementById("cancelRuleBtn"),
  cacheItems: document.getElementById("cacheItems"),
  cacheSynced: document.getElementById("cacheSynced"),
  cacheFull: document.getElementById("cacheFull"),
  cacheStatus: document.getElementById("cacheStatus"),
  cacheAgeSelect: document.getElementById("cacheAgeSelect"),
  fullResyncBtn: document.getElementById("fullResyncBtn")
};

const state = { rules: [], settings: {}, editingId: null };

function scheduleLabel(rule) {
  if (rule.schedule === "startup") return "On browser startup";
  if (rule.schedule === "daily") return `Daily at ${String(rule.hour).padStart(2, "0")}:${String(rule.minute).padStart(2, "0")}`;
  return `Every ${plural(Number(rule.intervalHours) || 6, "hour")}`;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === "light" ? "light" : "dark";
  document.querySelectorAll("[data-theme]").forEach(button => {
    button.classList.toggle("primary", button.dataset.theme === document.documentElement.dataset.theme);
  });
}

function renderRules() {
  el.ruleList.replaceChildren();
  if (!state.rules.length) {
    el.ruleList.innerHTML = '<div class="empty">No rules yet. Create one to clean selected domains automatically.</div>';
    return;
  }

  for (const rule of state.rules) {
    const row = document.createElement("div");
    row.className = `rule${rule.enabled ? "" : " off"}`;

    const head = document.createElement("div");
    head.className = "rule-head";
    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "rule-title";
    title.innerHTML = `<span class="status-dot${rule.enabled ? "" : " off"}"></span>`;
    title.append(document.createTextNode(rule.name));
    const meta = document.createElement("div");
    meta.className = "rule-meta";
    const last = rule.lastRun ? relativeTime(rule.lastRun) : "never run";
    meta.textContent = `${scheduleLabel(rule)} · last: ${last}${rule.lastDeleted ? ` · ${plural(rule.lastDeleted, "URL")} removed` : ""}`;
    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "rule-actions";
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
    remove.innerHTML = '<svg width="12" height="12" aria-hidden="true"><use href="#i-trash"/></svg>';
    remove.title = "Delete rule";
    remove.addEventListener("click", () => deleteRule(rule.id));

    actions.append(toggle, edit, remove);
    head.append(info, actions);

    const chips = document.createElement("div");
    chips.className = "chips";
    for (const domain of rule.domains.slice(0, 12)) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = domain;
      chips.append(chip);
    }
    if (rule.domains.length > 12) {
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
  el.cacheItems.textContent = meta ? plural(meta.count || 0, "URL") : "—";
  el.cacheSynced.textContent = meta ? relativeTime(meta.at) : "never";
  el.cacheFull.textContent = meta ? relativeTime(meta.fullAt) : "never";
  el.cacheStatus.textContent = updating ? "Scanning history in pages…" : "Cached results are used until the refresh interval expires.";
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
  el.ruleName.value = "";
  el.ruleSchedule.value = "startup";
  el.ruleInterval.value = "6";
  el.ruleHour.value = "3";
  el.ruleMinute.value = "0";
  el.ruleDomains.value = "";
  el.ruleEnabled.checked = true;
  el.saveRuleBtn.textContent = "Save rule";
  updateScheduleFields();
}

function editRule(id) {
  const rule = state.rules.find(item => item.id === id);
  if (!rule) return;
  state.editingId = id;
  el.ruleName.value = rule.name;
  el.ruleSchedule.value = rule.schedule || "startup";
  el.ruleInterval.value = rule.intervalHours || 6;
  el.ruleHour.value = rule.hour ?? 3;
  el.ruleMinute.value = rule.minute ?? 0;
  el.ruleDomains.value = rule.domains.join("\n");
  el.ruleEnabled.checked = rule.enabled !== false;
  el.saveRuleBtn.textContent = "Save changes";
  updateScheduleFields();
  showForm(true);
  el.ruleForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function parseDomains(raw) {
  const domains = new Set();
  for (const part of raw.split(/[\n,;]+/)) {
    const value = part.trim();
    if (!value) continue;
    try { domains.add(normalizeDomain(value)); } catch {}
  }
  return [...domains];
}

async function persist(rules) {
  state.rules = rules;
  await setStored(KEYS.rules, rules);
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

el.ruleForm.addEventListener("submit", async event => {
  event.preventDefault();
  const domains = parseDomains(el.ruleDomains.value);
  if (!domains.length) {
    el.cacheStatus.textContent = "Add at least one valid domain to the rule.";
    return;
  }
  const values = {
    name: el.ruleName.value.trim() || "Unnamed rule",
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
});

el.cacheAgeSelect.addEventListener("change", async () => {
  state.settings.cacheMaxAgeMs = Number(el.cacheAgeSelect.value);
  await saveSettings(state.settings);
});

el.fullResyncBtn.addEventListener("click", async () => {
  el.fullResyncBtn.disabled = true;
  renderCache(state.cacheMetaFromStorage, true);
  try {
    const result = await syncCache({ force: true });
    state.cacheMetaFromStorage = result.meta;
    renderCache(result.meta);
  } finally {
    el.fullResyncBtn.disabled = false;
  }
});

document.querySelectorAll("[data-theme]").forEach(button => {
  button.addEventListener("click", async () => {
    state.settings.theme = button.dataset.theme;
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
    el.cacheAgeSelect.value = String(state.settings.cacheMaxAgeMs || 1800000);
    applyTheme();
  }
});

(async function init() {
  const [rules, settings, cache] = await Promise.all([
    getStored(KEYS.rules, []),
    getSettings(),
    readCache()
  ]);
  state.rules = Array.isArray(rules) ? rules : [];
  state.settings = settings;
  state.cacheMetaFromStorage = cache.meta;
  el.cacheAgeSelect.value = String(settings.cacheMaxAgeMs || 1800000);
  resetForm();
  applyTheme();
  renderRules();
  renderCache(cache.meta);
})();
