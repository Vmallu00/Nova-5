"use strict";

require("dotenv").config();

const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const {
  GoalNear
} = goals;
const Vec3 = require("vec3").Vec3;

const minecraft = require("./minecraft");
const database = require("./database");

/*
 * ============================================================
 * NOVA NODE
 * FakePixel SkyBlock Bot
 *
 * ONE BOT ONLY
 * Minecraft 1.8.9
 * ============================================================
 */

const MC_HOST =
  process.env.MC_HOST || "mc.fakepixel.me";

const MC_PORT =
  Number(process.env.MC_PORT || 25565);

const MC_VERSION =
  process.env.MC_VERSION || "1.8.9";

const MC_USERNAME =
  process.env.MC_USERNAME || "N0V4_AI1";

const MC_PASSWORD =
  process.env.MC_PASSWORD || "vmallu";

const MC_REGISTER_PASSWORD =
  process.env.MC_REGISTER_PASSWORD || MC_PASSWORD;

const TARGET_USERNAME =
  process.env.TARGET_USERNAME || "V_Mallu_Gamer";

const RECONNECT_ENABLED =
  String(process.env.BOT_RECONNECT ?? "true").toLowerCase() === "true";

const RECONNECT_DELAY =
  Number(process.env.BOT_RECONNECT_DELAY || 5000);

const ANTI_AFK =
  String(process.env.ANTI_AFK ?? "true").toLowerCase() === "true";

/*
 * Fixed FakePixel SkyBlock NPC.
 *
 * User supplied coordinates:
 *
 * X = -25.257
 * Y =  93.000
 * Z =  -1.490
 */

const SKYBLOCK_NPC = {
  x: -25.257,
  y: 93.0,
  z: -1.490,
  radius: 6
};

const SKYBLOCK_HUB_SPAWN = {
  x: -2.500,
  y: 70.0625,
  z: -68.000,
  radius: 8
};

/*
 * ============================================================
 * STATE
 * ============================================================
 */

let bot = null;

let reconnectTimer = null;
let npcSearchTimer = null;
let antiAfkTimer = null;
let soupTimer = null;

let shuttingDown = false;
let skyblockAutomationStarted = false;
let npcInteractionInProgress = false;
let visitInProgress = false;

let currentWindow = null;

let logs = [];
const MAX_LOGS = 200;

let lastChatMessage = "";
let lastServerMessage = "";

const requestState = {
  pending: false,
  type: null,
  from: null,
  detectedAt: null,
  lastAction: null
};

let lastNpcInteraction = 0;

const status = {
  online: false,
  connected: false,
  username: MC_USERNAME,
  host: MC_HOST,
  port: MC_PORT,
  version: MC_VERSION,

  authenticated: false,
  registering: false,
  loggedIn: false,

  skyblock: false,
  skyblockHub: false,
  npcFound: false,
  npcInteracted: false,

  visiting: false,

  position: null,
  dimension: null,
  gameMode: null,

  health: null,
  food: null,

  reconnecting: false,

  startedAt: null,
  lastError: null
};

/*
 * ============================================================
 * LOGGING
 * ============================================================
 */

function log(message, type = "system") {
  const entry = {
    time: new Date().toISOString(),
    type,
    message: String(message)
  };

  logs.push(entry);

  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  console.log(
    `[BOT] [${type.toUpperCase()}] ${message}`
  );
}

function logError(message) {
  log(message, "error");
  status.lastError = String(message);
}

function logChat(message) {
  log(message, "chat");
  lastChatMessage = String(message);
}

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function distanceSquared(a, b) {
  if (!a || !b) {
    return Infinity;
  }

  const ax = Number(a.x);
  const ay = Number(a.y);
  const az = Number(a.z);

  const bx = Number(b.x);
  const by = Number(b.y);
  const bz = Number(b.z);

  if (
    !Number.isFinite(ax) ||
    !Number.isFinite(ay) ||
    !Number.isFinite(az) ||
    !Number.isFinite(bx) ||
    !Number.isFinite(by) ||
    !Number.isFinite(bz)
  ) {
    return Infinity;
  }

  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;

  return (
    dx * dx +
    dy * dy +
    dz * dz
  );
}

function distance(a, b) {
  const value =
    distanceSquared(a, b);

  return Number.isFinite(value)
    ? Math.sqrt(value)
    : Infinity;
}

function safePosition(position) {
  if (!position) {
    return null;
  }

  return {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z)
  };
}

/*
 * ============================================================
 * DATABASE SETTINGS
 * ============================================================
 */

function getState() {
  try {
    return database.getState();
  } catch {
    return {};
  }
}

function getSettings() {
  const state = getState();

  return state.settings || {};
}

function getTarget() {
  const state = getState();

  return (
    state.target?.username ||
    TARGET_USERNAME
  );
}

function isRegistered() {
  try {
    return database.isRegistered();
  } catch {
    return false;
  }
}

function setRegistered(value) {
  try {
    database.setRegistered(Boolean(value));
  } catch (error) {
    logError(
      `Unable to save registration state: ${error.message}`
    );
  }
}

/*
 * ============================================================
 * GET BOT
 *
 * IMPORTANT:
 * This function must exist BEFORE module.exports.
 * ============================================================
 */

function getBot() {
  return bot;
}

/*
 * ============================================================
 * STATUS
 * ============================================================
 */

function getStatus() {
  const settings = getSettings();

  let position = null;

  if (bot?.entity?.position) {
    position =
      safePosition(bot.entity.position);
  } else if (bot?.position) {
    position =
      safePosition(bot.position);
  }

  const entities =
    getNearbyEntities(20);

  return {
    ...status,

    online:
      Boolean(bot) &&
      Boolean(bot.player) &&
      status.online,

    connected:
      Boolean(bot),

    username:
      bot?.username ||
      MC_USERNAME,

    host: MC_HOST,
    port: MC_PORT,
    version: MC_VERSION,

    position,

    dimension:
      bot?.game?.dimension ||
      bot?.dimension ||
      status.dimension ||
      null,

    gameMode:
      bot?.game?.gameMode ||
      bot?.game?.gamemode ||
      status.gameMode ||
      null,

    health:
      bot?.health ??
      status.health ??
      null,

    food:
      bot?.food ??
      status.food ??
      null,

    target: {
      username: getTarget()
    },

    settings,

    entityCount:
      entities.length,

    skyblockNpc: {
      ...SKYBLOCK_NPC
    },

    skyblockHubSpawn: {
      ...SKYBLOCK_HUB_SPAWN
    },

    lastChatMessage,
    lastServerMessage,

    request: getRequestState()
  };
}

