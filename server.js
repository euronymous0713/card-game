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

const RARITY_INFO = {
    C: { label: "コモン", weight: 55 },
    UC: { label: "アンコモン", weight: 25 },
    R: { label: "レア", weight: 13 },
    SR: { label: "スーパーレア", weight: 5 },
    UR: { label: "ウルトラレア", weight: 2 }
};

function normalizeRarity(rarity) {
    return RARITY_INFO[rarity] ? rarity : "C";
}

function selectRarityByWeight() {
    const entries = Object.entries(RARITY_INFO);
    const totalWeight = entries.reduce((sum, [, info]) => sum + info.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [rarity, info] of entries) {
        random -= info.weight;

        if (random < 0) {
            return rarity;
        }
    }

    return "C";
}

function getCardsByRarity(rarity) {
    return CARD_MASTER.filter(card => normalizeRarity(card.rarity) === rarity);
}

function selectRandomCardByRarity() {
    const selectedRarity = selectRarityByWeight();
    const candidates = getCardsByRarity(selectedRarity);
    const cardPool = candidates.length > 0 ? candidates : CARD_MASTER;

    return cardPool[Math.floor(Math.random() * cardPool.length)];
}

function normalizeCard(baseCard) {
    return {
        ...baseCard,
        rarity: normalizeRarity(baseCard.rarity)
    };
}

function generateRoomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateChoiceId() {
    return `choice-${Date.now()}-${Math.random()}`;
}

function generateCardInstance(cardId = null) {
    const baseCard = cardId
        ? CARD_MASTER.find(card => card.id === cardId)
        : selectRandomCardByRarity();

    if (!baseCard) return null;

    const normalizedCard = normalizeCard(baseCard);

    return {
        ...normalizedCard,
        instanceId: `${normalizedCard.id}-${Date.now()}-${Math.random()}`
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
            statusEffects: [],
            skipTurns: 0,
            extraTurns: 0,
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
        waitingTrapChoice: false,
        waitingTrapPlayerId: null,
        waitingTrapPlayerName: ""
    };
}

function getCurrentPlayer(game) {
    return game.turnOrder[game.currentTurnIndex];
}

function getAlivePlayers(game) {
    return game.turnOrder.filter(player => !player.defeated);
}

function applyStartTurnStatusEffects(game, player) {
    if (!player || player.defeated) return;

    if (!Array.isArray(player.statusEffects)) {
        player.statusEffects = [];
    }

    const remainingEffects = [];

    player.statusEffects.forEach(effect => {
        if (!effect || effect.turns <= 0) return;

        if (effect.type === "slipDamage") {
            const damage = Math.max(0, Number(effect.damage) || 0);

            if (damage > 0) {
                applyDamage(game, player, damage);

                addLog(game, {
                    actionType: "statusEffect",
                    playerId: effect.sourcePlayerId || "",
                    playerName: effect.sourcePlayerName || "継続効果",
                    targetName: player.name,
                    cardName: effect.cardName || "スリップダメージ",
                    cardType: "継続効果",
                    cardRarity: effect.cardRarity || "C",
                    hateText: `${player.name} に継続ダメージ`,
                    log: `${player.name} は ${effect.cardName || "スリップダメージ"} で ${damage.toLocaleString()}ダメージを受けた`,
                    damageText: `ダメージ：${damage.toLocaleString()}`,
                    damageAmount: damage,
                    specialDetailText: `残りターン：${Math.max(0, effect.turns - 1)}`
                });
            }
        }

        const nextTurns = effect.turns - 1;

        if (nextTurns > 0 && !player.defeated) {
            remainingEffects.push({
                ...effect,
                turns: nextTurns
            });
        }
    });

    player.statusEffects = remainingEffects;
}

function shouldSkipCurrentTurn(game, player) {
    if (!player || player.defeated) return false;

    const skipTurns = Number(player.skipTurns) || 0;

    if (skipTurns <= 0) return false;

    player.skipTurns = Math.max(0, skipTurns - 1);

    addLog(game, {
        actionType: "statusEffect",
        playerId: player.id,
        playerName: player.name,
        targetName: player.name,
        cardName: "行動不能",
        cardType: "状態異常",
        cardRarity: "C",
        hateText: "1ターン行動不能",
        log: `${player.name} は行動不能でターンを失った`,
        specialDetailText: "ターンスキップ"
    });

    return true;
}

