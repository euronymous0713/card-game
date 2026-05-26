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

function shuffleArray(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

function createGameState(players) {
    const turnOrder = shuffleArray(players).map(player => ({
        id: player.id,
        name: player.name,
        followers: 10000,
        hate: 0,
        host: player.host
    }));

    return {
        turnOrder,
        currentTurnIndex: 0,
        playedCards: [],
        phase: "battle"
    };
}

function getCurrentPlayer(game) {
    return game.turnOrder[game.currentTurnIndex];
}

function clampHate(value) {
    return Math.max(0, Math.min(3, value));
}

io.on("connection", (socket) => {
    console.log("接続:", socket.id);

    socket.on("createRoom", (playerName) => {
        const roomId = generateRoomId();

        rooms[roomId] = {
            players: [{
                id: socket.id,
                name: playerName,
                ready: false,
                host: true
            }],
            game: null
        };

        socket.join(roomId);
        socket.emit("roomCreated", roomId);
        io.to(roomId).emit("updateRoom", rooms[roomId].players);
    });

    socket.on("joinRoom", ({ roomId, playerName }) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit("errorMessage", "ルームが存在しません");
            return;
        }

        if (room.players.length >= 4) {
            socket.emit("roomFull");
            socket.emit("errorMessage", "このルームは満員です（最大4人）");
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            ready: false,
            host: false
        });

        socket.join(roomId);
        socket.emit("joinSuccess", roomId);
        io.to(roomId).emit("updateRoom", room.players);
    });

    socket.on("toggleReady", ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.ready = !player.ready;
        io.to(roomId).emit("updateRoom", room.players);
    });

    socket.on("startGame", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const starter = room.players.find(p => p.id === socket.id);

        if (!starter || !starter.host) {
            socket.emit("errorMessage", "ゲーム開始はルーム作成者のみ可能です");
            return;
        }

        if (room.players.length < 2) {
            socket.emit("errorMessage", "ゲーム開始には2人以上必要です");
            return;
        }

        if (!room.players.every(p => p.ready)) {
            socket.emit("errorMessage", "全員が準備完了していません");
            return;
        }

        room.game = createGameState(room.players);

        io.to(roomId).emit("gameStarted");
        io.to(roomId).emit("updateGame", room.game);
    });

    socket.on("playCard", ({ roomId, card, targetId }) => {
        const room = rooms[roomId];

        if (!room || !room.game) return;

        const game = room.game;
        const currentPlayer = getCurrentPlayer(game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        const caster = game.turnOrder.find(p => p.id === socket.id);
        const target = game.turnOrder.find(p => p.id === targetId);

        if (!caster) return;

        if (game.turnOrder.length >= 3 && !target) {
            socket.emit("errorMessage", "対象プレイヤーを選択してください");
            return;
        }

        const finalTarget = target || game.turnOrder.find(p => p.id !== socket.id);

        if (!finalTarget) {
            socket.emit("errorMessage", "対象が存在しません");
            return;
        }

        if (finalTarget.id === socket.id && card.targetType !== "self") {
            socket.emit("errorMessage", "このカードは自分には使えません");
            return;
        }

        if (card.hateTarget === "self") {
            caster.hate = clampHate(caster.hate + card.hateChange);
        }

        if (card.hateTarget === "target") {
            finalTarget.hate = clampHate(finalTarget.hate + card.hateChange);
        }

        game.playedCards.push({
            playerId: socket.id,
            playerName: caster.name,
            targetId: finalTarget.id,
            targetName: finalTarget.name,
            cardName: card.name,
            cardType: card.type,
            effect: card.effect,
            hateText: card.hateText
        });

        io.to(roomId).emit("updateGame", game);
    });

    socket.on("endTurn", (roomId) => {
        const room = rooms[roomId];

        if (!room || !room.game) return;

        const currentPlayer = getCurrentPlayer(room.game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        room.game.currentTurnIndex =
            (room.game.currentTurnIndex + 1) % room.game.turnOrder.length;

        io.to(roomId).emit("updateGame", room.game);
    });

    socket.on("leaveRoom", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (player.host) {
            socket.emit("errorMessage", "ルーム作成者は退出ではなく解散してください");
            return;
        }

        room.players = room.players.filter(p => p.id !== socket.id);

        socket.leave(roomId);
        io.to(roomId).emit("updateRoom", room.players);
    });

    socket.on("disbandRoom", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);

        if (!player || !player.host) {
            socket.emit("errorMessage", "ルームを解散できるのは作成者のみです");
            return;
        }

        io.to(roomId).emit("roomDisbanded");

        const clients = io.sockets.adapter.rooms.get(roomId);

        if (clients) {
            clients.forEach(clientId => {
                const clientSocket = io.sockets.sockets.get(clientId);
                if (clientSocket) clientSocket.leave(roomId);
            });
        }

        delete rooms[roomId];
    });

    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const player = room.players.find(p => p.id === socket.id);

            if (!player) continue;

            if (player.host) {
                io.to(roomId).emit("roomDisbanded");
                delete rooms[roomId];
                continue;
            }

            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(roomId).emit("updateRoom", room.players);
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("サーバー起動");
});