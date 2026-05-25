const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// publicフォルダ公開
app.use(express.static("public"));

const rooms = {};

// 接続時
io.on("connection", (socket) => {

    console.log("接続:", socket.id);

    // ルーム作成
    socket.on("createRoom", () => {

        const roomId = Math.floor(1000 + Math.random() * 9000).toString();

        rooms[roomId] = [];

        rooms[roomId].push(socket.id);

        socket.join(roomId);

        socket.emit("roomCreated", roomId);

        io.to(roomId).emit("updatePlayers", rooms[roomId]);

        console.log("ルーム作成:", roomId);
    });

    // ルーム参加
    socket.on("joinRoom", (roomId) => {

        if (!rooms[roomId]) {
            socket.emit("joinError", "ルームが存在しません");
            return;
        }

        if (rooms[roomId].length >= 4) {
            socket.emit("joinError", "ルームが満員です");
            return;
        }

        rooms[roomId].push(socket.id);

        socket.join(roomId);

        io.to(roomId).emit("updatePlayers", rooms[roomId]);

        console.log("参加:", roomId);
    });

    // 切断
    socket.on("disconnect", () => {

        console.log("切断:", socket.id);

        for (const roomId in rooms) {

            rooms[roomId] =
                rooms[roomId].filter(id => id !== socket.id);

            io.to(roomId).emit("updatePlayers", rooms[roomId]);

            // 空なら削除
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

// Render対応
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("サーバー起動");
});