"use strict";

/*
 * NOVA NODE
 * FakePixel AI SkyBlock Dashboard
 *
 * One Minecraft bot only.
 */

const state = {
  currentPage: "dashboard",
  commandMode: "chat",
  logs: [],
  status: null,
  inventory: null,
  build: null,
  schematics: [],
  target: "V_Mallu_Gamer"
};

/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString()
    : "0";
}

function formatBytes(bytes) {
  const n = Number(bytes);

  if (!Number.isFinite(n) || n <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1
  );

  return `${(n / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 1
  )} ${units[index]}`;
}

function toast(message, type = "success") {
  const container = $("toastContainer");

  if (!container) return;

  const item = document.createElement("div");

  item.className = `toast ${type}`;
  item.textContent = message;

  container.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(6px)";

    setTimeout(() => item.remove(), 200);
  }, 3000);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      ok: false,
      error: `HTTP ${response.status}`
    };
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value ?? "—";
  }
}

function setChecked(id, value) {
  const element = $(id);

  if (element) {
    element.checked = Boolean(value);
  }
}

function getChecked(id) {
  return Boolean($(id)?.checked);
}

function setBadge(id, text, className = "") {
  const element = $(id);

  if (!element) return;

  element.textContent = text;

  element.className =
    `badge ${className}`.trim();
}

/* =========================================================
   PAGE NAVIGATION
========================================================= */

const pageTitles = {
  dashboard: [
    "Dashboard",
    "FakePixel SkyBlock control center"
  ],

  minecraft: [
    "Minecraft",
    "Control movement, camera and world state"
  ],

  inventory: [
    "Inventory",
    "Manage items, soup and flight state"
  ],

  builder: [
    "Builder",
    "Upload and build Minecraft schematics"
  ],

  ai: [
    "AI Control",
    "xKiro high-level automation"
  ],

  console: [
    "Console",
    "Live Minecraft bot logs"
  ],

  settings: [
    "Settings",
    "Configure automation and bot behavior"
  ]
};

function showPage(page) {
  if (!pageTitles[page]) {
    page = "dashboard";
  }

  state.currentPage = page;

  document
    .querySelectorAll(".page")
    .forEach((element) => {
      element.classList.toggle(
        "active",
        element.id === `page-${page}`
      );
    });

  document
    .querySelectorAll(".nav-item")
    .forEach((element) => {
      element.classList.toggle(
        "active",
        element.dataset.page === page
      );
    });

  const title = pageTitles[page];

  setText("pageTitle", title[0]);
  setText("pageSubtitle", title[1]);

  closeMobileMenu();

  if (page === "inventory") {
    refreshInventory();
    refreshSoup();
  }

  if (page === "builder") {
    refreshSchematics();
    refreshBuild();
  }

  if (page === "minecraft") {
    refreshWorld();
    refreshEntities();
  }

  if (page === "ai") {
    refreshAI();
    refreshTarget();
  }

  if (page === "settings") {
    refreshSettings();
  }
}