function getLogs() {
  return [...logs];
}

/*
 * ============================================================
 * ENTITY HELPERS
 *
 * DO NOT use:
 *
 * entity.position.distanceToSquared()
 * entity.position.offset()
 *
 * Those caused your previous Railway crashes.
 * ============================================================
 */

function getNearbyEntities(radius = 20) {
  if (!bot) {
    return [];
  }

  const center =
    bot.entity?.position ||
    bot.position;

  if (!center) {
    return [];
  }

  const radiusSquared =
    Number(radius) *
    Number(radius);

  return Object.values(
    bot.entities || {}
  )
    .filter(entity => {
      if (!entity) {
        return false;
      }

      if (!entity.position) {
        return false;
      }

      return (
        distanceSquared(
          entity.position,
          center
        ) <= radiusSquared
      );
    })
    .map(entity => ({
      id: entity.id,

      type:
        entity.type ||
        "unknown",

      name:
        entity.name ||
        null,

      username:
        entity.username ||
        null,

      displayName:
        entity.displayName ||
        null,

      position:
        safePosition(entity.position),

      yaw:
        Number(entity.yaw || 0),

      pitch:
        Number(entity.pitch || 0),

      health:
        entity.health ??
        null
    }));
}

/*
 * ============================================================
 * FIND SKYBLOCK NPC
 * ============================================================
 */

function isPotentialSkyblockNpc(entity) {
  if (!entity) {
    return false;
  }

  /*
   * FakePixel exposes the clickable NPC as
   * type = player.
   *
   * Armor stands are normally holograms.
   */

  const type =
    String(entity.type || "")
      .toLowerCase();

  if (type !== "player") {
    return false;
  }

  if (!entity.position) {
    return false;
  }

  const distanceFromNpc =
    distance(
      entity.position,
      SKYBLOCK_NPC
    );

  if (
    distanceFromNpc >
    SKYBLOCK_NPC.radius
  ) {
    return false;
  }

  return true;
}

function findSkyblockNpc() {
  if (!bot) {
    return null;
  }

  const entities =
    Object.values(
      bot.entities || {}
    );

  const candidates =
    entities.filter(
      isPotentialSkyblockNpc
    );

  if (
    candidates.length === 0
  ) {
    return null;
  }

  /*
   * Prefer entities whose name looks
   * like FakePixel NPC names.
   */

  const named =
    candidates.find(entity => {
      const name =
        String(
          entity.username ||
          entity.name ||
          entity.displayName ||
          ""
        ).toLowerCase();

      return (
        name.includes("[npc]") ||
        name.includes("npc")
      );
    });

  if (named) {
    return named;
  }

  candidates.sort(
    (a, b) => {
      return (
        distanceSquared(
          a.position,
          SKYBLOCK_NPC
        ) -
        distanceSquared(
          b.position,
          SKYBLOCK_NPC
        )
      );
    }
  );

  return candidates[0];
}

function isAtSkyblockHubSpawn() {
  if (!bot?.entity?.position) return false;
  return distance(bot.entity.position, SKYBLOCK_HUB_SPAWN) <= SKYBLOCK_HUB_SPAWN.radius;
}

function triggerVisitAfterHub(reason = "hub position") {
  if (status.skyblockHub) return;
  status.skyblockHub = true;
  stopNpcSearch();
  log(`SkyBlock Hub confirmed by ${reason}. NPC search stopped.`, "skyblock");

  const settings = getSettings();
  if (settings.autoVisit === false) return;

  setTimeout(() => {
    if (!bot) return;
    startVisit(getTarget()).catch(error => {
      logError(`Visit failed: ${error.message}`);
    });
  }, 1000);
}

/*
 * ============================================================
 * STOP NPC SEARCH
 * ============================================================
 */

function stopNpcSearch() {
  if (npcSearchTimer) {
    clearInterval(
      npcSearchTimer
    );

    npcSearchTimer = null;
  }

  log(
    "SkyBlock NPC search stopped.",
    "system"
  );
}

/*
 * ============================================================
 * PATHFINDER MOVEMENT
 * ============================================================
 */

function setupPathfinder() {
  if (!bot) {
    return;
  }

  bot.loadPlugin(pathfinder);

  try {
    const mcData =
      require("minecraft-data")(
        bot.version ||
        MC_VERSION
      );

    const movements =
      new Movements(
        bot,
        mcData
      );

    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.allowParkour = true;
    movements.allowSprinting = true;
    movements.canOpenDoors = true;
    movements.canOpenTrapdoors = true;

    bot.pathfinder.setMovements(
      movements
    );
  } catch (error) {
    logError(
      `Pathfinder setup failed: ${error.message}`
    );
  }
}

async function moveTo(
  x,
  y,
  z,
  range = 2
) {
  if (!bot) {
    throw new Error(
      "Minecraft bot is not connected."
    );
  }

  if (!bot.pathfinder) {
    throw new Error(
      "Pathfinder is not ready."
    );
  }

  const targetX = Number(x);
  const targetY = Number(y);
  const targetZ = Number(z);
  const targetRange = Number(range);

  if (
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY) ||
    !Number.isFinite(targetZ)
  ) {
    throw new Error(
      "Invalid movement coordinates."
    );
  }

  const finalRange =
    Number.isFinite(targetRange) &&
    targetRange > 0
      ? targetRange
      : 2;

  log(
    `Moving to ${targetX.toFixed(3)}, ${targetY.toFixed(3)}, ${targetZ.toFixed(3)}`,
    "movement"
  );

  bot.pathfinder.setGoal(
    new GoalNear(
      targetX,
      targetY,
      targetZ,
      finalRange
    )
  );

  return true;
}

function stopMovement() {
  if (
    bot?.pathfinder
  ) {
    bot.pathfinder.setGoal(
      null
    );
  }

  log(
    "Movement stopped.",
    "movement"
  );
}

/*
 * ============================================================
 * LOOK
 * ============================================================
 */

async function lookAt(
  x,
  y,
  z
) {
  if (!bot) {
    throw new Error(
      "Minecraft bot is not connected."
    );
  }

  const position = {
    x: Number(x),
    y: Number(y),
    z: Number(z)
  };

  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new Error(
      "Invalid look coordinates."
    );
  }

  await bot.lookAt(
    new Vec3(position.x, position.y, position.z),
    true
  );

  return true;
}

