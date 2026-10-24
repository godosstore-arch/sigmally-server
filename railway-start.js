const fs = require("fs");
const settings = JSON.parse(fs.readFileSync("./settings.json", "utf-8"));
if (process.env.PORT) settings.listeningPort = Number(process.env.PORT);
if (process.env.SERVER_NAME) settings.serverName = process.env.SERVER_NAME;
if (process.env.BOTS) settings.worldPlayerBotsPerWorld = Number(process.env.BOTS);
settings.adminPanelEnabled = false;
fs.writeFileSync("./settings.json", JSON.stringify(settings, null, 4), "utf-8");
require("./cli/index.js");