document
  .querySelectorAll(".nav-item")
  .forEach((button) => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

/* =========================================================
   MOBILE MENU
========================================================= */

function openMobileMenu() {
  $("sidebar")?.classList.add("open");
  $("sidebarOverlay")?.classList.add("show");
}

function closeMobileMenu() {
  $("sidebar")?.classList.remove("open");
  $("sidebarOverlay")?.classList.remove("show");
}

$("mobileMenuBtn")?.addEventListener(
  "click",
  openMobileMenu
);

$("sidebarOverlay")?.addEventListener(
  "click",
  closeMobileMenu
);

/* =========================================================
   STATUS
========================================================= */

function isBotOnline(status) {
  if (!status) return false;

  const value =
    status.online ??
    status.connected ??
    status.status === "online";

  return Boolean(value);
}

function updateStatusUI(data) {
  state.status = data;

  const bot = data.bot || {};
  const settings = data.settings || {};
  const soup = data.soup || {};
  const aiState = data.ai || {};

  const online = isBotOnline(bot);

  const statusText =
    online ? "Online" : "Offline";

  setText("topStatusText", statusText);
  setText("sideStatusText", statusText);
  setText("dashBotStatus", statusText);

  const topStatus = $("topStatus");

  if (topStatus) {
    topStatus.className =
      `top-status ${online ? "online" : "offline"}`;
  }

  const topDot =
    topStatus?.querySelector(".status-dot");

  if (topDot) {
    topDot.className =
      `status-dot ${online ? "online" : "offline"}`;
  }

  const sideDot = $("sideStatusDot");

  if (sideDot) {
    sideDot.className =
      `status-dot ${online ? "online" : "offline"}`;
  }

  setBadge(
    "dashOnlineBadge",
    statusText,
    online ? "online" : "offline"
  );

  setText(
    "dashUsername",
    bot.username ||
    bot.name ||
    "—"
  );

  setText(
    "dashServer",
    bot.host ||
    "mc.fakepixel.me"
  );

  setText(
    "dashPosition",
    formatPosition(bot.position)
  );

  setText(
    "dashDimension",
    bot.dimension ||
    bot.gameMode ||
    "—"
  );

  setText(
    "dashTarget",
    data.target?.username ||
    "V_Mallu_Gamer"
  );

  setText(
    "topTarget",
    data.target?.username ||
    "V_Mallu_Gamer"
  );

  setText(
    "dashAiModel",
    aiState.model ||
    "Unavailable"
  );

  const flightActive =
    Boolean(
      settings.flightActive ??
      soup.flightActive
    );

  setText(
    "dashFlight",
    flightActive
      ? "Active"
      : "Inactive"
  );

  setChecked(
    "toggleAutoSkyblock",
    settings.autoSkyblock
  );

  setChecked(
    "toggleAutoVisit",
    settings.autoVisit
  );

  setChecked(
    "toggleAntiAfk",
    settings.antiAfk
  );

  setChecked(
    "settingAutoSkyblock",
    settings.autoSkyblock
  );

  setChecked(
    "settingAutoVisit",
    settings.autoVisit
  );

  setChecked(
    "settingAntiAfk",
    settings.antiAfk
  );

  setChecked(
    "settingAutoSoup",
    settings.autoSoup
  );

  setChecked(
    "settingAutoCoopAccept",
    settings.autoCoopAccept
  );

  setChecked(
    "settingAutoTradeAccept",
    settings.autoTradeAccept
  );

  updateFlightUI(settings, soup);

  updateRequestUI(data.request || {});
}

function formatPosition(position) {
  if (!position) return "—";

  if (
    typeof position === "object" &&
    position.x !== undefined
  ) {
    return [
      Number(position.x).toFixed(1),
      Number(position.y).toFixed(1),
      Number(position.z).toFixed(1)
    ].join(" / ");
  }

  return String(position);
}

async function refreshStatus() {
  try {
    const data = await api("/api/status");

    updateStatusUI(data);
  } catch (error) {
    setText("topStatusText", "Offline");
    setText("sideStatusText", "Offline");
    setText("dashBotStatus", "Offline");
  }
}

/* =========================================================
   BOT
========================================================= */

async function reconnectBot() {
  try {
    toast("Reconnecting bot...", "success");

    await api("/api/bot/reconnect", {
      method: "POST"
    });

    toast(
      "Bot reconnect requested.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

$("dashboardReconnect")?.addEventListener(
  "click",
  reconnectBot
);

/* =========================================================
   AI VISIT
========================================================= */

async function startAIVisit() {
  try {
    toast(
      "Starting SkyBlock visit...",
      "success"
    );

    await api("/api/ai/visit", {
      method: "POST"
    });

    toast(
      "AI visit started.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

$("dashboardVisit")?.addEventListener(
  "click",
  startAIVisit
);

$("aiVisit")?.addEventListener(
  "click",
  startAIVisit
);

/* =========================================================
   AI
========================================================= */

async function refreshAI() {
  try {
    const data =
      await api("/api/ai/status");

    const available =
      Boolean(data.available);

    const dot = $("aiStatusDot");

    if (dot) {
      dot.className =
        `status-dot ${
          available
            ? "online"
            : "offline"
        }`;
    }

    setText(
      "aiStatus",
      available
        ? "AI Online"
        : "AI Unavailable"
    );

    setText(
      "aiModel",
      data.model || "—"
    );

    setText(
      "dashAiModel",
      data.model || "Unavailable"
    );
  } catch (error) {
    setText(
      "aiStatus",
      "AI Unavailable"
    );

    setText(
      "aiModel",
      "—"
    );
  }
}

/*
 * The server currently exposes AI visit directly.
 * Build planning is intentionally handled by the
 * backend/build system rather than making the browser
 * invent block placement actions.
 */

$("aiBuildPlan")?.addEventListener(
  "click",
  async () => {
    const output = $("aiPlanOutput");

    if (output) {
      output.textContent =
        "Build planning is available through the server-side AI planner.";
    }

    toast(
      "Use a schematic for local block placement.",
      "success"
    );
  }
);

/* =========================================================
   TARGET
========================================================= */

async function refreshTarget() {
  try {
    const data =
      await api("/api/target");

    const username =
      data.target?.username ||
      "V_Mallu_Gamer";

    state.target = username;

    setText(
      "topTarget",
      username
    );

    setText(
      "dashTarget",
      username
    );

    const input =
      $("targetUsername");

    if (
      input &&
      document.activeElement !== input
    ) {
      input.value = username;
    }
  } catch {}
}

async function saveTarget() {
  const input =
    $("targetUsername");

  const username =
    input?.value.trim();

  if (!username) {
    toast(
      "Enter a target username.",
      "error"
    );
    return;
  }

  try {
    await api("/api/target", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username
      })
    });

    state.target = username;

    setText(
      "topTarget",
      username
    );

    setText(
      "dashTarget",
      username
    );

    toast(
      "Target saved.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

$("saveTarget")?.addEventListener(
  "click",
  saveTarget
);

/* =========================================================
   SETTINGS
========================================================= */

async function refreshSettings() {
  try {
    const data =
      await api("/api/settings");

    const settings =
      data.settings || {};

    setChecked(
      "settingAutoSkyblock",
      settings.autoSkyblock
    );

    setChecked(
      "settingAutoVisit",
      settings.autoVisit
    );

    setChecked(
      "settingAntiAfk",
      settings.antiAfk
    );

    setChecked(
      "settingAutoSoup",
      settings.autoSoup
    );

    setChecked(
      "settingAutoCoopAccept",
      settings.autoCoopAccept
    );

    setChecked(
      "settingAutoTradeAccept",
      settings.autoTradeAccept
    );
  } catch (error) {
    toast(
      `Settings: ${error.message}`,
      "error"
    );
  }
}

async function saveSettings() {
  const settings = {
    autoSkyblock:
      getChecked("settingAutoSkyblock"),

    autoVisit:
      getChecked("settingAutoVisit"),

    antiAfk:
      getChecked("settingAntiAfk"),

    autoSoup:
      getChecked("settingAutoSoup"),

    autoCoopAccept:
      getChecked("settingAutoCoopAccept"),

    autoTradeAccept:
      getChecked("settingAutoTradeAccept")
  };

  try {
    const data =
      await api("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(settings)
      });

    updateStatusUI({
      ...(state.status || {}),
      settings:
        data.settings
    });

    toast(
      "Settings saved.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

$("saveSettings")?.addEventListener(
  "click",
  saveSettings
);

/*
 * Quick dashboard toggles.
 */

async function quickSettingToggle(
  setting,
  checkbox
) {
  try {
    await api("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        [setting]:
          checkbox.checked
      })
    });

    toast(
      `${setting} ${checkbox.checked ? "enabled" : "disabled"}.`,
      "success"
    );
  } catch (error) {
    checkbox.checked =
      !checkbox.checked;

    toast(
      error.message,
      "error"
    );
  }
}

$("toggleAutoSkyblock")
  ?.addEventListener("change", (event) => {
    quickSettingToggle(
      "autoSkyblock",
      event.target
    );
  });

$("toggleAutoVisit")
  ?.addEventListener("change", (event) => {
    quickSettingToggle(
      "autoVisit",
      event.target
    );
  });

$("toggleAntiAfk")
  ?.addEventListener("change", (event) => {
    quickSettingToggle(
      "antiAfk",
      event.target
    );
  });

/* =========================================================
   MINECRAFT WORLD
========================================================= */

async function refreshWorld() {
  try {
    const data =
      await api("/api/minecraft/state");

    const s = data.state || {};
    const position =
      s.position ||
      s.bot?.position ||
      s;

    setText(
      "worldX",
      numericValue(position?.x)
    );

    setText(
      "worldY",
      numericValue(position?.y)
    );

    setText(
      "worldZ",
      numericValue(position?.z)
    );

    setText(
      "worldDimension",
      s.dimension ||
      s.bot?.dimension ||
      "—"
    );

    setText(
      "worldHealth",
      s.health ??
      s.bot?.health ??
      "—"
    );

    setText(
      "worldFood",
      s.food ??
      s.foodSaturation ??
      s.bot?.food ??
      "—"
    );
  } catch {}
}

function numericValue(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n.toFixed(1)
    : "—";
}

async function moveBot() {
  const x = Number(
    $("moveX")?.value
  );

  const y = Number(
    $("moveY")?.value
  );

  const z = Number(
    $("moveZ")?.value
  );

  const range = Number(
    $("moveRange")?.value || 2
  );

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    toast(
      "Enter valid coordinates.",
      "error"
    );
    return;
  }

  try {
    await api("/api/minecraft/move", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        x,
        y,
        z,
        range
      })
    });

    toast(
      "Movement started.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function stopMovement() {
  try {
    await api("/api/minecraft/stop", {
      method: "POST"
    });

    toast(
      "Movement stopped.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function lookAt() {
  const x = Number(
    $("lookX")?.value
  );

  const y = Number(
    $("lookY")?.value
  );

  const z = Number(
    $("lookZ")?.value
  );

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    toast(
      "Enter valid coordinates.",
      "error"
    );
    return;
  }

  try {
    await api("/api/minecraft/look", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        x,
        y,
        z,
        rotation
      })
    });

    toast(
      "Bot camera updated.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

$("moveBtn")?.addEventListener(
  "click",
  moveBot
);

$("minecraftStop")?.addEventListener(
  "click",
  stopMovement
);

$("lookBtn")?.addEventListener(
  "click",
  lookAt
);

$("refreshWorld")?.addEventListener(
  "click",
  refreshWorld
);

/* =========================================================
   ENTITIES
========================================================= */

async function refreshEntities() {
  try {
    const data =
      await api(
        "/api/minecraft/entities?radius=20"
      );

    renderEntities(
      data.entities || []
    );
  } catch (error) {
    const list =
      $("entitiesList");

    if (list) {
      list.innerHTML =
        `<div class="empty-state">
          Unable to load entities
        </div>`;
    }
  }
}

function renderEntities(entities) {
  const list =
    $("entitiesList");

  if (!list) return;

  if (!Array.isArray(entities) ||
      entities.length === 0) {
    list.innerHTML =
      `<div class="empty-state">
        No nearby entities
      </div>`;

    return;
  }

  list.innerHTML =
    entities.map((entity) => {
      const name =
        entity.username ||
        entity.displayName ||
        entity.name ||
        entity.type ||
        "Unknown";

      const position =
        entity.position
          ? formatPosition(entity.position)
          : "—";

      return `
        <div class="entity-row">
          <div>
            <div class="entity-name">
              ${escapeHtml(name)}
            </div>

            <div class="entity-meta">
              ${escapeHtml(entity.type || "entity")}
            </div>
          </div>

          <div class="entity-meta">
            ${escapeHtml(position)}
          </div>
        </div>
      `;
    }).join("");
}

$("refreshEntities")?.addEventListener(
  "click",
  refreshEntities
);

/* =========================================================
   INVENTORY
========================================================= */

async function refreshInventory() {
  try {
    const data =
      await api("/api/inventory");

    state.inventory =
      data.inventory;

    renderInventory(
      data.inventory
    );
  } catch (error) {
    const grid =
      $("inventoryGrid");

    if (grid) {
      grid.innerHTML =
        `<div class="empty-state">
          Inventory unavailable
        </div>`;
    }
  }
}

function normalizeInventoryItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.inventory)) {
    return data.inventory;
  }

  return [];
}

function renderInventory(data) {
  const items =
    normalizeInventoryItems(data);

  const grid =
    $("inventoryGrid");

  if (!grid) return;

  /*
   * Mineflayer inventory normally exposes
   * slots starting at 0. Keep every returned
   * slot visible.
   */

  const maxSlot = Math.max(
    36,
    ...items.map(
      item =>
        Number(item.slot ?? 0)
    ) + 1
  );

  const slots =
    new Array(maxSlot).fill(null);

  for (const item of items) {
    const slot =
      Number(item.slot);

    if (
      Number.isInteger(slot) &&
      slot >= 0 &&
      slot < slots.length
    ) {
      slots[slot] = item;
    }
  }

  let full = 0;
  let partial = 0;
  let empty = 0;

  grid.innerHTML =
    slots.map((item, index) => {

      if (!item || item.empty) {
        empty++;

        return `
          <div class="inventory-slot empty">
            <span class="slot-number">
              ${index}
            </span>

            <span class="item-name">
              Empty
            </span>
          </div>
        `;
      }

      const count =
        Number(item.count ?? 0);

      const stackSize =
        Number(
          item.stackSize ??
          item.maxStackSize ??
          64
        );

      const isFull =
        count >= stackSize;

      if (isFull) {
        full++;
      } else {
        partial++;
      }

      const className =
        isFull
          ? "full"
          : "partial";

      const name =
        item.displayName ||
        item.name ||
        "Unknown";

      return `
        <div
          class="inventory-slot ${className}"
          title="${escapeHtml(name)}"
        >
          <span class="slot-number">
            ${index}
          </span>

          <span class="item-name">
            ${escapeHtml(name)}
          </span>

          <span class="item-count">
            ${count}
          </span>
        </div>
      `;
    }).join("");

  setText(
    "inventoryUsed",
    full + partial
  );

  setText(
    "inventoryEmpty",
    empty
  );

  setText(
    "inventoryFull",
    full
  );

  setText(
    "inventoryPartial",
    partial
  );
}

/* =========================================================
   REQUESTS
========================================================= */

function updateRequestUI(request = {}) {
  const pending = Boolean(request.pending);
  const type = request.type || null;

  setBadge(
    "requestBadge",
    pending ? (type === "trade" ? "Trade" : "Co-op") : "None",
    pending ? "online" : ""
  );

  setText(
    "requestType",
    pending ? (type === "trade" ? "Trade / Deal" : "Co-op") : "None"
  );

  setText(
    "requestFrom",
    request.from || "—"
  );

  setText(
    "requestActionStatus",
    request.lastAction || (pending ? "Request detected — choose an accept button." : "Waiting for a co-op or trade request.")
  );
}

async function acceptRequestType(type) {
  try {
    const data = await api("/api/requests/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type })
    });

    toast(
      type === "trade" ? "Trade Deal/Accept clicked." : "Co-op Accept clicked.",
      "success"
    );
    updateRequestUI(data.request || {});
    await refreshStatus();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function acceptCurrentRequestFromUI() {
  try {
    const data = await api("/api/requests/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    toast("Current request button clicked.", "success");
    updateRequestUI(data.request || {});
    await refreshStatus();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("acceptCoopRequest")?.addEventListener("click", () => acceptRequestType("coop"));
$("acceptTradeRequest")?.addEventListener("click", () => acceptRequestType("trade"));
$("acceptCurrentRequest")?.addEventListener("click", acceptCurrentRequestFromUI);

async function goSkyblockNpcFromUI() {
  try {
    const data = await api("/api/skyblock/npc", { method: "POST" });
    toast(data.result ? "SkyBlock NPC movement started." : "SkyBlock NPC action sent.", "success");
    await refreshStatus();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function visitTargetFromUI() {
  try {
    const data = await api("/api/ai/visit", { method: "POST" });
    toast("Visit command sent.", "success");
    await refreshStatus();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function lookNpcFromUI() {
  try {
    await api("/api/skyblock/npc/look", { method: "POST" });
    toast("Bot is looking at the SkyBlock NPC.", "success");
  } catch (error) { toast(error.message, "error"); }
}

async function selectSlot3FromUI() {
  try {
    await api("/api/minecraft/hotbar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: 3 })
    });
    toast("Hotbar slot 3 selected.", "success");
  } catch (error) { toast(error.message, "error"); }
}

async function rotateFromUI(yaw, pitch) {
  try {
    await api("/api/minecraft/rotate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaw, pitch })
    });
  } catch (error) { toast(error.message, "error"); }
}

$("lookNpcBtn")?.addEventListener("click", lookNpcFromUI);
$("selectSlot3Btn")?.addEventListener("click", selectSlot3FromUI);
$("rotateLeftBtn")?.addEventListener("click", () => rotateFromUI(-15, 0));
$("rotateRightBtn")?.addEventListener("click", () => rotateFromUI(15, 0));
$("lookUpBtn")?.addEventListener("click", () => rotateFromUI(0, -10));
$("lookDownBtn")?.addEventListener("click", () => rotateFromUI(0, 10));

$("goSkyblockNpcBtn")?.addEventListener("click", goSkyblockNpcFromUI);
$("rightClickNpcBtn")?.addEventListener("click", async () => {
  try {
    const data = await api("/api/skyblock/npc/right-click", { method: "POST" });
    toast(data.result ? "Right-click sent to SkyBlock NPC." : "Right-click attempted.", "success");
    await refreshStatus();
  } catch (error) {
    toast(error.message, "error");
  }
});
$("visitTargetBtn")?.addEventListener("click", visitTargetFromUI);

/* =========================================================
   SOUP
========================================================= */

async function refreshSoup() {
  try {
    const data =
      await api("/api/soup");

    const soup =
      data.soup || {};

    const count =
      Number(
        soup.count ??
        soup.available ??
        0
      );

    setText(
      "soupCount",
      count
    );

    const found =
      count > 0 ||
      Boolean(soup.found);

    setBadge(
      "soupBadge",
      found
        ? "Available"
        : "Not Found",
      found
        ? "online"
        : "offline"
    );

    updateFlightUI(
      state.status?.settings || {},
      soup
    );
  } catch {}
}

async function consumeSoup() {
  try {
    const data =
      await api("/api/soup/consume", {
        method: "POST"
      });

    toast(
      "Soup consume requested.",
      "success"
    );

    if (data.soup) {
      updateFlightUI(
        state.status?.settings || {},
        data.soup
      );
    }

    await refreshInventory();
    await refreshSoup();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("consumeSoup")?.addEventListener(
  "click",
  consumeSoup
);

async function setAutoSoup(enabled) {
  try {
    await api("/api/soup/auto", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        enabled
      })
    });

    setChecked(
      "settingAutoSoup",
      enabled
    );

    toast(
      `Auto Soup ${enabled ? "enabled" : "disabled"}.`,
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

$("autoSoupBtn")?.addEventListener(
  "click",
  () => {
    const current =
      getChecked("settingAutoSoup");

    setAutoSoup(!current);
  }
);

$("settingAutoSoup")
  ?.addEventListener(
    "change",
    event => {
      setAutoSoup(
        event.target.checked
      );
    }
  );

/* =========================================================
   FLIGHT
========================================================= */

function updateFlightUI(
  settings = {},
  soup = {}
) {
  const active =
    Boolean(
      settings.flightActive ??
      soup.flightActive ??
      false
    );

  const requested =
    Boolean(
      settings.flightRequested ??
      false
    );

  setText(
    "soupFlightState",
    active
      ? "Active"
      : "Inactive"
  );

  setBadge(
    "flightBadge",
    active
      ? "Active"
      : requested
        ? "Requested"
        : "Inactive",
    active
      ? "online"
      : requested
        ? "building"
        : "offline"
  );

  setText(
    "flightText",
    active
      ? "Flight active"
      : requested
        ? "Flight requested"
        : "Flight inactive"
  );

  setText(
    "flightSubtext",
    active
      ? "The server currently reports flight permission."
      : "Flight depends on server-side permissions."
  );

  const button =
    $("flightToggle");

  if (button) {
    button.textContent =
      requested
        ? "Disable Flight Request"
        : "Request Flight State";
  }

  const icon =
    $("flightIcon");

  if (icon) {
    icon.textContent =
      active
        ? "✈"
        : "○";
  }
}

async function refreshFlight() {
  try {
    const data =
      await api("/api/fly");

    updateFlightUI(
      data,
      data
    );
  } catch {}
}

async function toggleFlight() {
  try {
    const current =
      await api("/api/fly");

    const enabled =
      !Boolean(current.requested);

    await api("/api/fly", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        enabled
      })
    });

    toast(
      enabled
        ? "Flight request enabled."
        : "Flight request disabled.",
      "success"
    );

    await refreshStatus();
    await refreshFlight();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("flightToggle")?.addEventListener(
  "click",
  toggleFlight
);

/* =========================================================
   REQUEST ACCEPT
========================================================= */

async function acceptRequest() {
  try {
    await api("/api/requests/accept", {
      method: "POST"
    });

    toast(
      "Request acceptance attempted.",
      "success"
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

/*
 * This dashboard action is intentionally
 * available through the API even if the
 * automatic request settings are disabled.
 */

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape"
    ) {
      closeMobileMenu();
    }
  }
);

/* =========================================================
   CONSOLE
========================================================= */

function renderLogs(logs) {
  const output =
    $("consoleOutput");

  if (!output) return;

  if (!Array.isArray(logs) ||
      logs.length === 0) {
    output.innerHTML =
      `<div class="console-line system">
        Waiting for bot logs...
      </div>`;

    setText(
      "consoleCount",
      "0 messages"
    );

    return;
  }

  output.innerHTML =
    logs.map((log) => {

      if (
        typeof log === "string"
      ) {
        return `
          <div class="console-line">
            ${escapeHtml(log)}
          </div>
        `;
      }

      const type =
        log.type ||
        log.level ||
        "system";

      const message =
        log.message ||
        log.text ||
        JSON.stringify(log);

      const time =
        log.time ||
        log.timestamp ||
        "";

      return `
        <div class="console-line ${escapeHtml(type)}">
          ${time
            ? `[${escapeHtml(time)}] `
            : ""
          }${escapeHtml(message)}
        </div>
      `;
    }).join("");

  setText(
    "consoleCount",
    `${logs.length} messages`
  );

  output.scrollTop =
    output.scrollHeight;
}

async function refreshLogs() {
  try {
    const data =
      await api("/api/logs");

    state.logs =
      data.logs || [];

    renderLogs(state.logs);
  } catch {}
}

async function sendConsoleInput() {
  const input =
    $("consoleInput");

  if (!input) return;

  const value =
    input.value.trim();

  if (!value) return;

  try {
    if (
      state.commandMode === "command"
    ) {
      await api("/api/command", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          command: value
        })
      });
    } else {
      await api("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          message: value
        })
      });
    }

    input.value = "";

    await refreshLogs();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("consoleSend")?.addEventListener(
  "click",
  sendConsoleInput
);

$("consoleInput")?.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();
      sendConsoleInput();
    }
  }
);

document
  .querySelectorAll(".command-tab")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {

        state.commandMode =
          button.dataset.commandMode ||
          "chat";

        document
          .querySelectorAll(".command-tab")
          .forEach(tab => {
            tab.classList.toggle(
              "active",
              tab === button
            );
          });

        const input =
          $("consoleInput");

        if (input) {
          input.placeholder =
            state.commandMode === "command"
              ? "Enter Minecraft command..."
              : "Send Minecraft chat...";
        }
      }
    );
  });

