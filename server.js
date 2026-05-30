const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const CARD_MASTER = require("./data/cards");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};
const pendingTrapChoices = {};
const DEV_MODE = true;

function generateRoomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateChoiceId() {
    return `choice-${Date.now()}-${Math.random()}`;
}

function generateCardInstance(cardId = null) {
    const baseCard = cardId
        ? CARD_MASTER.find(card => card.id === cardId)
        : CARD_MASTER[Math.floor(Math.random() * CARD_MASTER.length)];

    if (!baseCard) return null;

    return {
        ...baseCard,
        instanceId: `${baseCard.id}-${Date.now()}-${Math.random()}`
    };
}

function drawCards(player) {
    while (player.hand.length < 4) {
        const card = generateCardInstance();
        if (card) player.hand.push(card);
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
        gameOver: false,
        waitingTrapChoice: false
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
    if (nextPlayer) drawCards(nextPlayer);
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
    if (index === -1) return null;

    const usedCard = player.hand[index];
    player.hand.splice(index, 1);

    return usedCard;
}

function addLog(game, log) {
    game.playedCards.push(log);
}

function applyDamage(game, target, amount) {
    target.followers = Math.max(0, target.followers - amount);

    if (target.followers <= 0) {
        target.defeated = true;
    }

    checkGameOver(game);
}

function changeHate(player, amount) {
    player.hate = clamp(player.hate + amount, 0, 3);
}

function findRoomBySocketId(socketId) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const player = room.players.find(player => player.id === socketId);

        if (player) {
            return { roomId, room };
        }
    }

    return null;
}

function removeTrapByFieldId(player, fieldId) {
    const index = player.fieldCards.findIndex(card => card.fieldId === fieldId);
    if (index === -1) return null;

    const trap = player.fieldCards[index];
    player.fieldCards.splice(index, 1);

    return trap;
}

function conditionText(condition) {
    if (condition === "onDamage") return "ダメージを受けたとき";
    if (condition === "onHateChange") return "ヘイトを変動させられたとき";
    if (condition === "onTrapEffect") return "罠カードの効果を受けたとき";
    return "条件不明";
}

