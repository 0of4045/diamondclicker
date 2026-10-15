const STORAGE_KEY = "minecraft-diamond-clicker-save-v1";
const DEFAULT_STATUS_MESSAGE = "Ready to mine";
const DEFAULT_SAVE_MESSAGE = "Auto-saving locally";
const exactNumberFormatter = new Intl.NumberFormat("en-US");

const upgradeCatalog = [
  {
    id: "clickPower",
    name: "Iron Pickaxe",
    description: "Mine one more diamond every time you click.",
    baseCost: 15,
    costScale: 1.18,
    effectText: "+1 / click",
  },
  {
    id: "autoClicker",
    name: "Redstone Miner",
    description: "Adds an automatic diamond miner every second.",
    baseCost: 45,
    costScale: 1.24,
    effectText: "+1 auto / sec",
  },
  {
    id: "multiplier",
    name: "Fortune Enchant",
    description: "Boosts your manual mining and automatic miners.",
    baseCost: 100,
    costScale: 1.34,
    effectText: "+15% global boost",
  },
];

const achievementCatalog = [
  {
    id: "firstClick",
    title: "First Diamond",
    description: "Mine your first diamond.",
    isUnlocked: (state, derived) => state.totalClicks >= 1,
  },
  {
    id: "fastHands",
    title: "Fast Pickaxe",
    description: "Mine 100 diamonds by hand.",
    isUnlocked: (state, derived) => state.totalClicks >= 100,
  },
  {
    id: "idleCore",
    title: "Mining Machine",
    description: "Reach 25 diamonds per second.",
    isUnlocked: (state, derived) => derived.totalPointsPerSecond >= 25,
  },
  {
    id: "chargedRun",
    title: "Diamond Hoarder",
    description: "Reach 10,000 diamonds in a single save.",
    isUnlocked: (state, derived) => state.score >= 10000,
  },
];

const defaultState = {
  score: 0,
  totalClicks: 0,
  unlockedAchievements: [],
  upgrades: {
    clickPower: 0,
    autoClicker: 0,
    multiplier: 0,
  },
  settings: {
    performanceMode: false,
    exactNumbers: false,
  },
};

const elements = {
  announceRegion: document.getElementById("announceRegion"),
  toastStack: document.getElementById("toastStack"),
  scoreHero: document.getElementById("scoreHero"),
  pointsPerClickHero: document.getElementById("pointsPerClickHero"),
  pointsPerSecondHero: document.getElementById("pointsPerSecondHero"),
  saveStatus: document.getElementById("saveStatus"),
  scoreLarge: document.getElementById("scoreLarge"),
  totalClicks: document.getElementById("totalClicks"),
  pointsPerClickLarge: document.getElementById("pointsPerClickLarge"),
  autoPointsPerSecond: document.getElementById("autoPointsPerSecond"),
  nextUpgradeName: document.getElementById("nextUpgradeName"),
  nextUpgradeMeta: document.getElementById("nextUpgradeMeta"),
  nextUpgradeGap: document.getElementById("nextUpgradeGap"),
  nextAchievementName: document.getElementById("nextAchievementName"),
  nextAchievementCopy: document.getElementById("nextAchievementCopy"),
  nextAchievementMeta: document.getElementById("nextAchievementMeta"),
  nextAchievementBar: document.getElementById("nextAchievementBar"),
  statusMessage: document.getElementById("statusMessage"),
  clickButton: document.getElementById("clickButton"),
  clickFeedbackLayer: document.getElementById("clickFeedbackLayer"),
  effectsToggle: document.getElementById("effectsToggle"),
  numbersToggle: document.getElementById("numbersToggle"),
  resetButton: document.getElementById("resetButton"),
  resetDialog: document.getElementById("resetDialog"),
  shopList: document.getElementById("shopList"),
  achievementList: document.getElementById("achievementList"),
  upgradeTemplate: document.getElementById("upgradeTemplate"),
  achievementTemplate: document.getElementById("achievementTemplate"),
};

const upgradeCardMap = new Map();
const achievementCardMap = new Map();
const state = loadState();
let renderFrameId = 0;
let saveTimeoutId = 0;
let saveStatusTimeoutId = 0;
let hasPendingSave = false;
let pendingSaveMessage = DEFAULT_SAVE_MESSAGE;
let pendingSaveNotification = false;

initialize();

