require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");

const botManager = require("./bot");
const minecraft = require("./minecraft");
const builder = require("./builder");
const db = require("./database");
const ai = require("./ai");

const app = express();

const PORT = Number(process.env.PORT || 9000);
const DATA_DIR = process.env.DATA_DIR || "./data";
const SCHEMATICS_DIR = process.env.SCHEMATICS_DIR || "./schematics";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SCHEMATICS_DIR, { recursive: true });

app.use(express.json({ limit: "10mb" }));

/* ---------------- AUTH ---------------- */

function checkAuth(req, res, next) {
  if (req.path === "/health") {
    return next();
  }

  const header = req.headers.authorization || "";

  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="NOVA NODE"');
    return res.status(401).json({
      ok: false,
      error: "Authentication required"
    });
  }

  try {
    const decoded = Buffer.from(
      header.slice(6),
      "base64"
    ).toString("utf8");

    const separator = decoded.indexOf(":");

    if (separator === -1) {
      throw new Error("Invalid authentication");
    }

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    const expectedUsername = process.env.PANEL_USERNAME || "vmallu";
    const expectedPassword = process.env.PANEL_PASSWORD || "vmallu";

    if (
      username !== expectedUsername ||
      password !== expectedPassword
    ) {
      res.setHeader("WWW-Authenticate", 'Basic realm="NOVA NODE"');

      return res.status(401).json({
        ok: false,
        error: "Invalid username or password"
      });
    }

    next();
  } catch {
    res.setHeader("WWW-Authenticate", 'Basic realm="NOVA NODE"');

    return res.status(401).json({
      ok: false,
      error: "Invalid authentication"
    });
  }
}

app.use(checkAuth);

/* ---------------- HELPERS ---------------- */

function syncBot() {
  const bot = botManager.getBot();

  if (bot) {
    minecraft.setBot(bot);
    builder.setBot(bot);
  }

  return bot;
}

function bool(value) {
  return value === true || value === "true";
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* ---------------- HEALTH ---------------- */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "fakepixel-ai-skyblock-bot",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* ---------------- STATUS ---------------- */

app.get("/api/status", (req, res) => {
  syncBot();

  const state = db.getState();

  res.json({
    ok: true,

    bot: botManager.getStatus(),

    target: state.target,

    settings: state.settings,

    soup: state.soup,

    ai: {
      available: ai.isAvailable(),
      model: ai.getModel(),
      baseUrl: ai.getBaseUrl()
    },

    build: builder.getBuildState(),

    request: botManager.getRequestState()
  });
});

/* ---------------- LOGS ---------------- */

app.get("/api/logs", (req, res) => {
  res.json({
    ok: true,
    logs: botManager.getLogs()
  });
});

/* ---------------- CHAT ---------------- */

app.post("/api/chat", (req, res) => {
  syncBot();

  const message = String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "Message is required"
    });
  }

  const result = botManager.sendChat(message);

  res.json({
    ok: true,
    result
  });
});

/* ---------------- COMMAND ---------------- */

app.post("/api/command", (req, res) => {
  syncBot();

  let command = String(req.body?.command || "").trim();

  if (!command) {
    return res.status(400).json({
      ok: false,
      error: "Command is required"
    });
  }

  if (!command.startsWith("/")) {
    command = "/" + command;
  }

  const result = botManager.sendCommand(command);

  res.json({
    ok: true,
    result
  });
});

/* ---------------- BOT ---------------- */