function moveToNextAliveTurn(game) {
    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length <= 1) return;

    let safetyCount = 0;

    do {
        game.currentTurnIndex =
            (game.currentTurnIndex + 1) % game.turnOrder.length;

        const nextPlayer = getCurrentPlayer(game);

        if (!nextPlayer || nextPlayer.defeated) {
            safetyCount++;
            continue;
        }

        applyStartTurnStatusEffects(game, nextPlayer);
        checkGameOver(game);

        if (game.gameOver) return;

        if (nextPlayer.defeated) {
            safetyCount++;
            continue;
        }

        if (shouldSkipCurrentTurn(game, nextPlayer)) {
            safetyCount++;
            continue;
        }

        drawCards(nextPlayer);
        return;
    } while (safetyCount < game.turnOrder.length * 3);
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

function getEffectType(card) {
    return card?.effectType || "";
}

function hasEffectType(card, types) {
    return types.includes(getEffectType(card));
}

function isTrapPiercingCard(card) {
    return Boolean(
        card?.ignoreTrap ||
        card?.pierceTrap ||
        hasEffectType(card, ["trapPierceDamage", "pierceDamage", "ignoreTrapDamage"])
    );
}

function calculateDamageForTarget(card, target) {
    let damage = Number(card.damage) || 0;

    if (target && target.hate >= 3) {
        damage *= 2;
    }

    return damage;
}

function addHateDetailToLog(log, hateAmount) {
    if (typeof hateAmount === "number" && hateAmount !== 0) {
        log.hateAmount = hateAmount;
    }

    return log;
}

function destroyFieldCards(player, count = null) {
    if (!player || !Array.isArray(player.fieldCards)) return 0;

    const destroyCount = count === null
        ? player.fieldCards.length
        : Math.min(player.fieldCards.length, Math.max(0, Number(count) || 0));

    player.fieldCards.splice(0, destroyCount);

    return destroyCount;
}

function discardCardsFromHand(player, count = 1) {
    if (!player || !Array.isArray(player.hand)) return 0;

    const discardCount = Math.min(player.hand.length, Math.max(0, Number(count) || 0));

    player.hand.splice(0, discardCount);

    return discardCount;
}

