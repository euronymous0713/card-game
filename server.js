const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server);

// publicフォルダ公開
app.use(express.static("public"));

console.log("サーバー起動");

// ルーム保存
const rooms = {};

// =========================
// 接続
// =========================

io.on("connection", (socket) => {

    console.log("ユーザー接続");

    // =========================
    // ルーム作成
    // =========================

    socket.on("createRoom", (playerName) => {

        const roomId =
            Math.floor(1000 + Math.random() * 9000).toString();

        rooms[roomId] = [];

        rooms[roomId].push({
            id: socket.id,
            name: playerName,
            ready: false
        });

        socket.join(roomId);

        socket.roomId = roomId;

        socket.emit("roomCreated", roomId);

        io.to(roomId).emit(
            "updateRoom",
            rooms[roomId]
        );

    });

    // =========================
    // ルーム参加
    // =========================

    socket.on("joinRoom", (data) => {

        const roomId = data.roomId;

        const playerName = data.playerName;

        // 存在確認
        if (!rooms[roomId]) {

            socket.emit(
                "errorMessage",
                "ルームが存在しません"
            );

            return;
        }

        // 最大4人
        if (rooms[roomId].length >= 4) {

            socket.emit(
                "errorMessage",
                "ルームが満員です"
            );

            return;
        }

        rooms[roomId].push({
            id: socket.id,
            name: playerName,
            ready: false
        });

        socket.join(roomId);

        socket.roomId = roomId;

        socket.emit("joinSuccess", roomId);

        io.to(roomId).emit(
            "updateRoom",
            rooms[roomId]
        );

    });

    // =========================
    // Ready
    // =========================

    socket.on("playerReady", () => {

        const roomId = socket.roomId;

        if (!roomId) return;

        const player =
            rooms[roomId].find(
                p => p.id === socket.id
            );

        if (!player) return;

        player.ready = true;

        io.to(roomId).emit(
            "updateRoom",
            rooms[roomId]
        );

    });

    // =========================
    // 切断
    // =========================

    socket.on("disconnect", () => {

        const roomId = socket.roomId;

        if (!roomId) return;

        if (!rooms[roomId]) return;

        rooms[roomId] =
            rooms[roomId].filter(
                p => p.id !== socket.id
            );

        io.to(roomId).emit(
            "updateRoom",
            rooms[roomId]
        );

    });

});

// =========================
// 起動
// =========================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(`Server running on ${PORT}`);

});