function initialize() {
  buildUpgradeCards();
  buildAchievementCards();
  bindEvents();
  startPassiveIncomeLoop();
  applySettings();
  setStatusMessage(DEFAULT_STATUS_MESSAGE);
  setSaveMessage(DEFAULT_SAVE_MESSAGE, false);
  render();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return cloneDefaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultState(),
      ...parsed,
      upgrades: {
        ...cloneDefaultState().upgrades,
        ...(parsed.upgrades || {}),
      },
      settings: {
        ...cloneDefaultState().settings,
        ...(parsed.settings || {}),
      },
      unlockedAchievements: Array.isArray(parsed.unlockedAchievements)
        ? parsed.unlockedAchievements
        : [],
    };
  } catch {
    return cloneDefaultState();
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function buildUpgradeCards() {
  elements.shopList.innerHTML = "";

  upgradeCatalog.forEach((upgrade) => {
    const fragment = elements.upgradeTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".shop-card");
    const title = fragment.querySelector(".shop-title");
    const level = fragment.querySelector(".shop-level");
    const description = fragment.querySelector(".shop-description");
    const effect = fragment.querySelector(".shop-effect");
    const cost = fragment.querySelector(".shop-cost-value");
    const button = fragment.querySelector(".shop-button");

    title.textContent = upgrade.name;
    description.textContent = upgrade.description;
    effect.textContent = upgrade.effectText;
    button.dataset.upgradeId = upgrade.id;

    upgradeCardMap.set(upgrade.id, { card, level, cost, button });
    elements.shopList.appendChild(fragment);
  });
}

function buildAchievementCards() {
  elements.achievementList.innerHTML = "";

  achievementCatalog.forEach((achievement) => {
    const fragment = elements.achievementTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".achievement-card");
    const title = fragment.querySelector(".achievement-title");
    const description = fragment.querySelector(".achievement-description");
    const stateBadge = fragment.querySelector(".achievement-state");

    title.textContent = achievement.title;
    description.textContent = achievement.description;

    achievementCardMap.set(achievement.id, { card, stateBadge });
    elements.achievementList.appendChild(fragment);
  });
}

function bindEvents() {
  elements.clickButton.addEventListener("click", handleMainClick);
  elements.clickButton.addEventListener("pointerdown", () => {
    elements.clickButton.classList.add("is-pressed");
  });
  elements.clickButton.addEventListener("pointerup", () => {
    elements.clickButton.classList.remove("is-pressed");
  });
  elements.clickButton.addEventListener("pointerleave", () => {
    elements.clickButton.classList.remove("is-pressed");
  });

  elements.shopList.addEventListener("click", (event) => {
    const purchaseButton = event.target.closest(".shop-button");

    if (!purchaseButton) {
      return;
    }

    purchaseUpgrade(purchaseButton.dataset.upgradeId);
  });

  elements.resetButton.addEventListener("click", () => {
    if (typeof elements.resetDialog.showModal === "function") {
      elements.resetDialog.showModal();
      return;
    }

    if (window.confirm("Reset all saved progress?")) {
      resetProgress();
    }
  });

  elements.resetDialog.addEventListener("close", () => {
    if (elements.resetDialog.returnValue === "confirm") {
      resetProgress();
    }
  });

  elements.effectsToggle.addEventListener("click", () => {
    state.settings.performanceMode = !state.settings.performanceMode;
    applySettings();
    scheduleSave({ message: "Performance mode updated", notify: true, delay: 0 });
    queueRender();
  });

  elements.numbersToggle.addEventListener("click", () => {
    state.settings.exactNumbers = !state.settings.exactNumbers;
    scheduleSave({ message: "Number format updated", notify: true, delay: 0 });
    queueRender();
  });

  window.addEventListener("pagehide", flushSave);
  window.addEventListener("beforeunload", flushSave);
}

function handleMainClick(event) {
  const reward = rollClickReward();

  state.score += reward.amount;
  state.totalClicks += 1;

  scheduleSave({ message: "Progress saved", notify: false });
  queueRender();
  showFloatingScore(reward.label, event);
  setStatusMessage("Diamond mined");
}

function purchaseUpgrade(upgradeId) {
  const upgrade = findUpgradeById(upgradeId);

  if (!upgrade) {
    return;
  }

  const cost = getUpgradeCost(upgrade.id);

  if (state.score < cost) {
    setStatusMessage("Not enough diamonds for that upgrade");
    return;
  }

  state.score -= cost;
  state.upgrades[upgrade.id] += 1;

  const upgradeCard = upgradeCardMap.get(upgrade.id);
  upgradeCard.button.classList.remove("is-upgraded");
  void upgradeCard.button.offsetWidth;
  upgradeCard.button.classList.add("is-upgraded");

  scheduleSave({ message: `${upgrade.name} saved`, notify: true });
  queueRender();
  setStatusMessage(`${upgrade.name} upgraded`);
}

function resetProgress() {
  Object.assign(state, cloneDefaultState());
  applySettings();
  scheduleSave({ message: "Progress reset and saved", notify: true, delay: 0 });
  queueRender();
  setStatusMessage("Progress reset complete");
}