function addSlipDamageEffect(targetPlayer, sourcePlayer, card) {
    if (!targetPlayer) return null;

    if (!Array.isArray(targetPlayer.statusEffects)) {
        targetPlayer.statusEffects = [];
    }

    const damage = Number(card.slipDamage || card.statusDamage || card.damage) || 1000;
    const turns = Number(card.slipTurns || card.statusTurns || card.durationTurns) || 3;

    const effect = {
        type: "slipDamage",
        damage,
        turns,
        sourcePlayerId: sourcePlayer.id,
        sourcePlayerName: sourcePlayer.name,
        cardName: card.name,
        cardRarity: normalizeRarity(card.rarity)
    };

    targetPlayer.statusEffects.push(effect);

    return effect;
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
                rarity: "C",
                effect: "",
                hateText: ""
            }))
        };
    });

    view.playedCards = view.playedCards.map(log => {
        if (log.actionType === "setTrap" && log.playerId !== viewerId) {
            return {
                ...log,
                cardName: "伏せカード",
                cardType: "罠",
                hateText: "カードを1枚伏せた",
                log: `${log.playerName} はカードを伏せた`
            };
        }

        if (log.actionType === "discard" && log.playerId !== viewerId) {
            return {
                ...log,
                cardName: "不明",
                cardType: "不明",
                hateText: "カードを捨てた",
                log: `${log.playerName} はカードを捨てた`
            };
        }

        if (log.actionType === "trap" && log.playerId !== viewerId) {
            return {
                ...log,
                log: `${log.playerName} の ${log.cardName} が発動した`
            };
        }

        if (log.actionType === "trapEffect" && log.playerId !== viewerId) {
            return {
                ...log
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
            rarity: normalizeRarity(card.rarity),
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
    room.game.waitingTrapPlayerId = targetPlayer.id;
    room.game.waitingTrapPlayerName = targetPlayer.name;

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

    emitGameUpdate(roomId);

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
    trapRarity = "C",
    trapEffectText,
    trapHateText,
    onComplete
}) {
    const complete = () => {
        if (typeof onComplete === "function") {
            onComplete();
        }
    };

    const trapEffectRequested = requestTrapChoice({
        roomId,
        targetPlayer,
        sourcePlayer,
        condition: "onTrapEffect",
        context: {
            amount: damage,
            cardName: trapName,
            cardType: trapType,
            cardRarity: normalizeRarity(trapRarity),
            effect: trapEffectText,
            hateText: trapHateText,
            sourceActionText: `${sourcePlayer.name} の罠 ${trapName} の効果`,
            resultText: `${damage.toLocaleString()}ダメージの罠効果を受けます`
        },
        onResolved: trapEffectResult => {
            if (trapEffectResult.pending) return;

            if (trapEffectResult.canceled) {
                complete();
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
                    if (damageResult.pending) return;

                    if (!damageResult.canceled) {
                        applyDamage(game, targetPlayer, damage);
                    }

                    complete();
                }
            });

            if (!damageRequested) {
                applyDamage(game, targetPlayer, damage);
                complete();
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
            cardRarity: normalizeRarity(trapRarity),
            effect: trapEffectText,
            hateText: trapHateText,
            sourceActionText: `${sourcePlayer.name} の罠 ${trapName} の効果`,
            resultText: `${damage.toLocaleString()}ダメージを受けます`
        },
        onResolved: damageResult => {
            if (damageResult.pending) return;

            if (!damageResult.canceled) {
                applyDamage(game, targetPlayer, damage);
            }

            complete();
        }
    });

    if (damageRequested) {
        return true;
    }

    applyDamage(game, targetPlayer, damage);
    return false;
}

function resolveTrapEffect(game, roomId, trapOwner, sourcePlayer, trap, context, afterPendingComplete) {
    addLog(game, {
        actionType: "trap",
        playerId: trapOwner.id,
        playerName: trapOwner.name,
        targetName: sourcePlayer.name,
        cardName: trap.name,
        cardType: trap.type,
        cardRarity: normalizeRarity(trap.rarity),
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
            cardRarity: normalizeRarity(trap.rarity),
            hateText: `${damage.toLocaleString()}ダメージを跳ね返した`,
            log: `${trapOwner.name} はダメージを跳ね返した`,
            damageText: `反射ダメージ：${damage.toLocaleString()}`,
            damageAmount: damage,
            trapDetailText: `反射：${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ`
        });

        const pending = requestTrapEffectThenDamage({
            roomId,
            game,
            targetPlayer: sourcePlayer,
            sourcePlayer: trapOwner,
            damage,
            trapName: trap.name,
            trapType: trap.type,
            trapRarity: trap.rarity,
            trapEffectText: trap.effect,
            trapHateText: trap.hateText,
            onComplete: () => {
                afterPendingComplete({
                    canceled: true
                });
            }
        });

        if (pending) {
            return {
                canceled: true,
                pending: true
            };
        }

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
            cardRarity: normalizeRarity(trap.rarity),
            hateText: "ヘイト変動を打ち消した",
            log: `${trapOwner.name} はヘイト変動を打ち消した`,
            trapDetailText: "ヘイト変動を無効化"
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
            cardRarity: normalizeRarity(trap.rarity),
            hateText: "罠効果を打ち消した",
            log: `${trapOwner.name} は罠効果を打ち消した`,
            trapDetailText: "罠効果を無効化"
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
            cardRarity: normalizeRarity(trap.rarity),
            hateText: "罠効果を打ち消し、相手の伏せカードを全破壊",
            log: `${trapOwner.name} は罠効果を打ち消し、相手の伏せカードをすべて破壊した`,
            trapDetailText: "罠効果を無効化 / 相手の伏せカードを全破壊"
        });

        return { canceled: true };
    }

    if (trap.trapEffect === "damageAndHate") {
        const damage = trap.trapDamage || 0;
        const hateChange = trap.trapHateChange || 0;

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            cardRarity: normalizeRarity(trap.rarity),
            hateText: `${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / ヘイト +${hateChange}`,
            log: `${trapOwner.name} の罠が ${sourcePlayer.name} に反撃した`,
            damageText: `罠ダメージ：${damage.toLocaleString()}`,
            damageAmount: damage,
            hateAmount: hateChange,
            trapDetailText: `反撃：${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / ヘイト +${hateChange}`
        });

        changeHate(sourcePlayer, hateChange);

        const pending = requestTrapEffectThenDamage({
            roomId,
            game,
            targetPlayer: sourcePlayer,
            sourcePlayer: trapOwner,
            damage,
            trapName: trap.name,
            trapType: trap.type,
            trapRarity: trap.rarity,
            trapEffectText: trap.effect,
            trapHateText: trap.hateText,
            onComplete: () => {
                afterPendingComplete({
                    canceled: false
                });
            }
        });

        if (pending) {
            return {
                canceled: false,
                pending: true
            };
        }

        return { canceled: false };
    }

    return { canceled: false };
}

