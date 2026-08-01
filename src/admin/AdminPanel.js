const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const { URL } = require("url");

const DEFAULT_PORT = 84;
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function isPlainScalar(value) {
    return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function normalizeSettingsPatch(payload, currentSettings) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

    const result = {};
    const allowedKeys = Object.keys(currentSettings || {});

    for (const key of Object.keys(payload)) {
        if (!allowedKeys.includes(key)) continue;
        if (isPlainScalar(payload[key])) {
            result[key] = coerceSettingValue(payload[key]);
        } else if (Array.isArray(payload[key]) && payload[key].every(isPlainScalar)) {
            result[key] = payload[key].map((item) => coerceSettingValue(item));
        }
    }

    return result;
}

function hashAdminToken(token) {
    if (typeof token !== "string") return "";
    return crypto.createHash("sha256").update(token).digest("hex");
}

function isAdminToken(token, tokens) {
    if (typeof token !== "string") return false;
    const normalized = token.trim();
    if (!normalized) return false;
    const tokenHash = hashAdminToken(normalized);
    if (!Array.isArray(tokens)) return false;
    return tokens.some((value) => {
        const stored = String(value).trim();
        if (!stored) return false;
        if (stored.length === 64 && /^[0-9a-f]+$/i.test(stored)) {
            return crypto.timingSafeEqual(Buffer.from(tokenHash, "hex"), Buffer.from(stored, "hex"));
        }
        return stored === normalized;
    });
}

function coerceSettingValue(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return value;
}

function isAdminPanelSettingName(settingName) {
    if (typeof settingName !== "string") return false;
    const normalized = settingName.trim();
    if (!normalized) return false;
    return normalized === "adminPanelEnabled"
        || normalized === "adminPanelPort"
        || normalized === "adminPanelPath"
        || normalized === "adminPanelTokens"
        || normalized === "adminPanelSessions"
        || normalized.startsWith("adminPanel");
}

function isAdminCommandAllowed(command) {
    if (typeof command !== "string") return false;
    const trimmed = command.trim();
    if (!trimmed) return false;

    const parts = trimmed.split(/\s+/).filter(Boolean);
    const commandName = parts[0].toLowerCase();
    const forbiddenCommands = new Set(["eval", "forbid", "pardon", "gentoken"]);

    if (forbiddenCommands.has(commandName)) return false;
    if (commandName === "setting") {
        const targetSettingName = parts[1];
        if (isAdminPanelSettingName(targetSettingName)) return false;
        return true;
    }

    return true;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return char;
        }
    });
}

class AdminPanel {
    constructor(handle) {
        this.handle = handle;
        this.server = null;
        this.sessions = new Map();
        this.sessionCounter = 1;
        this.logEntries = [];
        this.logLimit = 250;

        const originalLogger = this.handle.logger.onlog;
        this.handle.logger.onlog = (time, level, message) => {
            if (originalLogger) originalLogger(time, level, message);
            this._appendLog(time, level, message);
        };
    }

    get enabled() {
        return this.handle.settings.adminPanelEnabled !== false;
    }

    get port() {
        const parsed = Number(this.handle.settings.adminPanelPort || DEFAULT_PORT);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
    }

    get path() {
        return this.handle.settings.adminPanelPath || "/admin";
    }

    get adminTokens() {
        return Array.isArray(this.handle.settings.adminPanelTokens) ? this.handle.settings.adminPanelTokens : [];
    }

    _getFingerprint(req) {
        const userAgent = String(req.headers["user-agent"] || "").trim();
        const remoteAddress = req.socket.remoteAddress || "";
        return `${remoteAddress}:${userAgent}`;
    }

    _authenticate(req) {
        const session = this._getSession(req);
        if (session) return session;
        return null;
    }

    _createSession(tokenHash, fingerprint) {
        let sessionId;
        do {
            sessionId = crypto.randomBytes(16).toString("hex");
        } while (this.sessions.has(sessionId));
        this.sessions.set(sessionId, { tokenHash, fingerprint, createdAt: Date.now(), user: "Admin" });
        return sessionId;
    }

    _persistSessions() {
        const active = [];
        for (const [id, session] of this.sessions.entries()) {
            active.push({
                id,
                fingerprint: session.fingerprint,
                createdAt: session.createdAt,
                tokenHash: session.tokenHash
            });
        }
        this.handle.settings.adminPanelSessions = active;
    }

