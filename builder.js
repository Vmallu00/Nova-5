require("dotenv").config();

const fs = require("fs");
const path = require("path");
const nbt = require("prismarine-nbt");
const { Vec3 } = require("vec3");
const {
  goals,
  Movements
} = require("mineflayer-pathfinder");

const database = require("./database");
const minecraft = require("./minecraft");

const SCHEMATICS_DIR =
  process.env.SCHEMATICS_DIR ||
  path.join(
    process.env.DATA_DIR || "./data",
    "schematics"
  );

fs.mkdirSync(SCHEMATICS_DIR, {
  recursive: true
});

let bot = null;

let buildQueue = [];
let buildIndex = 0;

let buildLoop = null;
let busy = false;

let currentSchematic = null;
let currentBlocks = [];
const retryCounts = new Map();

const MAX_SCHEMATIC_SIZE = 100 * 1024 * 1024;

function setBot(instance) {
  bot = instance || null;
}

function getBot() {
  return bot;
}

function addLog(message) {
  console.log(`[BUILDER] ${message}`);
}

function safeFilename(filename) {
  const base = path.basename(
    String(filename || "")
  );

  if (
    !base ||
    base.includes("\0")
  ) {
    throw new Error(
      "Invalid schematic filename."
    );
  }

  if (
    !/\.schem$|\.schematic$/i.test(base)
  ) {
    throw new Error(
      "Only .schem and .schematic files are supported."
    );
  }

  return base;
}

function listSchematics() {
  fs.mkdirSync(SCHEMATICS_DIR, {
    recursive: true
  });

  return fs
    .readdirSync(SCHEMATICS_DIR)
    .filter(
      (file) =>
        /\.schem$|\.schematic$/i.test(
          file
        )
    )
    .map((file) => {
      const fullPath = path.join(
        SCHEMATICS_DIR,
        file
      );

      let stat = null;

      try {
        stat = fs.statSync(fullPath);
      } catch {}

      return {
        name: file,
        size: stat?.size || 0,
        modified:
          stat?.mtime?.toISOString() ||
          null
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}

function deleteSchematic(filename) {
  const safe = safeFilename(
    filename
  );

  const fullPath = path.join(
    SCHEMATICS_DIR,
    safe
  );

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      "Schematic does not exist."
    );
  }

  fs.unlinkSync(fullPath);

  addLog(
    `Deleted schematic ${safe}.`
  );

  return true;
}

function saveSchematic(
  filename,
  buffer
) {
  const safe = safeFilename(
    filename
  );

  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      "Schematic upload must be binary data."
    );
  }

  if (buffer.length === 0) {
    throw new Error(
      "Uploaded schematic is empty."
    );
  }

  if (
    buffer.length >
    MAX_SCHEMATIC_SIZE
  ) {
    throw new Error(
      "Schematic is larger than 100 MB."
    );
  }

  const fullPath = path.join(
    SCHEMATICS_DIR,
    safe
  );

  fs.writeFileSync(
    fullPath,
    buffer
  );

  addLog(
    `Saved schematic ${safe}.`
  );

  return {
    name: safe,
    size: buffer.length
  };
}

