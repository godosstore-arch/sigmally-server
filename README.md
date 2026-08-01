# sig-server

This is a fork of [OgarII](https://github.com/Luka967/OgarII) that implements [Sigmally](https://sigmally.com)'s custom protocol and settings.

It also includes server-side bot support and training dummy commands for creating frozen target cells in the world.

## Requirements

- Node.js 20+ (or a supported version for your native module build)
- `npm` for dependencies
- On Windows: Python and native build tools for `node-gyp` if the native addon needs compilation

## Install and compile

From the repository root:

```bash
npm install
```

This does two things:

1. installs JavaScript dependencies (`ws`, `bindings`, etc.)
2. compiles the native C core in `src/ccore/` using `node-gyp`

If the native build fails, install the Windows build environment and retry:

```bash
npm rebuild
```

## Run the server

Start the CLI server:

```bash
node cli/index.js
```

The server starts in an interactive command mode. Once the CLI is loaded, run:

```bash
start
```

Then use these commands:

- `start` — start the server
- `stop` — stop the server
- `exit` — stop and exit
- `reload` — reload settings from `settings.json`

The first run will create `settings.json` from defaults if it does not exist.

## Admin panel

The built-in admin panel is enabled by default and can be opened in a browser at:

```text
http://127.0.0.1:84/admin
```

You can change the port and path in `settings.json` with `adminPanelPort` and `adminPanelPath`.

### Generating and using tokens

Generate a new admin API token from the CLI console with:

```bash
gentoken
```

That command prints a new token once and stores its SHA-256 hash in `settings.json` under `adminPanelTokens`.

To sign in, open the admin panel and enter the token. Tokens are single-use and are removed from the active token list after a successful login. The panel also keeps the session tied to the browser fingerprint and cookie for extra protection.

### Security notes

The admin panel can run server commands, but some high-risk commands are intentionally blocked from the web shell to reduce abuse:

- `eval`
- `forbid`
- `pardon`
- `gentoken`

You can still use `setting` for normal server settings, but the web shell will refuse attempts to change anything related to admin-panel configuration or stored tokens such as `adminPanelEnabled`, `adminPanelPort`, `adminPanelPath`, `adminPanelTokens`, or `adminPanelSessions`.

If you need to rotate tokens or change admin-panel configuration, use the CLI directly and keep the admin panel behind a trusted network or reverse proxy.

## Connect clients

Use one of these clients:

- Sigmally Fixes: `https://one.sigmally.com?ip=ws://localhost/sigmally.com`
- Delta: `ws://localhost` (legacy protocol)
- Delta: `ws://localhost/sigmally.com` (Sigmally protocol)

## Training dummies and bots

New commands are available to spawn frozen dummy targets and bots.

### Add a dummy target

```bash
adddummy <world id> <x> <y> <size> [name] [skin] [color]
```

Example:

```bash
adddummy 1 0 0 100 Dummy 1%Alexander 16711680
```

This creates a frozen player-like cell at coordinates `x`, `y` with the specified size.

### Remove dummy targets

```bash
rmdummy <world id> [count=1]
```

### Existing bot commands

- `addbot <world id> [count=1]`
- `rmbot <world id> [count=1]`

## Settings

All server settings are loaded from `settings.json`. If the file is missing, the server creates it from the defaults in `src/Settings.js`.

### Listener / network

- `listenerForbiddenIPs` — blocked IP addresses
- `listenerAcceptedOrigins` — allowed WebSocket origin headers
- `listenerMaxConnections` — maximum total socket connections
- `listenerMaxClientDormancy` — maximum inactivity time (ms) before a client is disconnected
- `listenerMaxConnectionsPerIP` — maximum connections allowed from the same IP
- `listeningPort` — port where the server listens

### Server configuration

- `serverFrequency` — server tick rate (updates per second)
- `serverName` — displayed server name
- `serverGamemode` — default gamemode name (`FFA`, `Teams`, `LastManStanding`)
- `serverPassword` — password required to join if non-empty

### Chat

- `chatEnabled` — enable/disable chat
- `chatFilteredPhrases` — blocked chat phrases
- `chatCooldown` — delay between chat messages in ms

### World settings

- `worldMapX`, `worldMapY` — world center position
- `worldMapW`, `worldMapH` — world half-size in each direction
- `worldFinderMaxLevel` — spatial search quadtree/max cell search depth
- `worldFinderMaxItems` — maximum search hits per query
- `worldSafeSpawnTries` — safe spawn search attempts
- `worldSafeSpawnFromEjectedChance` — chance to spawn on ejected mass instead of empty space
- `worldSpawnNearSameIP` — when enabled, a new player from the same IP will try to spawn near an existing player using that IP
- `worldPlayerDisposeDelay` — ticks before disconnected players are removed
- `worldEatMult` — eat size multiplier for collision/eating rules
- `worldEatOverlapDiv` — overlap divisor for cell eating threshold

### Player bots and minions

- `worldPlayerBotsPerWorld` — number of player bots auto-created per world
- `worldPlayerBotNames` — default bot names
- `worldPlayerBotSkins` — default bot skins
- `worldMinionsPerPlayer` — minions spawned per active player
- `worldMaxMinions` — total minions limit
- `worldMaxPlayers` — maximum players per world
- `worldMinCount` — minimum number of active worlds
- `worldMaxCount` — maximum number of active worlds
- `matchmakerNeedsQueuing` — require queueing before world assignment
- `matchmakerBulkSize` — number of players matched into each world at once

### Minion settings

- `minionName` — default minion name
- `minionSpawnSize` — spawn size for minions
- `minionEnableERTPControls` — ERT protocol control support for minions
- `minionEnableQBasedControl` — toggle minion control with Q key
- `minionAlwaysSplits` — force minions to split
- `minionEatsViruses` — allow minions to eat viruses
- `minionEatsEjects` — allow minions to eat ejects
- `minionEatsPlayers` — allow minions to eat other players

### Pellet settings

- `pelletMinSize` — minimum pellet size
- `pelletMaxSize` — maximum pellet size
- `pelletGrowTicks` — ticks required for pellets to grow
- `pelletCount` — number of pellets kept in the world

### Virus settings

- `virusMinCount` — minimum virus count
- `virusMaxCount` — maximum virus count
- `virusSize` — virus size
- `virusFeedTimes` — virus feed count before splitting
- `virusPushing` — virus pushing mode enabled
- `virusSplitBoost` — boost applied when a virus splits
- `virusPushBoost` — boost applied when a cell hits a virus
- `virusMonotonePops` — unify virus pop effects

### Ejected mass settings

- `ejectedSize` — size of ejected mass
- `ejectingLoss` — mass lost when ejecting
- `ejectDispersion` — spread factor for ejected mass
- `ejectedCellBoost` — movement boost for ejected cells

### Mothercell settings

- `mothercellSize` — mothercell size
- `mothercellCount` — number of mothercells in the world
- `mothercellPassiveSpawnChance` — passive spawn chance for mothercells
- `mothercellActiveSpawnSpeed` — active pellet spawn speed
- `mothercellPelletBoost` — pellet boost when mothercell spawns matter
- `mothercellMaxPellets` — maximum pellets from a mothercell
- `mothercellMaxSize` — maximum mothercell size

### Player movement and gameplay

- `playerRoamSpeed` — speed while spectating / roaming
- `playerRoamViewScale` — view scale when roaming
- `playerViewScaleMult` — global view scale multiplier
- `playerMinViewScale` — minimum allowed view scale
- `playerMaxNameLength` — maximum player name length
- `playerAllowSkinInName` — allow skins embedded in names

### Player cell and split settings

- `playerMinSize` — minimum player cell size
- `playerSpawnSize` — default spawn cell size
- `playerMaxSize` — maximum player cell size
- `playerMinSplitSize` — minimum size required to split
- `playerMinEjectSize` — minimum size required to eject mass
- `playerSplitCap` — maximum splits per tick
- `playerEjectDelay` — eject cooldown in ticks
- `playerMaxCells` — maximum cells a player can own

### Gameplay physics

- `playerMoveMult` — player movement speed multiplier
- `playerSplitSizeDiv` — split size divider
- `playerSplitDistance` — split separation distance
- `playerSplitBoost` — boost applied to split cells
- `playerNoCollideDelay` — no-collide grace ticks after spawning/splitting
- `playerNoMergeDelay` — time before cells can merge
- `playerMergeVersion` — merge formula version (`old` or `new`)
- `playerMergeTime` — merge delay multiplier
- `playerMergeTimeIncrease` — merge delay growth per size
- `playerDecayMult` — natural size decay multiplier

## Compile to a Windows executable

This repository is a Node.js server with native bindings. You can package it into a standalone Windows EXE using a packager such as `pkg` or `nexe`, but you first need to build the native module.

### Option 1: `pkg`

1. Install `pkg` globally:

```bash
npm install -g pkg
```

2. Build the exe from the repo root:

```bash
pkg cli/index.js --targets node18-win-x64 --output sig-server.exe
```

If the native `.node` binding is not included automatically, build it first with `npm install` or `npm rebuild`, then copy the compiled binary from `build/Release/` alongside the generated EXE.

## GitHub Actions workflows

This project includes two workflows:

- `.github/workflows/build-exe.yml` — runs on `push` to `main` and manually via the Actions UI; builds `sig-server.exe` and uploads it as a workflow artifact.
- `.github/workflows/release-exe.yml` — runs when a GitHub release is published; builds `sig-server.exe` and uploads it directly to the release assets.

### Build workflow

The build workflow is useful for CI artifact generation without publishing a release. It compiles the EXE and stores it in the workflow run artifacts.

### Release workflow

The release workflow runs automatically when a release is published and attaches `sig-server.exe` to the GitHub release.

## Notes

- The server uses `settings.json` in the current working directory.
- If you want to customize a setting, edit `settings.json` and run `reload` in the CLI.
- `adddummy` creates training targets that look like player cells but remain frozen.
- The native core is in `src/ccore/`; if the build fails, install required build tools for your platform.
