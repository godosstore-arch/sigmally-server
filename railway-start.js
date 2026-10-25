const fs = require("fs");
const crypto = require("crypto");
const settings = JSON.parse(fs.readFileSync("./settings.json", "utf-8"));
const publicPort = Number(process.env.PORT || 8080);
const GAME_PORT = 8081;
const ADMIN_PORT = 8084;
settings.listeningPort = GAME_PORT;
settings.adminPanelPort = ADMIN_PORT;
if (process.env.SERVER_NAME) settings.serverName = process.env.SERVER_NAME;
// Defaults tuned for low-CPU hosts (Render free); override with env vars
settings.worldPlayerBotsPerWorld = Number(process.env.BOT_COUNT || 0);
// No food by default (mass comes from the admin panel); PELLET_COUNT turns it back on
settings.pelletCount = Number(process.env.PELLET_COUNT || 0);
settings.worldMapW = settings.worldMapH = Number(process.env.MAP_SIZE || 17071);
settings.virusMinCount = Number(process.env.VIRUS_MIN || 10);
settings.virusMaxCount = Number(process.env.VIRUS_MAX || 15);
settings.playerMaxCells = Number(process.env.MAX_CELLS || 12);
// Behind the host's proxy every player shares the proxy's IP, so per-IP limits would lock everyone out
settings.listenerMaxConnectionsPerIP = 0;
settings.worldSpawnNearSameIP = false;
// Admin panel only when ADMIN_TOKEN is set; the token stays valid for every login
const adminToken = (process.env.ADMIN_TOKEN || "").trim();
settings.adminPanelEnabled = adminToken.length > 0;
settings.adminPanelTokens = adminToken ? [crypto.createHash("sha256").update(adminToken).digest("hex")] : [];
settings.adminPanelKeepTokens = true;
fs.writeFileSync("./settings.json", JSON.stringify(settings, null, 4), "utf-8");
// Per-connection DEBUG/ACCESS lines only cost CPU and disk on a small host; keep them out of the log file
const logSettings = JSON.parse(fs.readFileSync("./log-settings.json", "utf-8"));
logSettings.showingFile.DEBUG = logSettings.showingFile.ACCESS = false;
fs.writeFileSync("./log-settings.json", JSON.stringify(logSettings, null, 4), "utf-8");
require("./gateway")(publicPort, ADMIN_PORT, settings.adminPanelPath || "/admin");
require("./cli/index.js");
