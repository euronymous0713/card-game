const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");

const CARD_MASTER = require("./data/cards");

let DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
try {
    DISCORD_WEBHOOK_URL = DISCORD_WEBHOOK_URL || require("./config.local").DISCORD_WEBHOOK_URL || "";
} catch (_) {}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

function sendDiscordWebhook(payload) {
    if (!DISCORD_WEBHOOK_URL) return;
    const body = JSON.stringify(payload);
    const url = new URL(DISCORD_WEBHOOK_URL);
    const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
        }
    }, (res) => {
        res.resume();
        if (res.statusCode < 200 || res.statusCode >= 300) {
            console.error("Discord webhook failed, status:", res.statusCode);
        }
    });
    req.on("error", (e) => console.error("Discord webhook error:", e));
    req.write(body);
    req.end();
}

app.post("/api/bug-report", (req, res) => {
    const { name, summary, detail, roomId } = req.body || {};
    if (!summary || !summary.trim()) {
        return res.status(400).json({ error: "件名は必須です" });
    }
    sendDiscordWebhook({
        embeds: [{
            title: "🐛 バグ報告",
            color: 0xe74c3c,
            fields: [
                { name: "送信者", value: name || "不明", inline: true },
                { name: "場所", value: roomId ? `ルーム ${roomId}` : "タイトル画面", inline: true },
                { name: "件名", value: summary.slice(0, 256) },
                { name: "詳細", value: (detail || "").slice(0, 1024) || "（なし）" }
            ],
            timestamp: new Date().toISOString()
        }]
    });
    res.json({ ok: true });
});

const rooms = {};
const pendingTrapChoices = {};
const pendingOverwriteChoices = {};
const DEV_MODE = true;
const RECONNECT_TIMEOUT_MS = 5 * 60 * 1000;

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

