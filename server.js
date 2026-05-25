const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = {};

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("接続:", socket.id);

    socket.on("attack", () => {
        io.emit("message", "攻撃！");
    });
    socket.on("createRoom", ({ roomCode, name }) => {

        rooms[roomCode] = {
            roomCode,
            players: []
        };

        rooms[roomCode].players.push({
            id: socket.id,
            name
        });

        socket.join(roomCode);

        io.to(roomCode).emit(
            "roomJoined",
            rooms[roomCode]
        );

    });

    socket.on("joinRoom", ({ roomCode, name }) => {

        const room = rooms[roomCode];

        if (!room) return;

        room.players.push({
            id: socket.id,
            name
        });

        socket.join(roomCode);

        io.to(roomCode).emit(
            "roomJoined",
            room
        );

    });
});

server.listen(3000, () => {
    console.log("サーバー起動");
});