function resolveSchematic(filename) {
  const safe = safeFilename(
    filename
  );

  const fullPath = path.join(
    SCHEMATICS_DIR,
    safe
  );

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Schematic "${safe}" was not found.`
    );
  }

  return {
    name: safe,
    path: fullPath
  };
}

function readNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getNbtValue(value) {
  if (
    value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(
      value,
      "value"
    )
  ) {
    return value.value;
  }

  return value;
}

function getCompoundValue(
  compound,
  key,
  fallback = undefined
) {
  if (!compound) {
    return fallback;
  }

  const value =
    compound[key];

  if (value === undefined) {
    return fallback;
  }

  return getNbtValue(value);
}

function parseSpongeSchematic(root) {
  const width = readNumber(
    getCompoundValue(
      root,
      "Width",
      0
    )
  );

  const height = readNumber(
    getCompoundValue(
      root,
      "Height",
      0
    )
  );

  const length = readNumber(
    getCompoundValue(
      root,
      "Length",
      0
    )
  );

  if (
    width <= 0 ||
    height <= 0 ||
    length <= 0
  ) {
    throw new Error(
      "Invalid Sponge schematic dimensions."
    );
  }

  const paletteRaw =
    getCompoundValue(
      root,
      "Palette",
      {}
    );

  const palette = {};

  for (const [name, value] of Object.entries(
    paletteRaw || {}
  )) {
    palette[
      readNumber(
        getNbtValue(value),
        -1
      )
    ] = name;
  }

  const blockData =
    getCompoundValue(
      root,
      "BlockData",
      null
    );

  if (!blockData) {
    throw new Error(
      "Schematic has no BlockData."
    );
  }

  const bytes = Buffer.from(
    Array.isArray(blockData)
      ? blockData
      : blockData.value || blockData
  );

  const blockIds =
    decodeVarInts(bytes);

  const blocks = [];

  /*
   * Sponge schematic linear order:
   * x + width * (z + length * y)
   */
  let index = 0;

  for (
    let y = 0;
    y < height;
    y++
  ) {
    for (
      let z = 0;
      z < length;
      z++
    ) {
      for (
        let x = 0;
        x < width;
        x++
      ) {
        const paletteId =
          blockIds[index++];

        if (
          paletteId === undefined
        ) {
          continue;
        }

        const blockName =
          palette[paletteId];

        if (!blockName) {
          continue;
        }

        if (
          blockName ===
            "minecraft:air" ||
          blockName === "air"
        ) {
          continue;
        }

        blocks.push({
          x,
          y,
          z,
          block: normalizeBlockName(blockName),
          blockState: blockName,
          meta: stateMetadata(blockName)
        });
      }
    }
  }

  return {
    format: "sponge",
    width,
    height,
    length,
    blocks
  };
}

function decodeVarInts(buffer) {
  const values = [];

  let value = 0;
  let shift = 0;

  for (
    let i = 0;
    i < buffer.length;
    i++
  ) {
    const byte = buffer[i];

    value |=
      (byte & 0x7f) << shift;

    if (
      (byte & 0x80) === 0
    ) {
      values.push(
        value >>> 0
      );

      value = 0;
      shift = 0;
    } else {
      shift += 7;

      if (shift > 35) {
        throw new Error(
          "Invalid schematic VarInt data."
        );
      }
    }
  }

  return values;
}

function parseLegacySchematic(root) {
  const width = readNumber(
    getCompoundValue(
      root,
      "Width",
      0
    )
  );

  const height = readNumber(
    getCompoundValue(
      root,
      "Height",
      0
    )
  );

  const length = readNumber(
    getCompoundValue(
      root,
      "Length",
      0
    )
  );

  if (
    width <= 0 ||
    height <= 0 ||
    length <= 0
  ) {
    throw new Error(
      "Invalid legacy schematic dimensions."
    );
  }

  const blocksRaw =
    getCompoundValue(
      root,
      "Blocks",
      null
    );

  const dataRaw =
    getCompoundValue(
      root,
      "Data",
      null
    );

  if (!blocksRaw) {
    throw new Error(
      "Legacy schematic has no Blocks data."
    );
  }

  const blocksData =
    Buffer.from(
      Array.isArray(blocksRaw)
        ? blocksRaw
        : blocksRaw.value ||
            blocksRaw
    );

  const metadata =
    dataRaw
      ? Buffer.from(
          Array.isArray(dataRaw)
            ? dataRaw
            : dataRaw.value ||
                dataRaw
        )
      : Buffer.alloc(
          blocksData.length
        );

  const blocks = [];

  /*
   * Legacy .schematic uses:
   * x + width * (z + length * y)
   */
  let index = 0;

  for (
    let y = 0;
    y < height;
    y++
  ) {
    for (
      let z = 0;
      z < length;
      z++
    ) {
      for (
        let x = 0;
        x < width;
        x++
      ) {
        const id =
          blocksData[index] || 0;

        const meta =
          metadata[index] || 0;

        index++;

        if (id === 0) {
          continue;
        }

        const blockName =
          legacyBlockName(
            id,
            meta
          );

        if (!blockName) {
          continue;
        }

        blocks.push({
          x,
          y,
          z,
          block: blockName,
          meta
        });
      }
    }
  }

  return {
    format: "legacy",
    width,
    height,
    length,
    blocks
  };
}

function normalizeBlockName(name) {
  let value = String(name || "").trim().toLowerCase();
  if (value.startsWith("minecraft:")) value = value.slice(10);
  value = value.split("[")[0];

  // Common modern names used by Sponge schematics that target a 1.8/1.8.9 server.
  const aliases = {
    oak_planks: "planks", spruce_planks: "planks", birch_planks: "planks", jungle_planks: "planks", acacia_planks: "planks", dark_oak_planks: "planks",
    oak_log: "log", spruce_log: "log", birch_log: "log", jungle_log: "log", acacia_log: "log2", dark_oak_log: "log2",
    oak_leaves: "leaves", spruce_leaves: "leaves", birch_leaves: "leaves", jungle_leaves: "leaves", acacia_leaves: "leaves2", dark_oak_leaves: "leaves2",
    white_wool: "wool", orange_wool: "wool", magenta_wool: "wool", light_blue_wool: "wool", yellow_wool: "wool", lime_wool: "wool", pink_wool: "wool", gray_wool: "wool",
    light_gray_wool: "wool", cyan_wool: "wool", purple_wool: "wool", blue_wool: "wool", brown_wool: "wool", green_wool: "wool", red_wool: "wool", black_wool: "wool",
    oak_slab: "wooden_slab", stone_slab: "stone_slab", oak_stairs: "oak_stairs",
    red_sand: "sandstone", red_sandstone: "red_sandstone",
    white_stained_glass: "stained_glass", orange_stained_glass: "stained_glass", magenta_stained_glass: "stained_glass",
    white_stained_hardened_clay: "stained_hardened_clay",
    smooth_stone: "stone", smooth_sandstone: "sandstone"
  };
  return aliases[value] || value;
}

function stateMetadata(blockName) {
  const raw = String(blockName || "").toLowerCase();
  const match = raw.match(/\[([^\]]+)\]/);
  if (!match) return undefined;
  const state = match[1];
  const variant = (state.match(/(?:variant|color|axis)=([^,]+)/) || [])[1];
  if (!variant) return undefined;
  const maps = {
    white: 0, orange: 1, magenta: 2, light_blue: 3, yellow: 4, lime: 5, pink: 6, gray: 7, light_gray: 8, cyan: 9, purple: 10, blue: 11, brown: 12, green: 13, red: 14, black: 15,
    granite: 1, polished_granite: 2, diorite: 3, polished_diorite: 4, andesite: 5, polished_andesite: 6,
    oak: 0, spruce: 1, birch: 2, jungle: 3, acacia: 0, dark_oak: 1
  };
  return maps[variant];
}

/*
 * Common legacy ID mapping.
 *
 * Unknown IDs are skipped instead of placing
 * an incorrect block.
 */
function legacyBlockName(
  id,
  meta
) {
  const map = {
    1: "stone",
    2: "grass",
    3: "dirt",
    4: "cobblestone",
    5: "planks",
    7: "bedrock",
    12: "sand",
    13: "gravel",
    14: "gold_ore",
    15: "iron_ore",
    16: "coal_ore",
    17: "log",
    18: "leaves",
    20: "glass",
    21: "lapis_ore",
    22: "lapis_block",
    24: "sandstone",
    35: "wool",
    41: "gold_block",
    42: "iron_block",
    43: "double_stone_slab",
    44: "stone_slab",
    45: "brick_block",
    46: "tnt",
    47: "bookshelf",
    48: "mossy_cobblestone",
    49: "obsidian",
    50: "torch",
    56: "diamond_ore",
    57: "diamond_block",
    58: "crafting_table",
    61: "furnace",
    62: "lit_furnace",
    67: "stone_stairs",
    73: "redstone_ore",
    74: "lit_redstone_ore",
    79: "ice",
    80: "snow",
    82: "clay",
    84: "jukebox",
    86: "pumpkin",
    87: "netherrack",
    88: "soul_sand",
    89: "glowstone",
    91: "lit_pumpkin",
    98: "stonebrick",
    103: "melon_block",
    110: "mycelium",
    112: "nether_brick",
    121: "end_stone",
    123: "redstone_lamp",
    124: "lit_redstone_lamp",
    129: "emerald_ore",
    133: "emerald_block",
    152: "redstone_block",
    155: "quartz_block",
    159: "stained_hardened_clay",
    162: "log2",
    168: "prismarine",
    169: "sea_lantern",
    172: "hardened_clay",
    174: "packed_ice",
    179: "red_sandstone",
    201: "purpur_block",
    202: "purpur_pillar",
    206: "end_bricks"
  };

  return map[id] || null;
}

async function loadSchematic(
  filename
) {
  const file =
    resolveSchematic(filename);

  const buffer =
    fs.readFileSync(
      file.path
    );

  if (
    buffer.length === 0
  ) {
    throw new Error(
      "Schematic file is empty."
    );
  }

  let parsed;

  try {
    parsed =
      await nbt.parse(buffer);
  } catch (error) {
    throw new Error(
      `Could not parse schematic NBT: ${error.message}`
    );
  }

  const root =
    parsed?.parsed?.value ||
    parsed?.parsed ||
    parsed?.value ||
    parsed;

  if (!root) {
    throw new Error(
      "Invalid schematic NBT."
    );
  }

  const hasPalette =
    Boolean(
      root.Palette
    );

  const schematic =
    hasPalette
      ? parseSpongeSchematic(root)
      : parseLegacySchematic(root);

  currentSchematic = {
    ...schematic,
    name: file.name
  };

  currentBlocks =
    schematic.blocks;

  addLog(
    `Loaded ${file.name}: ${schematic.width}x${schematic.height}x${schematic.length}, ${schematic.blocks.length} blocks.`
  );

  return currentSchematic;
}

function rotateBlockEntry(entry, rotation, width, length) {
  const x = Number(entry.x), z = Number(entry.z);
  if (rotation === 90) return { ...entry, x: length - 1 - z, z: x };
  if (rotation === 180) return { ...entry, x: width - 1 - x, z: length - 1 - z };
  if (rotation === 270) return { ...entry, x: z, z: width - 1 - x };
  return { ...entry };
}

function sortBuildQueue(blocks, schematic = currentSchematic, requestedRotation = null) {
  const rotation = requestedRotation === null ? Number(database.get("build.rotation") || 0) : Number(requestedRotation);
  const width = Number(schematic?.width || 0);
  const length = Number(schematic?.length || 0);
  const transformed = blocks.map(b => rotateBlockEntry(b, rotation, width, length));
  return transformed.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

function getBuildState() {
  return database.get(
    "build"
  );
}

function updateBuild(patch) {
  return database.update({
    build: patch
  });
}

function blockMatches(worldBlock, desired) {
  if (!worldBlock) return false;
  const desiredName = typeof desired === "string" ? desired : desired?.block;
  const actual = normalizeBlockName(worldBlock.name);
  const wanted = normalizeBlockName(desiredName);
  if (actual !== wanted) return false;

  if (typeof desired === "object" && desired.meta !== undefined && desired.meta !== null) {
    const wm = Number(worldBlock.metadata);
    const dm = Number(desired.meta);
    if (Number.isFinite(wm) && Number.isFinite(dm)) return wm === dm;
  }
  return true;
}

function getBlockByName(name) {
  if (!bot?.registry) {
    return null;
  }

  const normalized =
    normalizeBlockName(name);

  const block =
    bot.registry.blocksByName[
      normalized
    ];

  return block || null;
}

function findInventoryMaterial(blockSpec) {
  if (!bot?.inventory) {
    return null;
  }

  const wanted = normalizeBlockName(
    typeof blockSpec === "string" ? blockSpec : blockSpec?.block
  );
  const desiredMeta = typeof blockSpec === "object" ? Number(blockSpec.meta) : NaN;

  for (
    let slot = 0;
    slot < bot.inventory.slots.length;
    slot++
  ) {
    const item =
      bot.inventory.slots[slot];

    if (!item) {
      continue;
    }

    const itemName =
      normalizeBlockName(
        item.name
      );

    if (itemName === wanted && item.count > 0) {
      if (Number.isFinite(desiredMeta) && item.metadata !== undefined && Number(item.metadata) !== desiredMeta) continue;
      return {
        slot,
        item
      };
    }
  }

  /*
   * Some old schematic IDs can map to a block
   * whose inventory item has a slightly different
   * internal name. Registry-based fallback.
   */
  const registryBlock =
    getBlockByName(wanted);

  if (registryBlock) {
    for (
      let slot = 0;
      slot < bot.inventory.slots.length;
      slot++
    ) {
      const item =
        bot.inventory.slots[slot];

      if (!item || item.count <= 0) {
        continue;
      }

      if (
        item.type ===
        registryBlock.id
      ) {
        return {
          slot,
          item
        };
      }
    }
  }

  return null;
}

function isReplaceable(block) {
  if (!block) {
    return true;
  }

  const name =
    normalizeBlockName(
      block.name
    );

  return (
    name === "air" ||
    name === "cave_air" ||
    name === "void_air" ||
    name === "water" ||
    name === "flowing_water" ||
    name === "lava" ||
    name === "flowing_lava"
  );
}

function getReferenceCandidates(
  target
) {
  const offsets = [
    new Vec3(0, -1, 0),
    new Vec3(0, 1, 0),
    new Vec3(-1, 0, 0),
    new Vec3(1, 0, 0),
    new Vec3(0, 0, -1),
    new Vec3(0, 0, 1)
  ];

  return offsets
    .map(
      (offset) => new Vec3(
        Number(target.x) + Number(offset.x),
        Number(target.y) + Number(offset.y),
        Number(target.z) + Number(offset.z)
      )
    )
    .map(
      (position) =>
        bot.blockAt(position)
    )
    .filter(Boolean)
    .filter(
      (block) =>
        !isReplaceable(block)
    );
}

function getFaceVector(
  reference,
  target
) {
  return new Vec3(
    Number(target.x) - Number(reference.position.x),
    Number(target.y) - Number(reference.position.y),
    Number(target.z) - Number(reference.position.z)
  );
}

async function ensureNear(
  position,
  range = 4
) {
  if (
    !bot ||
    !bot.pathfinder
  ) {
    throw new Error(
      "Bot/pathfinder is unavailable."
    );
  }

  if (
    bot.entity?.position &&
    bot.entity.position.distanceTo(
      position
    ) <= range
  ) {
    return;
  }

  const movements =
    new Movements(bot);

  /*
   * The builder must not dig through the
   * schematic/world to reach blocks.
   */
  movements.canDig = false;
  movements.allow1by1towers = false;
  movements.allowParkour = true;

  bot.pathfinder.setMovements(
    movements
  );

  bot.pathfinder.setGoal(
    new goals.GoalNear(
      position.x,
      position.y,
      position.z,
      range
    )
  );

  await waitUntilNear(
    position,
    range,
    15000
  );
}

async function waitUntilNear(
  position,
  range,
  timeout
) {
  const start =
    Date.now();

  while (
    Date.now() - start <
    timeout
  ) {
    if (!bot?.entity) {
      throw new Error(
        "Minecraft bot disconnected."
      );
    }

    if (
      bot.entity.position.distanceTo(
        position
      ) <= range
    ) {
      return true;
    }

    await wait(250);
  }

  throw new Error(
    "Timed out while moving to build area."
  );
}

async function placeOneBlock(
  entry,
  origin
) {
  if (!bot) {
    throw new Error(
      "Minecraft bot is not connected."
    );
  }

  const target = new Vec3(
    origin.x + entry.x,
    origin.y + entry.y,
    origin.z + entry.z
  );

  const existing =
    bot.blockAt(target);

  if (
    blockMatches(
      existing,
      entry.block
    )
  ) {
    return {
      status: "skipped",
      target
    };
  }

  const material =
    findInventoryMaterial(entry);

  if (!material) {
    return {
      status: "missing",
      target
    };
  }

  const references =
    getReferenceCandidates(
      target
    );

  if (!references.length) {
    return {
      status: "no_reference",
      target
    };
  }

  /*
   * Move close enough to interact with
   * the reference block.
   */
  await bot.equip(material.item, "hand");

  for (const reference of references) {
    try {
      await ensureNear(reference.position, 4);
      const current =
        bot.blockAt(target);

      if (
        blockMatches(
          current,
          entry.block
        )
      ) {
        return {
          status: "skipped",
          target
        };
      }

      const face =
        getFaceVector(
          reference,
          target
        );

      await bot.lookAt(
        reference.position,
        true
      );

      await bot.placeBlock(
        reference,
        face
      );

      await wait(80);

      const placed =
        bot.blockAt(target);

      if (
        blockMatches(
          placed,
          entry.block
        )
      ) {
        return {
          status: "placed",
          target
        };
      }
    } catch {
      /*
       * Try another adjacent solid reference.
       */
    }
  }

  return {
    status: "failed",
    target
  };
}

async function processNextBlock() {
  if (
    busy ||
    !bot ||
    !currentSchematic
  ) {
    return;
  }

  const state =
    getBuildState();

  if (
    !state.running ||
    state.paused
  ) {
    return;
  }

  if (
    buildIndex >=
    buildQueue.length
  ) {
    finishBuild();
    return;
  }

  busy = true;

  const entry =
    buildQueue[buildIndex];

  const origin =
    new Vec3(
      Number(state.x || 0),
      Number(state.y || 0),
      Number(state.z || 0)
    );

  updateBuild({
    currentBlock: {
      x: entry.x,
      y: entry.y,
      z: entry.z,
      block: entry.block
    },

    currentMaterial:
      entry.block,

    action: "placing"
  });

  try {
    const result =
      await placeOneBlock(
        entry,
        origin
      );

    if (
      result.status === "placed"
    ) {
      updateBuild({
        placed:
          Number(state.placed || 0) +
          1,
        action: "placing"
      });
    } else if (
      result.status === "skipped"
    ) {
      updateBuild({
        skipped:
          Number(state.skipped || 0) +
          1,
        action: "skipping"
      });
    } else if (
      result.status === "missing"
    ) {
      updateBuild({
        failed:
          Number(state.failed || 0) +
          1,
        action: "missing_material",
        error:
          `Missing material: ${entry.block}`
      });

      addLog(
        `Missing material ${entry.block}; build paused.`
      );

      updateBuild({
        paused: true,
        action: "paused"
      });

      return;
    } else {
      const key = `${buildIndex}:${entry.x}:${entry.y}:${entry.z}`;
      const tries = Number(retryCounts.get(key) || 0) + 1;
      retryCounts.set(key, tries);
      if (tries < 4) {
        updateBuild({ action: "retrying", error: `Retry ${tries}/3: ${entry.block} at ${entry.x},${entry.y},${entry.z}` });
        return;
      }
      updateBuild({
        failed: Number(state.failed || 0) + 1,
        action: "failed",
        error: `Could not place ${entry.block} at ${entry.x},${entry.y},${entry.z}`
      });
    }

    retryCounts.delete(`${buildIndex}:${entry.x}:${entry.y}:${entry.z}`);
    buildIndex++;

    updateBuild({
      action: "building"
    });
  } catch (error) {
    const current =
      getBuildState();

    updateBuild({
      failed:
        Number(current.failed || 0) +
        1,

      error:
        error.message,

      action: "error"
    });

    addLog(
      `Build error: ${error.message}`
    );

    /*
     * Do not immediately stop the entire build for
     * a transient placement failure.
     */
    buildIndex++;
  } finally {
    busy = false;
  }

  if (
    buildIndex >=
    buildQueue.length
  ) {
    finishBuild();
  }
}

function startLoop() {
  if (buildLoop) {
    return;
  }

  buildLoop = setInterval(
    () => {
      processNextBlock().catch(
        (error) => {
          addLog(
            `Build loop error: ${error.message}`
          );
        }
      );
    },
    150
  );
}

function stopLoop() {
  if (buildLoop) {
    clearInterval(buildLoop);
    buildLoop = null;
  }
}

async function startBuild(options = {}) {
  if (!bot) {
    throw new Error(
      "Minecraft bot is not connected."
    );
  }

  const filename =
    options.schematic ||
    options.filename ||
    database.get(
      "build.schematic"
    );

  if (!filename) {
    throw new Error(
      "No schematic selected."
    );
  }

  const x =
    readNumber(options.x, 0);

  const y =
    readNumber(options.y, 0);

  const z =
    readNumber(options.z, 0);

  const schematic =
    await loadSchematic(
      filename
    );

  if (
    !schematic.blocks.length
  ) {
    throw new Error(
      "Schematic contains no placeable blocks."
    );
  }

  currentBlocks = schematic.blocks;

  const rotation = [0, 90, 180, 270].includes(Number(options.rotation))
    ? Number(options.rotation)
    : 0;
  buildQueue = sortBuildQueue(currentBlocks, currentSchematic, rotation);

  buildIndex = 0;

  busy = false;

  const state = {
    running: true,
    paused: false,

    schematic:
      schematic.name,

    x,
    y,
    z,
    rotation,

    total:
      buildQueue.length,

    placed: 0,
    skipped: 0,
    failed: 0,

    currentBlock: null,
    currentMaterial: null,

    startedAt: new Date().toISOString(),
    finishedAt: null,

    error: "",
    action: "starting"
  };

  database.update({
    build: state
  });

  addLog(
    `Build started: ${schematic.name} at ${x}, ${y}, ${z}.`
  );

  startLoop();

  return getBuildState();
}

function pauseBuild() {
  const state =
    getBuildState();

  if (!state.running) {
    return state;
  }

  database.update({
    build: {
      paused: true,
      action: "paused"
    }
  });

  if (bot?.pathfinder) {
    bot.pathfinder.setGoal(
      null
    );
  }

  addLog(
    "Build paused."
  );

  return getBuildState();
}

function resumeBuild() {
  const state =
    getBuildState();

  if (!state.running) {
    return state;
  }

  database.update({
    build: {
      paused: false,
      action: "building",
      error: ""
    }
  });

  addLog(
    "Build resumed."
  );

  startLoop();

  return getBuildState();
}

function stopBuild() {
  database.update({
    build: {
      running: false,
      paused: false,
      action: "stopped"
    }
  });

  if (bot?.pathfinder) {
    bot.pathfinder.setGoal(
      null
    );
  }

  busy = false;

  addLog(
    "Build stopped."
  );

  return getBuildState();
}

function finishBuild() {
  stopLoop();

  database.update({
    build: {
      running: false,
      paused: false,
      action: "completed",
      finishedAt:
        new Date().toISOString()
    }
  });

  addLog(
    "Build completed."
  );
}

function resetBuild() {
  stopLoop();

  buildQueue = [];
  buildIndex = 0;
  busy = false;

  currentSchematic = null;
  currentBlocks = [];

  database.resetBuild();

  addLog(
    "Build state reset."
  );

  return getBuildState();
}

function getProgress() {
  const state =
    getBuildState();

  const total =
    Number(state.total || 0);

  const completed =
    Number(state.placed || 0) +
    Number(state.skipped || 0);

  return {
    ...state,

    index: buildIndex,

    completed,

    percent:
      total > 0
        ? Math.min(
            100,
            (completed / total) *
              100
          )
        : 0
  };
}

function wait(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

module.exports = {
  setBot,
  getBot,

  SCHEMATICS_DIR,
  MAX_SCHEMATIC_SIZE,

  listSchematics,
  saveSchematic,
  deleteSchematic,

  loadSchematic,

  startBuild,
  pauseBuild,
  resumeBuild,
  stopBuild,
  resetBuild,

  getBuildState,
  getProgress
};