function startPassiveIncomeLoop() {
  window.setInterval(() => {
    const derived = getDerivedStats(state);

    if (derived.totalPointsPerSecond <= 0) {
      return;
    }

    state.score += derived.totalPointsPerSecond;
    scheduleSave({ notify: false, delay: 900 });
    queueRender();
  }, 1000);
}

function queueRender() {
  if (renderFrameId) {
    return;
  }

  renderFrameId = window.requestAnimationFrame(() => {
    renderFrameId = 0;
    render();
  });
}

function render() {
  const derived = getDerivedStats(state);

  updateText(elements.scoreHero, formatNumber(state.score));
  updateText(elements.pointsPerClickHero, formatNumber(derived.pointsPerClick));
  updateText(elements.pointsPerSecondHero, formatNumber(derived.totalPointsPerSecond));

  updateText(elements.scoreLarge, formatNumber(state.score));
  updateText(elements.totalClicks, formatNumber(state.totalClicks));
  updateText(elements.pointsPerClickLarge, formatNumber(derived.pointsPerClick));
  updateText(elements.autoPointsPerSecond, formatNumber(derived.totalPointsPerSecond));

  renderSettings();
  renderAchievements(derived);
  renderGuidePanel(derived);
  renderUpgradeCards();
}

function renderUpgradeCards() {
  upgradeCatalog.forEach((upgrade) => {
    const level = state.upgrades[upgrade.id];
    const cost = getUpgradeCost(upgrade.id);
    const ui = upgradeCardMap.get(upgrade.id);

    updateText(ui.level, `Level ${formatNumber(level)}`);
    updateText(ui.cost, formatNumber(cost));
    ui.button.disabled = state.score < cost;
  });
}

function renderAchievements(derived) {
  achievementCatalog.forEach((achievement) => {
    const unlocked = achievement.isUnlocked(state, derived);
    const ui = achievementCardMap.get(achievement.id);

    if (unlocked && !state.unlockedAchievements.includes(achievement.id)) {
      state.unlockedAchievements.push(achievement.id);
      showToast("Achievement unlocked", achievement.title);
      announce(`${achievement.title} unlocked`);
      scheduleSave({ notify: false, delay: 0 });
    }

    ui.card.classList.toggle("is-unlocked", unlocked);
    updateText(ui.stateBadge, unlocked ? "Unlocked" : "Locked");
  });
}

function renderGuidePanel(derived) {
  const nextUpgrade = getNextUpgradeGoal();
  const nextAchievement = getNextAchievementGoal(derived);

  updateText(elements.nextUpgradeName, nextUpgrade.name);
  updateText(elements.nextUpgradeMeta, `Cost ${formatNumber(nextUpgrade.cost)}`);
  updateText(elements.nextUpgradeGap, nextUpgrade.gapText);

  updateText(elements.nextAchievementName, nextAchievement.title);
  updateText(elements.nextAchievementCopy, nextAchievement.description);
  updateText(elements.nextAchievementMeta, nextAchievement.meta);
  elements.nextAchievementBar.style.width = `${nextAchievement.progressPercent}%`;
}

function renderSettings() {
  const performanceOn = state.settings.performanceMode;
  const exactNumbersOn = state.settings.exactNumbers;

  elements.effectsToggle.setAttribute("aria-pressed", String(performanceOn));
  elements.numbersToggle.setAttribute("aria-pressed", String(exactNumbersOn));
  updateText(elements.effectsToggle, performanceOn ? "Performance mode on" : "Performance mode off");
  updateText(elements.numbersToggle, exactNumbersOn ? "Exact numbers on" : "Exact numbers off");
}

function getDerivedStats(currentState) {
  const multiplierBonus = 1 + currentState.upgrades.multiplier * 0.15;
  const pointsPerClick = Math.max(1, Math.floor((1 + currentState.upgrades.clickPower) * multiplierBonus));
  const totalPointsPerSecond = Math.floor(currentState.upgrades.autoClicker * (1 + currentState.upgrades.multiplier * 0.1));

  return {
    pointsPerClick,
    totalPointsPerSecond,
  };
}

function getUpgradeCost(upgradeId) {
  const upgrade = findUpgradeById(upgradeId);
  const currentLevel = state.upgrades[upgradeId];
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, currentLevel));
}

function rollClickReward() {
  const derived = getDerivedStats(state);
  return {
    amount: derived.pointsPerClick,
    label: `+${formatNumber(derived.pointsPerClick)}`,
  };
}

function findUpgradeById(upgradeId) {
  return upgradeCatalog.find((upgrade) => upgrade.id === upgradeId);
}

