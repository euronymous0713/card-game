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

    console.log("接続:", socket.id);

    socket.on("createRoom", (playerName) => {

        const roomId = generateRoomId();

        rooms[roomId] = [
            {
                id: socket.id,
                name: playerName,
                ready: false,
                host: true
            }
        ];

        socket.join(roomId);

        socket.emit("roomCreated", roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);
    });

    socket.on("joinRoom", ({ roomId, playerName }) => {

        const room = rooms[roomId];

        if (!room) {
            socket.emit("errorMessage", "ルームが存在しません");
            return;
        }

        // ここが重要：4人以上なら入室拒否
        if (room.length >= 4) {
            socket.emit("roomFull");
            socket.emit("errorMessage", "このルームは満員です（最大4人）");
            return;
        }

        const alreadyJoined = room.some(player => player.id === socket.id);

        if (alreadyJoined) {
            socket.emit("errorMessage", "すでにこのルームに参加しています");
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

    socket.on("toggleReady", ({ roomId }) => {

        const room = rooms[roomId];

        if (!room) return;

        const player = room.find(player => player.id === socket.id);

        if (!player) return;

        player.ready = !player.ready;

        io.to(roomId).emit("updateRoom", room);
    });

    socket.on("startGame", (roomId) => {

        const room = rooms[roomId];

        if (!room) return;

        const starter = room.find(player => player.id === socket.id);

        if (!starter || !starter.host) {
            socket.emit("errorMessage", "ゲーム開始はルーム作成者のみ可能です");
            return;
        }

        if (room.length < 2) {
            socket.emit("errorMessage", "ゲーム開始には2人以上必要です");
            return;
        }

        const allReady = room.every(player => player.ready);

        if (!allReady) {
            socket.emit("errorMessage", "全員が準備完了していません");
            return;
        }

        io.to(roomId).emit("gameStarted");
    });

    socket.on("leaveRoom", (roomId) => {

        const room = rooms[roomId];

        if (!room) return;

        const player = room.find(player => player.id === socket.id);

        if (!player) return;

        if (player.host) {
            socket.emit("errorMessage", "ルーム作成者は退出ではなく解散してください");
            return;
        }

        rooms[roomId] = room.filter(player => player.id !== socket.id);

        socket.leave(roomId);

        io.to(roomId).emit("updateRoom", rooms[roomId]);
    });

    socket.on("disbandRoom", (roomId) => {

        const room = rooms[roomId];

        if (!room) return;

        const player = room.find(player => player.id === socket.id);

        if (!player || !player.host) {
            socket.emit("errorMessage", "ルームを解散できるのは作成者のみです");
            return;
        }

        io.to(roomId).emit("roomDisbanded");

        const clients = io.sockets.adapter.rooms.get(roomId);

        if (clients) {
            clients.forEach(clientId => {
                const clientSocket = io.sockets.sockets.get(clientId);
                if (clientSocket) {
                    clientSocket.leave(roomId);
                }
            });
        }

        delete rooms[roomId];
    });

    socket.on("disconnect", () => {

        for (const roomId in rooms) {

            const room = rooms[roomId];

            const player = room.find(player => player.id === socket.id);

            if (!player) continue;

            if (player.host) {
                io.to(roomId).emit("roomDisbanded");
                delete rooms[roomId];
                continue;
            }

            rooms[roomId] = room.filter(player => player.id !== socket.id);

            io.to(roomId).emit("updateRoom", rooms[roomId]);
        }
    });
});

server.listen(3000, () => {
    console.log("サーバー起動");
});