app.post("/api/bot/reconnect", async (req, res) => {
  try {
    botManager.disconnect();

    setTimeout(() => {
      try {
        const bot = botManager.createBot();

        if (bot) {
          minecraft.setBot(bot);
          builder.setBot(bot);
        }
      } catch (err) {
        console.error("Reconnect error:", err);
      }
    }, 500);

    res.json({
      ok: true,
      message: "Bot reconnect requested"
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- AI ---------------- */

app.get("/api/ai/status", (req, res) => {
  res.json({
    ok: true,
    available: ai.isAvailable(),
    model: ai.getModel(),
    baseUrl: ai.getBaseUrl()
  });
});

app.post("/api/skyblock/npc", async (req, res) => {
  syncBot();
  try {
    const result = await botManager.goToSkyblockNpc();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/skyblock/npc/right-click", async (req, res) => {
  syncBot();
  try {
    const result = await botManager.rightClickSkyblockNpc();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/skyblock/npc/look", async (req, res) => {
  syncBot();
  try {
    const result = await botManager.lookAtSkyblockNpc();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/minecraft/hotbar", async (req, res) => {
  syncBot();
  try {
    const slot = Number(req.body?.slot || 3);
    const result = await botManager.selectHotbarSlot(slot);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/minecraft/rotate", async (req, res) => {
  syncBot();
  try {
    const yaw = Number(req.body?.yaw || 0);
    const pitch = Number(req.body?.pitch || 0);
    const result = await botManager.rotateLook(yaw, pitch);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/ai/visit", async (req, res) => {
  syncBot();

  try {
    const result = await botManager.startVisit();

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- MINECRAFT STATE ---------------- */

app.get("/api/minecraft/state", (req, res) => {
  syncBot();

  res.json({
    ok: true,
    state: minecraft.getState()
  });
});

app.get("/api/minecraft/entities", (req, res) => {
  syncBot();

  const radius = Math.max(
    1,
    Math.min(100, safeNumber(req.query.radius, 20))
  );

  res.json({
    ok: true,
    entities: minecraft.getNearbyEntities(radius)
  });
});

/* ---------------- MOVEMENT ---------------- */

app.post("/api/minecraft/move", async (req, res) => {
  syncBot();

  try {
    const x = safeNumber(req.body?.x);
    const y = safeNumber(req.body?.y);
    const z = safeNumber(req.body?.z);
    const range = Math.max(
      1,
      Math.min(20, safeNumber(req.body?.range, 2))
    );

    const result = await botManager.moveTo(x, y, z, range);

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/minecraft/stop", (req, res) => {
  syncBot();

  try {
    const result = botManager.stopMovement();

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/minecraft/look", async (req, res) => {
  syncBot();

  try {
    const x = safeNumber(req.body?.x);
    const y = safeNumber(req.body?.y);
    const z = safeNumber(req.body?.z);

    const result = await botManager.lookAt(x, y, z);

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- REQUESTS ---------------- */

app.get("/api/requests", (req, res) => {
  syncBot();
  res.json({ ok: true, request: botManager.getRequestState() });
});

app.post("/api/requests/accept", async (req, res) => {
  syncBot();

  try {
    const type = req.body?.type ? String(req.body.type).toLowerCase() : null;
    if (type && !["coop", "trade"].includes(type)) {
      return res.status(400).json({ ok: false, error: "type must be coop or trade" });
    }

    const result = await botManager.acceptCurrentRequest(type);
    res.json({ ok: true, result, request: botManager.getRequestState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, request: botManager.getRequestState() });
  }
});

/* ---------------- INVENTORY ---------------- */

app.get("/api/inventory", (req, res) => {
  syncBot();

  try {
    const inventory = botManager.getInventoryState();

    res.json({
      ok: true,
      inventory
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- SOUP ---------------- */

app.get("/api/soup", (req, res) => {
  syncBot();

  try {
    res.json({
      ok: true,
      soup: botManager.getSoupState()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/soup/consume", async (req, res) => {
  syncBot();

  try {
    const result = await botManager.consumeSoup();

    res.json({
      ok: true,
      result,
      soup: botManager.getSoupState()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/soup/auto", (req, res) => {
  syncBot();

  try {
    const enabled = bool(req.body?.enabled);

    const result = botManager.setAutoSoup(enabled);

    res.json({
      ok: true,
      enabled,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- FLIGHT ---------------- */

app.get("/api/fly", (req, res) => {
  const state = db.getState();

  res.json({
    ok: true,
    requested: !!state.settings.flightRequested,
    active: !!state.settings.flightActive
  });
});

app.post("/api/fly", (req, res) => {
  syncBot();

  try {
    const enabled = bool(req.body?.enabled);

    const result = botManager.setFlightRequested(enabled);

    res.json({
      ok: true,
      requested: enabled,
      active: !!db.get("settings.flightActive"),
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


/* ---------------- TARGET ---------------- */

app.get("/api/target", (req, res) => {
  const state = db.getState();

  res.json({
    ok: true,
    target: state.target
  });
});

app.post("/api/target", (req, res) => {
  const username = String(
    req.body?.username || ""
  ).trim();

  if (!username) {
    return res.status(400).json({
      ok: false,
      error: "Username is required"
    });
  }

  db.update({
    target: {
      username
    }
  });

  res.json({
    ok: true,
    target: db.getState().target
  });
});

/* ---------------- SETTINGS ---------------- */

const allowedSettings = [
  "autoSkyblock",
  "autoVisit",
  "antiAfk",
  "autoSoup",
  "autoCoopAccept",
  "autoTradeAccept"
];

app.get("/api/settings", (req, res) => {
  res.json({
    ok: true,
    settings: db.getState().settings
  });
});

app.post("/api/settings", (req, res) => {
  const updates = {};

  for (const key of allowedSettings) {
    if (typeof req.body?.[key] === "boolean") {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length > 0) {
    db.update({
      settings: updates
    });
  }

  res.json({
    ok: true,
    settings: db.getState().settings
  });
});

/* =========================================================
   SCHEMATICS
   ========================================================= */

app.get("/api/schematics", (req, res) => {
  try {
    res.json({
      ok: true,
      schematics: builder.listSchematics()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/*
 * Upload raw .schem / .schematic data.
 *
 * Frontend sends:
 *
 * PUT /api/schematics/upload?filename=test.schem
 *
 * Content-Type:
 * application/octet-stream
 */

app.put(
  "/api/schematics/upload",
  express.raw({
    type: [
      "application/octet-stream",
      "application/x-schematic",
      "application/x-gzip",
      "application/octet-stream; charset=utf-8"
    ],
    limit: "100mb"
  }),
  async (req, res) => {
    try {
      const filename =
        req.query.filename ||
        req.headers["x-schematic-name"];

      if (!filename) {
        return res.status(400).json({
          ok: false,
          error: "Schematic filename is required"
        });
      }

      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({
          ok: false,
          error: "No schematic data received"
        });
      }

      const result = await builder.saveSchematic(
        String(filename),
        req.body
      );

      res.json({
        ok: true,
        schematic: result
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err.message
      });
    }
  }
);

app.delete("/api/schematics/:filename", (req, res) => {
  try {
    const filename = req.params.filename;

    const result = builder.deleteSchematic(filename);

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

/* =========================================================
   BUILDER
   ========================================================= */

app.get("/api/build/status", (req, res) => {
  res.json({
    ok: true,
    build: builder.getBuildState(),
    progress: builder.getProgress()
  });
});

app.post("/api/build/start", async (req, res) => {
  syncBot();

  try {
    const schematic = String(
      req.body?.schematic || ""
    ).trim();

    if (!schematic) {
      return res.status(400).json({
        ok: false,
        error: "Schematic is required"
      });
    }

    const x = safeNumber(req.body?.x, 0);
    const y = safeNumber(req.body?.y, 0);
    const z = safeNumber(req.body?.z, 0);

    const result = await builder.start({
      schematic,
      x,
      y,
      z,
      rotation: Number(req.body?.rotation || 0)
    });

    res.json({
      ok: true,
      result,
      build: builder.getBuildState()
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/build/pause", (req, res) => {
  try {
    const result = builder.pause();

    res.json({
      ok: true,
      result,
      build: builder.getBuildState()
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/build/resume", async (req, res) => {
  try {
    syncBot();

    const result = await builder.resume();

    res.json({
      ok: true,
      result,
      build: builder.getBuildState()
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/build/stop", (req, res) => {
  try {
    const result = builder.stop();

    res.json({
      ok: true,
      result,
      build: builder.getBuildState()
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

app.post("/api/build/reset", (req, res) => {
  try {
    const result = builder.reset();

    res.json({
      ok: true,
      result,
      build: builder.getBuildState()
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- CURRENT WINDOW ---------------- */

app.get("/api/minecraft/window", (req, res) => {
  syncBot();

  try {
    res.json({
      ok: true,
      window: botManager.getCurrentWindow()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/* ---------------- STARTUP ---------------- */

function startBot() {
  try {
    const bot = botManager.createBot();

    if (bot) {
      minecraft.setBot(bot);
      builder.setBot(bot);
    }
  } catch (err) {
    console.error("Bot startup error:", err);
  }
}

const publicDir = path.join(__dirname, "public");

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

/*
 * Express 5 compatible SPA fallback.
 * Do not use app.get("*").
 */
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    req.accepts("html") &&
    fs.existsSync(path.join(publicDir, "index.html"))
  ) {
    return res.sendFile(
      path.join(publicDir, "index.html")
    );
  }

  next();
});

/* ---------------- 404 ---------------- */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found"
  });
});

/* ---------------- ERROR ---------------- */

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    ok: false,
    error: err.message || "Internal server error"
  });
});

/* ---------------- LISTEN ---------------- */

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("======================================");
  console.log("     FAKEPIXEL AI SKYBLOCK BOT");
  console.log("======================================");
  console.log(`Dashboard: http://0.0.0.0:${PORT}`);
  console.log(`Port: ${PORT}`);
  console.log(`MC: ${process.env.MC_HOST || "mc.fakepixel.me"}`);
  console.log(`Version: ${process.env.MC_VERSION || "1.8.9"}`);
  console.log(`Target: ${process.env.TARGET_USERNAME || "V_Mallu_Gamer"}`);
  console.log("======================================");
  console.log("");

  startBot();
});

/* ---------------- SHUTDOWN ---------------- */

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  try {
    builder.stop();
  } catch {}

  try {
    botManager.disconnect();
  } catch {}

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = app;
