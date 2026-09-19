const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "./data";
const STATE_FILE = path.join(DATA_DIR, "state.json");

const DEFAULT_STATE = {
  bot: {
    registered: false,
    authenticated: false,
    connected: false,
    username: "",
    server: "mc.fakepixel.me",
    world: "",
    lastError: "",
    connectedAt: null,
    lastDisconnect: null
  },

  target: {
    username: process.env.TARGET_USERNAME || "V_Mallu_Gamer",
    visited: false,
    lastVisit: null
  },

  ai: {
    enabled: true,
    model:
      process.env.XKIRO_MODEL ||
      "qwen/qwen3.8-max:free",
    lastAction: "",
    lastResponse: "",
    lastError: ""
  },

  settings: {
    registered: false,

    autoSkyblock:
      process.env.AUTO_SKYBLOCK !== "false",

    autoVisit:
      process.env.AUTO_VISIT !== "false",

    antiAfk:
      process.env.ANTI_AFK !== "false",

    autoSoup:
      process.env.AUTO_SOUP === "true",

    flightRequested: false,
    flightActive: false,

    autoCoopAccept: true,
    autoTradeAccept: true
  },

  requests: {
    pending: false,
    type: null,
    from: null,
    detectedAt: null,
    lastAction: null
  },

  soup: {
    found: false,
    quantity: 0,
    slot: null,
    lastConsumed: null,
    autoEnabled:
      process.env.AUTO_SOUP === "true"
  },

  inventory: {
    items: [],
    updatedAt: null
  },

  movement: {
    moving: false,
    x: null,
    y: null,
    z: null
  },

  build: {
    running: false,
    paused: false,

    schematic: null,

    x: 0,
    y: 0,
    z: 0,

    total: 0,
    placed: 0,
    skipped: 0,
    failed: 0,

    currentBlock: null,
    currentMaterial: null,

    startedAt: null,
    finishedAt: null,

    error: "",
    action: "idle"
  }
};

let state = null;

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function ensureDataDirectory() {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

function mergeDeep(target, source) {
  if (!source || typeof source !== "object") {
    return target;
  }

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      if (
        !target[key] ||
        typeof target[key] !== "object" ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }

      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }

  return target;
}

function load() {
  ensureDataDirectory();

  let loaded = {};

  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(
        STATE_FILE,
        "utf8"
      );

      if (raw.trim()) {
        loaded = JSON.parse(raw);
      }
    }
  } catch (error) {
    console.error(
      "[DATABASE] Failed to load state:",
      error.message
    );
  }

  state = mergeDeep(
    cloneDefault(),
    loaded
  );

  /*
   * Keep the old registration state compatible
   * with the new settings.registration state.
   */
  if (
    state.settings &&
    state.settings.registered === true
  ) {
    state.bot.registered = true;
  }

  if (
    state.bot &&
    state.bot.registered === true
  ) {
    state.settings.registered = true;
  }

  save();

  return state;
}

function save() {
  ensureDataDirectory();

  if (!state) {
    state = cloneDefault();
  }

  const temporaryFile = `${STATE_FILE}.tmp`;

  try {
    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(state, null, 2),
      "utf8"
    );

    fs.renameSync(
      temporaryFile,
      STATE_FILE
    );
  } catch (error) {
    console.error(
      "[DATABASE] Failed to save state:",
      error.message
    );

    try {
      if (fs.existsSync(temporaryFile)) {
        fs.unlinkSync(temporaryFile);
      }
    } catch {}
  }
}

function getState() {
  if (!state) {
    load();
  }

  return state;
}

function update(patch) {
  if (!state) {
    load();
  }

  mergeDeep(state, patch);
  save();

  return state;
}

function get(pathString, fallback = undefined) {
  const current = getState();

  if (!pathString) {
    return current;
  }

  const parts = String(pathString).split(".");
  let value = current;

  for (const part of parts) {
    if (
      value === null ||
      value === undefined ||
      !Object.prototype.hasOwnProperty.call(
        value,
        part
      )
    ) {
      return fallback;
    }

    value = value[part];
  }

  return value;
}

function set(pathString, value) {
  if (!state) {
    load();
  }

  const parts = String(pathString).split(".");
  let current = state;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (
      !current[part] ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts[parts.length - 1]] = value;

  save();

  return value;
}

function setRegistered(value = true) {
  if (!state) {
    load();
  }

  state.bot.registered = Boolean(value);
  state.settings.registered = Boolean(value);

  save();

  return state.settings.registered;
}

function isRegistered() {
  return Boolean(
    get("settings.registered", false)
  );
}

function setSoupAuto(value) {
  const enabled = Boolean(value);

  update({
    settings: {
      autoSoup: enabled
    },
    requests: {
    pending: false,
    type: null,
    from: null,
    detectedAt: null,
    lastAction: null
  },

  soup: {
      autoEnabled: enabled
    }
  });

  return enabled;
}

function setFlightState({
  requested,
  active
} = {}) {
  const patch = {
    settings: {}
  };

  if (requested !== undefined) {
    patch.settings.flightRequested =
      Boolean(requested);
  }

  if (active !== undefined) {
    patch.settings.flightActive =
      Boolean(active);
  }

  return update(patch);
}

function resetBuild() {
  update({
    build: cloneDefault().build
  });

  return get("build");
}

function resetRuntime() {
  update({
    bot: {
      authenticated: false,
      connected: false,
      world: "",
      lastError: ""
    },

    movement: {
      moving: false
    },

    build: {
      running: false,
      paused: false,
      action: "idle"
    }
  });

  return getState();
}

function getFilePath() {
  return STATE_FILE;
}

load();

module.exports = {
  DATA_DIR,
  STATE_FILE,

  load,
  save,

  getState,
  update,

  get,
  set,

  setRegistered,
  isRegistered,

  setSoupAuto,
  setFlightState,

  resetBuild,
  resetRuntime,

  getFilePath
};