/*
 * ============================================================
 * RIGHT CLICK NPC
 * ============================================================
 *
 * IMPORTANT:
 *
 * Use Mineflayer's activateEntity().
 *
 * Do NOT use:
 * minecraft.interactEntity()
 *
 * Do NOT use:
 * entity.position.offset()
 *
 * Do NOT use:
 * entity.position.distanceToSquared()
 * ============================================================
 */

async function rightClickNpc(npc) {
  if (!bot) throw new Error("Bot is not connected.");
  if (!npc || !npc.position) throw new Error("SkyBlock NPC was not found.");

  const now = Date.now();
  if (now - lastNpcInteraction < 1200) return false;
  lastNpcInteraction = now;

  const x = Number(npc.position.x);
  const y = Number(npc.position.y);
  const z = Number(npc.position.z);

  log(`Interacting with SkyBlock NPC ${npc.username || npc.name || "unknown"} at ${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}`, "npc");

  await selectHotbarSlot(3);
  await bot.lookAt(new Vec3(x, y + 1.0, z), true);
  await sleep(180);

  // Minecraft 1.8 use_entity: mouse=0 means interact/right-click.
  // Send this first so FakePixel receives the exact protocol interaction.
  if (bot._client && typeof bot._client.write === "function") {
    bot._client.write("use_entity", {
      target: Number(npc.id),
      mouse: 0
    });
    try { bot.swingArm("right"); } catch {}
    status.npcInteracted = true;
    log("SkyBlock NPC right-click packet sent.", "npc");
    return true;
  }

  // Fallback for Mineflayer versions without direct protocol access.
  if (typeof bot.activateEntity === "function") {
    const originalPosition = npc.position;
    try {
      npc.position = new Vec3(x, y, z);
      await bot.activateEntity(npc);
      try { bot.swingArm("right"); } catch {}
      status.npcInteracted = true;
      log("SkyBlock NPC right-click sent with activateEntity.", "npc");
      return true;
    } finally {
      npc.position = originalPosition;
    }
  }

  throw new Error("Minecraft entity interaction is unavailable.");
}
async function selectHotbarSlot(slotNumber = 3) {
  if (!bot) throw new Error("Bot is not connected.");
  const n = Math.max(1, Math.min(9, Number(slotNumber) || 3));
  const index = n - 1;
  if (typeof bot.setQuickBarSlot !== "function") {
    throw new Error("Hotbar selection is unavailable.");
  }
  bot.setQuickBarSlot(index);
  await sleep(100);
  log(`Selected hotbar slot ${n}.`, "inventory");
  return { ok: true, slot: n, index };
}

async function lookAtSkyblockNpc() {
  if (!bot) throw new Error("Bot is not connected.");
  let npc = findSkyblockNpc(7);
  if (!npc) {
    throw new Error("SkyBlock NPC is not currently visible.");
  }
  await bot.lookAt(
    new Vec3(Number(npc.position.x), Number(npc.position.y) + 1.0, Number(npc.position.z)),
    true
  );
  return true;
}

async function rotateLook(yawDegrees = 15, pitchDegrees = 0) {
  if (!bot || !bot.entity) throw new Error("Bot is not connected.");
  const yaw = Number(bot.entity.yaw || 0) + Number(yawDegrees) * Math.PI / 180;
  let pitch = Number(bot.entity.pitch || 0) + Number(pitchDegrees) * Math.PI / 180;
  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  if (typeof bot.look !== "function") throw new Error("Camera rotation is unavailable.");
  await bot.look(yaw, pitch, true);
  return { ok: true, yawDegrees: yaw * 180 / Math.PI, pitchDegrees: pitch * 180 / Math.PI };
}
/*
 * Right-click the known SkyBlock NPC without starting movement.
 * Used by the dashboard manual interaction button.
 */
async function rightClickSkyblockNpc() {
  if (!bot) throw new Error("Bot is not connected.");

  let npc = findSkyblockNpc(7);

  if (!npc) {
    const d = bot.entity?.position
      ? distance(bot.entity.position, SKYBLOCK_NPC)
      : Infinity;

    if (d > 5) {
      await moveTo(SKYBLOCK_NPC.x, SKYBLOCK_NPC.y, SKYBLOCK_NPC.z, 2);
      const timeout = Date.now() + 15000;
      while (bot && Date.now() < timeout) {
        npc = findSkyblockNpc(7);
        if (npc) break;
        await sleep(300);
      }
    }
  }

  if (!npc) {
    throw new Error("SkyBlock NPC is not currently visible. Move the bot near -25.257, 93, -1.490 first.");
  }

  return rightClickNpc(npc);
}

/*
 * ============================================================
 * SKYBLOCK NPC AUTOMATION
 * ============================================================
 */