function resolveDamageWithTrapChoice({
    roomId,
    game,
    sourcePlayer,
    targetPlayer,
    card,
    damage,
    ignoreTrap,
    onComplete
}) {
    const normalizedRarity = normalizeRarity(card.rarity);

    const complete = result => {
        if (typeof onComplete === "function") {
            onComplete(result);
        }
    };

    if (ignoreTrap) {
        applyDamage(game, targetPlayer, damage);
        complete({
            canceled: false,
            damageAmount: damage,
            originalDamageAmount: damage,
            trapPierced: true
        });
        return false;
    }

    const requested = requestTrapChoice({
        roomId,
        targetPlayer,
        sourcePlayer,
        condition: "onDamage",
        context: {
            amount: damage,
            cardName: card.name,
            cardType: card.type,
            cardRarity: normalizedRarity,
            effect: card.effect,
            hateText: card.hateText,
            sourceActionText: `${sourcePlayer.name} が ${card.name} を使用`,
            resultText: `${damage.toLocaleString()}ダメージを受ける可能性があります`
        },
        onResolved: result => {
            if (result.pending) return;

            if (!result.canceled) {
                applyDamage(game, targetPlayer, damage);
            }

            complete({
                canceled: Boolean(result.canceled),
                damageAmount: result.canceled ? 0 : damage,
                originalDamageAmount: damage,
                trapPierced: false
            });
        }
    });

    if (!requested) {
        applyDamage(game, targetPlayer, damage);
        complete({
            canceled: false,
            damageAmount: damage,
            originalDamageAmount: damage,
            trapPierced: false
        });
    }

    return requested;
}

function resolveDamageSequence({
    roomId,
    game,
    sourcePlayer,
    targets,
    card,
    ignoreTrap,
    onComplete
}) {
    const results = [];
    let index = 0;

    const next = () => {
        if (game.gameOver || index >= targets.length) {
            if (typeof onComplete === "function") {
                onComplete(results);
            }
            return;
        }

        const targetPlayer = targets[index];
        index++;

        if (!targetPlayer || targetPlayer.defeated || targetPlayer.id === sourcePlayer.id) {
            next();
            return;
        }

        const damage = calculateDamageForTarget(card, targetPlayer);

        resolveDamageWithTrapChoice({
            roomId,
            game,
            sourcePlayer,
            targetPlayer,
            card,
            damage,
            ignoreTrap,
            onComplete: result => {
                results.push({
                    targetPlayer,
                    ...result
                });
                next();
            }
        });
    };

    next();
}

