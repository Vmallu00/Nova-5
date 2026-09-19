"use strict";

/*
 * NOVA NODE
 * xKiro AI Controller
 *
 * One Minecraft bot only.
 */

const OpenAI = require("openai");

const API_KEY =
  process.env.XKIRO_API_KEY || "";

const BASE_URL =
  process.env.XKIRO_BASE_URL ||
  "https://api.xkiro.com/v1";

const MODEL =
  process.env.XKIRO_MODEL ||
  "qwen/qwen3.8-max:free";

let client = null;

/* =========================================================
   CLIENT
========================================================= */

function getClient() {
  if (!API_KEY) {
    return null;
  }

  if (!client) {
    client = new OpenAI({
      apiKey: API_KEY,
      baseURL: BASE_URL
    });
  }

  return client;
}

function isAvailable() {
  return Boolean(API_KEY);
}

function getModel() {
  return MODEL;
}

function getBaseUrl() {
  return BASE_URL;
}

function getApiKeyConfigured() {
  return Boolean(API_KEY);
}

/* =========================================================
   JSON
========================================================= */

function parseJSON(text) {
  if (!text) {
    return null;
  }

  let value = String(text).trim();

  /*
   * Remove markdown code fences if the model
   * accidentally returns them.
   */

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(value);
  } catch {}

  /*
   * Try to find the first JSON object.
   */

  const start =
    value.indexOf("{");

  const end =
    value.lastIndexOf("}");

  if (
    start !== -1 &&
    end > start
  ) {
    try {
      return JSON.parse(
        value.slice(
          start,
          end + 1
        )
      );
    } catch {}
  }

  /*
   * Try JSON array.
   */

  const arrayStart =
    value.indexOf("[");

  const arrayEnd =
    value.lastIndexOf("]");

  if (
    arrayStart !== -1 &&
    arrayEnd > arrayStart
  ) {
    try {
      return JSON.parse(
        value.slice(
          arrayStart,
          arrayEnd + 1
        )
      );
    } catch {}
  }

  return null;
}

/* =========================================================
   GENERAL AI REQUEST
========================================================= */

async function ask(
  prompt,
  options = {}
) {
  const ai = getClient();

  if (!ai) {
    throw new Error(
      "XKIRO_API_KEY is not configured."
    );
  }

  const system =
    options.system ||
    `
You are the AI controller for NOVA NODE.

Rules:

1. There is exactly ONE Minecraft bot.
2. The Minecraft server is FakePixel.
3. Minecraft version is 1.8.9.
4. Never invent Minecraft GUI slots.
5. Never invent item names.
6. Never invent coordinates.
7. Only select a GUI slot when that slot exists in the supplied data.
8. Use high-level planning for building.
9. Do not generate thousands of individual block-placement commands.
10. Local Mineflayer handles fast block placement.
11. Return valid JSON when JSON output is requested.
12. Do not bypass server permissions or anti-cheat.
`;

  const response =
    await ai.chat.completions.create({
      model: MODEL,

      messages: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: String(prompt)
        }
      ],

      temperature:
        options.temperature ??
        0.2,

      max_tokens:
        options.maxTokens ??
        1500
    });

  const content =
    response?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "xKiro returned an empty response."
    );
  }

  return content;
}

/* =========================================================
   VISIT GUI
========================================================= */

