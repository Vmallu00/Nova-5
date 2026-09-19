"use strict";

const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalNear, GoalBlock } = goals;
const mcDataLoader = require("minecraft-data");
const Vec3 = require("vec3").Vec3;

let bot = null;
let defaultMovements = null;

function setBot(instance) {
  bot = instance;

  if (!bot) {
    defaultMovements = null;
    return;
  }

  try {
    bot.loadPlugin(pathfinder);

    const mcData = mcDataLoader(bot.version);

    defaultMovements = new Movements(bot, mcData);

    defaultMovements.canDig = true;
    defaultMovements.allow1by1towers = false;
    defaultMovements.allowParkour = true;
    defaultMovements.allowSprinting = true;

    bot.pathfinder.setMovements(defaultMovements);
  } catch (err) {
    console.error("[MINECRAFT] Movement setup failed:", err);
  }
}

function getBot() {
  return bot;
}

function isConnected() {
  return Boolean(
    bot &&
    bot.player &&
    bot.entity
  );
}

/* =========================================================
   CHAT
========================================================= */

function chat(message) {
  if (!isConnected()) {
    throw new Error("Minecraft bot is not connected.");
  }

  bot.chat(String(message));
}

function command(commandText) {
  if (!isConnected()) {
    throw new Error("Minecraft bot is not connected.");
  }

  let command = String(commandText).trim();

  if (!command) {
    throw new Error("Command is empty.");
  }

  if (!command.startsWith("/")) {
    command = "/" + command;
  }

  bot.chat(command);
}

/* =========================================================
   POSITION
========================================================= */

function getPosition() {
  if (!isConnected() || !bot.entity?.position) {
    return null;
  }

  return {
    x: Number(bot.entity.position.x),
    y: Number(bot.entity.position.y),
    z: Number(bot.entity.position.z)
  };
}

function distanceTo(x, y, z) {
  const position = getPosition();

  if (!position) {
    return Infinity;
  }

  const dx = position.x - Number(x);
  const dy = position.y - Number(y);
  const dz = position.z - Number(z);

  return Math.sqrt(
    dx * dx +
    dy * dy +
    dz * dz
  );
}

/* =========================================================
   MOVEMENT
========================================================= */

async function moveTo(x, y, z, range = 1.5) {
  if (!isConnected()) {
    throw new Error("Minecraft bot is not connected.");
  }

  x = Number(x);
  y = Number(y);
  z = Number(z);
  range = Number(range);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    throw new Error("Invalid movement coordinates.");
  }

  if (
    !Number.isFinite(range) ||
    range <= 0
  ) {
    range = 1.5;
  }

  if (!bot.pathfinder) {
    throw new Error("Pathfinder is not available.");
  }

  if (defaultMovements) {
    bot.pathfinder.setMovements(defaultMovements);
  }

  const target = new Vec3(x, y, z);

  console.log(
    `[MINECRAFT] Moving to ${x}, ${y}, ${z}`
  );

  bot.pathfinder.setGoal(
    new GoalNear(
      target.x,
      target.y,
      target.z,
      range
    )
  );

  return {
    ok: true,
    x,
    y,
    z,
    range
  };
}

function stopMovement() {
  if (!bot?.pathfinder) {
    return;
  }

  bot.pathfinder.setGoal(null);

  try {
    bot.clearControlStates();
  } catch {}
}

/* =========================================================
   LOOK
========================================================= */

async function lookAt(x, y, z) {
  if (!isConnected()) {
    throw new Error("Minecraft bot is not connected.");
  }

  x = Number(x);
  y = Number(y);
  z = Number(z);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    throw new Error("Invalid look coordinates.");
  }

  const target = new Vec3(x, y, z);

  await bot.lookAt(
    target,
    true
  );

  return {
    ok: true,
    x,
    y,
    z
  };
}

/* =========================================================
   EXACT SKYBLOCK NPC
========================================================= */

const SKYBLOCK_NPC = {
  x: -25.257,
  y: 93,
  z: -1.490
};

function getSkyblockNpcCoordinates() {
  return {
    ...SKYBLOCK_NPC
  };
}

function findEntityNear(
  x,
  y,
  z,
  radius = 4
) {
  if (!isConnected()) {
    return null;
  }

  const entities = Object.values(
    bot.entities || {}
  );

  let closest = null;
  let closestDistance = Infinity;

  for (const entity of entities) {
    if (!entity || !entity.position) {
      continue;
    }

    const dx =
      Number(entity.position.x) - Number(x);

    const dy =
      Number(entity.position.y) - Number(y);

    const dz =
      Number(entity.position.z) - Number(z);

    const distance = Math.sqrt(
      dx * dx +
      dy * dy +
      dz * dz
    );

    if (
      distance <= radius &&
      distance < closestDistance
    ) {
      closest = entity;
      closestDistance = distance;
    }
  }

  return closest;
}

/*
 * Find the actual Mineflayer entity.
 *
 * IMPORTANT:
 * Do not convert this entity into a plain
 * {x,y,z} object before interacting with it.
 */