io.on("connection", socket => {
    console.log("接続:", socket.id);

    if (DEV_MODE) {
        socket.emit("devCardList", CARD_MASTER.map(normalizeCard));
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
            game.waitingTrapPlayerId = null;
            game.waitingTrapPlayerName = "";
            return;
        }

        const callback = pending.onResolved;

        delete pendingTrapChoices[choiceId];

        const finishPending = result => {
            game.waitingTrapChoice = false;
            game.waitingTrapPlayerId = null;
            game.waitingTrapPlayerName = "";
            callback(result);
        };

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
                        pending.context,
                        finishPending
                    );
                }
            }
        }

        if (result.pending) return;

        finishPending(result);
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
                rarity: normalizeRarity(usedCard.rarity),
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
                actionType: "setTrap",
                playerId: caster.id,
                playerName: caster.name,
                targetName: "自分の場",
                cardName: usedCard.name,
                cardType: usedCard.type,
                cardRarity: normalizeRarity(usedCard.rarity),
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

        const isAllEnemyCard =
            usedCard.targetType === "allEnemies" ||
            hasEffectType(usedCard, ["allAttack", "attackAllEnemies"]);

        const finalTarget =
            isAllEnemyCard
                ? null
                : usedCard.targetType === "self"
                    ? caster
                    : target;

        if (!finalTarget && !isAllEnemyCard) {
            caster.hand.push(usedCard);
            return;
        }

        const finishCardPlay = (extraLog = {}) => {
            const logTargetName = extraLog.targetName || finalTarget?.name || "対象なし";

            addLog(game, {
                actionType: "play",
                playerId: caster.id,
                playerName: caster.name,
                targetName: logTargetName,
                cardName: usedCard.name,
                cardType: usedCard.type,
                cardRarity: normalizeRarity(usedCard.rarity),
                hateText: usedCard.hateText,
                log: `${caster.name} → ${logTargetName}：${usedCard.name}`,
                ...extraLog
            });

            finishGameIfNeeded(roomId);
        };

        if (isAllEnemyCard) {
            const targets = game.turnOrder.filter(player => {
                return player.id !== caster.id && !player.defeated;
            });

            if (targets.length === 0) {
                caster.hand.push(usedCard);
                socket.emit("errorMessage", "対象プレイヤーがいません");
                return;
            }

            const ignoreTrap = isTrapPiercingCard(usedCard);

            resolveDamageSequence({
                roomId,
                game,
                sourcePlayer: caster,
                targets,
                card: usedCard,
                ignoreTrap,
                onComplete: results => {
                    if (usedCard.hateTarget === "self") {
                        changeHate(caster, usedCard.hateChange);
                    }

                    const totalDamage = results.reduce((sum, result) => {
                        return sum + (Number(result.damageAmount) || 0);
                    }, 0);

                    const detail = results.map(result => {
                        const amount = Number(result.damageAmount) || 0;
                        const original = Number(result.originalDamageAmount) || amount;
                        const suffix = result.canceled
                            ? `0（無効 / 元 ${original.toLocaleString()}）`
                            : amount.toLocaleString();

                        return `${result.targetPlayer.name}:${suffix}`;
                    }).join(" / ");

                    finishCardPlay({
                        targetName: "敵全体",
                        damageText: `合計ダメージ：${totalDamage.toLocaleString()}`,
                        damageAmount: totalDamage,
                        specialDetailText: ignoreTrap
                            ? `罠貫通 / ${detail}`
                            : detail
                    });
                }
            });

            return;
        }

        if (usedCard.kind === "special") {
            const effectType = getEffectType(usedCard);

            if (hasEffectType(usedCard, ["destroyTargetTraps", "destroyTrap"])) {
                const count = usedCard.destroyTrapCount === undefined ? null : Number(usedCard.destroyTrapCount);
                const destroyedCount = destroyFieldCards(finalTarget, count);

                finishCardPlay({
                    specialDetailText: `破壊した伏せカード：${destroyedCount}枚`
                });
                return;
            }

            if (hasEffectType(usedCard, ["destroyAllEnemyTraps", "destroyAllTraps"])) {
                const targets = game.turnOrder.filter(player => {
                    if (player.defeated) return false;
                    if (effectType === "destroyAllEnemyTraps") return player.id !== caster.id;
                    return true;
                });

                const destroyedCount = targets.reduce((sum, player) => {
                    return sum + destroyFieldCards(player, null);
                }, 0);

                finishCardPlay({
                    targetName: effectType === "destroyAllEnemyTraps" ? "敵全体" : "全員",
                    specialDetailText: `破壊した伏せカード：${destroyedCount}枚`
                });
                return;
            }

            if (hasEffectType(usedCard, ["skipTurn", "stun", "cannotAct"])) {
                const skipTurns = Number(usedCard.skipTurns || usedCard.durationTurns) || 1;
                finalTarget.skipTurns = (Number(finalTarget.skipTurns) || 0) + skipTurns;

                finishCardPlay({
                    specialDetailText: `行動不能：${skipTurns}ターン`
                });
                return;
            }

            if (hasEffectType(usedCard, ["slipDamage", "damageOverTime", "dot"])) {
                const effect = addSlipDamageEffect(finalTarget, caster, usedCard);

                finishCardPlay({
                    specialDetailText: `スリップダメージ：${effect.damage.toLocaleString()} × ${effect.turns}ターン`
                });
                return;
            }

            if (hasEffectType(usedCard, ["extraTurn", "additionalTurn"])) {
                const extraTurns = Number(usedCard.extraTurns) || 1;
                caster.extraTurns = (Number(caster.extraTurns) || 0) + extraTurns;

                finishCardPlay({
                    targetName: caster.name,
                    specialDetailText: `追加ターン：${extraTurns}回`
                });
                return;
            }

            if (hasEffectType(usedCard, ["discardTargetHand", "discardHand", "handDiscard"])) {
                const discardCount = usedCard.discardAllHand
                    ? finalTarget.hand.length
                    : Number(usedCard.discardCount) || 1;
                const discardedCount = discardCardsFromHand(finalTarget, discardCount);

                finishCardPlay({
                    specialDetailText: `捨てさせた手札：${discardedCount}枚`
                });
                return;
            }

            socket.emit("errorMessage", `未対応の特殊効果です：${effectType || "effectType未設定"}`);
            caster.hand.push(usedCard);
            return;
        }

        if (usedCard.kind === "attack") {
            const damage = calculateDamageForTarget(usedCard, finalTarget);
            const ignoreTrap = isTrapPiercingCard(usedCard);

            resolveDamageWithTrapChoice({
                roomId,
                game,
                sourcePlayer: caster,
                targetPlayer: finalTarget,
                card: usedCard,
                damage,
                ignoreTrap,
                onComplete: result => {
                    if (usedCard.hateTarget === "self") {
                        changeHate(caster, usedCard.hateChange);
                    }

                    if (usedCard.hateTarget === "target") {
                        changeHate(finalTarget, usedCard.hateChange);
                    }

                    const damageText = result.canceled
                        ? `ダメージ：0（無効 / 元ダメージ ${damage.toLocaleString()}）`
                        : `ダメージ：${damage.toLocaleString()}`;

                    const extraLog = {
                        log: `${caster.name} → ${finalTarget.name}：${usedCard.name}`,
                        damageText,
                        damageAmount: result.canceled ? 0 : damage,
                        originalDamageAmount: damage,
                        damageCanceled: Boolean(result.canceled)
                    };

                    if (ignoreTrap) {
                        extraLog.specialDetailText = "罠貫通";
                    }

                    if (usedCard.hateTarget === "target") {
                        addHateDetailToLog(extraLog, usedCard.hateChange);
                    }

                    finishCardPlay(extraLog);
                }
            });

            return;
        }

        if (usedCard.kind === "support") {
            const beforeFollowers = caster.followers;
            caster.followers =
                Math.min(10000, caster.followers + usedCard.heal);
            const healAmount = Math.max(0, caster.followers - beforeFollowers);

            if (usedCard.hateTarget === "self") {
                changeHate(caster, usedCard.hateChange);
            }

            finishCardPlay({
                healText: `回復：${healAmount.toLocaleString()}`,
                healAmount
            });
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
                    cardRarity: normalizeRarity(usedCard.rarity),
                    effect: usedCard.effect,
                    hateText: usedCard.hateText,
                    sourceActionText: `${caster.name} が ${usedCard.name} を使用`,
                    resultText: `ヘイトが ${usedCard.hateChange > 0 ? "+" : ""}${usedCard.hateChange} 変動する可能性があります`
                },
                onResolved: result => {
                    if (result.pending) return;

                    if (!result.canceled) {
                        changeHate(finalTarget, usedCard.hateChange);
                    }

                    finishCardPlay(result.canceled ? {} : {
                        hateAmount: usedCard.hateChange
                    });
                }
            });

            if (!requested) {
                changeHate(finalTarget, usedCard.hateChange);
                finishCardPlay({
                    hateAmount: usedCard.hateChange
                });
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

    socket.on("endTurn", payload => {
        const roomId = typeof payload === "string" ? payload : payload?.roomId;
        const requestedTurnIndex = typeof payload === "object" ? payload.turnIndex : null;
        const requestedPlayerId = typeof payload === "object" ? payload.playerId : null;

        const room = rooms[roomId];
        if (!room || !room.game) return;

        const game = room.game;
        if (game.gameOver) return;

        if (game.waitingTrapChoice) {
            socket.emit("errorMessage", "罠カードの選択待ちです");
            return;
        }

        if (
            typeof requestedTurnIndex === "number" &&
            requestedTurnIndex !== game.currentTurnIndex
        ) {
            emitGameUpdate(roomId);
            return;
        }

        const currentPlayer = getCurrentPlayer(game);

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            if (requestedPlayerId === socket.id) {
                emitGameUpdate(roomId);
                return;
            }

            socket.emit("errorMessage", "今はあなたのターンではありません");
            return;
        }

        if ((Number(currentPlayer.extraTurns) || 0) > 0) {
            currentPlayer.extraTurns = Math.max(0, Number(currentPlayer.extraTurns) - 1);
            drawCards(currentPlayer);

            addLog(game, {
                actionType: "extraTurn",
                playerId: currentPlayer.id,
                playerName: currentPlayer.name,
                targetName: currentPlayer.name,
                cardName: "追加ターン",
                cardType: "特殊",
                cardRarity: "C",
                hateText: "もう一度自分のターン",
                log: `${currentPlayer.name} は追加ターンを得た`,
                specialDetailText: "ターン終了後、もう一度行動できます"
            });

            emitGameUpdate(roomId);
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