function getNextUpgradeGoal() {
  const sortedUpgrades = [...upgradeCatalog].sort((left, right) => getUpgradeCost(left.id) - getUpgradeCost(right.id));
  const cheapestUpgrade = sortedUpgrades[0];
  const cheapestCost = getUpgradeCost(cheapestUpgrade.id);
  const gap = Math.max(0, cheapestCost - state.score);

  return {
    name: cheapestUpgrade.name,
    cost: cheapestCost,
    gapText: gap === 0 ? "Ready to upgrade now" : `${formatNumber(gap)} diamonds needed`,
  };
}

function getNextAchievementGoal(derived) {
  const nextAchievement = achievementCatalog.find((achievement) => !state.unlockedAchievements.includes(achievement.id));

  if (!nextAchievement) {
    return {
      title: "All current achievements unlocked",
      description: "You cleared every milestone in this prototype build.",
      meta: "100% complete",
      progressPercent: 100,
    };
  }

  if (nextAchievement.id === "firstClick") {
    return buildProgressGoal(nextAchievement, state.totalClicks, 1, "clicks");
  }

  if (nextAchievement.id === "fastHands") {
    return buildProgressGoal(nextAchievement, state.totalClicks, 100, "clicks");
  }

  if (nextAchievement.id === "idleCore") {
    return buildProgressGoal(nextAchievement, derived.totalPointsPerSecond, 25, "diamonds per second");
  }

  if (nextAchievement.id === "chargedRun") {
    return buildProgressGoal(nextAchievement, state.score, 10000, "diamonds");
  }

  return {
    title: nextAchievement.title,
    description: nextAchievement.description,
    meta: "In progress",
    progressPercent: 0,
  };
}

function buildProgressGoal(achievement, currentValue, targetValue, unitLabel) {
  const progressPercent = Math.min(100, Math.round((currentValue / targetValue) * 100));
  return {
    title: achievement.title,
    description: achievement.description,
    meta: `${formatNumber(currentValue)} / ${formatNumber(targetValue)} ${unitLabel}`,
    progressPercent,
  };
}

function applySettings() {
  document.body.classList.toggle("performance-mode", state.settings.performanceMode);
}

function scheduleSave({ message = "Progress saved", notify = false, delay = 280 } = {}) {
  hasPendingSave = true;

  if (notify) {
    pendingSaveNotification = true;
    pendingSaveMessage = message;
  }

  window.clearTimeout(saveTimeoutId);
  saveTimeoutId = window.setTimeout(flushSave, delay);
}

function flushSave() {
  if (!hasPendingSave) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  hasPendingSave = false;

  if (pendingSaveNotification) {
    setSaveMessage(pendingSaveMessage, true);
    pendingSaveNotification = false;
    pendingSaveMessage = DEFAULT_SAVE_MESSAGE;
  }
}

function setStatusMessage(message) {
  updateText(elements.statusMessage, message);
}

function setSaveMessage(message, autoReset = true) {
  updateText(elements.saveStatus, message);

  if (!autoReset) {
    return;
  }

  window.clearTimeout(saveStatusTimeoutId);
  saveStatusTimeoutId = window.setTimeout(() => {
    updateText(elements.saveStatus, DEFAULT_SAVE_MESSAGE);
  }, 1200);
}

function showFloatingScore(label, event) {
  const existingPopups = elements.clickFeedbackLayer.childElementCount;

  if (existingPopups > 10) {
    elements.clickFeedbackLayer.firstElementChild?.remove();
  }

  const popup = document.createElement("span");
  const feedbackBounds = elements.clickFeedbackLayer.getBoundingClientRect();
  const x = event ? event.clientX - feedbackBounds.left : feedbackBounds.width / 2;
  const y = event ? event.clientY - feedbackBounds.top : feedbackBounds.height / 2;

  popup.className = "floating-score";
  popup.textContent = label;
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;

  elements.clickFeedbackLayer.appendChild(popup);

  window.setTimeout(() => {
    popup.remove();
  }, 900);
}

function showToast(title, copy) {
  const toast = document.createElement("article");
  const heading = document.createElement("p");
  const body = document.createElement("p");

  toast.className = "toast";
  heading.className = "toast-title";
  body.className = "toast-copy";
  heading.textContent = title;
  body.textContent = copy;

  toast.append(heading, body);
  elements.toastStack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2900);
}

function announce(message) {
  updateText(elements.announceRegion, "");
  window.setTimeout(() => {
    updateText(elements.announceRegion, message);
  }, 20);
}

function formatNumber(value) {
  if (state.settings.exactNumbers) {
    return exactNumberFormatter.format(value);
  }

  if (value < 1000) {
    return exactNumberFormatter.format(value);
  }

  const units = ["K", "M", "B", "T", "Qa", "Qi"];
  let scaled = value;
  let unitIndex = -1;

  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(decimals)}${units[unitIndex]}`;
}

function updateText(element, value) {
  if (element.textContent !== value) {
    element.textContent = value;
  }
}
