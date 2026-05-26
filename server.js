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

    // =====================
    // ルーム作成
    // =====================
    socket.on("createRoom", (playerName) => {

        const roomId = generateRoomId();

        rooms[roomId] = [{
            id: socket.id,
            name: playerName,
            ready: false,
            host: true
        }];

        socket.join(roomId);

        socket.emit("roomCreated", roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);
    });

    // =====================
    // ルーム参加（最大5人）
    // =====================
    socket.on("joinRoom", ({ roomId, playerName }) => {

        const room = rooms[roomId];

        if (!room) {
            socket.emit("errorMessage", "ルームが存在しません");
            return;
        }

        if (room.length >= 5) {
            socket.emit("roomFull");
            return;
        }

        room.push({
            id: socket.id,
            name: playerName,
            ready: false,
            host: false
        });

        socket.join(roomId);

        socket.emit("joinSuccess", roomId);

        io.to(roomId).emit("updateRoom", room);
    });

    // =====================
    // 準備切替
    // =====================
    socket.on("toggleReady", ({ roomId }) => {

        const room = rooms[roomId];
        if (!room) return;

        const player = room.find(p => p.id === socket.id);
        if (!player) return;

        player.ready = !player.ready;

        io.to(roomId).emit("updateRoom", room);
    });

    // =====================
    // ゲーム開始条件
    // =====================
    socket.on("startGame", (roomId) => {

        const room = rooms[roomId];
        if (!room) return;

        if (room.length < 2) {
            socket.emit("errorMessage", "2人以上必要です");
            return;
        }

        if (!room.every(p => p.ready)) {
            socket.emit("errorMessage", "全員準備完了していません");
            return;
        }

        io.to(roomId).emit("gameStarted");
    });

    // =====================
    // 退出
    // =====================
    socket.on("leaveRoom", (roomId) => {

        const room = rooms[roomId];
        if (!room) return;

        rooms[roomId] = room.filter(p => p.id !== socket.id);

        socket.leave(roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);
    });

    // =====================
    // 解散（ホストのみ）
    // =====================
    socket.on("disbandRoom", (roomId) => {

        const room = rooms[roomId];
        if (!room) return;

        const player = room.find(p => p.id === socket.id);

        if (!player?.host) return;

        io.to(roomId).emit("roomDisbanded");

        delete rooms[roomId];
    });

    // =====================
    // 切断
    // =====================
    socket.on("disconnect", () => {

        for (const roomId in rooms) {

            const room = rooms[roomId];

            const player = room.find(p => p.id === socket.id);
            if (!player) continue;

            if (player.host) {
                io.to(roomId).emit("roomDisbanded");
                delete rooms[roomId];
                continue;
            }

            rooms[roomId] = room.filter(p => p.id !== socket.id);

            io.to(roomId).emit("updateRoom", rooms[roomId]);
        }
    });
});

server.listen(3000, () => {
    console.log("サーバー起動");
});