function createGameViewForPlayer(game, viewerId) {
    const view = JSON.parse(JSON.stringify(game));

    view.turnOrder = view.turnOrder.map(player => {
        if (player.id === viewerId) return player;

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
        if (
            ["trap", "trapEffect", "discard"].includes(log.actionType) &&
            log.playerId !== viewerId
        ) {
            if (log.actionType === "discard") {
                return {
                    ...log,
                    cardName: "不明",
                    cardType: "不明",
                    hateText: "カードを捨てた",
                    log: `${log.playerName} はカードを捨てた`
                };
            }

            return {
                ...log,
                cardName: "伏せカード",
                cardType: "罠",
                hateText: "罠が発動した",
                log: `${log.playerName} の罠が発動した`
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

        const view = createGameViewForPlayer(room.game, clientId);

        clientSocket.emit("updateGame", view);

        if (DEV_MODE) {
            clientSocket.emit("devGameState", view);
        }
    });
}

function finishGameIfNeeded(roomId) {
    const room = rooms[roomId];
    if (!room || !room.game) return;

    checkGameOver(room.game);
    emitGameUpdate(roomId);

    if (room.game.gameOver) {
        io.to(roomId).emit("gameOver", room.game.winner);
    }
}

function requestTrapChoice({
    roomId,
    targetPlayer,
    sourcePlayer,
    condition,
    context,
    onResolved
}) {
    const room = rooms[roomId];

    if (!room || !room.game) return false;
    if (!targetPlayer || !sourcePlayer) return false;
    if (targetPlayer.id === sourcePlayer.id) return false;
    if (targetPlayer.fieldCards.length === 0) return false;

    const allTraps = targetPlayer.fieldCards.map(card => {
        const canActivate = card.trapCondition === condition;

        return {
            fieldId: card.fieldId,
            name: card.name,
            type: card.type,
            effect: card.effect,
            hateText: card.hateText,
            trapCondition: card.trapCondition,
            conditionText: conditionText(card.trapCondition),
            canActivate,
            disabledReason: canActivate
                ? ""
                : `発動条件が違います：${conditionText(card.trapCondition)}`
        };
    });

    const hasActivatableTrap = allTraps.some(card => card.canActivate);
    if (!hasActivatableTrap) return false;

    const targetSocket = io.sockets.sockets.get(targetPlayer.id);
    if (!targetSocket) return false;

    const choiceId = generateChoiceId();

    room.game.waitingTrapChoice = true;

    pendingTrapChoices[choiceId] = {
        roomId,
        targetPlayerId: targetPlayer.id,
        sourcePlayerId: sourcePlayer.id,
        condition,
        context,
        onResolved
    };

    targetSocket.emit("chooseTrap", {
        choiceId,
        sourcePlayerName: sourcePlayer.name,
        condition,
        conditionText: conditionText(condition),
        context,
        traps: allTraps
    });

    return true;
}

function requestTrapEffectThenDamage({
    roomId,
    game,
    targetPlayer,
    sourcePlayer,
    damage,
    trapName,
    trapType,
    trapEffectText,
    trapHateText
}) {
    const trapEffectRequested = requestTrapChoice({
        roomId,
        targetPlayer,
        sourcePlayer,
        condition: "onTrapEffect",
        context: {
            amount: damage,
            cardName: trapName,
            cardType: trapType,
            effect: trapEffectText,
            hateText: trapHateText,
            sourceActionText: `${sourcePlayer.name} の罠 ${trapName} の効果`,
            resultText: `${damage.toLocaleString()}ダメージの罠効果を受けます`
        },
        onResolved: trapEffectResult => {
            if (trapEffectResult.canceled) {
                finishGameIfNeeded(roomId);
                return;
            }

            const damageRequested = requestTrapChoice({
                roomId,
                targetPlayer,
                sourcePlayer,
                condition: "onDamage",
                context: {
                    amount: damage,
                    cardName: trapName,
                    cardType: trapType,
                    effect: trapEffectText,
                    hateText: trapHateText,
                    sourceActionText: `${sourcePlayer.name} の罠 ${trapName} の効果`,
                    resultText: `${damage.toLocaleString()}ダメージを受けます`
                },
                onResolved: damageResult => {
                    if (!damageResult.canceled) {
                        applyDamage(game, targetPlayer, damage);
                    }

                    finishGameIfNeeded(roomId);
                }
            });

            if (!damageRequested) {
                applyDamage(game, targetPlayer, damage);
                finishGameIfNeeded(roomId);
            }
        }
    });

    if (trapEffectRequested) {
        return true;
    }

    const damageRequested = requestTrapChoice({
        roomId,
        targetPlayer,
        sourcePlayer,
        condition: "onDamage",
        context: {
            amount: damage,
            cardName: trapName,
            cardType: trapType,
            effect: trapEffectText,
            hateText: trapHateText,
            sourceActionText: `${sourcePlayer.name} の罠 ${trapName} の効果`,
            resultText: `${damage.toLocaleString()}ダメージを受けます`
        },
        onResolved: damageResult => {
            if (!damageResult.canceled) {
                applyDamage(game, targetPlayer, damage);
            }

            finishGameIfNeeded(roomId);
        }
    });

    if (damageRequested) {
        return true;
    }

    applyDamage(game, targetPlayer, damage);
    return false;
}

function resolveTrapEffect(game, roomId, trapOwner, sourcePlayer, trap, context) {
    addLog(game, {
        actionType: "trap",
        playerId: trapOwner.id,
        playerName: trapOwner.name,
        targetName: sourcePlayer.name,
        cardName: trap.name,
        cardType: trap.type,
        hateText: trap.hateText || "罠が発動した",
        log: `${trapOwner.name} の罠が発動した`
    });

    if (trap.trapEffect === "reflectDamage") {
        const damage = context.amount || 0;

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            hateText: `${damage.toLocaleString()}ダメージを跳ね返した`,
            log: `${trapOwner.name} はダメージを跳ね返した`
        });

        requestTrapEffectThenDamage({
            roomId,
            game,
            targetPlayer: sourcePlayer,
            sourcePlayer: trapOwner,
            damage,
            trapName: trap.name,
            trapType: trap.type,
            trapEffectText: trap.effect,
            trapHateText: trap.hateText
        });

        return { canceled: true };
    }

    if (trap.trapEffect === "cancelHate") {
        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            hateText: "ヘイト変動を打ち消した",
            log: `${trapOwner.name} はヘイト変動を打ち消した`
        });

        return { canceled: true };
    }

    if (trap.trapEffect === "cancelTrap") {
        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            hateText: "罠効果を打ち消した",
            log: `${trapOwner.name} は罠効果を打ち消した`
        });

        return { canceled: true };
    }

    if (trap.trapEffect === "cancelTrapAndDestroyEnemyTraps") {
        sourcePlayer.fieldCards = [];

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            hateText: "罠効果を打ち消し、相手の伏せカードを全破壊",
            log: `${trapOwner.name} は罠効果を打ち消し、相手の伏せカードをすべて破壊した`
        });

        return { canceled: true };
    }

    if (trap.trapEffect === "damageAndHate") {
        const damage = trap.trapDamage || 0;
        const hateChange = trap.trapHateChange || 0;

        const handledByChoice = requestTrapEffectThenDamage({
            roomId,
            game,
            targetPlayer: sourcePlayer,
            sourcePlayer: trapOwner,
            damage,
            trapName: trap.name,
            trapType: trap.type,
            trapEffectText: trap.effect,
            trapHateText: trap.hateText
        });

        if (!handledByChoice) {
            finishGameIfNeeded(roomId);
        }

        changeHate(sourcePlayer, hateChange);

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            hateText: `${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / ヘイト +${hateChange}`,
            log: `${trapOwner.name} の罠が ${sourcePlayer.name} に反撃した`
        });

        return { canceled: false };
    }

    return { canceled: false };
}