    _loadPersistedSessions() {
        this.sessions.clear();
        const persisted = Array.isArray(this.handle.settings.adminPanelSessions) ? this.handle.settings.adminPanelSessions : [];
        const now = Date.now();
        const active = [];
        for (const item of persisted) {
            if (!item || typeof item.id !== "string" || typeof item.fingerprint !== "string" || typeof item.createdAt !== "number") continue;
            if (now - item.createdAt > SESSION_TTL_MS) continue;
            this.sessions.set(item.id, {
                fingerprint: item.fingerprint,
                createdAt: item.createdAt,
                tokenHash: item.tokenHash || "",
                user: typeof item.user === "string" ? item.user : "Admin"
            });
            active.push(item);
        }
        this.handle.settings.adminPanelSessions = active;
    }

    _appendLog(time, level, message) {
        const entry = {
            time: time instanceof Date ? time.toISOString() : new Date().toISOString(),
            level: String(level || "PRINT"),
            message: String(message || "")
        };
        this.logEntries.push(entry);
        if (this.logEntries.length > this.logLimit) {
            this.logEntries.splice(0, this.logEntries.length - this.logLimit);
        }
    }

    start() {
        if (!this.enabled || this.server) return false;
        this._loadPersistedSessions();
        this.server = http.createServer(this.handleRequest.bind(this));
        this.server.listen(this.port, "0.0.0.0");
        this.server.on("error", (error) => {
            this.handle.logger?.warn?.(`admin panel failed to start on port ${this.port}: ${error.message}`);
        });
        this.handle.logger?.inform?.(`admin panel listening on port ${this.port} at ${this.path}`);
        return true;
    }

    stop() {
        if (!this.server) return false;
        this.server.close();
        this.server = null;
        return true;
    }