async function goToSkyblockNpc() {
  if (!bot) {
    return;
  }

  // Do not require a chat-based SkyBlock flag here.
  // FakePixel may not send a predictable SkyBlock message, so the
  // NPC coordinate itself is the authoritative entry point.
  if (
    status.skyblockHub
  ) {
    return;
  }

  if (
    npcInteractionInProgress
  ) {
    return;
  }

  npcInteractionInProgress = true;

  try {
    stopNpcSearch();

    status.npcFound = false;

    log(
      "SkyBlock Hub NPC target: " +
      `${SKYBLOCK_NPC.x}, ` +
      `${SKYBLOCK_NPC.y}, ` +
      `${SKYBLOCK_NPC.z}`,
      "npc"
    );

    /*
     * First move to the known NPC location.
     */

    await moveTo(
      SKYBLOCK_NPC.x,
      SKYBLOCK_NPC.y,
      SKYBLOCK_NPC.z,
      4
    );

    /*
     * Wait until the bot is close.
     */

    const timeout =
      Date.now() + 20000;

    while (
      bot &&
      bot.entity?.position &&
      Date.now() < timeout
    ) {
      const d =
        distance(
          bot.entity.position,
          SKYBLOCK_NPC
        );

      if (d <= 3.0) {
        break;
      }

      await sleep(500);
    }

    if (!bot) {
      return;
    }

    /*
     * Find the actual player NPC
     * around the fixed coordinates.
     */

    let npc =
      findSkyblockNpc(7);

    if (!npc) {
      log(
        "No player-type NPC found at the fixed SkyBlock coordinates yet.",
        "npc"
      );

      /*
       * Give FakePixel a little time to
       * spawn the NPC entity.
       */

      for (
        let attempt = 0;
        attempt < 8;
        attempt++
      ) {
        await sleep(500);

        npc =
          findSkyblockNpc(7);

        if (npc) {
          break;
        }
      }
    }

    if (!npc) {
      throw new Error(
        "SkyBlock NPC entity was not found near -25.257, 93.0, -1.490."
      );
    }

    status.npcFound = true;

    log(
      `Found SkyBlock NPC: ` +
      `${npc.username || npc.name || "player"} ` +
      `at ${npc.position.x.toFixed(3)}, ` +
      `${npc.position.y.toFixed(3)}, ` +
      `${npc.position.z.toFixed(3)}`,
      "npc"
    );

    /*
     * Right-click the actual NPC.
     */

    const beforeInteraction = bot.entity?.position
      ? { x: Number(bot.entity.position.x), y: Number(bot.entity.position.y), z: Number(bot.entity.position.z) }
      : null;

    await rightClickNpc(npc);

    // The NPC interaction should send the bot into the SkyBlock Hub.
    // Prefer the exact user-supplied Hub spawn, but also accept a clear
    // server teleport/world move because FakePixel does not always place
    // the player on the exact decimal coordinate.
    log(`Waiting for SkyBlock Hub spawn near ${SKYBLOCK_HUB_SPAWN.x}, ${SKYBLOCK_HUB_SPAWN.y}, ${SKYBLOCK_HUB_SPAWN.z}...`, "skyblock");
    const hubTimeout = Date.now() + 20000;
    while (bot && Date.now() < hubTimeout) {
      if (isAtSkyblockHubSpawn()) {
        triggerVisitAfterHub("known hub spawn coordinates");
        break;
      }

      if (beforeInteraction && bot.entity?.position) {
        const moved = distance(bot.entity.position, beforeInteraction);
        const yMoved = Math.abs(Number(bot.entity.position.y) - beforeInteraction.y);
        if (moved >= 20 || yMoved >= 10) {
          triggerVisitAfterHub("server teleport after NPC interaction");
          break;
        }
      }

      await sleep(400);
    }

    if (!status.skyblockHub) {
      stopNpcSearch();
      log("NPC interaction sent, but Hub spawn was not confirmed yet. Use the Visit Target button after the server finishes teleporting.", "skyblock");
    }

  } catch (error) {
    logError(
      `SkyBlock NPC interaction failed: ${error.message}`
    );
  } finally {
    npcInteractionInProgress = false;
  }
}

/*
 * ============================================================
 * START NPC WATCHER
 * ============================================================
 */

function startNpcWatcher() {
  stopNpcSearch();

  if (!bot) {
    return;
  }

  if (
    status.skyblockHub
  ) {
    return;
  }

  log(
    "Watching for SkyBlock Hub NPC.",
    "npc"
  );

  /*
   * Try immediately.
   */

  goToSkyblockNpc();

  /*
   * Retry only while we have not
   * entered the hub.
   */

  npcSearchTimer =
    setInterval(() => {
      if (!bot) {
        stopNpcSearch();
        return;
      }

      if (
        status.skyblockHub
      ) {
        stopNpcSearch();
        return;
      }

      if (
        npcInteractionInProgress
      ) {
        return;
      }

      goToSkyblockNpc();

    }, 4000);
}

/*
 * ============================================================
 * VISIT PLAYER
 * ============================================================
 */

async function startVisit(
  username = getTarget()
) {
  if (!bot) {
    throw new Error(
      "Bot is not connected."
    );
  }

  if (visitInProgress) {
    return false;
  }

  visitInProgress = true;

  status.visiting = true;

  try {
    const target =
      String(username || getTarget())
        .trim();

    if (!target) {
      throw new Error(
        "Target username is empty."
      );
    }

    log(
      `Visiting ${target}...`,
      "visit"
    );

    /*
     * Required flow:
     *
     * /visit V_Mallu_Gamer
     *
     * No /warp is.
     */

    await command(
      `/visit ${target}`
    );

    return true;

  } finally {
    visitInProgress = false;
  }
}

/*
 * ============================================================
 * CHAT / COMMAND
 * ============================================================
 */

function chat(message) {
  if (!bot) {
    throw new Error(
      "Bot is not connected."
    );
  }

  const text =
    String(message || "").trim();

  if (!text) {
    throw new Error(
      "Message cannot be empty."
    );
  }

  bot.chat(text);

  log(
    `[CHAT] ${text}`,
    "chat"
  );

  return true;
}

function command(cmd) {
  if (!bot) {
    throw new Error(
      "Bot is not connected."
    );
  }

  let text =
    String(cmd || "").trim();

  if (!text) {
    throw new Error(
      "Command cannot be empty."
    );
  }

  if (!text.startsWith("/")) {
    text = `/${text}`;
  }

  bot.chat(text);

  log(
    `[COMMAND] ${text}`,
    "command"
  );

  return true;
}

function sendChat(message) {
  return chat(message);
}

function sendCommand(cmd) {
  return command(cmd);
}

/*
 * ============================================================
 * LOGIN / REGISTER
 * ============================================================
 */

function sendLoginCommand() {
  if (!bot) {
    return;
  }

  if (
    isRegistered()
  ) {
    log(
      "Saved registration found. Sending /login.",
      "auth"
    );

    command(
      `/login ${MC_PASSWORD}`
    );

    status.loggedIn = true;

    return;
  }

  status.registering = true;

  log(
    "First-time join detected. Sending /register.",
    "auth"
  );

  command(
    `/register ${MC_PASSWORD} ${MC_REGISTER_PASSWORD}`
  );

  setRegistered(true);

  status.registering = false;
  status.loggedIn = true;
}

function handleAuthChat(message) {
  const text =
    String(message || "")
      .toLowerCase();

  /*
   * Login required.
   */

  const loginRequired =
    text.includes("please login") ||
    text.includes("please log in") ||
    text.includes("/login") ||
    text.includes("you need to login") ||
    text.includes("already registered") ||
    text.includes("already exists");

  /*
   * Register required.
   */

  const registerRequired =
    text.includes("please register") ||
    text.includes("/register") ||
    text.includes("register yourself") ||
    text.includes("not registered");

  if (
    registerRequired &&
    !isRegistered()
  ) {
    log(
      "Server requested registration.",
      "auth"
    );

    try {
      status.registering = true;

      command(
        `/register ${MC_PASSWORD} ${MC_REGISTER_PASSWORD}`
      );

      setRegistered(true);

      status.registering = false;
      status.loggedIn = true;
    } catch (error) {
      logError(
        `Register failed: ${error.message}`
      );
    }

    return true;
  }

  if (
    loginRequired
  ) {
    log(
      "Server requested login.",
      "auth"
    );

    try {
      command(
        `/login ${MC_PASSWORD}`
      );

      status.loggedIn = true;
    } catch (error) {
      logError(
        `Login failed: ${error.message}`
      );
    }

    return true;
  }

  return false;
}

