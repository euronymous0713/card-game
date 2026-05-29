const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

const CARD_MASTER = [
    {
        id: "card-1",
        name: "炎上パンチ",
        type: "攻撃",
        kind: "attack",
        targetType: "enemy",
        damage: 2000,
        heal: 0,
        hateTarget: "self",
        hateChange: 1,
        hateText: "自分のヘイト +1",
        effect: "対象に2,000フォロワーダメージ。対象のヘイトが3ならダメージ2倍。自分のヘイトが1上がる。"
    },
    {
        id: "card-2",
        name: "お気持ち表明",
        type: "防御",
        kind: "support",
        targetType: "self",
        damage: 0,
        heal: 1000,
        hateTarget: "self",
        hateChange: -1,
        hateText: "自分のヘイト -1",
        effect: "自分のフォロワーを1,000回復。長文で沈静化し、自分のヘイトが1下がる。"
    },
    {
        id: "card-3",
        name: "釣りスレ",
        type: "罠",
        kind: "trap",
        targetType: "self",
        damage: 0,
        heal: 0,
        hateTarget: "self",
        hateChange: 1,
        hateText: "自分のヘイト +1",
        effect: "自分の場に伏せる。最大2枚まで伏せられる。"
    },
    {
        id: "card-4",
        name: "古参アピール",
        type: "補助",
        kind: "support",
        targetType: "self",
        damage: 0,
        heal: 1000,
        hateTarget: "self",
        hateChange: -1,
        hateText: "自分のヘイト -1",
        effect: "自分のフォロワーを1,000回復。『昔はよかった』でヘイトが1下がる。"
    }
];

function generateRoomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateCardInstance() {
    const baseCard =
        CARD_MASTER[Math.floor(Math.random() * CARD_MASTER.length)];

    return {
        ...baseCard,
        instanceId: `${baseCard.id}-${Date.now()}-${Math.random()}`
    };
}

function drawCards(player) {
    while (player.hand.length < 4) {
        player.hand.push(generateCardInstance());
    }
}

