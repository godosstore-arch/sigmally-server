// Single public port ($PORT): /admin is proxied to the admin panel, and the game WebSocket
// attaches directly to this server (ExternalServer), so game traffic skips any extra hop.
const http = require("http");
const ExternalServer = require("./src/sockets/ExternalServer");

module.exports = function startGateway(publicPort, adminPort, adminPath) {
    const server = http.createServer((req, res) => {
        if (!req.url.startsWith(adminPath)) {
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("ok");
            return;
        }
        const upstream = http.request({
            host: "127.0.0.1", port: adminPort, path: req.url, method: req.method, headers: req.headers
        }, (up) => {
            res.writeHead(up.statusCode, up.headers);
            up.pipe(res);
        });
        upstream.on("error", () => { res.writeHead(502); res.end("admin panel unavailable"); });
        req.pipe(upstream);
    });
    server.on("connection", (socket) => socket.setNoDelay(true));
    server.listen(publicPort, "0.0.0.0");
    ExternalServer.server = server;
    return server;
};