async function chooseVisitGUIAction(
  windowData,
  targetUsername
) {
  const username =
    targetUsername ||
    process.env.TARGET_USERNAME ||
    "V_Mallu_Gamer";

  const slots =
    Array.isArray(windowData)
      ? windowData
      : Array.isArray(
          windowData?.slots
        )
        ? windowData.slots
        : [];

  /*
   * Local filtering first.
   * AI is only allowed to choose from real
   * candidates supplied to it.
   */

  const candidates =
    slots
      .map((item, index) => ({
        slot:
          item?.slot ??
          index,

        name:
          item?.name ??
          null,

        displayName:
          item?.displayName ??
          null,

        count:
          item?.count ??
          0,

        lore:
          Array.isArray(item?.lore)
            ? item.lore
            : []
      }))
      .filter((item) => {
        const combined =
          [
            item.name,
            item.displayName,
            ...item.lore
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return (
          combined.includes(
            username.toLowerCase()
          ) ||
          combined.includes(
            "visit player island"
          )
        );
      });

  if (candidates.length === 0) {
    return {
      action: "none",
      slot: null,
      reason:
        "No matching visit item was found."
    };
  }

  if (candidates.length === 1) {
    return {
      action: "click",
      slot:
        Number(candidates[0].slot),
      reason:
        "A single matching visit item was found."
    };
  }

  try {
    const result =
      await ask(
        `
Find the correct GUI item for visiting player "${username}".

Available candidates:

${JSON.stringify(
  candidates,
  null,
  2
)}

Return ONLY JSON:

{
  "action": "click" | "none",
  "slot": number | null
}

You may ONLY select one of the supplied slot numbers.
`,
        {
          temperature: 0,
          maxTokens: 300
        }
      );

    const parsed =
      parseJSON(result);

    if (
      parsed &&
      parsed.action === "click"
    ) {
      const selectedSlot =
        Number(parsed.slot);

      const valid =
        candidates.some(
          item =>
            Number(item.slot) ===
            selectedSlot
        );

      if (valid) {
        return {
          action: "click",
          slot: selectedSlot,
          reason:
            "AI selected a supplied GUI candidate."
        };
      }
    }
  } catch (error) {
    console.error(
      "[AI] Visit GUI error:",
      error.message
    );
  }

  /*
   * Safe local fallback.
   */

  return {
    action: "click",
    slot:
      Number(candidates[0].slot),
    reason:
      "Used the first valid supplied candidate."
  };
}

/* =========================================================
   BUILD PLANNING
========================================================= */

async function chooseBuildAction(
  buildState
) {
  const safeState =
    buildState || {};

  const result =
    await ask(
      `
Create a HIGH-LEVEL Minecraft build plan.

Current build state:

${JSON.stringify(
  safeState,
  null,
  2
)}

Do NOT output individual block placement
commands.

Return JSON:

{
  "action": "build" | "pause" | "stop" | "none",
  "strategy": "string",
  "notes": ["string"]
}
`,
      {
        temperature: 0.2,
        maxTokens: 700
      }
    );

  const parsed =
    parseJSON(result);

  if (!parsed) {
    return {
      action: "none",
      strategy:
        "Unable to parse AI response.",
      notes: []
    };
  }

  return parsed;
}

/* =========================================================
   MINECRAFT STATE ANALYSIS
========================================================= */

async function analyzeMinecraftState(
  minecraftState
) {
  const result =
    await ask(
      `
Analyze this Minecraft state:

${JSON.stringify(
  minecraftState || {},
  null,
  2
)}

Return JSON:

{
  "summary": "string",
  "actions": ["string"],
  "warnings": ["string"]
}
`,
      {
        temperature: 0.2,
        maxTokens: 900
      }
    );

  return (
    parseJSON(result) || {
      summary: result,
      actions: [],
      warnings: []
    }
  );
}

/* =========================================================
   BUILD PLAN
========================================================= */

async function createBuildPlan(
  request
) {
  const result =
    await ask(
      `
Create a high-level Minecraft construction
plan for this request:

${JSON.stringify(
  request || {},
  null,
  2
)}

The local schematic builder will handle
individual block placement.

Return JSON:

{
  "name": "string",
  "description": "string",
  "steps": [
    "string"
  ],
  "placementStrategy": "string"
}
`,
      {
        temperature: 0.3,
        maxTokens: 1200
      }
    );

  return (
    parseJSON(result) || {
      name: "Build Plan",
      description: result,
      steps: [],
      placementStrategy:
        "Use the uploaded schematic with local Mineflayer placement."
    }
  );
}

/* =========================================================
   SIMPLE STATUS
========================================================= */

function getStatus() {
  return {
    available:
      isAvailable(),

    model:
      getModel(),

    baseUrl:
      getBaseUrl(),

    apiKeyConfigured:
      getApiKeyConfigured()
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  ask,

  isAvailable,

  getModel,

  getBaseUrl,

  getApiKeyConfigured,

  getClient,

  getStatus,

  parseJSON,

  chooseVisitGUIAction,

  chooseBuildAction,

  analyzeMinecraftState,

  createBuildPlan
};