function shuffleArray(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createGameState(players) {
    const turnOrder = shuffleArray(players).map(player => {
        const gamePlayer = {
            id: player.id,
            name: player.name,
            followers: 10000,
            hate: 0,
            host: player.host,
            hand: [],
            fieldCards: [],
            defeated: false
        };

        drawCards(gamePlayer);

        return gamePlayer;
    });

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

    const nextPlayer = getCurrentPlayer(game);

    if (nextPlayer) {
        drawCards(nextPlayer);
    }
}

function checkGameOver(game) {
    const alivePlayers = getAlivePlayers(game);

    if (alivePlayers.length === 1) {
        game.gameOver = true;
        game.winner = alivePlayers[0];
    }
}

function removeCardFromHand(player, instanceId) {
    const index = player.hand.findIndex(card => card.instanceId === instanceId);

    if (index === -1) {
        return null;
    }

    const usedCard = player.hand[index];

    player.hand.splice(index, 1);

    return usedCard;
}

function createGameViewForPlayer(game, viewerId) {
    const view = JSON.parse(JSON.stringify(game));

    view.turnOrder = view.turnOrder.map(player => {
        if (player.id === viewerId) {
            return player;
        }

        return {
            ...player,
            hand: [],
            fieldCards: player.fieldCards.map(() => ({
                hidden: true,
                name: "伏せカード",
                type: "罠",
                effect: "",
                hateText: ""
            }))
        };
    });

    view.playedCards = view.playedCards.map(log => {
        if (log.actionType === "trap" && log.playerId !== viewerId) {
            return {
                ...log,
                cardName: "伏せカード",
                cardType: "罠",
                hateText: "カードを1枚伏せた",
                log: `${log.playerName} はカードを1枚伏せた`
            };
        }

        return log;
    });

    return view;
}

function emitGameUpdate(roomId) {
    const room = rooms[roomId];

    if (!room || !room.game) return;

    const clients = io.sockets.adapter.rooms.get(roomId);

    if (!clients) return;

    clients.forEach(clientId => {
        const clientSocket = io.sockets.sockets.get(clientId);

        if (!clientSocket) return;

        clientSocket.emit(
            "updateGame",
            createGameViewForPlayer(room.game, clientId)
        );
    });
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
        emitGameUpdate(roomId);
    });

    socket.on("playCard", ({ roomId, cardInstanceId, targetId }) => {
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

        if (!caster) return;

        const usedCard = removeCardFromHand(caster, cardInstanceId);

        if (!usedCard) {
            socket.emit("errorMessage", "そのカードは手札にありません");
            return;
        }

        const target = game.turnOrder.find(player => player.id === targetId);

        if (usedCard.kind === "trap") {
            if (caster.fieldCards.length >= 2) {
                caster.hand.push(usedCard);
                socket.emit("errorMessage", "伏せカードは最大2枚までです");
                return;
            }

            caster.fieldCards.push({
                id: usedCard.id,
                name: usedCard.name,
                type: usedCard.type,
                effect: usedCard.effect,
                hateText: usedCard.hateText
            });

            caster.hate = clamp(caster.hate + usedCard.hateChange, 0, 3);

            game.playedCards.push({
                actionType: "trap",
                playerId: caster.id,
                playerName: caster.name,
                targetName: "自分の場",
                cardName: usedCard.name,
                cardType: usedCard.type,
                hateText: usedCard.hateText,
                log: `${caster.name} は ${usedCard.name} を伏せた`
            });

            emitGameUpdate(roomId);
            return;
        }

        if (usedCard.targetType === "enemy") {
            if (!target) {
                caster.hand.push(usedCard);
                socket.emit("errorMessage", "対象プレイヤーを選択してください");
                return;
            }

            if (target.id === socket.id) {
                caster.hand.push(usedCard);
                socket.emit("errorMessage", "このカードは自分には使えません");
                return;
            }

            if (target.defeated) {
                caster.hand.push(usedCard);
                socket.emit("errorMessage", "オワコン済みのプレイヤーは対象にできません");
                return;
            }
        }

        const finalTarget =
            usedCard.targetType === "self"
                ? caster
                : target;

        if (!finalTarget) {
            caster.hand.push(usedCard);
            return;
        }

        let damageText = "";

        if (usedCard.kind === "attack") {
            let damage = usedCard.damage;

            if (finalTarget.hate >= 3) {
                damage *= 2;
                damageText = " / ヘイト3のためダメージ2倍";
            }

            finalTarget.followers =
                Math.max(0, finalTarget.followers - damage);

            if (finalTarget.followers <= 0) {
                finalTarget.defeated = true;
            }
        }

        if (usedCard.kind === "support") {
            caster.followers =
                Math.min(10000, caster.followers + usedCard.heal);
        }

        if (usedCard.hateTarget === "self") {
            caster.hate = clamp(caster.hate + usedCard.hateChange, 0, 3);
        }

        if (usedCard.hateTarget === "target") {
            finalTarget.hate = clamp(finalTarget.hate + usedCard.hateChange, 0, 3);
        }

        game.playedCards.push({
            actionType: "play",
            playerId: caster.id,
            playerName: caster.name,
            targetName: finalTarget.name,
            cardName: usedCard.name,
            cardType: usedCard.type,
            hateText: `${usedCard.hateText}${damageText}`,
            log: `${caster.name} → ${finalTarget.name}：${usedCard.name}`
        });

        checkGameOver(game);

        emitGameUpdate(roomId);

        if (game.gameOver) {
            io.to(roomId).emit("gameOver", game.winner);
        }
    });

    socket.on("discardCard", ({ roomId, cardInstanceId }) => {
        const room = rooms[roomId];

        if (!room || !room.game) return;

        const game = room.game;

        if (game.gameOver) return;

        const currentPlayer = getCurrentPlayer(game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        const player = game.turnOrder.find(player => player.id === socket.id);

        if (!player) return;

        const discardedCard = removeCardFromHand(player, cardInstanceId);

        if (!discardedCard) {
            socket.emit("errorMessage", "そのカードは手札にありません");
            return;
        }

        game.playedCards.push({
            actionType: "discard",
            playerId: player.id,
            playerName: player.name,
            targetName: "捨て札",
            cardName: discardedCard.name,
            cardType: discardedCard.type,
            hateText: "カードを捨てた",
            log: `${player.name} は ${discardedCard.name} を捨てた`
        });

        emitGameUpdate(roomId);
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

        emitGameUpdate(roomId);
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