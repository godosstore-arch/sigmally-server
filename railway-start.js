const fs = require("fs");
const settings = JSON.parse(fs.readFileSync("./settings.json", "utf-8"));
if (process.env.PORT) settings.listeningPort = Number(process.env.PORT);
if (process.env.SERVER_NAME) settings.serverName = process.env.SERVER_NAME;
// Defaults tuned for low-CPU hosts (Render free); override with env vars
settings.worldPlayerBotsPerWorld = Number(process.env.BOT_COUNT || 0);
settings.pelletCount = Number(process.env.PELLETS || 8000);
settings.worldMapW = settings.worldMapH = Number(process.env.MAP_SIZE || 12000);
settings.adminPanelEnabled = false;
fs.writeFileSync("./settings.json", JSON.stringify(settings, null, 4), "utf-8");
require("./cli/index.js");
