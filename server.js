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

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createGameState(players) {
    const turnOrder = shuffleArray(players).map(player => ({
        id: player.id,
        name: player.name,
        followers: 10000,
        hate: 0,
        host: player.host,
        fieldCards: [],
        defeated: false
    }));

    return {
        turnOrder,
        currentTurnIndex: 0,
        playedCards: [],
        phase: "battle",
        winner: null,
        gameOver: false
    };
}

function getCurrentPlayer(game) {
    return game.turnOrder[game.currentTurnIndex];
}

function getAlivePlayers(game) {
    return game.turnOrder.filter(player => !player.defeated);
}

function moveToNextAliveTurn(game) {
    const alivePlayers = getAlivePlayers(game);

    if (alivePlayers.length <= 1) return;

    do {
        game.currentTurnIndex =
            (game.currentTurnIndex + 1) % game.turnOrder.length;
    } while (game.turnOrder[game.currentTurnIndex].defeated);
}

function checkGameOver(game) {
    const alivePlayers = getAlivePlayers(game);

    if (alivePlayers.length === 1) {
        game.gameOver = true;
        game.winner = alivePlayers[0];
    }
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

        const player = room.players.find(player => player.id === socket.id);
        if (!player) return;

        player.ready = !player.ready;
        io.to(roomId).emit("updateRoom", room.players);
    });

    socket.on("startGame", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const starter = room.players.find(player => player.id === socket.id);

        if (!starter || !starter.host) {
            socket.emit("errorMessage", "ゲーム開始はルーム作成者のみ可能です");
            return;
        }

        if (room.players.length < 2) {
            socket.emit("errorMessage", "ゲーム開始には2人以上必要です");
            return;
        }

        if (!room.players.every(player => player.ready)) {
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

        if (game.gameOver) return;

        const currentPlayer = getCurrentPlayer(game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        if (currentPlayer.defeated) {
            socket.emit("errorMessage", "オワコン済みのため行動できません");
            return;
        }

        const caster = game.turnOrder.find(player => player.id === socket.id);
        const target = game.turnOrder.find(player => player.id === targetId);

        if (!caster) return;

        if (card.kind === "trap") {
            if (caster.fieldCards.length >= 2) {
                socket.emit("errorMessage", "伏せカードは最大2枚までです");
                return;
            }

            caster.fieldCards.push({
                id: card.id,
                name: card.name,
                type: card.type,
                effect: card.effect
            });

            caster.hate = clamp(caster.hate + card.hateChange, 0, 3);

            game.playedCards.push({
                playerName: caster.name,
                targetName: "自分の場",
                cardName: card.name,
                cardType: card.type,
                hateText: card.hateText,
                log: `${caster.name} はカードを1枚伏せた`
            });

            io.to(roomId).emit("updateGame", game);
            return;
        }

        if (card.targetType === "enemy") {
            if (!target) {
                socket.emit("errorMessage", "対象プレイヤーを選択してください");
                return;
            }

            if (target.id === socket.id) {
                socket.emit("errorMessage", "このカードは自分には使えません");
                return;
            }

            if (target.defeated) {
                socket.emit("errorMessage", "オワコン済みのプレイヤーは対象にできません");
                return;
            }
        }

        const finalTarget =
            card.targetType === "self"
                ? caster
                : target;

        if (!finalTarget) return;

        if (card.kind === "attack") {
            finalTarget.followers =
                Math.max(0, finalTarget.followers - card.damage);

            if (finalTarget.followers <= 0) {
                finalTarget.defeated = true;
            }
        }

        if (card.kind === "support") {
            caster.followers =
                Math.min(10000, caster.followers + card.heal);
        }

        if (card.hateTarget === "self") {
            caster.hate = clamp(caster.hate + card.hateChange, 0, 3);
        }

        if (card.hateTarget === "target") {
            finalTarget.hate = clamp(finalTarget.hate + card.hateChange, 0, 3);
        }

        game.playedCards.push({
            playerName: caster.name,
            targetName: finalTarget.name,
            cardName: card.name,
            cardType: card.type,
            hateText: card.hateText,
            log: `${caster.name} → ${finalTarget.name}：${card.name}`
        });

        checkGameOver(game);

        io.to(roomId).emit("updateGame", game);

        if (game.gameOver) {
            io.to(roomId).emit("gameOver", game.winner);
        }
    });

    socket.on("endTurn", (roomId) => {
        const room = rooms[roomId];

        if (!room || !room.game) return;

        const game = room.game;

        if (game.gameOver) return;

        const currentPlayer = getCurrentPlayer(game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        moveToNextAliveTurn(game);

        io.to(roomId).emit("updateGame", game);
    });

    socket.on("leaveRoom", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(player => player.id === socket.id);
        if (!player) return;

        if (player.host) {
            socket.emit("errorMessage", "ルーム作成者は退出ではなく解散してください");
            return;
        }

        room.players = room.players.filter(player => player.id !== socket.id);

        socket.leave(roomId);
        io.to(roomId).emit("updateRoom", room.players);
    });

    socket.on("disbandRoom", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(player => player.id === socket.id);

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

    socket.on("returnTitle", (roomId) => {
        const room = rooms[roomId];

        if (!room) return;

        socket.leave(roomId);

        delete rooms[roomId];
    });

    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];

            const player = room.players.find(player => player.id === socket.id);

            if (!player) continue;

            if (player.host) {
                io.to(roomId).emit("roomDisbanded");
                delete rooms[roomId];
                continue;
            }

            room.players = room.players.filter(player => player.id !== socket.id);

            io.to(roomId).emit("updateRoom", room.players);
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("サーバー起動");
});