$("clearConsole")?.addEventListener(
  "click",
  () => {
    const output =
      $("consoleOutput");

    if (output) {
      output.innerHTML =
        `<div class="console-line system">
          Console view cleared.
        </div>`;
    }

    setText(
      "consoleCount",
      "0 messages"
    );
  }
);

/* =========================================================
   SCHEMATICS
========================================================= */

async function refreshSchematics() {
  try {
    const data =
      await api("/api/schematics");

    state.schematics =
      data.schematics || [];

    renderSchematics(
      state.schematics
    );

    populateBuildSelect(
      state.schematics
    );
  } catch (error) {
    toast(
      `Schematics: ${error.message}`,
      "error"
    );
  }
}

function schematicName(item) {
  if (typeof item === "string") {
    return item;
  }

  return (
    item.name ||
    item.filename ||
    item.file ||
    "unknown.schematic"
  );
}

function schematicSize(item) {
  if (
    typeof item !== "object" ||
    !item
  ) {
    return "";
  }

  return item.size
    ? formatBytes(item.size)
    : "";
}

function renderSchematics(items) {
  const list =
    $("schematicList");

  if (!list) return;

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    list.innerHTML =
      `<div class="empty-state">
        No schematics uploaded
      </div>`;

    return;
  }

  list.innerHTML =
    items.map(item => {

      const name =
        schematicName(item);

      const size =
        schematicSize(item);

      return `
        <div class="schematic-row">

          <div>
            <div class="schematic-name">
              ${escapeHtml(name)}
            </div>

            <div class="schematic-size">
              ${escapeHtml(size)}
            </div>
          </div>

          <div class="schematic-actions">

            <button
              type="button"
              title="Use"
              data-use-schematic="${escapeHtml(name)}"
            >
              ✓
            </button>

            <button
              type="button"
              title="Delete"
              data-delete-schematic="${escapeHtml(name)}"
            >
              ×
            </button>

          </div>

        </div>
      `;
    }).join("");

  list
    .querySelectorAll(
      "[data-use-schematic]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const name =
            button.dataset.useSchematic;

          const select =
            $("buildSchematic");

          if (select) {
            select.value = name;
          }

          toast(
            "Schematic selected.",
            "success"
          );
        }
      );
    });

  list
    .querySelectorAll(
      "[data-delete-schematic]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          deleteSchematic(
            button.dataset.deleteSchematic
          );
        }
      );
    });
}

