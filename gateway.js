// Single public port ($PORT): /admin goes to the admin panel, the game WebSocket goes to the internal listener.
const http = require("http");
const net = require("net");

module.exports = function startGateway(publicPort, gamePort, adminPort, adminPath) {
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
    server.on("upgrade", (req, socket, head) => {
        const upstream = net.connect(gamePort, "127.0.0.1", () => {
            let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
            for (let i = 0; i < req.rawHeaders.length; i += 2)
                raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
            upstream.write(raw + "\r\n");
            if (head && head.length) upstream.write(head);
            socket.pipe(upstream).pipe(socket);
        });
        upstream.setNoDelay(true);
        socket.setNoDelay(true);
        upstream.on("error", () => socket.destroy());
        socket.on("error", () => upstream.destroy());
    });
    server.listen(publicPort, "0.0.0.0");
    return server;
};