io.on("connection", socket => {
    console.log("接続:", socket.id);

    if (DEV_MODE) {
        socket.emit("devCardList", CARD_MASTER);
    }

    socket.on("createRoom", playerName => {
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

    socket.on("startGame", roomId => {
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

    socket.on("chooseTrapResponse", ({ choiceId, fieldId }) => {
        const pending = pendingTrapChoices[choiceId];
        if (!pending) return;
        if (socket.id !== pending.targetPlayerId) return;

        const room = rooms[pending.roomId];

        if (!room || !room.game) {
            delete pendingTrapChoices[choiceId];
            return;
        }

        const game = room.game;
        const trapOwner = game.turnOrder.find(player => player.id === pending.targetPlayerId);
        const sourcePlayer = game.turnOrder.find(player => player.id === pending.sourcePlayerId);

        if (!trapOwner || !sourcePlayer) {
            delete pendingTrapChoices[choiceId];
            game.waitingTrapChoice = false;
            return;
        }

        let result = { canceled: false };

        if (fieldId) {
            const selectedTrap =
                trapOwner.fieldCards.find(card => card.fieldId === fieldId);

            if (
                selectedTrap &&
                selectedTrap.trapCondition === pending.condition
            ) {
                const trap = removeTrapByFieldId(trapOwner, fieldId);

                if (trap) {
                    result = resolveTrapEffect(
                        game,
                        pending.roomId,
                        trapOwner,
                        sourcePlayer,
                        trap,
                        pending.context
                    );
                }
            }
        }

        const callback = pending.onResolved;

        delete pendingTrapChoices[choiceId];

        game.waitingTrapChoice = false;

        callback(result);
    });

    socket.on("playCard", ({ roomId, cardInstanceId, targetId }) => {
        const room = rooms[roomId];
        if (!room || !room.game) return;

        const game = room.game;
        if (game.gameOver) return;

        if (game.waitingTrapChoice) {
            socket.emit("errorMessage", "罠カードの選択待ちです");
            return;
        }

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
                fieldId: `field-${usedCard.instanceId}`,
                id: usedCard.id,
                name: usedCard.name,
                type: usedCard.type,
                effect: usedCard.effect,
                hateText: usedCard.hateText,
                trapCondition: usedCard.trapCondition,
                trapEffect: usedCard.trapEffect,
                trapDamage: usedCard.trapDamage || 0,
                trapHateChange: usedCard.trapHateChange || 0
            });

            if (usedCard.hateChange) {
                changeHate(caster, usedCard.hateChange);
            }

            addLog(game, {
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

        const finishCardPlay = () => {
            addLog(game, {
                actionType: "play",
                playerId: caster.id,
                playerName: caster.name,
                targetName: finalTarget.name,
                cardName: usedCard.name,
                cardType: usedCard.type,
                hateText: usedCard.hateText,
                log: `${caster.name} → ${finalTarget.name}：${usedCard.name}`
            });

            finishGameIfNeeded(roomId);
        };

        if (usedCard.kind === "attack") {
            let damage = usedCard.damage;

            if (finalTarget.hate >= 3) {
                damage *= 2;
            }

            const requested = requestTrapChoice({
                roomId,
                targetPlayer: finalTarget,
                sourcePlayer: caster,
                condition: "onDamage",
                context: {
                    amount: damage,
                    cardName: usedCard.name,
                    cardType: usedCard.type,
                    effect: usedCard.effect,
                    hateText: usedCard.hateText,
                    sourceActionText: `${caster.name} が ${usedCard.name} を使用`,
                    resultText: `${damage.toLocaleString()}ダメージを受ける可能性があります`
                },
                onResolved: result => {
                    if (!result.canceled) {
                        applyDamage(game, finalTarget, damage);
                    }

                    if (usedCard.hateTarget === "self") {
                        changeHate(caster, usedCard.hateChange);
                    }

                    finishCardPlay();
                }
            });

            if (!requested) {
                applyDamage(game, finalTarget, damage);

                if (usedCard.hateTarget === "self") {
                    changeHate(caster, usedCard.hateChange);
                }

                finishCardPlay();
            }

            return;
        }

        if (usedCard.kind === "support") {
            caster.followers =
                Math.min(10000, caster.followers + usedCard.heal);

            if (usedCard.hateTarget === "self") {
                changeHate(caster, usedCard.hateChange);
            }

            finishCardPlay();
            return;
        }

        if (usedCard.kind === "hate") {
            const requested = requestTrapChoice({
                roomId,
                targetPlayer: finalTarget,
                sourcePlayer: caster,
                condition: "onHateChange",
                context: {
                    amount: usedCard.hateChange,
                    cardName: usedCard.name,
                    cardType: usedCard.type,
                    effect: usedCard.effect,
                    hateText: usedCard.hateText,
                    sourceActionText: `${caster.name} が ${usedCard.name} を使用`,
                    resultText: `ヘイトが ${usedCard.hateChange > 0 ? "+" : ""}${usedCard.hateChange} 変動する可能性があります`
                },
                onResolved: result => {
                    if (!result.canceled) {
                        changeHate(finalTarget, usedCard.hateChange);
                    }

                    finishCardPlay();
                }
            });

            if (!requested) {
                changeHate(finalTarget, usedCard.hateChange);
                finishCardPlay();
            }

            return;
        }

        if (usedCard.hateTarget === "self") {
            changeHate(caster, usedCard.hateChange);
        }

        finishCardPlay();
    });

    socket.on("discardCard", ({ roomId, cardInstanceId }) => {
        const room = rooms[roomId];
        if (!room || !room.game) return;

        const game = room.game;
        if (game.gameOver) return;

        if (game.waitingTrapChoice) {
            socket.emit("errorMessage", "罠カードの選択待ちです");
            return;
        }

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

        addLog(game, {
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

    socket.on("endTurn", roomId => {
        const room = rooms[roomId];
        if (!room || !room.game) return;

        const game = room.game;
        if (game.gameOver) return;

        if (game.waitingTrapChoice) {
            socket.emit("errorMessage", "罠カードの選択待ちです");
            return;
        }

        const currentPlayer = getCurrentPlayer(game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        moveToNextAliveTurn(game);
        emitGameUpdate(roomId);
    });

    socket.on("devSetFollowers", ({ playerId, followers }) => {
        if (!DEV_MODE) return;

        const result = findRoomBySocketId(socket.id);
        if (!result || !result.room.game) return;

        const player = result.room.game.turnOrder.find(p => p.id === playerId);
        if (!player) return;

        player.followers = clamp(Number(followers), 0, 99999);
        player.defeated = player.followers <= 0;

        finishGameIfNeeded(result.roomId);
    });

    socket.on("devSetHate", ({ playerId, hate }) => {
        if (!DEV_MODE) return;

        const result = findRoomBySocketId(socket.id);
        if (!result || !result.room.game) return;

        const player = result.room.game.turnOrder.find(p => p.id === playerId);
        if (!player) return;

        player.hate = clamp(Number(hate), 0, 3);
        emitGameUpdate(result.roomId);
    });

    socket.on("devAddCard", ({ playerId, cardId }) => {
        if (!DEV_MODE) return;

        const result = findRoomBySocketId(socket.id);
        if (!result || !result.room.game) return;

        const player = result.room.game.turnOrder.find(p => p.id === playerId);
        if (!player) return;

        if (player.hand.length >= 4) {
            socket.emit("errorMessage", "手札は最大4枚です");
            return;
        }

        const card = generateCardInstance(cardId);
        if (!card) return;

        player.hand.push(card);
        emitGameUpdate(result.roomId);
    });

    socket.on("devClearHand", ({ playerId }) => {
        if (!DEV_MODE) return;

        const result = findRoomBySocketId(socket.id);
        if (!result || !result.room.game) return;

        const player = result.room.game.turnOrder.find(p => p.id === playerId);
        if (!player) return;

        player.hand = [];
        emitGameUpdate(result.roomId);
    });

    socket.on("devDrawFull", ({ playerId }) => {
        if (!DEV_MODE) return;

        const result = findRoomBySocketId(socket.id);
        if (!result || !result.room.game) return;

        const player = result.room.game.turnOrder.find(p => p.id === playerId);
        if (!player) return;

        drawCards(player);
        emitGameUpdate(result.roomId);
    });

    socket.on("devClearTraps", ({ playerId }) => {
        if (!DEV_MODE) return;

        const result = findRoomBySocketId(socket.id);
        if (!result || !result.room.game) return;

        const player = result.room.game.turnOrder.find(p => p.id === playerId);
        if (!player) return;

        player.fieldCards = [];
        emitGameUpdate(result.roomId);
    });

    socket.on("leaveRoom", roomId => {
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

    socket.on("disbandRoom", roomId => {
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

    socket.on("returnTitle", roomId => {
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
            io.to(roomId).emit("updateRoom", rooms[roomId]?.players || []);
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("サーバー起動");
});