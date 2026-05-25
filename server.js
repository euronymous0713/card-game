const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

function generateRoomId() {

    return Math.floor(1000 + Math.random() * 9000).toString();

}

io.on("connection", (socket) => {

    console.log("接続");

    // =========================
    // ルーム作成
    // =========================

    socket.on("createRoom", (playerName) => {

        const roomId = generateRoomId();

        rooms[roomId] = [];

        rooms[roomId].push({
            id: socket.id,
            name: playerName,
            ready: false
        });

        socket.join(roomId);

        socket.emit("roomCreated", roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);

    });

    // =========================
    // ルーム参加
    // =========================

    socket.on("joinRoom", ({ roomId, playerName }) => {

        if (!rooms[roomId]) {

            socket.emit("errorMessage", "ルームが存在しません");
            return;

        }

        if (rooms[roomId].length >= 4) {

            socket.emit("errorMessage", "満員です");
            return;

        }

        rooms[roomId].push({
            id: socket.id,
            name: playerName,
            ready: false
        });

        socket.join(roomId);

        socket.emit("joinSuccess", roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);

    });

    // =========================
    // 準備完了
    // =========================

    socket.on("playerReady", (roomId) => {

        const room = rooms[roomId];

        if (!room) return;

        const player = room.find(p => p.id === socket.id);

        if (!player) return;

        player.ready = !player.ready;

        io.to(roomId).emit("updateRoom", room);

    });

    // =========================
    // ゲーム開始
    // =========================

    socket.on("startGame", (roomId) => {

        const room = rooms[roomId];

        if (!room) return;

        const allReady = room.every(player => player.ready);

        if (!allReady) {

            socket.emit("errorMessage", "全員準備完了していません");
            return;

        }

        io.to(roomId).emit("gameStarted");

    });

    // =========================
    // 退出
    // =========================

    socket.on("leaveRoom", (roomId) => {

        if (!rooms[roomId]) return;

        rooms[roomId] = rooms[roomId].filter(
            player => player.id !== socket.id
        );

        socket.leave(roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);

        // 空部屋削除
        if (rooms[roomId].length === 0) {

            delete rooms[roomId];

        }

    });

    // =========================
    // 切断
    // =========================

    socket.on("disconnect", () => {

        for (const roomId in rooms) {

            rooms[roomId] = rooms[roomId].filter(
                player => player.id !== socket.id
            );

            io.to(roomId).emit("updateRoom", rooms[roomId]);

            if (rooms[roomId].length === 0) {

                delete rooms[roomId];

            }

        }

    });

});

server.listen(3000, () => {

    console.log("サーバー起動");

});