function findSkyblockNpc(radius = 5) {
  if (!isConnected()) {
    return null;
  }

  const entities = Object.values(
    bot.entities || {}
  );

  let closest = null;
  let closestDistance = Infinity;

  for (const entity of entities) {
    if (!entity || !entity.position) {
      continue;
    }

    const name = String(
      entity.username ||
      entity.displayName ||
      entity.name ||
      entity.type ||
      ""
    ).toLowerCase();

    const dx =
      entity.position.x -
      SKYBLOCK_NPC.x;

    const dy =
      entity.position.y -
      SKYBLOCK_NPC.y;

    const dz =
      entity.position.z -
      SKYBLOCK_NPC.z;

    const distance = Math.sqrt(
      dx * dx +
      dy * dy +
      dz * dz
    );

    if (distance > radius) {
      continue;
    }

    /*
     * FakePixel NPCs can sometimes appear as
     * generic player entities, so coordinates
     * are the primary detection method.
     */
    const looksLikePlayer =
      entity.type === "player" ||
      Boolean(entity.username);

    const looksRelevant =
      name.includes("skyblock") ||
      name.includes("npc") ||
      name.includes("player");

    if (
      looksLikePlayer ||
      looksRelevant ||
      distance <= 2.5
    ) {
      if (distance < closestDistance) {
        closest = entity;
        closestDistance = distance;
      }
    }
  }

  return closest;
}

/* =========================================================
   RIGHT CLICK / NPC INTERACTION
========================================================= */

async function interactEntity(entity) {
  if (!isConnected()) throw new Error("Minecraft bot is not connected.");
  if (!entity || !entity.position) throw new Error("NPC entity was not found.");

  const x = Number(entity.position.x);
  const y = Number(entity.position.y);
  const z = Number(entity.position.z);
  const originalPosition = entity.position;

  try {
    bot.setQuickBarSlot(2); // hotbar slot 3
    await bot.lookAt(new Vec3(x, y + 1, z), true);
    await new Promise(r => setTimeout(r, 150));

    entity.position = new Vec3(x, y, z);
    if (typeof bot.activateEntity === "function") {
      await bot.activateEntity(entity);
      try { bot.swingArm("right"); } catch {}
      return { ok: true, method: "activateEntity", hotbarSlot: 3 };
    }
  } catch (err) {
    console.log("[MINECRAFT] activateEntity fallback:", err.message);
  } finally {
    entity.position = originalPosition;
  }

  if (typeof bot._client?.write === "function") {
    bot._client.write("use_entity", { target: Number(entity.id), mouse: 0 });
    try { bot.swingArm("right"); } catch {}
    return { ok: true, method: "use_entity", hotbarSlot: 3 };
  }

  throw new Error("Entity interaction is unavailable.");
}

function selectHotbarSlot(slotNumber = 3) {
  if (!isConnected()) throw new Error("Minecraft bot is not connected.");
  const n = Math.max(1, Math.min(9, Number(slotNumber) || 3));
  bot.setQuickBarSlot(n - 1);
  return { ok: true, slot: n };
}

async function rotateLook(yawDegrees = 15, pitchDegrees = 0) {
  if (!isConnected()) throw new Error("Minecraft bot is not connected.");
  const yaw = Number(bot.entity.yaw || 0) + Number(yawDegrees) * Math.PI / 180;
  let pitch = Number(bot.entity.pitch || 0) + Number(pitchDegrees) * Math.PI / 180;
  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  await bot.look(yaw, pitch, true);
  return { ok: true };
}
/*
 * Walk directly to the known SkyBlock NPC,
 * then right-click it.
 */
async function goToSkyblockNpc() {
  if (!isConnected()) {
    throw new Error("Minecraft bot is not connected.");
  }

  const npc = SKYBLOCK_NPC;

  console.log(
    `[MINECRAFT] SkyBlock NPC target: ${npc.x}, ${npc.y}, ${npc.z}`
  );

  await moveTo(
    npc.x,
    npc.y,
    npc.z,
    2.0
  );

  /*
   * Wait for pathfinder to get reasonably close.
   */
  const started = Date.now();

  while (
    Date.now() - started < 15000
  ) {
    const distance =
      distanceTo(
        npc.x,
        npc.y,
        npc.z
      );

    if (distance <= 3.0) {
      break;
    }

    await new Promise(
      resolve => setTimeout(resolve, 250)
    );
  }

  stopMovement();

  const distance =
    distanceTo(
      npc.x,
      npc.y,
      npc.z
    );

  console.log(
    `[MINECRAFT] NPC distance: ${distance.toFixed(2)}`
  );

  /*
   * Search for the actual entity after walking.
   */
  const entity =
    findSkyblockNpc(5);

  if (!entity) {
    throw new Error(
      "SkyBlock NPC entity was not found near the known coordinates."
    );
  }

  await interactEntity(entity);

  return {
    ok: true,
    entityId: entity.id,
    position: {
      x: Number(entity.position.x),
      y: Number(entity.position.y),
      z: Number(entity.position.z)
    }
  };
}

/* =========================================================
   ENTITIES
========================================================= */