function generateReconnectToken() {
    return `reconnect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function drawCards(player, maxDraw = 4) {
    let drawn = 0;
    while (player.hand.length < 4 && drawn < maxDraw) {
        const card = generateCardInstance();
        if (card) {
            player.hand.push(card);
            drawn++;
        }
    }
}

function drawCardsHandManage(player, drawCount, maxHand = 4) {
    let drawn = 0;
    while (player.hand.length < maxHand && drawn < drawCount) {
        const card = generateCardInstance();
        if (card) {
            player.hand.push(card);
            drawn++;
        }
    }
}

function shuffleArray(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createGameState(players, drawRule = "classic") {
    const turnOrder = shuffleArray(players).map(player => {
        const gamePlayer = {
            id: player.id,
            reconnectToken: player.reconnectToken || generateReconnectToken(),
            name: player.name,
            followers: 10000,
            hate: 0,
            host: player.host,
            disconnected: Boolean(player.disconnected),
            hand: [],
            fieldCards: [],
            defeated: false,
            skipTurns: 0,
            extraTurns: 0,
            statusEffects: [],
            cardsPlayedThisTurn: 0,
            totalDamageTaken: 0
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
        waitingTrapPlayerName: "",
        drawRule
    };
}

function getCurrentPlayer(game) {
    return game.turnOrder[game.currentTurnIndex];
}

function getAlivePlayers(game) {
    return game.turnOrder.filter(player => !player.defeated);
}

const STATUS_INFO = {
    slipDamage: {
        label: "炎上",
        icon: "🔥",
        description: "ターン開始時にスリップダメージを受ける"
    },
    freeze: {
        label: "凍結",
        icon: "🧊",
        description: "ターン開始時に行動できず、ターンを失う"
    },
    mute: {
        label: "ミュート",
        icon: "🔇",
        description: "ヘイト変動を受けない"
    },
    shadowban: {
        label: "シャドウバン",
        icon: "👻",
        description: "攻撃ダメージが500下がる"
    },
    expose: {
        label: "晒し中",
        icon: "👁",
        description: "受ける攻撃ダメージが300増える"
    },
    digitalDetox: {
        label: "電波障害",
        icon: "📵",
        description: "ターン開始時のドローが1枚になる"
    },
    kagiaka: {
        label: "鍵垢",
        icon: "🔒",
        description: "攻撃カードの対象に選ばれなくなる（範囲攻撃は除く）"
    }
};

function statusInfo(type) {
    return STATUS_INFO[type] || {
        label: "状態異常",
        icon: "⚠️",
        description: "特殊な状態異常"
    };
}

function hasStatusEffect(player, type) {
    if (!player || !Array.isArray(player.statusEffects)) return false;

    return player.statusEffects.some(effect => {
        return effect &&
            effect.type === type &&
            Number(effect.remainingTurns || 0) > 0;
    });
}

function addStatusEffect(player, effect) {
    if (!player || !effect || !effect.type) return;

    if (!Array.isArray(player.statusEffects)) {
        player.statusEffects = [];
    }

    const info = statusInfo(effect.type);
    const remainingTurns = Math.max(1, Number(effect.remainingTurns || effect.durationTurns || 1));

    if (effect.type === "slipDamage") {
        const existing = player.statusEffects.find(
            e => e && e.type === "slipDamage" && Number(e.amount) === Number(effect.amount || 0)
        );
        if (existing) {
            existing.remainingTurns = Number(existing.remainingTurns || 0) + remainingTurns;
            return;
        }
    } else {
        const existing = player.statusEffects.find(e => e && e.type === effect.type);
        if (existing) {
            existing.remainingTurns = Number(existing.remainingTurns || 0) + remainingTurns;
            return;
        }
    }

    player.statusEffects.push({
        type: effect.type,
        label: effect.label || info.label,
        icon: effect.icon || info.icon,
        description: effect.description || info.description,
        amount: Number(effect.amount || 0),
        remainingTurns,
        sourcePlayerId: effect.sourcePlayerId || "",
        sourcePlayerName: effect.sourcePlayerName || "状態異常",
        cardName: effect.cardName || info.label,
        cardRarity: normalizeRarity(effect.cardRarity)
    });
}

function decreaseStatusEffect(player, type, amount = 1) {
    if (!player || !Array.isArray(player.statusEffects)) return;

    player.statusEffects = player.statusEffects
        .map(effect => {
            if (!effect || effect.type !== type) return effect;

            return {
                ...effect,
                remainingTurns: Number(effect.remainingTurns || 0) - amount
            };
        })
        .filter(effect => {
            return effect && Number(effect.remainingTurns || 0) > 0;
        });
}

function getHighestFollowerPlayers(game) {
    const alivePlayers = getAlivePlayers(game);
    const highest = Math.max(...alivePlayers.map(player => player.followers));

    return alivePlayers.filter(player => player.followers === highest);
}

function getLowestFollowerPlayers(game) {
    const alivePlayers = getAlivePlayers(game);
    const lowest = Math.min(...alivePlayers.map(player => player.followers));

    return alivePlayers.filter(player => player.followers === lowest);
}

function isRankTarget(game, player, condition) {
    if (!game || !player || !condition) return false;

    if (condition === "leader" || condition === "highestFollowers" || condition === "top") {
        return getHighestFollowerPlayers(game).some(candidate => candidate.id === player.id);
    }

    if (condition === "lowestFollowers" || condition === "last" || condition === "underdog") {
        return getLowestFollowerPlayers(game).some(candidate => candidate.id === player.id);
    }

    return false;
}

function applyTurnStartEffects(game, player) {
    if (!player || player.defeated) return;

    if (!Array.isArray(player.statusEffects) || player.statusEffects.length === 0) {
        return;
    }

    const remainingEffects = [];

    player.statusEffects.forEach(effect => {
        if (!effect) return;

        const type = effect.type || "unknown";
        const remainingTurns = Number(effect.remainingTurns || 0);

        if (remainingTurns <= 0) return;

        if (type === "slipDamage" || type === "burn") {
            const damage = Number(effect.amount || 0);

            if (damage > 0) {
                applyDamage(game, player, damage, {
                    playerName: effect.sourcePlayerName || "状態異常",
                    cardName: effect.cardName || "炎上",
                    cardRarity: effect.cardRarity
                });

                addLog(game, {
                    actionType: "statusEffect",
                    playerId: effect.sourcePlayerId || "",
                    playerName: effect.sourcePlayerName || "状態異常",
                    targetName: player.name,
                    cardName: effect.cardName || "炎上",
                    cardType: "状態異常",
                    cardRarity: effect.cardRarity || "C",
                    hateText: `${player.name} に ${formatNumber(damage)} スリップダメージ`,
                    log: `${player.name} は炎上ダメージを受けた`,
                    damageText: `炎上ダメージ：${formatNumber(damage)}`,
                    damageAmount: damage,
                    specialText: `状態異常：${effect.label || "炎上"}`
                });
            }

            const nextRemainingTurns = remainingTurns - 1;

            if (nextRemainingTurns > 0 && !player.defeated) {
                remainingEffects.push({
                    ...effect,
                    remainingTurns: nextRemainingTurns
                });
            }

            return;
        }

        if (type === "freeze") {
            // 凍結はターンスキップ処理側で残りターンを減らします。
            remainingEffects.push(effect);
            return;
        }

        const nextRemainingTurns = remainingTurns - 1;

        if (nextRemainingTurns > 0 && !player.defeated) {
            remainingEffects.push({
                ...effect,
                remainingTurns: nextRemainingTurns
            });
        }
    });

    player.statusEffects = remainingEffects;
}

function moveToNextAliveTurn(game) {
    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length <= 1) return;

    const currentPlayer = getCurrentPlayer(game);

    if (
        currentPlayer &&
        !currentPlayer.defeated &&
        Number(currentPlayer.extraTurns || 0) > 0
    ) {
        currentPlayer.extraTurns -= 1;
        const extraDrawLimit = hasStatusEffect(currentPlayer, "digitalDetox") ? 1 : 4;
        drawCards(currentPlayer, extraDrawLimit);

        addLog(game, {
            actionType: "extraTurn",
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            targetName: currentPlayer.name,
            cardName: "追加ターン",
            cardType: "特殊",
            cardRarity: "C",
            hateText: "もう一度ターンを行う",
            log: `${currentPlayer.name} は追加ターンを得た`
        });

        return;
    }

    let guard = 0;

    do {
        game.currentTurnIndex =
            (game.currentTurnIndex + 1) % game.turnOrder.length;

        const nextPlayer = getCurrentPlayer(game);
        guard += 1;

        if (!nextPlayer || nextPlayer.defeated) {
            continue;
        }

        const drawLimit = hasStatusEffect(nextPlayer, "digitalDetox") ? 1 : 4;

        applyTurnStartEffects(game, nextPlayer);
        checkGameOver(game);

        if (game.gameOver || nextPlayer.defeated) {
            continue;
        }

        if (Number(nextPlayer.skipTurns || 0) > 0) {
            nextPlayer.skipTurns -= 1;
            decreaseStatusEffect(nextPlayer, "freeze");

            addLog(game, {
                actionType: "skipTurn",
                playerId: nextPlayer.id,
                playerName: nextPlayer.name,
                targetName: nextPlayer.name,
                cardName: "凍結",
                cardType: "状態異常",
                cardRarity: "C",
                hateText: "ターンをスキップ",
                log: `${nextPlayer.name} は凍結でターンを失った`,
                specialText: "状態異常：凍結"
            });

            continue;
        }

        if ((game.drawRule || "classic") === "handManage") {
            const cardsPlayed = nextPlayer.cardsPlayedThisTurn || 0;
            const baseCount = Math.max(0, 4 - cardsPlayed);
            const drawCount = hasStatusEffect(nextPlayer, "digitalDetox")
                ? Math.min(1, baseCount)
                : baseCount;
            nextPlayer.cardsPlayedThisTurn = 0;
            drawCardsHandManage(nextPlayer, drawCount);
        } else {
            drawCards(nextPlayer, drawLimit);
        }
        return;
    } while (guard < game.turnOrder.length * 3);
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

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function applyDamage(game, target, amount, source = null) {
    const wasAlreadyDefeated = target.defeated;
    const actualDamage = Math.min(amount, target.followers);

    target.followers = Math.max(0, target.followers - amount);
    target.totalDamageTaken = (target.totalDamageTaken || 0) + actualDamage;

    if (target.followers <= 0) {
        target.defeated = true;

        if (!wasAlreadyDefeated && source) {
            target.defeatCause = {
                playerName: source.playerName || "",
                cardName: source.cardName || "",
                cardRarity: normalizeRarity(source.cardRarity),
                cardEffect: source.cardEffect || ""
            };
        }
    }

    checkGameOver(game);
}

function changeHate(player, amount) {
    const value = Number(amount || 0);

    if (!player || value === 0) return false;

    if (hasStatusEffect(player, "mute")) {
        return false;
    }

    player.hate = clamp(player.hate + value, 0, 3);
    return true;
}

function applyHateBonus(card, sourcePlayer, targetPlayer, baseDamage) {
    let damage = Number(baseDamage || 0);
    const details = [];

    if (!Array.isArray(card.hateBonus)) {
        return { damage, details };
    }

    card.hateBonus.forEach(bonus => {
        const requiredHate = Number(
            bonus.targetHateAtLeast ??
            bonus.hate ??
            bonus.targetHate ??
            0
        );

        if (!targetPlayer || targetPlayer.hate < requiredHate) return;

        const bonusDamage = Number(bonus.extraDamage ?? bonus.damage ?? bonus.bonusDamage ?? 0);

        if (bonusDamage > 0) {
            damage += bonusDamage;
            details.push(`ヘイト${requiredHate}以上：+${formatNumber(bonusDamage)}ダメージ`);
        }

        const targetHateChange = Number(bonus.targetHateChange ?? 0);

        if (targetHateChange !== 0) {
            changeHate(targetPlayer, targetHateChange);
            details.push(`ヘイト${requiredHate}以上：対象ヘイト ${targetHateChange > 0 ? "+" : ""}${targetHateChange}`);
        }

        const selfHateChange = Number(bonus.selfHateChange ?? 0);

        if (selfHateChange !== 0 && sourcePlayer) {
            changeHate(sourcePlayer, selfHateChange);
            details.push(`ヘイト${requiredHate}以上：自分ヘイト ${selfHateChange > 0 ? "+" : ""}${selfHateChange}`);
        }

        const destroyTrapCount = Number(bonus.destroyTrapCount ?? 0);

        if (destroyTrapCount > 0 && targetPlayer) {
            const destroyed = targetPlayer.fieldCards.splice(0, destroyTrapCount).length;
            details.push(`ヘイト${requiredHate}以上：伏せカード${destroyed}枚破壊`);
        }
    });

    return { damage, details };
}

function applyRankBonus(game, card, sourcePlayer, targetPlayer, baseDamage) {
    let damage = Number(baseDamage || 0);
    const details = [];

    if (!Array.isArray(card.rankBonus)) {
        return { damage, details };
    }

    card.rankBonus.forEach(bonus => {
        const condition = bonus.condition || bonus.target || bonus.rank;

        if (!isRankTarget(game, targetPlayer, condition)) return;

        const label = condition === "leader" || condition === "highestFollowers" || condition === "top"
            ? "トップ対象"
            : "最下位対象";

        const bonusDamage = Number(bonus.extraDamage ?? bonus.damage ?? bonus.bonusDamage ?? 0);

        if (bonusDamage > 0) {
            damage += bonusDamage;
            details.push(`${label}：+${formatNumber(bonusDamage)}ダメージ`);
        }

        const targetHateChange = Number(bonus.targetHateChange ?? 0);

        if (targetHateChange !== 0 && targetPlayer) {
            const changed = changeHate(targetPlayer, targetHateChange);
            details.push(changed
                ? `${label}：対象ヘイト ${targetHateChange > 0 ? "+" : ""}${targetHateChange}`
                : `${label}：対象ヘイト変動なし`);
        }

        const selfHateChange = Number(bonus.selfHateChange ?? 0);

        if (selfHateChange !== 0 && sourcePlayer) {
            const changed = changeHate(sourcePlayer, selfHateChange);
            details.push(changed
                ? `${label}：自分ヘイト ${selfHateChange > 0 ? "+" : ""}${selfHateChange}`
                : `${label}：自分ヘイト変動なし`);
        }
    });

    return { damage, details };
}

function applySelfHateBonus(card, casterPlayer, baseDamage, baseHeal) {
    let damage = Number(baseDamage || 0);
    let heal = Number(baseHeal || 0);
    const details = [];
    let extraHateChange = 0;

    if (card.selfHateScaling && card.selfHateScaling.damagePerHate) {
        const bonus = Number(casterPlayer.hate) * Number(card.selfHateScaling.damagePerHate);
        if (bonus > 0) {
            damage += bonus;
            details.push(`自ヘイト${casterPlayer.hate}：+${formatNumber(bonus)}ダメージ`);
        }
    }

    if (Array.isArray(card.selfHateBonus)) {
        card.selfHateBonus.forEach(bonus => {
            if (bonus.selfHateExact !== undefined && casterPlayer.hate !== Number(bonus.selfHateExact)) return;

            const multiplier = Number(bonus.damageMultiplier ?? 1);
            if (multiplier !== 1) {
                damage = Math.round(damage * multiplier);
                details.push(`自ヘイト${bonus.selfHateExact}：ダメージ${multiplier}倍`);
            }

            const bonusDamage = Number(bonus.extraDamage ?? 0);
            if (bonusDamage > 0) {
                damage += bonusDamage;
                details.push(`自ヘイト${bonus.selfHateExact}：+${formatNumber(bonusDamage)}ダメージ`);
            }

            const bonusHeal = Number(bonus.extraHeal ?? 0);
            if (bonusHeal > 0) {
                heal += bonusHeal;
                details.push(`自ヘイト${bonus.selfHateExact}：+${formatNumber(bonusHeal)}回復`);
            }

            const hateChange = Number(bonus.extraHateChange ?? 0);
            if (hateChange !== 0) {
                extraHateChange += hateChange;
                details.push(`自ヘイト${bonus.selfHateExact}：ヘイト${hateChange > 0 ? "+" : ""}${hateChange}`);
            }
        });
    }

    return { damage, heal, details, extraHateChange };
}

function applySpecialEffect(game, card, caster, target) {
    const effectType = card.effectType;
    const details = [];

    if (effectType === "destroyTargetTraps") {
        if (!target) return details;

        const destroyCount = Number(card.destroyTrapCount || 1);
        const destroyed = target.fieldCards.splice(0, destroyCount).length;
        details.push(`伏せカード破壊：${destroyed}枚`);
        return details;
    }

    if (effectType === "destroyAllEnemyTraps") {
        let totalDestroyed = 0;

        game.turnOrder.forEach(player => {
            if (player.id === caster.id || player.defeated) return;

            totalDestroyed += player.fieldCards.length;
            player.fieldCards = [];
        });

        details.push(`敵全体の伏せカード破壊：${totalDestroyed}枚`);
        return details;
    }

    if (effectType === "skipTurn") {
        const skipTurns = Math.max(1, Number(card.skipTurns || 1));

        if (!target) {
            const enemies = game.turnOrder.filter(p => p.id !== caster.id && !p.defeated);
            enemies.forEach(enemy => {
                enemy.skipTurns = Number(enemy.skipTurns || 0) + skipTurns;
                addStatusEffect(enemy, {
                    type: "freeze",
                    remainingTurns: skipTurns,
                    sourcePlayerId: caster.id,
                    sourcePlayerName: caster.name,
                    cardName: card.name,
                    cardRarity: card.rarity
                });
            });
            details.push(`全体凍結：${skipTurns}ターン（${enemies.length}人）`);
            return details;
        }

        target.skipTurns = Number(target.skipTurns || 0) + skipTurns;
        addStatusEffect(target, {
            type: "freeze",
            remainingTurns: skipTurns,
            sourcePlayerId: caster.id,
            sourcePlayerName: caster.name,
            cardName: card.name,
            cardRarity: card.rarity
        });
        details.push(`凍結：${skipTurns}ターン`);
        return details;
    }

    if (effectType === "slipDamage") {
        const slipDamage = Math.max(0, Number(card.slipDamage || 0));
        const durationTurns = Math.max(1, Number(card.durationTurns || 1));

        if (!target) {
            const enemies = game.turnOrder.filter(p => p.id !== caster.id && !p.defeated);
            enemies.forEach(enemy => {
                addStatusEffect(enemy, {
                    type: "slipDamage",
                    amount: slipDamage,
                    remainingTurns: durationTurns,
                    sourcePlayerId: caster.id,
                    sourcePlayerName: caster.name,
                    cardName: card.name,
                    cardRarity: card.rarity
                });
            });
            details.push(`全体炎上：${formatNumber(slipDamage)} × ${durationTurns}ターン（${enemies.length}人）`);
            return details;
        }

        addStatusEffect(target, {
            type: "slipDamage",
            amount: slipDamage,
            remainingTurns: durationTurns,
            sourcePlayerId: caster.id,
            sourcePlayerName: caster.name,
            cardName: card.name,
            cardRarity: card.rarity
        });

        details.push(`炎上：${formatNumber(slipDamage)} × ${durationTurns}ターン`);
        return details;
    }

    if (effectType === "extraTurn") {
        const extraTurns = Math.max(1, Number(card.extraTurns || 1));
        caster.extraTurns = Number(caster.extraTurns || 0) + extraTurns;
        details.push(`追加ターン：${extraTurns}回`);
        return details;
    }

    if (effectType === "discardTargetHand") {
        if (!target) return details;

        const discardAllHand = Boolean(card.discardAllHand);
        const discardCount = discardAllHand
            ? target.hand.length
            : Math.min(target.hand.length, Math.max(1, Number(card.discardCount || 1)));

        target.hand.splice(0, discardCount);
        details.push(`手札破壊：${discardCount}枚`);
        return details;
    }

    if (effectType === "applyStatus") {
        const statusType = card.statusType || "burn";
        const durationTurns = Math.max(1, Number(card.durationTurns || 1));
        const amount = Number(card.statusAmount || card.slipDamage || 0);
        const info = statusInfo(statusType);

        if (!target) {
            const enemies = game.turnOrder.filter(p => p.id !== caster.id && !p.defeated);
            enemies.forEach(enemy => {
                addStatusEffect(enemy, {
                    type: statusType,
                    amount,
                    remainingTurns: durationTurns,
                    sourcePlayerId: caster.id,
                    sourcePlayerName: caster.name,
                    cardName: card.name,
                    cardRarity: card.rarity
                });
                if (statusType === "freeze") {
                    enemy.skipTurns = Number(enemy.skipTurns || 0) + durationTurns;
                }
            });
            details.push(`全体${info.label}：${durationTurns}ターン（${enemies.length}人）`);
            return details;
        }

        addStatusEffect(target, {
            type: statusType,
            amount,
            remainingTurns: durationTurns,
            sourcePlayerId: caster.id,
            sourcePlayerName: caster.name,
            cardName: card.name,
            cardRarity: card.rarity
        });

        if (statusType === "freeze") {
            target.skipTurns = Number(target.skipTurns || 0) + durationTurns;
        }

        details.push(`${info.label}：${durationTurns}ターン${amount > 0 ? ` / ${formatNumber(amount)}ダメージ` : ""}`);
        return details;
    }

    if (effectType === "discardAllEnemiesHand") {
        let total = 0;
        game.turnOrder.forEach(player => {
            if (player.id === caster.id || player.defeated) return;
            total += player.hand.length;
            player.hand = [];
        });
        details.push(`敵全員の手札破壊：${total}枚`);
        return details;
    }

    if (effectType === "clearSelfStatus") {
        const before = Array.isArray(caster.statusEffects) ? caster.statusEffects.length : 0;
        caster.statusEffects = [];
        caster.skipTurns = 0;
        details.push(`状態異常解除：${before}個`);
        return details;
    }

    details.push("特殊効果：未対応");
    return details;
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

function findRoomByReconnectToken(roomId, reconnectToken) {
    const room = rooms[roomId];

    if (!room || !reconnectToken) return null;

    const player = room.players.find(player => player.reconnectToken === reconnectToken);

    if (!player) return null;

    return { roomId, room, player };
}

function emitRoomUpdate(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    io.to(roomId).emit("updateRoom", {
        players: room.players,
        drawRule: room.drawRule || "classic"
    });
}

function updateIdInLogs(logs, oldId, newId) {
    if (!Array.isArray(logs)) return;

    logs.forEach(log => {
        if (!log) return;
        if (log.playerId === oldId) log.playerId = newId;
        if (log.sourcePlayerId === oldId) log.sourcePlayerId = newId;
        if (log.targetPlayerId === oldId) log.targetPlayerId = newId;
    });
}

function updateIdInStatusEffects(players, oldId, newId) {
    if (!Array.isArray(players)) return;

    players.forEach(player => {
        if (!Array.isArray(player.statusEffects)) return;

        player.statusEffects.forEach(effect => {
            if (!effect) return;
            if (effect.sourcePlayerId === oldId) effect.sourcePlayerId = newId;
        });
    });
}

function replacePlayerSocketId(room, oldId, newId) {
    if (!room || oldId === newId) return;

    room.players.forEach(player => {
        if (player.id === oldId) {
            player.id = newId;
        }
    });

    if (room.game) {
        room.game.turnOrder.forEach(player => {
            if (player.id === oldId) {
                player.id = newId;
            }
        });

        if (room.game.waitingTrapPlayerId === oldId) {
            room.game.waitingTrapPlayerId = newId;
        }

        updateIdInLogs(room.game.playedCards, oldId, newId);
        updateIdInStatusEffects(room.game.turnOrder, oldId, newId);
    }

    Object.values(pendingTrapChoices).forEach(pending => {
        if (!pending) return;
        if (pending.targetPlayerId === oldId) pending.targetPlayerId = newId;
        if (pending.sourcePlayerId === oldId) pending.sourcePlayerId = newId;
    });
}

function clearReconnectCleanupTimer(room, reconnectToken) {
    if (!room || !room.reconnectCleanupTimers || !reconnectToken) return;

    const timer = room.reconnectCleanupTimers[reconnectToken];

    if (timer) {
        clearTimeout(timer);
        delete room.reconnectCleanupTimers[reconnectToken];
    }
}

function scheduleReconnectCleanup(roomId, reconnectToken) {
    const room = rooms[roomId];
    if (!room || !reconnectToken) return;

    room.reconnectCleanupTimers = room.reconnectCleanupTimers || {};
    clearReconnectCleanupTimer(room, reconnectToken);

    room.reconnectCleanupTimers[reconnectToken] = setTimeout(() => {
        const currentRoom = rooms[roomId];
        if (!currentRoom) return;

        const player = currentRoom.players.find(player => player.reconnectToken === reconnectToken);
        if (!player || !player.disconnected) return;

        if (currentRoom.players.every(player => player.disconnected)) {
            delete rooms[roomId];
            return;
        }

        if (!currentRoom.game) {
            if (player.host) {
                io.to(roomId).emit("roomDisbanded");
                delete rooms[roomId];
                return;
            }

            currentRoom.players = currentRoom.players.filter(player => player.reconnectToken !== reconnectToken);
            emitRoomUpdate(roomId);
        }
    }, RECONNECT_TIMEOUT_MS);
}

function sendPendingTrapChoiceToPlayer(roomId, player, targetSocket) {
    const room = rooms[roomId];
    if (!room || !room.game || !player || !targetSocket) return;

    const pendingEntry = Object.entries(pendingTrapChoices).find(([, pending]) => {
        return pending &&
            pending.roomId === roomId &&
            pending.targetPlayerId === player.id;
    });

    if (!pendingEntry) return;

    const [choiceId, pending] = pendingEntry;
    const sourcePlayer = room.game.turnOrder.find(candidate => candidate.id === pending.sourcePlayerId);

    if (!sourcePlayer) return;

    const allTraps = player.fieldCards.map(card => {
        const canActivate = card.trapCondition === pending.condition;

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

    targetSocket.emit("chooseTrap", {
        choiceId,
        sourcePlayerName: sourcePlayer.name,
        condition: pending.condition,
        conditionText: conditionText(pending.condition),
        context: pending.context,
        traps: allTraps
    });
}

function removeTrapByFieldId(player, fieldId) {
    const index = player.fieldCards.findIndex(card => card.fieldId === fieldId);
    if (index === -1) return null;

    const trap = player.fieldCards[index];
    player.fieldCards.splice(index, 1);

    return trap;
}

function setTrapCard(caster, usedCard, game, roomId, overwrite = false) {
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
        trapHateChange: usedCard.trapHateChange || 0,
        trapMuteTurns: usedCard.trapMuteTurns || 0,
        trapFreezeTurns: usedCard.trapFreezeTurns || 0,
        trapShadowbanTurns: usedCard.trapShadowbanTurns || 0
    });

    caster.cardsPlayedThisTurn = (caster.cardsPlayedThisTurn || 0) + 1;

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
        log: overwrite
            ? `${caster.name} は伏せカードを上書きした`
            : `${caster.name} は ${usedCard.name} を伏せた`
    });

    emitGameUpdate(roomId);
}

function conditionText(condition) {
    if (condition === "onDamage") return "ダメージを受けたとき";
    if (condition === "onHateChange") return "ヘイトを変動させられたとき";
    if (condition === "onTrapEffect") return "罠カードの効果を受けたとき";
    return "条件不明";
}

function createGameViewForPlayer(game, viewerId) {
    const view = JSON.parse(JSON.stringify(game));
    const viewer = view.turnOrder.find(player => player.id === viewerId);
    const isSpectator = !viewer;
    const canViewAll = Boolean(isSpectator || (viewer && viewer.defeated));

    view.turnOrder = view.turnOrder.map(player => {
        if (player.id === viewerId) return player;

        return {
            ...player,
            hand: canViewAll ? player.hand : [],
            handCount: player.hand.length,
            fieldCards: canViewAll
                ? player.fieldCards
                : player.fieldCards.map(() => ({
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
        if (canViewAll) return log;

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

        return log;
    });

    return view;
}

function emitGameUpdate(roomId) {
    const room = rooms[roomId];
    if (!room || !room.game) return;

    const clients = io.sockets.adapter.rooms.get(roomId);
    if (!clients) return;

    const spectators = room.players
        .filter(p => p.spectator && !p.disconnected)
        .map(p => ({ name: p.name }));

    clients.forEach(clientId => {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (!clientSocket) return;

        const view = createGameViewForPlayer(room.game, clientId);
        view.spectators = spectators;

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
    onEffectConfirmed,
    onComplete
}) {
    const complete = () => {
        if (typeof onComplete === "function") {
            onComplete();
        }
    };

    // ダメージ以外の付随効果（ヘイト変動・状態異常）は、onTrapEffect連鎖で
    // 効果そのものが無効化されなかったと確定した時点でのみ反映する。
    const confirmEffect = () => {
        if (typeof onEffectConfirmed === "function") {
            onEffectConfirmed();
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

            confirmEffect();

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
                        applyDamage(game, targetPlayer, damage, {
                            playerName: sourcePlayer.name,
                            cardName: trapName,
                            cardRarity: trapRarity
                        });
                    }

                    complete();
                }
            });

            if (!damageRequested) {
                applyDamage(game, targetPlayer, damage, {
                    playerName: sourcePlayer.name,
                    cardName: trapName,
                    cardRarity: trapRarity
                });
                complete();
            }
        }
    });

    if (trapEffectRequested) {
        return true;
    }

    confirmEffect();

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
                applyDamage(game, targetPlayer, damage, {
                    playerName: sourcePlayer.name,
                    cardName: trapName,
                    cardRarity: trapRarity
                });
            }

            complete();
        }
    });

    if (damageRequested) {
        return true;
    }

    applyDamage(game, targetPlayer, damage, {
        playerName: sourcePlayer.name,
        cardName: trapName,
        cardRarity: trapRarity
    });
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
        effect: trap.effect || "",
        log: `${trapOwner.name} の ${trap.name} が発動した`
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
            log: `${trapOwner.name} の ${trap.name} がダメージを跳ね返した`,
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
            log: `${trapOwner.name} の ${trap.name} がヘイト変動を打ち消した`,
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
            log: `${trapOwner.name} の ${trap.name} が罠効果を打ち消した`,
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
            log: `${trapOwner.name} の ${trap.name} が罠効果を打ち消し、相手の伏せカードをすべて破壊した`,
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
            log: `${trapOwner.name} の ${trap.name} が ${sourcePlayer.name} に反撃した`,
            damageText: `罠ダメージ：${damage.toLocaleString()}`,
            damageAmount: damage,
            hateAmount: hateChange,
            trapDetailText: `反撃：${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / ヘイト +${hateChange}`
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
            onEffectConfirmed: () => {
                changeHate(sourcePlayer, hateChange);
            },
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

    if (trap.trapEffect === "freezeAttacker") {
        const freezeTurns = Math.max(1, Number(trap.trapFreezeTurns || 1));

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            cardRarity: normalizeRarity(trap.rarity),
            hateText: `${sourcePlayer.name} を ${freezeTurns}ターン凍結`,
            log: `${trapOwner.name} の ${trap.name} が ${sourcePlayer.name} を凍結した`,
            trapDetailText: `凍結：${sourcePlayer.name} ${freezeTurns}ターン行動不能`
        });

        sourcePlayer.skipTurns = Number(sourcePlayer.skipTurns || 0) + freezeTurns;
        addStatusEffect(sourcePlayer, {
            type: "freeze",
            remainingTurns: freezeTurns,
            sourcePlayerId: trapOwner.id,
            sourcePlayerName: trapOwner.name,
            cardName: trap.name,
            cardRarity: trap.rarity
        });

        return { canceled: false };
    }

    if (trap.trapEffect === "shadowbanAttacker") {
        const shadowbanTurns = Math.max(1, Number(trap.trapShadowbanTurns || 1));

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            cardRarity: normalizeRarity(trap.rarity),
            hateText: `${sourcePlayer.name} を ${shadowbanTurns}ターンシャドウバン`,
            log: `${trapOwner.name} の ${trap.name} が ${sourcePlayer.name} をシャドウバンした`,
            trapDetailText: `シャドウバン：${sourcePlayer.name} ${shadowbanTurns}ターン`
        });

        addStatusEffect(sourcePlayer, {
            type: "shadowban",
            remainingTurns: shadowbanTurns,
            sourcePlayerId: trapOwner.id,
            sourcePlayerName: trapOwner.name,
            cardName: trap.name,
            cardRarity: trap.rarity
        });

        return { canceled: false };
    }

    if (trap.trapEffect === "damageAndFreeze") {
        const damage = trap.trapDamage || 0;
        const freezeTurns = Math.max(1, Number(trap.trapFreezeTurns || 1));
        const hateChange = trap.trapHateChange || 0;

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            cardRarity: normalizeRarity(trap.rarity),
            hateText: `${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / 凍結 ${freezeTurns}ターン`,
            log: `${trapOwner.name} の ${trap.name} が ${sourcePlayer.name} に反撃・凍結した`,
            damageText: damage > 0 ? `罠ダメージ：${damage.toLocaleString()}` : "ダメージなし",
            damageAmount: damage,
            trapDetailText: `反撃：${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / 凍結 ${freezeTurns}ターン`
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
            onEffectConfirmed: () => {
                sourcePlayer.skipTurns = Number(sourcePlayer.skipTurns || 0) + freezeTurns;
                addStatusEffect(sourcePlayer, {
                    type: "freeze",
                    remainingTurns: freezeTurns,
                    sourcePlayerId: trapOwner.id,
                    sourcePlayerName: trapOwner.name,
                    cardName: trap.name,
                    cardRarity: trap.rarity
                });

                if (hateChange !== 0) changeHate(sourcePlayer, hateChange);
            },
            onComplete: () => {
                afterPendingComplete({ canceled: false });
            }
        });

        if (pending) return { canceled: false, pending: true };

        return { canceled: false };
    }

    if (trap.trapEffect === "cancelDamage") {
        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            cardRarity: normalizeRarity(trap.rarity),
            hateText: "ダメージを無効化した",
            log: `${trapOwner.name} の ${trap.name} がダメージを無効化した`,
            trapDetailText: "ダメージ無効化"
        });

        return { canceled: true };
    }

    if (trap.trapEffect === "damageAndMute") {
        const damage = trap.trapDamage || 0;
        const muteTurns = Math.max(1, Number(trap.trapMuteTurns || 1));
        const hateChange = trap.trapHateChange || 0;

        addLog(game, {
            actionType: "trapEffect",
            playerId: trapOwner.id,
            playerName: trapOwner.name,
            targetName: sourcePlayer.name,
            cardName: trap.name,
            cardType: trap.type,
            cardRarity: normalizeRarity(trap.rarity),
            hateText: `${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / ミュート ${muteTurns}ターン`,
            log: `${trapOwner.name} の ${trap.name} が ${sourcePlayer.name} を反撃・ミュートした`,
            damageText: damage > 0 ? `罠ダメージ：${damage.toLocaleString()}` : "ダメージなし",
            damageAmount: damage,
            trapDetailText: `反撃：${sourcePlayer.name} に ${damage.toLocaleString()}ダメージ / ミュート ${muteTurns}ターン`
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
            onEffectConfirmed: () => {
                addStatusEffect(sourcePlayer, {
                    type: "mute",
                    remainingTurns: muteTurns,
                    sourcePlayerId: trapOwner.id,
                    sourcePlayerName: trapOwner.name,
                    cardName: trap.name,
                    cardRarity: trap.rarity
                });

                if (hateChange !== 0) {
                    changeHate(sourcePlayer, hateChange);
                }
            },
            onComplete: () => {
                afterPendingComplete({ canceled: false });
            }
        });

        if (pending) {
            return { canceled: false, pending: true };
        }

        return { canceled: false };
    }

    return { canceled: false };
}


function makePlayerOwakonBySocket(roomId, socketId) {
    const room = rooms[roomId];

    if (!room || !room.game) {
        return false;
    }

    const lobbyPlayer = room.players.find(player => player.id === socketId);
    const game = room.game;
    const gamePlayer = game.turnOrder.find(player => player.id === socketId);

    if (!gamePlayer || gamePlayer.defeated) {
        return false;
    }

    const wasCurrentTurn = getCurrentPlayer(game)?.id === socketId;

    gamePlayer.followers = 0;
    gamePlayer.defeated = true;
    gamePlayer.defeatCause = {
        playerName: "",
        cardName: "途中退出",
        cardRarity: "C"
    };
    gamePlayer.disconnected = true;
    gamePlayer.disconnectedAt = Date.now();

    if (lobbyPlayer) {
        lobbyPlayer.disconnected = true;
        lobbyPlayer.disconnectedAt = gamePlayer.disconnectedAt;
    }

    Object.entries(pendingTrapChoices).forEach(([choiceId, pending]) => {
        if (!pending) return;
        if (pending.roomId !== roomId) return;
        if (pending.targetPlayerId !== socketId && pending.sourcePlayerId !== socketId) return;

        delete pendingTrapChoices[choiceId];
        game.waitingTrapChoice = false;
        game.waitingTrapPlayerId = null;
        game.waitingTrapPlayerName = "";

        if (typeof pending.onResolved === "function") {
            pending.onResolved({ canceled: false, pending: false });
        }
    });

    Object.entries(pendingOverwriteChoices).forEach(([choiceId, pending]) => {
        if (!pending) return;
        if (pending.roomId !== roomId) return;
        if (pending.playerId !== socketId) return;
        delete pendingOverwriteChoices[choiceId];
    });

    addLog(game, {
        actionType: "defeated",
        playerId: gamePlayer.id,
        playerName: gamePlayer.name,
        targetName: gamePlayer.name,
        cardName: "途中退出",
        cardType: "特殊",
        cardRarity: "C",
        hateText: "対戦から退出してオワコンになった",
        log: `${gamePlayer.name} は対戦から退出してオワコンになった`,
        specialText: "途中退出"
    });

    checkGameOver(game);

    if (!game.gameOver && wasCurrentTurn) {
        moveToNextAliveTurn(game);
    }

    checkGameOver(game);

    return true;
}

io.on("connection", socket => {
    console.log("接続:", socket.id);

    socket.emit("cardList", CARD_MASTER.map(normalizeCard));

    if (DEV_MODE) {
        socket.emit("devCardList", CARD_MASTER.map(normalizeCard));
    }

    socket.on("reconnectPlayer", ({ roomId, reconnectToken }) => {
        const result = findRoomByReconnectToken(roomId, reconnectToken);

        if (!result) {
            socket.emit("reconnectFailed", "復帰できるルームが見つかりません");
            return;
        }

        const { room, player } = result;
        const oldId = player.id;

        clearReconnectCleanupTimer(room, reconnectToken);
        replacePlayerSocketId(room, oldId, socket.id);

        player.id = socket.id;
        player.disconnected = false;
        player.disconnectedAt = null;

        if (room.game) {
            const gamePlayer = room.game.turnOrder.find(candidate => candidate.reconnectToken === reconnectToken);

            if (gamePlayer) {
                gamePlayer.id = socket.id;
                gamePlayer.disconnected = false;
                gamePlayer.disconnectedAt = null;
            }
        }

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.reconnectToken = reconnectToken;

        socket.emit("reconnectInfo", { roomId, reconnectToken });
        socket.emit("reconnectSuccess", {
            roomId,
            isHost: Boolean(player.host),
            ready: Boolean(player.ready),
            phase: room.game ? "battle" : "lobby"
        });

        emitRoomUpdate(roomId);

        if (room.game) {
            emitGameUpdate(roomId);

            const gamePlayer = room.game.turnOrder.find(candidate => candidate.id === socket.id);
            sendPendingTrapChoiceToPlayer(roomId, gamePlayer, socket);
        }
    });

    socket.on("createRoom", playerName => {
        const roomId = generateRoomId();

        const reconnectToken = generateReconnectToken();

        rooms[roomId] = {
            players: [{
                id: socket.id,
                reconnectToken,
                name: playerName,
                ready: false,
                host: true,
                disconnected: false,
                disconnectedAt: null
            }],
            game: null,
            reconnectCleanupTimers: {},
            drawRule: "classic"
        };

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.reconnectToken = reconnectToken;
        socket.emit("roomCreated", roomId);
        socket.emit("reconnectInfo", { roomId, reconnectToken });
        emitRoomUpdate(roomId);
    });

    socket.on("joinRoom", ({ roomId, playerName }) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit("errorMessage", "ルームが存在しません");
            return;
        }

        const activePlayers = room.players.filter(p => !p.spectator);
        const isSpectator = activePlayers.length >= 4 || Boolean(room.game);

        const reconnectToken = generateReconnectToken();

        room.players.push({
            id: socket.id,
            reconnectToken,
            name: playerName,
            ready: isSpectator ? true : false,
            host: false,
            spectator: isSpectator,
            disconnected: false,
            disconnectedAt: null
        });

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.reconnectToken = reconnectToken;
        socket.emit("reconnectInfo", { roomId, reconnectToken });

        if (isSpectator) {
            socket.emit("spectatorJoinSuccess", { roomId, phase: room.game ? "battle" : "lobby" });
        } else {
            socket.emit("joinSuccess", roomId);
        }

        emitRoomUpdate(roomId);

        if (isSpectator && room.game) {
            emitGameUpdate(roomId);
        }
    });

    socket.on("toggleReady", ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(player => player.id === socket.id);
        if (!player) return;

        player.ready = !player.ready;
        emitRoomUpdate(roomId);
    });

    socket.on("setDrawRule", ({ roomId, drawRule }) => {
        const room = rooms[roomId];
        if (!room || room.game) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.host) return;

        if (drawRule !== "classic" && drawRule !== "handManage") return;

        room.drawRule = drawRule;
        emitRoomUpdate(roomId);
    });

    socket.on("startGame", roomId => {
        const room = rooms[roomId];
        if (!room) return;

        const starter = room.players.find(player => player.id === socket.id);

        if (!starter || !starter.host) {
            socket.emit("errorMessage", "ゲーム開始はルーム作成者のみ可能です");
            return;
        }

        const activePlayers = room.players.filter(p => !p.spectator);

        if (activePlayers.length < 2) {
            socket.emit("errorMessage", "ゲーム開始には2人以上必要です");
            return;
        }

        if (!activePlayers.every(player => player.ready)) {
            socket.emit("errorMessage", "全員が準備完了していません");
            return;
        }

        room.game = createGameState(activePlayers, room.drawRule || "classic");
        room.returnedToLobby = null;

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

    socket.on("chooseOverwriteTrapResponse", ({ choiceId, fieldId }) => {
        const pending = pendingOverwriteChoices[choiceId];
        if (!pending) return;
        if (socket.id !== pending.playerId) return;

        const room = rooms[pending.roomId];
        if (!room || !room.game) {
            delete pendingOverwriteChoices[choiceId];
            return;
        }

        const game = room.game;
        const caster = game.turnOrder.find(p => p.id === pending.playerId);
        if (!caster) {
            delete pendingOverwriteChoices[choiceId];
            return;
        }

        delete pendingOverwriteChoices[choiceId];

        const removeIndex = caster.fieldCards.findIndex(c => c.fieldId === fieldId);
        if (removeIndex !== -1) {
            caster.fieldCards.splice(removeIndex, 1);
        } else {
            caster.fieldCards.shift();
        }

        setTrapCard(caster, pending.newCard, game, pending.roomId, true);
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
                const choiceId = `overwrite-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                pendingOverwriteChoices[choiceId] = {
                    roomId,
                    playerId: caster.id,
                    newCard: usedCard
                };
                socket.emit("chooseOverwriteTrap", {
                    choiceId,
                    newCard: {
                        name: usedCard.name,
                        type: usedCard.type,
                        rarity: normalizeRarity(usedCard.rarity),
                        effect: usedCard.effect,
                        hateText: usedCard.hateText,
                        trapCondition: usedCard.trapCondition,
                        conditionText: conditionText(usedCard.trapCondition)
                    },
                    currentTraps: caster.fieldCards.map(card => ({
                        fieldId: card.fieldId,
                        name: card.name,
                        type: card.type,
                        rarity: card.rarity,
                        effect: card.effect,
                        hateText: card.hateText,
                        trapCondition: card.trapCondition,
                        conditionText: conditionText(card.trapCondition)
                    }))
                });
                return;
            }

            setTrapCard(caster, usedCard, game, roomId);
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

            if (hasStatusEffect(target, "kagiaka")) {
                caster.hand.push(usedCard);
                socket.emit("errorMessage", `${target.name} は鍵垢中のため対象にできません`);
                return;
            }
        }

        const finalTarget =
            usedCard.targetType === "self"
                ? caster
                : usedCard.targetType === "allEnemies"
                    ? null
                    : target;

        if (usedCard.targetType !== "allEnemies" && !finalTarget) {
            caster.hand.push(usedCard);
            return;
        }

        caster.cardsPlayedThisTurn = (caster.cardsPlayedThisTurn || 0) + 1;

        const targetLabel = usedCard.targetType === "allEnemies"
            ? "敵全体"
            : finalTarget.name;

        const finishCardPlay = (extraLog = {}) => {
            addLog(game, {
                actionType: "play",
                playerId: caster.id,
                playerName: caster.name,
                targetName: targetLabel,
                cardName: usedCard.name,
                cardType: usedCard.type,
                cardRarity: normalizeRarity(usedCard.rarity),
                hateText: usedCard.hateText,
                log: `${caster.name} → ${targetLabel}：${usedCard.name}`,
                ...extraLog
            });

            finishGameIfNeeded(roomId);
        };

        if (usedCard.kind === "attack") {
            if (usedCard.targetType === "allEnemies") {
                const targets = game.turnOrder.filter(player => {
                    return player.id !== caster.id && !player.defeated;
                });

                const damageDetails = [];
                let totalDamage = 0;

                targets.forEach(enemy => {
                    const hateBonusResult = applyHateBonus(usedCard, caster, enemy, usedCard.damage);
                    const rankBonusResult = applyRankBonus(game, usedCard, caster, enemy, hateBonusResult.damage);
                    const selfHateBonusResult = applySelfHateBonus(usedCard, caster, rankBonusResult.damage, 0);
                    let damage = selfHateBonusResult.damage;

                    if (hasStatusEffect(caster, "shadowban")) {
                        damage = Math.max(0, damage - 500);
                    }

                    if (hasStatusEffect(enemy, "expose")) {
                        damage += 300;
                    }

                    if (enemy.hate >= 3) {
                        damage *= 2;
                    }

                    applyDamage(game, enemy, damage, {
                        playerName: caster.name,
                        cardName: usedCard.name,
                        cardRarity: usedCard.rarity,
                        cardEffect: usedCard.effect || ""
                    });

                    if (usedCard.attackSlipDamage > 0) {
                        addStatusEffect(enemy, {
                            type: "slipDamage",
                            amount: Number(usedCard.attackSlipDamage),
                            remainingTurns: Number(usedCard.attackSlipDurationTurns || 1),
                            sourcePlayerId: caster.id,
                            sourcePlayerName: caster.name,
                            cardName: usedCard.name,
                            cardRarity: usedCard.rarity
                        });
                    }

                    if (usedCard.attackStatusType) {
                        const dur = Number(usedCard.attackStatusDuration || 1);
                        addStatusEffect(enemy, {
                            type: usedCard.attackStatusType,
                            remainingTurns: dur,
                            sourcePlayerId: caster.id,
                            sourcePlayerName: caster.name,
                            cardName: usedCard.name,
                            cardRarity: usedCard.rarity
                        });
                        if (usedCard.attackStatusType === "freeze") {
                            enemy.skipTurns = Number(enemy.skipTurns || 0) + dur;
                        }
                    }

                    totalDamage += damage;
                    damageDetails.push(`${enemy.name}:${formatNumber(damage)}`);
                });

                if (usedCard.hateTarget === "self") {
                    changeHate(caster, usedCard.hateChange);
                }

                const allEnemiesExtra = {
                    log: `${caster.name} → 敵全体：${usedCard.name}`,
                    damageText: `全体ダメージ：${damageDetails.join(" / ")}`,
                    damageAmount: totalDamage
                };

                if (usedCard.attackStatusType) {
                    const dur = Number(usedCard.attackStatusDuration || 1);
                    allEnemiesExtra.specialText = `${statusInfo(usedCard.attackStatusType).label}：${dur}ターン付与（全体）`;
                }

                finishCardPlay(allEnemiesExtra);

                return;
            }

            const hateBonusResult = applyHateBonus(usedCard, caster, finalTarget, usedCard.damage);
            const rankBonusResult = applyRankBonus(game, usedCard, caster, finalTarget, hateBonusResult.damage);
            const selfHateBonusResult = applySelfHateBonus(usedCard, caster, rankBonusResult.damage, 0);
            let damage = selfHateBonusResult.damage;
            const bonusDetails = [...hateBonusResult.details, ...rankBonusResult.details, ...selfHateBonusResult.details];

            if (hasStatusEffect(caster, "shadowban")) {
                damage = Math.max(0, damage - 500);
                bonusDetails.push("シャドウバン：-500ダメージ");
            }

            if (hasStatusEffect(finalTarget, "expose")) {
                damage += 300;
                bonusDetails.push("晒し中：+300ダメージ");
            }

            if (finalTarget.hate >= 3) {
                damage *= 2;
                bonusDetails.push("ヘイト3：ダメージ2倍");
            }

            const afterDamage = result => {
                if (!result.canceled) {
                    applyDamage(game, finalTarget, damage, {
                        playerName: caster.name,
                        cardName: usedCard.name,
                        cardRarity: usedCard.rarity,
                        cardEffect: usedCard.effect || ""
                    });

                    if (usedCard.attackSlipDamage > 0) {
                        addStatusEffect(finalTarget, {
                            type: "slipDamage",
                            amount: Number(usedCard.attackSlipDamage),
                            remainingTurns: Number(usedCard.attackSlipDurationTurns || 1),
                            sourcePlayerId: caster.id,
                            sourcePlayerName: caster.name,
                            cardName: usedCard.name,
                            cardRarity: usedCard.rarity
                        });
                    }

                    if (usedCard.attackStatusType) {
                        const dur = Number(usedCard.attackStatusDuration || 1);
                        addStatusEffect(finalTarget, {
                            type: usedCard.attackStatusType,
                            remainingTurns: dur,
                            sourcePlayerId: caster.id,
                            sourcePlayerName: caster.name,
                            cardName: usedCard.name,
                            cardRarity: usedCard.rarity
                        });
                        if (usedCard.attackStatusType === "freeze") {
                            finalTarget.skipTurns = Number(finalTarget.skipTurns || 0) + dur;
                        }
                        bonusDetails.push(`${statusInfo(usedCard.attackStatusType).label}：${dur}ターン付与`);
                    }
                }

                if (usedCard.hateTarget === "self") {
                    changeHate(caster, usedCard.hateChange);
                }

                if (usedCard.hateTarget === "target") {
                    changeHate(finalTarget, usedCard.hateChange);
                }

                if (usedCard.hateTarget === "both") {
                    changeHate(caster, usedCard.hateChange);
                    changeHate(finalTarget, usedCard.hateChange);
                }

                finishCardPlay({
                    log: `${caster.name} → ${finalTarget.name}：${usedCard.name}`,
                    damageText: result.canceled
                        ? `ダメージ：0（無効 / 元ダメージ ${formatNumber(damage)}）`
                        : `ダメージ：${formatNumber(damage)}`,
                    damageAmount: result.canceled ? 0 : damage,
                    originalDamageAmount: damage,
                    damageCanceled: Boolean(result.canceled),
                    bonusText: bonusDetails.join(" / ")
                });
            };

            const shouldIgnoreTrap = Boolean(usedCard.ignoreTrap || usedCard.pierceTrap);

            if (shouldIgnoreTrap) {
                afterDamage({ canceled: false });
                return;
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
                    cardRarity: normalizeRarity(usedCard.rarity),
                    effect: usedCard.effect,
                    hateText: usedCard.hateText,
                    sourceActionText: `${caster.name} が ${usedCard.name} を使用`,
                    resultText: `${formatNumber(damage)}ダメージを受ける可能性があります`
                },
                onResolved: result => {
                    if (result.pending) return;
                    afterDamage(result);
                }
            });

            if (!requested) {
                afterDamage({ canceled: false });
            }

            return;
        }

        if (usedCard.kind === "support") {
            const selfHateBonusResult = applySelfHateBonus(usedCard, caster, 0, usedCard.heal);
            const totalHeal = selfHateBonusResult.heal;

            const beforeFollowers = caster.followers;
            caster.followers = Math.min(10000, caster.followers + totalHeal);
            const healAmount = Math.max(0, caster.followers - beforeFollowers);

            if (usedCard.clearStatus) {
                caster.statusEffects = [];
                caster.skipTurns = 0;
            }

            if (usedCard.hateTarget === "self") {
                changeHate(caster, usedCard.hateChange);
            }

            if (selfHateBonusResult.extraHateChange !== 0) {
                changeHate(caster, selfHateBonusResult.extraHateChange);
            }

            if (usedCard.statusType) {
                const sInfo = statusInfo(usedCard.statusType);
                addStatusEffect(caster, {
                    type: usedCard.statusType,
                    remainingTurns: Number(usedCard.durationTurns || 1),
                    sourcePlayerId: caster.id,
                    sourcePlayerName: caster.name,
                    cardName: usedCard.name,
                    cardRarity: usedCard.rarity
                });
            }

            finishCardPlay({
                healText: `回復：${healAmount.toLocaleString()}`,
                healAmount,
                ...(usedCard.clearStatus ? { specialText: "状態異常解除" } : {}),
                ...(usedCard.statusType ? { specialText: `${statusInfo(usedCard.statusType).label}：${Number(usedCard.durationTurns || 1)}ターン` } : {}),
                ...(selfHateBonusResult.details.length > 0 ? { bonusText: selfHateBonusResult.details.join(" / ") } : {})
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

                    if (usedCard.hateTarget === "both") {
                        changeHate(caster, usedCard.hateChange);
                    }

                    finishCardPlay();
                }
            });

            if (!requested) {
                changeHate(finalTarget, usedCard.hateChange);
                if (usedCard.hateTarget === "both") {
                    changeHate(caster, usedCard.hateChange);
                }
                finishCardPlay();
            }

            return;
        }

        if (usedCard.kind === "special") {
            const specialDetails = applySpecialEffect(game, usedCard, caster, finalTarget);

            if (usedCard.hateTarget === "self") {
                changeHate(caster, usedCard.hateChange);
            }

            if (usedCard.hateTarget === "target" && finalTarget) {
                changeHate(finalTarget, usedCard.hateChange);
            }

            finishCardPlay({
                specialText: specialDetails.join(" / "),
                log: `${caster.name} → ${targetLabel}：${usedCard.name}`
            });

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

        player.cardsPlayedThisTurn = (player.cardsPlayedThisTurn || 0) + 1;

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

        moveToNextAliveTurn(game);
        finishGameIfNeeded(roomId);
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

        const maxHand = 4;
        if (player.hand.length >= maxHand) {
            socket.emit("errorMessage", `手札は最大${maxHand}枚です`);
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

    socket.on("battleLeaveRoom", ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(player => player.id === socket.id);
        if (!player) return;

        if (!room.game) {
            socket.emit("errorMessage", "対戦中ではありません");
            return;
        }

        clearReconnectCleanupTimer(room, player.reconnectToken);

        if (player.spectator) {
            room.players = room.players.filter(p => p.id !== socket.id);
            socket.leave(roomId);
            socket.data.roomId = null;
            socket.data.reconnectToken = null;
            emitRoomUpdate(roomId);
            socket.emit("battleLeaveSuccess");
            return;
        }

        const changed = makePlayerOwakonBySocket(roomId, socket.id);

        socket.leave(roomId);
        socket.data.roomId = null;
        socket.data.reconnectToken = null;

        emitRoomUpdate(roomId);
        emitGameUpdate(roomId);

        if (room.game && room.game.gameOver) {
            io.to(roomId).emit("gameOver", room.game.winner);
        }

        if (changed) {
            socket.emit("battleLeaveSuccess");
        }
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

        clearReconnectCleanupTimer(room, player.reconnectToken);
        room.players = room.players.filter(player => player.id !== socket.id);

        socket.leave(roomId);
        emitRoomUpdate(roomId);
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

    socket.on("returnToRoom", roomId => {
        const room = rooms[roomId];
        if (!room) return;
        if (!room.game || !room.game.gameOver) return;

        if (!room.returnedToLobby) room.returnedToLobby = new Set();
        room.returnedToLobby.add(socket.id);

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.spectator) {
            player.ready = false;
        }

        socket.emit("returnToRoom");

        const activePlayers = room.players.filter(p => !p.spectator && !p.disconnected);
        const allReturned = activePlayers.every(p => room.returnedToLobby.has(p.id));
        if (allReturned) {
            room.game = null;
            room.returnedToLobby = null;
        }

        emitRoomUpdate(roomId);
    });

    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const player = room.players.find(player => player.id === socket.id);

            if (!player) continue;

            player.disconnected = true;
            player.disconnectedAt = Date.now();

            if (room.game) {
                const gamePlayer = room.game.turnOrder.find(candidate => candidate.id === socket.id);

                if (gamePlayer) {
                    gamePlayer.disconnected = true;
                    gamePlayer.disconnectedAt = player.disconnectedAt;
                }

                emitRoomUpdate(roomId);
                emitGameUpdate(roomId);
                scheduleReconnectCleanup(roomId, player.reconnectToken);
                continue;
            }

            emitRoomUpdate(roomId);
            scheduleReconnectCleanup(roomId, player.reconnectToken);
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("サーバー起動");
});