/*
 * ============================================================
 * REQUEST CHAT DETECTION
 * ============================================================
 */

function handleRequestChat(message) {
  const raw = String(message || "");
  const text = stripMinecraftFormatting(raw).toLowerCase();
  if (!text) return false;

  const trade =
    text.includes("trade request") ||
    text.includes("wants to trade") ||
    text.includes("invited you to trade") ||
    text.includes("has invited you to trade") ||
    text.includes("sent you a trade request");

  const coop =
    text.includes("co-op request") ||
    text.includes("coop request") ||
    text.includes("invited you to join their co-op") ||
    text.includes("invited you to join their coop") ||
    text.includes("wants you to join") && text.includes("co-op") ||
    text.includes("wants you to join") && text.includes("coop");

  if (trade) {
    markRequest("trade");
    return true;
  }

  if (coop) {
    markRequest("coop");
    return true;
  }

  return false;
}

/*
 * ============================================================
 * SKYBLOCK CHAT DETECTION
 * ============================================================
 */

function handleSkyblockChat(message) {
  const text =
    String(message || "")
      .toLowerCase();

  /*
   * FakePixel SkyBlock entry messages.
   */

  if (
    text.includes(
      "welcome to fakepixel skyblock"
    ) ||
    text.includes(
      "skyblock hub"
    ) ||
    text.includes(
      "skyblock"
    ) &&
    (
      text.includes("welcome") ||
      text.includes("joining") ||
      text.includes("entered")
    )
  ) {
    if (!status.skyblock) {
      status.skyblock = true;

      log(
        "FakePixel SkyBlock detected.",
        "skyblock"
      );

      startNpcWatcher();
    }
  }

  /*
   * Hub detection.
   *
   * The important part is that once
   * the bot is at the Hub NPC area,
   * NPC search is stopped.
   */

  if (text.includes("skyblock hub")) {
    triggerVisitAfterHub("server chat");
  }
}

/*
 * ============================================================
 * GUI / WINDOW
 * ============================================================
 */

function getCurrentWindow() {
  return currentWindow;
}

function stripMinecraftFormatting(value) {
  return String(value || "").replace(/§[0-9a-fk-or]/gi, "").replace(/\s+/g, " ").trim();
}

function collectNbtStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectNbtStrings(v, out);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k !== "Color" && k !== "color") out.push(k);
      collectNbtStrings(v, out);
    }
  }
  return out;
}

function itemText(item) {
  if (!item) return "";
  const values = [
    item.name,
    item.displayName,
    item.customName,
    item.nbt
  ];
  return stripMinecraftFormatting(collectNbtStrings(values).join(" ")).toLowerCase();
}

function getWindowItems(window) {
  return Array.isArray(window?.slots) ? window.slots : [];
}

function detectRequestType(window) {
  const title = stripMinecraftFormatting(window?.title || "").toLowerCase();
  const allText = getWindowItems(window).map(itemText).join(" ");

  if (
    title.includes("trade") ||
    allText.includes("click to accept the trade") ||
    allText.includes("accept the trade") ||
    allText.includes("deal!") ||
    allText.includes("deal")
  ) return "trade";

  if (
    title.includes("co-op") ||
    title.includes("coop") ||
    allText.includes("co-op") ||
    allText.includes("coop") ||
    allText.includes("accept invite") ||
    requestState.type === "coop"
  ) return "coop";

  return requestState.type || null;
}

function isAcceptItem(item, type = null) {
  const text = itemText(item);
  if (!text) return false;

  if (type === "trade") {
    return (
      text.includes("click to accept the trade") ||
      text.includes("accept the trade") ||
      text.includes("deal!") ||
      text.includes("deal") ||
      text.includes("confirm trade")
    );
  }

  if (type === "coop") {
    return (
      text.includes("accept invite") ||
      text.includes("accept co-op") ||
      text.includes("accept coop") ||
      text.includes("click to accept") ||
      text.includes("confirm") ||
      text.includes("accept") ||
      text.includes("yes")
    );
  }

  return (
    text.includes("click to accept the trade") ||
    text.includes("accept the trade") ||
    text.includes("deal!") ||
    text.includes("accept invite") ||
    text.includes("accept co-op") ||
    text.includes("accept coop")
  );
}

function getRequestState() {
  return { ...requestState };
}

function markRequest(type, from = null) {
  requestState.pending = true;
  requestState.type = type;
  requestState.from = from || null;
  requestState.detectedAt = new Date().toISOString();
  log(`${type === "trade" ? "Trade" : "Co-op"} request detected${from ? ` from ${from}` : ""}.`, "request");
}

function clearRequest(action = null) {
  requestState.pending = false;
  requestState.lastAction = action;
  requestState.type = null;
  requestState.from = null;
  requestState.detectedAt = null;
}

async function acceptCurrentRequest(requestType = null) {
  if (!bot) throw new Error("Bot is not connected.");

  const window = bot.currentWindow || currentWindow;
  if (!window) throw new Error("No open request/trade GUI.");

  const type = requestType || detectRequestType(window);
  const slots = getWindowItems(window);
  const candidates = [];

  for (let i = 0; i < slots.length; i++) {
    if (slots[i] && isAcceptItem(slots[i], type)) candidates.push(i);
  }

  if (!candidates.length) {
    throw new Error(`No ${type === "trade" ? "trade Deal/Accept" : type === "coop" ? "co-op Accept" : "Accept/Confirm"} button found in the current GUI.`);
  }

  // Prefer the first explicit accept/deal button.
  const slot = candidates[0];
  const label = itemText(slots[slot]).slice(0, 120);

  log(`Clicking ${type || "request"} acceptance slot ${slot}: ${label}`, "gui");
  await bot.clickWindow(slot, 0, 0);
  await sleep(350);

  requestState.lastAction = `clicked ${type || "request"} slot ${slot}`;

  // Trade GUIs can show a second Deal/Confirm screen. If it opens, the
  // windowOpen listener will process it again. Keep the pending state briefly.
  if (type === "coop") clearRequest("co-op accepted");
  else if (type === "trade") {
    requestState.pending = true;
    requestState.type = "trade";
  } else clearRequest("request accepted");

  return { ok: true, type, slot, label };
}