function getNearbyEntities(radius = 20) {
  if (!isConnected()) {
    return [];
  }

  radius = Number(radius);

  if (
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    radius = 20;
  }

  const botPosition =
    bot.entity.position;

  return Object.values(
    bot.entities || {}
  )
    .filter(entity => {
      if (
        !entity ||
        !entity.position
      ) {
        return false;
      }

      const dx =
        entity.position.x -
        botPosition.x;

      const dy =
        entity.position.y -
        botPosition.y;

      const dz =
        entity.position.z -
        botPosition.z;

      const distanceSquared =
        dx * dx +
        dy * dy +
        dz * dz;

      return (
        distanceSquared <=
        radius * radius
      );
    })
    .map(entity => ({
      id: entity.id,

      type:
        entity.type ||
        "unknown",

      username:
        entity.username ||
        null,

      displayName:
        entity.displayName ||
        null,

      name:
        entity.name ||
        null,

      position: {
        x: Number(entity.position.x),
        y: Number(entity.position.y),
        z: Number(entity.position.z)
      },

      yaw:
        Number(entity.yaw || 0),

      pitch:
        Number(entity.pitch || 0),

      distance:
        Math.sqrt(
          Math.pow(
            entity.position.x -
            botPosition.x,
            2
          ) +
          Math.pow(
            entity.position.y -
            botPosition.y,
            2
          ) +
          Math.pow(
            entity.position.z -
            botPosition.z,
            2
          )
        )
    }))
    .sort(
      (a, b) =>
        a.distance -
        b.distance
    );
}

/* =========================================================
   INVENTORY
========================================================= */

function getInventory() {
  if (!isConnected()) {
    return [];
  }

  const inventory =
    bot.inventory;

  if (!inventory) {
    return [];
  }

  const items = [];

  for (
    let slot = 0;
    slot < inventory.inventoryStart;
    slot++
  ) {
    const item =
      inventory.slots?.[slot];

    if (!item) {
      items.push({
        slot,
        empty: true,
        name: null,
        displayName: null,
        count: 0,
        stackSize: 64
      });

      continue;
    }

    items.push({
      slot,
      empty: false,
      name:
        item.name ||
        "unknown",

      displayName:
        item.displayName ||
        item.name ||
        "unknown",

      count:
        Number(item.count || 0),

      stackSize:
        Number(
          item.stackSize ||
          64
        ),

      metadata:
        item.metadata ?? null,

      nbt:
        item.nbt ?? null
    });
  }

  return items;
}

function findInventoryItem(name) {
  if (!isConnected()) {
    return null;
  }

  const wanted =
    String(name).toLowerCase();

  return (
    bot.inventory.items()
      .find(item =>
        String(
          item.name ||
          item.displayName ||
          ""
        )
          .toLowerCase()
          .includes(wanted)
      ) || null
  );
}

function findMysticalMushroomSoup() {
  if (!isConnected()) {
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
          name.includes("mushroom") &&
          name.includes("soup")
        ) ||
        display.includes(
          "mystical mushroom soup"
        );
      }) || null
  );
}

async function equipItem(item) {
  if (!isConnected()) {
    throw new Error("Bot is offline.");
  }

  if (!item) {
    throw new Error("Item not found.");
  }

  await bot.equip(
    item,
    "hand"
  );
}

async function consumeSoup() {
  const soup =
    findMysticalMushroomSoup();

  if (!soup) {
    throw new Error(
      "Mystical Mushroom Soup was not found in inventory."
    );
  }

  await equipItem(soup);

  await bot.activateItem();

  await new Promise(
    resolve => setTimeout(resolve, 1200)
  );

  try {
    bot.deactivateItem();
  } catch {}

  return {
    ok: true,
    item: soup.name,
    count: soup.count
  };
}

/* =========================================================
   FLIGHT
========================================================= */

function setFlightRequested(enabled) {
  /*
   * Do not spoof Minecraft flight permissions.
   * This only records the dashboard request.
   */
  return Boolean(enabled);
}

/* =========================================================
   STATE
========================================================= */

function getState() {
  if (!isConnected()) {
    return {
      connected: false,
      position: null,
      username: null,
      health: null,
      food: null,
      dimension: null
    };
  }

  return {
    connected: true,

    username:
      bot.username || null,

    position:
      getPosition(),

    health:
      Number(bot.health ?? 0),

    food:
      Number(bot.food ?? 0),

    foodSaturation:
      Number(
        bot.foodSaturation ?? 0
      ),

    dimension:
      bot.game?.dimension ||
      bot.world?.dimension ||
      null,

    gameMode:
      bot.game?.gameMode ||
      null
  };
}

module.exports = {
  setBot,
  getBot,
  isConnected,

  chat,
  command,

  getPosition,
  distanceTo,

  moveTo,
  stopMovement,
  lookAt,

  SKYBLOCK_NPC,
  getSkyblockNpcCoordinates,
  findSkyblockNpc,
  goToSkyblockNpc,
  interactEntity,

  getNearbyEntities,

  getInventory,
  findInventoryItem,
  findMysticalMushroomSoup,
  equipItem,
  consumeSoup,

  setFlightRequested,

  getState
};