function populateBuildSelect(items) {
  const select =
    $("buildSchematic");

  if (!select) return;

  const previous =
    select.value;

  select.innerHTML =
    `<option value="">
      Select schematic
    </option>`;

  for (const item of items) {
    const name =
      schematicName(item);

    const option =
      document.createElement("option");

    option.value = name;
    option.textContent = name;

    select.appendChild(option);
  }

  if (
    items.some(
      item =>
        schematicName(item) === previous
    )
  ) {
    select.value = previous;
  }
}

async function uploadSchematic(event) {
  const file =
    event.target.files?.[0];

  event.target.value = "";

  if (!file) return;

  const filename =
    file.name;

  const lower =
    filename.toLowerCase();

  if (
    !lower.endsWith(".schem") &&
    !lower.endsWith(".schematic")
  ) {
    toast(
      "Only .schem and .schematic files are supported.",
      "error"
    );
    return;
  }

  if (
    file.size > 100 * 1024 * 1024
  ) {
    toast(
      "Maximum schematic size is 100 MB.",
      "error"
    );
    return;
  }

  try {
    toast(
      `Uploading ${filename}...`,
      "success"
    );

    const encoded =
      encodeURIComponent(filename);

    const response =
      await fetch(
        `/api/schematics/upload?filename=${encoded}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type":
              "application/octet-stream",
            "X-Schematic-Name":
              filename
          },
          body: file
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      data.ok === false
    ) {
      throw new Error(
        data.error ||
        "Upload failed"
      );
    }

    toast(
      "Schematic uploaded.",
      "success"
    );

    await refreshSchematics();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

$("schematicUpload")
  ?.addEventListener(
    "change",
    uploadSchematic
  );

async function deleteSchematic(
  filename
) {
  if (
    !confirm(
      `Delete "${filename}"?`
    )
  ) {
    return;
  }

  try {
    await api(
      `/api/schematics/${encodeURIComponent(filename)}`,
      {
        method: "DELETE"
      }
    );

    toast(
      "Schematic deleted.",
      "success"
    );

    await refreshSchematics();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* =========================================================
   BUILDER
========================================================= */

async function refreshBuild() {
  try {
    const data =
      await api("/api/build/status");

    state.build =
      data.build || {};

    updateBuildUI(
      data.build || {},
      data.progress || {}
    );
  } catch {}
}

function updateBuildUI(
  build = {},
  progress = {}
) {
  const status =
    String(
      build.status ||
      progress.status ||
      "idle"
    ).toLowerCase();

  let badgeText = "Idle";
  let badgeClass = "";

  if (
    status === "building" ||
    status === "running"
  ) {
    badgeText = "Building";
    badgeClass = "building";
  } else if (
    status === "paused"
  ) {
    badgeText = "Paused";
    badgeClass = "building";
  } else if (
    status === "complete" ||
    status === "completed"
  ) {
    badgeText = "Complete";
    badgeClass = "online";
  } else if (
    status === "error" ||
    status === "failed"
  ) {
    badgeText = "Error";
    badgeClass = "offline";
  }

  setBadge(
    "buildBadge",
    badgeText,
    badgeClass
  );

  const percent =
    clamp(
      Number(
        progress.percent ??
        build.percent ??
        0
      ),
      0,
      100
    );

  setText(
    "buildPercent",
    `${percent.toFixed(1)}%`
  );

  const progressBar =
    $("buildProgress");

  if (progressBar) {
    progressBar.style.width =
      `${percent}%`;
  }

  const placed =
    Number(
      progress.placed ??
      build.placed ??
      0
    );

  const total =
    Number(
      progress.total ??
      build.total ??
      0
    );

  setText(
    "buildPlaced",
    `${formatNumber(placed)} placed`
  );

  setText(
    "buildTotal",
    `${formatNumber(total)} blocks`
  );

  const activity =
    $("buildActivity");

  if (activity) {
    activity.textContent =
      build.message ||
      progress.message ||
      (
        status === "idle"
          ? "Builder idle."
          : `Builder status: ${status}`
      );
  }
}

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

async function startBuild() {
  const schematic =
    $("buildSchematic")?.value;

  if (!schematic) {
    toast(
      "Select a schematic first.",
      "error"
    );
    return;
  }

  const x =
    Number($("buildX")?.value || 0);

  const y =
    Number($("buildY")?.value || 0);

  const z =
    Number($("buildZ")?.value || 0);

  const rotation = Number($("buildRotation")?.value || 0);

  try {
    await api("/api/build/start", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        schematic,
        x,
        y,
        z,
        rotation
      })
    });

    toast(
      "Build started.",
      "success"
    );

    await refreshBuild();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function buildAction(
  action
) {
  try {
    await api(
      `/api/build/${action}`,
      {
        method: "POST"
      }
    );

    toast(
      `Build ${action}.`,
      "success"
    );

    await refreshBuild();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("buildStart")?.addEventListener(
  "click",
  startBuild
);

$("buildPause")?.addEventListener(
  "click",
  () => buildAction("pause")
);

$("buildResume")?.addEventListener(
  "click",
  () => buildAction("resume")
);

$("buildStop")?.addEventListener(
  "click",
  () => buildAction("stop")
);

$("buildReset")?.addEventListener(
  "click",
  () => buildAction("reset")
);

$("refreshSchematics")?.addEventListener(
  "click",
  refreshSchematics
);

/* =========================================================
   PERIODIC REFRESH
========================================================= */

let lastPage = "";

setInterval(
  refreshStatus,
  5000
);

setInterval(
  refreshLogs,
  2000
);

setInterval(
  () => {

    if (
      state.currentPage ===
      "inventory"
    ) {
      refreshInventory();
      refreshSoup();
    }

  },
  5000
);

setInterval(
  () => {

    if (
      state.currentPage ===
      "builder"
    ) {
      refreshBuild();
    }

  },
  1500
);

setInterval(
  () => {

    if (
      state.currentPage ===
      "minecraft"
    ) {
      refreshWorld();
    }

  },
  4000
);

/* =========================================================
   INITIALIZATION
========================================================= */

async function initialize() {
  try {
    await refreshStatus();
  } catch {}

  try {
    await refreshTarget();
  } catch {}

  try {
    await refreshAI();
  } catch {}

  try {
    await refreshLogs();
  } catch {}

  try {
    await refreshSchematics();
  } catch {}

  showPage("dashboard");
}

initialize();