    _readBody(req) {
        return new Promise((resolve) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk;
                if (body.length > 1e6) req.socket.destroy();
            });
            req.on("end", () => resolve(body));
        });
    }

    _parseBody(body) {
        if (!body) return {};
        try {
            return JSON.parse(body);
        } catch (_) {
            const entries = new URLSearchParams(body);
            const result = {};
            for (const [key, value] of entries.entries()) result[key] = value;
            return result;
        }
    }

    _setSessionCookie(res, sessionId) {
        res.setHeader("Set-Cookie", [`admin_session=${sessionId}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax`]);
    }

    _clearSessionCookie(res) {
        res.setHeader("Set-Cookie", [`admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`]);
    }

    _getSession(req) {
        const cookies = Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((entry) => {
            const index = entry.indexOf("=");
            if (index < 0) return [entry.trim(), ""];
            return [entry.slice(0, index).trim(), entry.slice(index + 1).trim()];
        }));

        const sessionId = cookies.admin_session;
        if (!sessionId) return null;
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        if (Date.now() - session.createdAt > SESSION_TTL_MS) {
            this.sessions.delete(sessionId);
            this._persistSessions();
            this._saveSettings();
            return null;
        }
        if (session.fingerprint !== this._getFingerprint(req)) {
            this.sessions.delete(sessionId);
            this._persistSessions();
            this._saveSettings();
            return null;
        }
        return session;
    }

    _saveSettings() {
        fs.writeFileSync("./settings.json", JSON.stringify(this.handle.settings, null, 4), "utf-8");
    }

    async handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const pathname = url.pathname;

        if (!this.enabled) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("admin panel disabled");
            return;
        }

        if (pathname === this.path || pathname === `${this.path}/`) {
            const session = this._getSession(req);
            if (session) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(this._dashboardHtml(session));
                return;
            }

            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this._loginHtml());
            return;
        }

        if (pathname === `${this.path}/login` && req.method === "POST") {
            const fingerprint = this._getFingerprint(req);
            const body = await this._readBody(req);
            const payload = this._parseBody(body);
            const token = String(payload.token || "").trim();
            if (!isAdminToken(token, this.adminTokens)) {
                res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "invalid admin token" }));
                return;
            }

            const tokenHash = hashAdminToken(token);
            const tokenIndex = this.handle.settings.adminPanelTokens.findIndex((value) => {
                const stored = String(value).trim();
                if (stored.length === 64 && /^[0-9a-f]+$/i.test(stored)) {
                    return crypto.timingSafeEqual(Buffer.from(tokenHash, "hex"), Buffer.from(stored, "hex"));
                }
                return stored === token;
            });
            if (tokenIndex === -1) {
                res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "invalid admin token" }));
                return;
            }

            const sessionId = this._createSession(tokenHash, fingerprint);
            this._setSessionCookie(res, sessionId);
            this.handle.settings.adminPanelTokens.splice(tokenIndex, 1);
            this._persistSessions();
            this._saveSettings();

            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (pathname === `${this.path}/login`) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this._loginHtml());
            return;
        }

        if (pathname === `${this.path}/logout`) {
            const cookies = Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((entry) => {
                const index = entry.indexOf("=");
                if (index < 0) return [entry.trim(), ""];
                return [entry.slice(0, index).trim(), entry.slice(index + 1).trim()];
            }));
            const sessionId = cookies.admin_session;
            if (sessionId) {
                this.sessions.delete(sessionId);
                this._persistSessions();
                this._saveSettings();
            }
            this._clearSessionCookie(res);
            res.writeHead(302, { Location: this.path });
            res.end();
            return;
        }

        if (pathname === `${this.path}/api/logs`) {
            const session = this._authenticate(req);
            if (!session) {
                res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "not authenticated" }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, logs: this.logEntries.slice(-this.logLimit) }));
            return;
        }

        if (pathname === `${this.path}/api/status`) {
            const session = this._authenticate(req);
            if (!session) {
                res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "not authenticated" }));
                return;
            }

            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, email: session.email, serverName: this.handle.settings.serverName, running: this.handle.running }));
            return;
        }

        if (pathname === `${this.path}/api/command` && req.method === "POST") {
            const session = this._authenticate(req);
            if (!session) {
                res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "not authenticated" }));
                return;
            }

            const body = await this._readBody(req);
            const payload = this._parseBody(body);
            const command = String(payload.command || "").trim();
            if (!command) {
                res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "missing command" }));
                return;
            }

            if (!isAdminCommandAllowed(command)) {
                res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: "this command is not allowed from the admin shell" }));
                return;
            }

            this.handle.logger.print(`admin command: ${command}`);
            const executed = this.handle.commands.execute(null, command);
            if (!executed) {
                this.handle.logger.print(`unknown command: ${command}`);
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: executed, message: executed ? `executed: ${command}` : `unknown command: ${command}` }));
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
    }

    _loginHtml() {
        return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Admin Login</title><style>body{margin:0;background:radial-gradient(circle at top left,#2b2a5c,#0d0d14 45%);color:#f5f5f8;font-family:'Inter',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}*{box-sizing:border-box}a,button{font:inherit}button{cursor:pointer}main{width:100%;max-width:540px;background:rgba(18,20,34,.92);border:1px solid rgba(255,255,255,.08);border-radius:32px;backdrop-filter:blur(24px);box-shadow:0 40px 120px rgba(0,0,0,.35);overflow:hidden}header{padding:36px 32px 24px}h1{margin:0;font-size:2.4rem;letter-spacing:.04em;color:#fff}p{margin:14px 0 0;line-height:1.7;color:#c7c7d7}form{display:grid;gap:18px;padding:0 32px 34px}label{display:block;color:#c7c7d7;font-size:.95rem}input{width:100%;padding:16px 18px;border:none;border-radius:16px;background:rgba(255,255,255,.06);color:#f5f5f8;outline:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}button{width:100%;padding:16px 18px;border:none;border-radius:16px;background:linear-gradient(135deg,#e2b240,#f4e36b);color:#111;font-weight:700;letter-spacing:.02em;box-shadow:0 18px 40px rgba(226,178,64,.2)}.note{font-size:.9rem;color:#8b8bb4;line-height:1.6;margin-top:-8px}</style></head>
  <body>
    <main>
      <header>
        <h1>Admin portal</h1>
        <p>Enter your secure token to connect. Once authenticated, your session will stay active even after server restarts.</p>
      </header>
      <form id="login-form">
        <label for="token">Admin API token</label>
        <input type="password" id="token" name="token" placeholder="••••••••••••••••••••" required autocomplete="one-time-code">
        <button type="submit">Continue</button>
        <p class="note">Tokens are one-time use and bound to your browser machine for extra security.</p>
      </form>
    </main>
    <script>
      const form = document.getElementById('login-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const token = document.getElementById('token').value;
        const response = await fetch('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        const data = await response.json();
        if (data.ok) window.location.href = '/admin';
        else alert(data.error || 'login failed');
      });
    </script>
  </body>
</html>`;
    }

    _dashboardHtml(session) {
        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Admin Shell</title>
    <style>body{margin:0;background:radial-gradient(circle at top left,#1e1d3c,#07070c 58%);color:#ecf0ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;min-height:100vh}*{box-sizing:border-box}main{width:100%;max-width:980px;margin:0 auto;padding:28px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}h1{margin:0;font-size:2.2rem}p{margin:8px 0 0;color:#a3b4d3}a.logout{display:inline-flex;align-items:center;padding:10px 18px;border-radius:14px;background:rgba(255,255,255,.08);color:#fff;text-decoration:none;transition:background .2s ease}a.logout:hover{background:rgba(255,255,255,.14)}.terminal{min-height:320px;max-height:520px;overflow:auto;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:.95rem;color:#e9efff;line-height:1.6;white-space:pre-wrap;word-break:break-word}form{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}input{flex:1 1 0;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px 16px;background:rgba(255,255,255,.05);color:#fff;outline:none;min-width:220px}input:focus{border-color:rgba(255,255,255,.32)}button{border:none;padding:14px 20px;border-radius:14px;background:#6c63ff;color:#fff;cursor:pointer;transition:transform .2s ease,background .2s ease}button:hover{transform:translateY(-1px);background:#8376ff}.line{margin:0 0 10px}.line strong{color:#f6e05e}.line.error strong{color:#ff6b6b}.line.command strong{color:#7ef6d5}</style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Admin Shell</h1>
          <p>Logged in as <strong>${session.email}</strong>. Enter commands below and press Enter.</p>
        </div>
        <a class="logout" href="/admin/logout">Logout</a>
      </header>
      <div class="terminal" id="terminal"></div>
      <form id="command-form">
        <input id="command" autocomplete="off" autofocus type="text" placeholder="Type a server command here..." spellcheck="false">
        <button type="submit">Run</button>
      </form>
    </main>
    <script>
      const terminal = document.getElementById('terminal');
      const form = document.getElementById('command-form');
      const input = document.getElementById('command');
      const history = [];
      let historyIndex = -1;

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      }

      let displayedLogCount = 0;

      function appendMessage(text, type = 'info') {
        const line = document.createElement('div');
        line.className = 'line ' + (type === 'command' ? 'command' : type === 'error' ? 'error' : '');
        if (type === 'command') {
          line.innerHTML = '<strong>$</strong> ' + escapeHtml(text);
        } else {
          line.innerHTML = '<strong>[' + escapeHtml(type.toUpperCase()) + ']</strong> ' + escapeHtml(text);
        }
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
      }

      function appendLogEntry(entry) {
        const level = (entry.level || 'PRINT').toUpperCase();
        const type = level === 'ERROR' || level === 'FATAL' ? 'error' : 'info';
        const prefix = level === 'PRINT' ? 'LOG' : level;
        appendMessage(entry.time + ' ' + prefix + ': ' + entry.message, type);
      }

      async function fetchLogs() {
        try {
          const response = await fetch('/admin/api/logs');
          const data = await response.json();
          if (!data.ok || !Array.isArray(data.logs)) return;
          const logs = data.logs.slice(displayedLogCount);
          for (const entry of logs) {
            appendLogEntry(entry);
          }
          displayedLogCount = data.logs.length;
        } catch (error) {
          console.warn('failed to fetch logs', error);
        }
      }

      function pushHistory(value) {
        if (!value) return;
        if (history[history.length - 1] === value) return;
        history.push(value);
        if (history.length > 100) history.shift();
        historyIndex = history.length;
      }

      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (history.length === 0) return;
          historyIndex = Math.max(0, historyIndex - 1);
          input.value = history[historyIndex] || '';
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (history.length === 0) return;
          historyIndex = Math.min(history.length, historyIndex + 1);
          input.value = history[historyIndex] || '';
        }
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const command = input.value.trim();
        if (!command) return;
        appendMessage(command, 'command');
        pushHistory(command);
        input.value = '';
        try {
          const response = await fetch('/admin/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
          });
          const data = await response.json();
          if (!data.ok) {
            appendMessage(data.error || 'Command failed', 'error');
          } else {
            appendMessage(data.message || 'Command executed', 'info');
          }
          await fetchLogs();
        } catch (error) {
          appendMessage('Command failed: ' + error.message, 'error');
        }
      });

      fetchLogs();
      setInterval(fetchLogs, 3000);
    </script>
  </body>
</html>`;
    }
}

module.exports = {
    AdminPanel,
    normalizeSettingsPatch,
    isAdminToken,
    hashAdminToken,
    coerceSettingValue,
    isAdminCommandAllowed
};
