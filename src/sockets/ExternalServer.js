// Holds an HTTP server provided by the host (see gateway.js) for the Listener to attach the game WebSocket to.
// Kept in its own module so it can be set before the server modules load.
module.exports = {
    /** @type {import("http").Server | null} */
    server: null
};