/*
 * ============================================================
 * INVENTORY
 * ============================================================
 */

function getInventoryState() {
  if (!bot) {
    return {
      connected: false,
      items: []
    };
  }

  const items =
    [];

  for (
    let slot = 0;
    slot < 45;
    slot++
  ) {
    const item =
      bot.inventory.slots?.[slot] ||
      null;

    if (!item) {
      items.push({
        slot,
        empty: true,
        name: null,
        displayName: null,
        count: 0,
        stackSize: 64,
        metadata: null,
        nbt: null
      });

      continue;
    }

    const stackSize =
      Number(
        item.stackSize ||
        64
      );

    items.push({
      slot,

      empty: false,

      name:
        item.name ||
        null,

      displayName:
        item.displayName ||
        item.name ||
        null,

      count:
        Number(item.count || 0),

      stackSize,

      metadata:
        item.metadata ??
        null,

      nbt:
        item.nbt ??
        null
    });
  }

  return {
    connected: true,
    items
  };
}

function findInventoryItem(
  name
) {
  if (!bot) {
    return null;
  }

  const search =
    String(name || "")
      .toLowerCase();

  return (
    bot.inventory.items()
      .find(item => {
        return (
          String(
            item.name || ""
          ).toLowerCase() ===
          search
        );
      }) ||
    null
  );
}

function findMysticalMushroomSoup() {
  if (!bot) {
    return null;
  }

  return (
    bot.inventory.items()
      .find(item => {
        const name =
          String(
            item.name ||
            ""
          ).toLowerCase();

        const display =
          String(
            item.displayName ||
            ""
          ).toLowerCase();

        return (
          name.includes(
            "mushroom_stew"
          ) ||
          name.includes(
            "mystical_mushroom_soup"
          ) ||
          display.includes(
            "mystical mushroom soup"
          )
        );
      }) ||
    null
  );
}

/*
 * ============================================================
 * SOUP
 * ============================================================
 */

function getSoupState() {
  const soup =
    findMysticalMushroomSoup();

  const state =
    getState();

  const settings =
    state.settings || {};

  return {
    found:
      Boolean(soup),

    available:
      Boolean(soup),

    count:
      soup
        ? Number(soup.count || 0)
        : 0,

    slot:
      soup
        ? Number(soup.slot)
        : null,

    name:
      soup?.name ||
      null,

    displayName:
      soup?.displayName ||
      null,

    autoSoup:
      Boolean(
        settings.autoSoup
      ),

    flightRequested:
      Boolean(
        settings.flightRequested
      ),

    flightActive:
      Boolean(
        settings.flightActive
      )
  };
}

async function consumeSoup() {
  if (!bot) {
    throw new Error(
      "Bot is not connected."
    );
  }

  const soup =
    findMysticalMushroomSoup();

  if (!soup) {
    throw new Error(
      "Mystical Mushroom Soup was not found in inventory."
    );
  }

  log(
    `Mystical Mushroom Soup found in slot ${soup.slot}.`,
    "soup"
  );

  try {
    await bot.equip(
      soup,
      "hand"
    );

    await sleep(250);

    bot.activateItem();

    await sleep(1000);

    bot.deactivateItem();

    log(
      "Mystical Mushroom Soup consumed.",
      "soup"
    );

    return true;

  } catch (error) {
    logError(
      `Soup consume failed: ${error.message}`
    );

    throw error;
  }
}

function setAutoSoup(
  enabled
) {
  const value =
    Boolean(enabled);

  try {
    database.setSoupAuto(
      value
    );
  } catch {
    try {
      database.update({
        settings: {
          autoSoup: value
        }
      });
    } catch {}
  }

  if (value) {
    startSoupWatcher();
  } else {
    stopSoupWatcher();
  }

  return value;
}

function startSoupWatcher() {
  stopSoupWatcher();

  soupTimer =
    setInterval(async () => {
      if (!bot) {
        return;
      }

      const settings =
        getSettings();

      if (
        !settings.autoSoup
      ) {
        return;
      }

      /*
       * Only consume when a soup
       * actually exists.
       */

      const soup =
        findMysticalMushroomSoup();

      if (!soup) {
        return;
      }

      /*
       * Avoid trying to consume
       * continuously.
       */

      try {
        await consumeSoup();
      } catch {}
    }, 10000);
}

function stopSoupWatcher() {
  if (soupTimer) {
    clearInterval(
      soupTimer
    );

    soupTimer = null;
  }
}

/*
 * ============================================================
 * FLIGHT STATE
 * ============================================================
 *
 * This does NOT bypass FakePixel's flight
 * permissions. It only tracks/request state.
 * ============================================================
 */

function setFlightRequested(
  enabled
) {
  const value =
    Boolean(enabled);

  try {
    database.setFlightState(
      value,
      getSettings().flightActive
    );
  } catch {
    try {
      database.update({
        settings: {
          flightRequested:
            value
        }
      });
    } catch {}
  }

  log(
    `Flight request ${value ? "enabled" : "disabled"}.`,
    "flight"
  );

  return value;
}

/*
 * ============================================================
 * ANTI AFK
 * ============================================================
 */

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearInterval(
      antiAfkTimer
    );

    antiAfkTimer = null;
  }
}

function startAntiAfk() {
  stopAntiAfk();

  if (!ANTI_AFK) {
    return;
  }

  antiAfkTimer =
    setInterval(() => {
      if (!bot) {
        return;
      }

      const settings =
        getSettings();

      if (
        settings.antiAfk === false
      ) {
        return;
      }

      try {
        /*
         * Small legitimate movement/look
         * to keep the client active.
         */

        const yaw =
          Number(
            bot.entity?.yaw || 0
          );

        bot.look(
          yaw + 0.15,
          Number(
            bot.entity?.pitch || 0
          ),
          true
        );

      } catch {}
    }, 30000);
}

/*
 * ============================================================
 * MINECRAFT STATE
 * ============================================================
 */

function getMinecraftState() {
  if (!bot) {
    return {
      connected: false
    };
  }

  return {
    connected: true,

    username:
      bot.username,

    position:
      safePosition(
        bot.entity?.position
      ),

    dimension:
      bot.game?.dimension ||
      null,

    gameMode:
      bot.game?.gameMode ||
      null,

    health:
      bot.health ??
      null,

    food:
      bot.food ??
      null,

    foodSaturation:
      bot.foodSaturation ??
      null,

    experience:
      bot.experience || null,

    heldItem:
      bot.heldItem
        ? {
            name:
              bot.heldItem.name,
            displayName:
              bot.heldItem.displayName,
            count:
              bot.heldItem.count
          }
        : null
  };
}

