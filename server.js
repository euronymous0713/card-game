const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("接続:", socket.id);

    socket.on("attack", () => {
        io.emit("message", "攻撃！");
    });
});

server.listen(3000, () => {
    console.log("サーバー起動");
});