/*
 * ============================================================
 * WINDOWS
 * ============================================================
 */

function setupWindowListeners() {
  if (!bot) {
    return;
  }

  bot.on(
    "windowOpen",
    window => {
      currentWindow =
        window;

      log(
        `GUI opened: ${window.title || window.type || "unknown"}`,
        "gui"
      );

      handleRequestWindow(
        window
      ).catch(error => {
        logError(
          `GUI handler failed: ${error.message}`
        );
      });
    }
  );

  bot.on(
    "windowClose",
    window => {
      if (
        currentWindow ===
        window
      ) {
        currentWindow =
          null;
      }

      log(
        "GUI closed.",
        "gui"
      );
    }
  );
}

async function handleRequestWindow(window) {
  if (!window) return;

  const settings = getSettings();
  const type = detectRequestType(window);
  if (!type) return;

  const slots = getWindowItems(window);
  const hasAccept = slots.some(item => item && isAcceptItem(item, type));
  if (!hasAccept) return;

  requestState.pending = true;
  requestState.type = type;

  log(`${type === "trade" ? "Trade" : "Co-op"} acceptance GUI detected.`, "request");

  const enabled =
    type === "trade"
      ? settings.autoTradeAccept !== false
      : settings.autoCoopAccept !== false;

  if (!enabled) return;

  await sleep(500);

  try {
    await acceptCurrentRequest(type);
    log(`Automatic ${type} acceptance completed.`, "request");
  } catch (error) {
    logError(`Automatic ${type} acceptance failed: ${error.message}`);
  }
}

/*
 * ============================================================
 * BOT EVENTS
 * ============================================================
 */

function attachEvents(instance) {
  instance.on(
    "login",
    () => {
      status.online = true;
      status.connected = true;
      status.authenticated = false;
      status.startedAt =
        new Date().toISOString();

      log(
        `Minecraft connection established as ${instance.username}.`,
        "system"
      );

      /*
       * Mineflayer login event means
       * connection exists. FakePixel's
       * own /register or /login follows.
       */

      setTimeout(() => {
        if (!bot) {
          return;
        }

        sendLoginCommand();
      }, 1500);
    }
  );

  instance.on(
    "spawn",
    () => {
      status.online = true;
      status.connected = true;

      log(
        "Minecraft respawn detected.",
        "system"
      );

      setupPathfinder();

      // Keep the requested third hotbar slot selected for NPC interaction.
      try { selectHotbarSlot(3).catch(() => {}); } catch {}

      /*
       * Wait for server/world state.
       */

      setTimeout(() => {
        startAutomation();
      }, 1000);
    }
  );

  instance.on(
    "messagestr",
    message => {
      const text =
        String(message || "");

      lastServerMessage =
        text;

      logChat(text);

      handleAuthChat(
        text
      );

      handleRequestChat(
        text
      );

      handleSkyblockChat(
        text
      );

      /*
       * Detect successful FakePixel
       * authentication/login.
       */

      const lower =
        text.toLowerCase();

      if (
        lower.includes(
          "authentication completed"
        ) ||
        lower.includes(
          "successfully logged in"
        ) ||
        lower.includes(
          "login successful"
        )
      ) {
        status.authenticated =
          true;

        status.loggedIn =
          true;

        log(
          "FakePixel authentication completed.",
          "auth"
        );

        startAutomation();
      }

      /*
       * Server-side flight state.
       */

      if (
        lower.includes(
          "flight"
        ) &&
        (
          lower.includes("enabled") ||
          lower.includes("active") ||
          lower.includes("granted")
        )
      ) {
        try {
          database.setFlightState(
            getSettings().flightRequested,
            true
          );
        } catch {}
      }

      if (
        lower.includes(
          "flight"
        ) &&
        (
          lower.includes("disabled") ||
          lower.includes("removed")
        )
      ) {
        try {
          database.setFlightState(
            getSettings().flightRequested,
            false
          );
        } catch {}
      }
    }
  );

  instance.on(
    "chat",
    (username, message) => {
      logChat(
        `<${username}> ${message}`
      );

      handleAuthChat(
        message
      );

      handleRequestChat(
        message
      );

      handleSkyblockChat(
        message
      );
    }
  );

  instance.on(
    "health",
    () => {
      status.health =
        instance.health;

      status.food =
        instance.food;
    }
  );

  instance.on(
    "kicked",
    reason => {
      logError(
        `Bot kicked: ${String(reason)}`
      );

      status.online = false;
      status.connected = false;
    }
  );

  instance.on(
    "end",
    reason => {
      const isCurrent = bot === instance;

      log(
        `Minecraft connection ended: ${reason || "unknown"}`,
        "system"
      );

      if (!isCurrent) {
        log("Ignoring end event from an old Minecraft connection.", "system");
        return;
      }

      bot = null;
      status.online = false;
      status.connected = false;
      status.authenticated = false;
      currentWindow = null;

      stopNpcSearch();
      stopAntiAfk();

      if (!shuttingDown && RECONNECT_ENABLED) {
        scheduleReconnect();
      }
    }
  );

  instance.on(
    "error",
    error => {
      logError(
        `Minecraft error: ${error.message}`
      );
    }
  );

  instance.on(
    "entitySpawn",
    entity => {
      if (
        !status.skyblock ||
        status.skyblockHub
      ) {
        return;
      }

      if (
        isPotentialSkyblockNpc(
          entity
        )
      ) {
        log(
          `SkyBlock NPC entity spawned: ${entity.username || entity.name || "player"}`,
          "npc"
        );
      }
    }
  );
}

/*
 * ============================================================
 * AUTOMATION
 * ============================================================
 */

function startAutomation() {
  if (!bot) {
    return;
  }

  if (
    skyblockAutomationStarted
  ) {
    return;
  }

  skyblockAutomationStarted =
    true;

  log(
    "Starting SkyBlock automation...",
    "skyblock"
  );

  startAntiAfk();

  const settings =
    getSettings();

  if (
    settings.autoSoup
  ) {
    startSoupWatcher();
  }

  if (settings.autoSkyblock !== false) {
    /*
     * We do NOT send /skyblock.
     *
     * FakePixel automation waits for
     * the SkyBlock state/server response.
     */

    setTimeout(() => {
      if (bot && !status.skyblockHub) {
        // Start from the known FakePixel NPC coordinate even when the
        // server does not emit a useful "SkyBlock" chat message.
        startNpcWatcher();
      }
    }, 1500);

    // Once the server moves the bot to the known Hub spawn, immediately
    // stop NPC searching and run the requested /visit command.
    const hubCheck = setInterval(() => {
      if (!bot || status.skyblockHub) {
        clearInterval(hubCheck);
        return;
      }
      if (isAtSkyblockHubSpawn()) {
        triggerVisitAfterHub("live player position");
        clearInterval(hubCheck);
      }
    }, 1000);
  }
}

/*
 * ============================================================
 * CREATE BOT
 * ============================================================
 */

function createBot() {
  if (shuttingDown) {
    return null;
  }

  /*
   * Prevent duplicate bots.
   */

  if (bot) {
    log("Bot instance already exists; createBot() will not replace it.", "system");
    return bot;
  }

  skyblockAutomationStarted =
    false;

  npcInteractionInProgress =
    false;

  visitInProgress =
    false;

  status.online = false;
  status.connected = false;
  status.authenticated = false;
  status.loggedIn = false;
  status.skyblock = false;
  status.skyblockHub = false;
  status.npcFound = false;
  status.npcInteracted = false;
  status.visiting = false;
  status.lastError = null;

  stopNpcSearch();
  stopAntiAfk();

  log(
    `Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`,
    "system"
  );

  try {
    const instance =
      mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: MC_VERSION,

        /*
         * FakePixel password authentication
         * is handled by the server's
         * /register and /login commands.
         */

        auth: "offline",

        hideErrors: false
      });

    bot =
      instance;

    minecraft.setBot(
      instance
    );

    attachEvents(
      instance
    );

    setupWindowListeners();

    return instance;

  } catch (error) {
    logError(
      `Bot creation failed: ${error.message}`
    );

    bot = null;

    scheduleReconnect();

    return null;
  }
}

/*
 * ============================================================
 * DISCONNECT
 * ============================================================
 */

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer = null;
  }

  stopNpcSearch();
  stopAntiAfk();
  stopSoupWatcher();

  if (bot) {
    const oldBot = bot;
    bot = null;
    try {
      oldBot.quit("Dashboard disconnect");
    } catch {}
  }

  try {
    minecraft.setBot(
      null
    );
  } catch {}

  status.online = false;
  status.connected = false;

  log(
    "Bot disconnected.",
    "system"
  );
}

/*
 * ============================================================
 * RECONNECT
 * ============================================================
 */

function scheduleReconnect() {
  if (shuttingDown) {
    return;
  }

  if (!RECONNECT_ENABLED) {
    return;
  }

  if (reconnectTimer) {
    return;
  }

  status.reconnecting = true;

  log(
    `Reconnect scheduled in ${RECONNECT_DELAY} ms.`,
    "system"
  );

  reconnectTimer =
    setTimeout(() => {
      reconnectTimer = null;
      status.reconnecting = false;

      createBot();
    }, RECONNECT_DELAY);
}

/*
 * ============================================================
 * TARGET
 * ============================================================
 */

function setTargetUsername(
  username
) {
  const value =
    String(username || "")
      .trim();

  if (!value) {
    throw new Error(
      "Target username cannot be empty."
    );
  }

  try {
    database.update({
      target: {
        username: value
      }
    });
  } catch (error) {
    logError(
      `Unable to save target: ${error.message}`
    );

    throw error;
  }

  log(
    `Target username changed to ${value}.`,
    "system"
  );

  return value;
}

/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

function setSettings(
  updates
) {
  if (
    !updates ||
    typeof updates !== "object"
  ) {
    throw new Error(
      "Settings must be an object."
    );
  }

  const allowed = [
    "autoSkyblock",
    "autoVisit",
    "antiAfk",
    "autoSoup",
    "autoCoopAccept",
    "autoTradeAccept"
  ];

  const clean = {};

  for (
    const key of allowed
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        updates,
        key
      )
    ) {
      clean[key] =
        Boolean(updates[key]);
    }
  }

  try {
    database.update({
      settings: clean
    });
  } catch (error) {
    logError(
      `Unable to update settings: ${error.message}`
    );

    throw error;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      clean,
      "autoSoup"
    )
  ) {
    if (clean.autoSoup) {
      startSoupWatcher();
    } else {
      stopSoupWatcher();
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      clean,
      "antiAfk"
    )
  ) {
    if (clean.antiAfk) {
      startAntiAfk();
    } else {
      stopAntiAfk();
    }
  }

  return getSettings();
}

/*
 * ============================================================
 * INITIALIZE DATABASE
 * ============================================================
 */

try {
  database.getState();
} catch (error) {
  logError(
    `Database initialization failed: ${error.message}`
  );
}

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  /*
   * Bot
   */
  createBot,
  disconnect,
  getBot,

  /*
   * Status/logs
   */
  getStatus,
  getLogs,

  /*
   * Chat/commands
   */
  sendChat,
  sendCommand,

  /*
   * Movement
   */
  moveTo,
  stopMovement,
  lookAt,
  rotateLook,
  selectHotbarSlot,
  lookAtSkyblockNpc,

  /*
   * AI / visit
   */
  startVisit,
  goToSkyblockNpc,
  rightClickSkyblockNpc,

  /*
   * Entities/world
   */
  getEntities: getNearbyEntities,
  getMinecraftState,

  /*
   * GUI
   */
  getCurrentWindow,
  getRequestState,
  acceptCurrentRequest,

  /*
   * Inventory
   */
  getInventoryState,
  findInventoryItem,
  findMysticalMushroomSoup,

  /*
   * Soup
   */
  getSoupState,
  consumeSoup,
  setAutoSoup,

  /*
   * Flight
   */
  setFlightRequested,

  /*
   * Target/settings
   */
  setTargetUsername,
  setSettings,

  /*
   * Utility
   */
  getLastChatMessage: () =>
    lastChatMessage
};

/*
 * ============================================================
 * GRACEFUL SHUTDOWN
 * ============================================================
 */

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  log(
    "Shutting down Minecraft bot...",
    "system"
  );

  stopNpcSearch();
  stopAntiAfk();
  stopSoupWatcher();

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer = null;
  }

  if (bot) {
    try {
      bot.quit(
        "Application shutdown"
      );
    } catch {}
  }

  bot = null;

  try {
    minecraft.setBot(
      null
    );
  } catch {}
}

process.once(
  "SIGTERM",
  shutdown
);

process.once(
  "SIGINT",
  shutdown
);
