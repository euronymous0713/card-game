const socket = io();
window.socket = socket;

let cardMasterMap = {};
fetch("/api/cards").then(r => r.json()).then(cards => {
    cards.forEach(c => { cardMasterMap[c.name] = c; });
}).catch(() => { });

window.onload = () => {
    const titleScreen = document.getElementById("titleScreen");
    const lobbyScreen = document.getElementById("lobbyScreen");
    const draftScreen = document.getElementById("draftScreen");
    const battleScreen = document.getElementById("battleScreen");
    const battleField = document.getElementById("battleField");

    const createRoomButton = document.getElementById("createRoomButton");
    const joinRoomButton = document.getElementById("joinRoomButton");
    const cardListButton = document.getElementById("cardListButton");
    const cardListOverlay = document.getElementById("cardListOverlay");
    const cardListCloseButton = document.getElementById("cardListCloseButton");
    const cardListBody = document.getElementById("cardListBody");
    const cardListControls = document.getElementById("cardListControls");
    const cardListControlToggleButton = document.getElementById("cardListControlToggleButton");
    const cardListSearchInput = document.getElementById("cardListSearchInput");
    const cardListFilterButtons = document.querySelectorAll(".card-list-filter-button");
    const readyButton = document.getElementById("readyButton");
    const leaveRoomButton = document.getElementById("leaveRoomButton");
    const startGameButton = document.getElementById("startGameButton");

    const roomIdText = document.getElementById("roomIdText");
    const playerList = document.getElementById("playerList");
    const nameInput = document.getElementById("nameInput");

    const handArea = document.getElementById("handArea");
    const cardDetail = document.getElementById("cardDetail");
    const dropZone = document.getElementById("dropZone");
    const discardZone = document.getElementById("discardZone");
    const turnPanel = document.getElementById("turnPanel");
    const battleMessage = document.getElementById("battleMessage");
    const playedCardList = document.getElementById("playedCardList");
    const historyPanel = document.querySelector(".history-panel");
    const historyDetailButton = document.getElementById("historyDetailButton");
    const historyModalOverlay = document.getElementById("historyModalOverlay");
    const historyModalBody = document.getElementById("historyModalBody");
    const historyModalCloseButton = document.getElementById("historyModalCloseButton");
    const endTurnButton = document.getElementById("endTurnButton");
    const myFieldCards = document.getElementById("myFieldCards");

    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const gameOverText = document.getElementById("gameOverText");
    const gameOverKime = document.getElementById("gameOverKime");
    const gameOverResults = document.getElementById("gameOverResults");
    const nextButton = document.getElementById("nextButton");

    const turnAnnouncement = document.getElementById("turnAnnouncement");
    const effectLayer = document.getElementById("effectLayer");

    const enemySlots = [
        document.getElementById("enemySlot1"),
        document.getElementById("enemySlot2"),
        document.getElementById("enemySlot3")
    ];

    const myPanel = document.getElementById("myPanel");

    const mobileActionPanel = document.createElement("div");
    mobileActionPanel.id = "mobileActionPanel";
    mobileActionPanel.className = "mobile-action-panel";
    document.body.appendChild(mobileActionPanel);

    const mobileHistoryButton = document.createElement("button");
    mobileHistoryButton.id = "mobileHistoryButton";
    mobileHistoryButton.className = "mobile-history-button";
    mobileHistoryButton.type = "button";
    mobileHistoryButton.innerText = "👁";
    mobileHistoryButton.setAttribute("aria-label", "使用履歴を表示");
    mobileHistoryButton.title = "使用履歴";
    document.body.appendChild(mobileHistoryButton);

    const mobileSettingsButton = document.createElement("button");
    mobileSettingsButton.id = "mobileSettingsButton";
    mobileSettingsButton.className = "mobile-settings-button";
    mobileSettingsButton.type = "button";
    mobileSettingsButton.innerText = "⚙";
    mobileSettingsButton.setAttribute("aria-label", "設定を表示");
    mobileSettingsButton.title = "設定";
    battleField.appendChild(mobileSettingsButton);

    const mobileSettingsOverlay = document.createElement("div");
    mobileSettingsOverlay.id = "mobileSettingsOverlay";
    mobileSettingsOverlay.className = "mobile-settings-overlay";
    document.body.appendChild(mobileSettingsOverlay);

    const mobileEffectOverlay = document.createElement("div");
    mobileEffectOverlay.id = "mobileEffectOverlay";
    mobileEffectOverlay.className = "mobile-effect-overlay";
    document.body.appendChild(mobileEffectOverlay);

    const mobileTrapWaitingNotice = document.createElement("div");
    mobileTrapWaitingNotice.id = "mobileTrapWaitingNotice";
    mobileTrapWaitingNotice.className = "mobile-trap-waiting-notice";
    mobileTrapWaitingNotice.innerText = "罠カード選択待ち";
    document.body.appendChild(mobileTrapWaitingNotice);

    // 使用履歴はPCで謎の「×」が出ないよう、閉じるボタンを生成しません。
    // スマホでは履歴見出しタップ、または履歴背景タップで閉じます。

    let currentRoomId = "";
    let isHost = false;
    let isReady = false;
    let isTaimanMode = false;
    let taimanFighters = [];
    let latestGame = null;
    let previousGame = null;
    let draggedCard = null;
    let selectedTargetId = "";
    let selectedMobileCardInstanceId = "";
    let selectedMobileFieldCardKey = "";
    let selectedMobileStatusKey = "";
    let endTurnRequestPending = false;
    let titleCardList = [];
    let currentCardListRarityFilter = "all";
    let currentCardListKindFilter = "all";
    let currentCardListSearchText = "";
    let cardListVisibleCount = 24;
    let cardListSearchTimer = null;
    let gameOverSoundPlayed = false;

    const RECONNECT_ROOM_KEY = "internetSeikimatsuRoomId";
    const RECONNECT_TOKEN_KEY = "internetSeikimatsuReconnectToken";
    let reconnectAttempted = false;

    function setScreenMode(mode) {
        document.body.classList.toggle("title-active", mode === "title");
        document.body.classList.toggle("lobby-active", mode === "lobby");
        document.body.classList.toggle("draft-active", mode === "draft");
        document.body.classList.toggle("battle-active", mode === "battle");
        if (draftScreen) draftScreen.style.display = mode === "draft" ? "flex" : "none";
    }

    function saveReconnectInfo(roomId, reconnectToken) {
        if (!roomId || !reconnectToken) return;

        // sessionStorageはタブ/ウィンドウごとに独立しているため、
        // 同じブラウザで複数タブを開いて多人数操作するテスト時に
        // 再接続トークンが他タブのものへ書き換わってしまう事故を防げる。
        sessionStorage.setItem(RECONNECT_ROOM_KEY, roomId);
        sessionStorage.setItem(RECONNECT_TOKEN_KEY, reconnectToken);
    }

    function clearReconnectInfo() {
        sessionStorage.removeItem(RECONNECT_ROOM_KEY);
        sessionStorage.removeItem(RECONNECT_TOKEN_KEY);
    }

    function getReconnectInfo() {
        return {
            roomId: sessionStorage.getItem(RECONNECT_ROOM_KEY) || "",
            reconnectToken: sessionStorage.getItem(RECONNECT_TOKEN_KEY) || ""
        };
    }

    function attemptReconnect() {
        if (reconnectAttempted) return;

        const reconnectInfo = getReconnectInfo();

        if (!reconnectInfo.roomId || !reconnectInfo.reconnectToken) return;

        reconnectAttempted = true;
        socket.emit("reconnectPlayer", reconnectInfo);
    }

    function disconnectedLabel(player) {
        return player?.disconnected ? "（再接続待ち）" : "";
    }

    setScreenMode("title");


    const soundManager = window.SoundManager || null;

    if (soundManager && typeof soundManager.init === "function") {
        soundManager.init();
    }

    function playSound(soundName) {
        if (!soundManager || typeof soundManager.play !== "function") return;

        soundManager.play(soundName);
    }

    function unlockSoundOnce() {
        if (!soundManager || typeof soundManager.unlock !== "function") return;

        soundManager.unlock();
    }

    document.addEventListener("pointerdown", unlockSoundOnce, { once: true });
    document.addEventListener("keydown", unlockSoundOnce, { once: true });

    socket.on("connect", () => {
        const connectingScreen = document.getElementById("connectingScreen");
        if (connectingScreen) connectingScreen.style.display = "none";
        titleScreen.style.display = "";
        attemptReconnect();
    });

    // 切断時にフラグを戻し、自動再接続後の "connect" で必ず reconnectPlayer を送れるようにする。
    socket.on("disconnect", () => {
        reconnectAttempted = false;
    });

    if (socket.connected) {
        attemptReconnect();
    }

    socket.on("reconnectInfo", ({ roomId, reconnectToken }) => {
        saveReconnectInfo(roomId, reconnectToken);
    });

    socket.on("reconnectSuccess", data => {
        currentRoomId = data.roomId || currentRoomId;
        isHost = Boolean(data.isHost);
        isReady = Boolean(data.ready);
        endTurnRequestPending = false;
        previousGame = null;
        gameOverSoundPlayed = false;

        roomIdText.innerText = `ルームID : ${currentRoomId}`;
        leaveRoomButton.innerText = isHost ? "ルーム解散" : "退出";
        readyButton.innerText = isReady ? "準備解除" : "準備完了";
        readyButton.classList.toggle("cancel-ready", isReady);
        startGameButton.style.display = isHost ? "block" : "none";

        titleScreen.style.display = "none";

        if (data.phase === "battle") {
            setScreenMode("battle");
            lobbyScreen.style.display = "none";
            battleScreen.style.display = "block";
            gameOverOverlay.style.display = "none";
        } else if (data.phase === "draft") {
            setScreenMode("draft");
            lobbyScreen.style.display = "none";
            battleScreen.style.display = "none";
        } else {
            setScreenMode("lobby");
            lobbyScreen.style.display = "flex";
            battleScreen.style.display = "none";
        }
    });

    socket.on("reconnectFailed", () => {
        clearReconnectInfo();
    });

    function soundNameFromPlayedCardLog(log) {
        if (!log) return "";

        const actionType = log.actionType || "";
        const cardType = log.cardType || "";
        const specialText = log.specialText || "";
        const hateAmount = Number(log.hateAmount || 0);
        const damageAmount = Number(log.damageAmount || 0);
        const healAmount = Number(log.healAmount || 0);

        if (actionType === "setTrap") return "setTrap";
        if (actionType === "trap") return "trap";

        if (actionType === "discard") return "discard";
        if (actionType === "trapEffect") return "";

        if (
            actionType === "statusEffect" ||
            actionType === "extraTurn" ||
            actionType === "special" ||
            cardType === "特殊" ||
            specialText
        ) {
            return "special";
        }

        if (
            actionType === "hate" ||
            cardType === "妨害" ||
            hateAmount !== 0
        ) {
            return "hate";
        }

        if (
            actionType === "heal" ||
            cardType === "防御" ||
            cardType === "補助" ||
            cardType === "防御/補助" ||
            healAmount > 0
        ) {
            return "heal";
        }

        if (
            actionType === "attack" ||
            cardType === "攻撃" ||
            damageAmount > 0
        ) {
            return "attack";
        }

        return "special";
    }

    function playSoundForPlayedCardLog(log) {
        if (!log) return;

        const isMyImmediateActionLog =
            log.playerId === socket.id &&
            log.actionType !== "trap" &&
            log.actionType !== "trapEffect" &&
            log.actionType !== "statusEffect" &&
            log.actionType !== "extraTurn";

        // 自分が直接行った「カード使用 / 罠セット / 捨て札」は、
        // socket.emit の直前で先に鳴らすため、updateGame 後の二重再生を防ぎます。
        if (isMyImmediateActionLog) return;

        const soundName = soundNameFromPlayedCardLog(log);

        if (!soundName) return;

        playSound(soundName);
    }

    function soundNameFromCard(card) {
        if (!card) return "special";

        const kind = card.kind || "";
        const type = card.type || "";

        if (kind === "trap" || type === "罠") return "setTrap";
        if (kind === "hate" || type === "妨害") return "hate";
        if (kind === "special" || type === "特殊") return "special";
        if (kind === "support" || type === "防御" || type === "補助" || type === "防御/補助") return "heal";
        if (kind === "attack" || type === "攻撃") return "attack";

        return "special";
    }


    createTrapChoiceModalStyle();
    createSpectatorStyles();

    function createSpectatorStyles() {
        const style = document.createElement("style");
        style.innerHTML = `
            .spectator-watching-label {
                font-size: 11px;
                color: #00ffe1;
                margin-bottom: 2px;
                opacity: 0.85;
                letter-spacing: 0.5px;
            }
            .revealed-set-card {
                background: rgba(0, 255, 225, 0.12) !important;
                border-color: rgba(0, 255, 225, 0.45) !important;
                color: #00ffe1 !important;
                font-size: 10px !important;
            }
            .spectator-player-card {
                opacity: 0.75;
                border-style: dashed !important;
            }
        `;
        document.head.appendChild(style);
    }

    function createTrapChoiceModalStyle() {
        const style = document.createElement("style");

        style.innerHTML = `
        .trap-choice-overlay {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            background: rgba(0, 0, 0, 0.72);
        }

        .trap-choice-box {
            width: min(520px, 92vw);
            padding: 24px;
            border-radius: 22px;
            background: rgba(0, 0, 0, 0.92);
            border: 2px solid rgba(255, 176, 0, 0.85);
            box-shadow: 0 0 28px rgba(255, 176, 0, 0.45);
            color: white;
            text-align: center;
        }

        .trap-choice-box h2 {
            margin-bottom: 12px;
            color: #ffb000;
            font-size: 24px;
        }

        .trap-source-box {
            margin: 12px 0;
            padding: 12px;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(0, 255, 225, 0.25);
            text-align: left;
        }

        .trap-section-title {
            margin-bottom: 6px;
            font-size: 12px;
            color: #00ffe1;
        }

        .trap-source-card-name {
            margin-bottom: 6px;
            font-size: 20px;
            font-weight: bold;
            color: #ffb000;
        }

        .trap-source-card-name span {
            margin-left: 8px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.65);
        }

        .trap-danger-text {
            margin-top: 6px;
            font-weight: bold;
            color: #ff4d4d !important;
        }

        .trap-choice-message {
            margin: 12px 0;
            font-weight: bold;
            color: #ffb000 !important;
        }

        .trap-choice-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 16px;
        }

        .trap-choice-card {
            padding: 12px;
            border-radius: 14px;
            border: 2px solid rgba(0, 255, 225, 0.35);
            background: rgba(255, 255, 255, 0.06);
            cursor: pointer;
            text-align: left;
        }

        .trap-choice-card:hover {
            border-color: #00ffe1;
            box-shadow: 0 0 14px rgba(0, 255, 225, 0.28);
        }

        .trap-choice-card strong {
            display: block;
            margin-bottom: 5px;
            color: #00ffe1;
            font-size: 17px;
        }

        .trap-choice-card span {
            display: block;
            font-size: 13px;
            line-height: 1.45;
            color: rgba(255, 255, 255, 0.78);
        }

        .trap-choice-card small {
            display: block;
            margin-top: 6px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.52);
        }

        .disabled-trap-choice {
            opacity: 0.35;
            filter: grayscale(1);
            cursor: not-allowed;
            border-color: rgba(255, 255, 255, 0.15) !important;
            box-shadow: none !important;
        }

        .disabled-trap-choice:hover {
            border-color: rgba(255, 255, 255, 0.15) !important;
            box-shadow: none !important;
        }

        .trap-skip-button {
            width: 100%;
            background: linear-gradient(135deg, #555, #222);
        }
    `;

        document.head.appendChild(style);
    }

    function hateIcons(hate) {
        return "◆".repeat(hate) + "◇".repeat(3 - hate);
    }

    function followerText(player) {
        return player.defeated
            ? "オワコン"
            : `${player.followers.toLocaleString()} フォロワー`;
    }

    function statusInfo(type) {
        const infos = {
            slipDamage: {
                label: "炎上",
                icon: "🔥",
                description: "ターン開始時にスリップダメージを受けます。"
            },
            burn: {
                label: "炎上",
                icon: "🔥",
                description: "ターン開始時にスリップダメージを受けます。"
            },
            freeze: {
                label: "凍結",
                icon: "🧊",
                description: "ターン開始時に行動できず、ターンを失います。"
            },
            mute: {
                label: "ミュート",
                icon: "🔇",
                description: "ヘイト上昇を受けません。"
            },
            shadowban: {
                label: "シャドウバン",
                icon: "👻",
                description: "自分の攻撃ダメージが500下がります。"
            },
            expose: {
                label: "晒し中",
                icon: "👁",
                description: "受ける攻撃ダメージが300増えます。"
            },
            digitalDetox: {
                label: "電波障害",
                icon: "📵",
                description: "ターン開始時のドローが1枚になります。"
            },
            kagiaka: {
                label: "鍵垢",
                icon: "🔒",
                description: "攻撃カードの対象に選ばれません。（範囲攻撃は除く）"
            }
        };

        return infos[type] || {
            label: "状態異常",
            icon: "⚠️",
            description: "特殊な状態異常です。"
        };
    }

    function statusEffectTitle(effect) {
        const info = statusInfo(effect.type);
        const amountText = effect.amount ? ` / ${Number(effect.amount).toLocaleString()}ダメージ` : "";
        const turnText = `残り${Number(effect.remainingTurns || 0)}ターン`;

        return `${effect.label || info.label}：${turnText}${amountText}\n${effect.description || info.description}`;
    }

    function statusEffectsHtml(player) {
        const effects = Array.isArray(player?.statusEffects)
            ? player.statusEffects.filter(effect => effect && Number(effect.remainingTurns || 0) > 0)
            : [];

        if (effects.length === 0) {
            return "";
        }

        return `
            <div class="status-effect-row">
                ${effects.map((effect, index) => {
            const info = statusInfo(effect.type);
            const label = effect.label || info.label;
            const description = effect.description || info.description;
            const amount = Number(effect.amount || 0);
            const turns = Number(effect.remainingTurns || 0);

            return `
                        <button
                            type="button"
                            class="status-effect-icon status-${effect.type || "unknown"}"
                            data-status-label="${label}"
                            data-status-description="${description}"
                            data-status-amount="${amount}"
                            data-status-turns="${turns}"
                            title="${statusEffectTitle(effect)}"
                            aria-label="${label}"
                        >
                            ${effect.icon || info.icon}<span>${turns}</span>
                        </button>
                    `;
        }).join("")}
            </div>
        `;
    }

    function bindStatusEffectEvents(container) {
        if (!container) return;

        container.querySelectorAll(".status-effect-icon").forEach(icon => {
            const renderStatusDetail = () => {
                const label = icon.dataset.statusLabel || "状態異常";
                const description = icon.dataset.statusDescription || "";
                const amount = Number(icon.dataset.statusAmount || 0);
                const turns = Number(icon.dataset.statusTurns || 0);

                return { label, description, amount, turns };
            };

            const showPcStatusDetail = () => {
                if (isMobileLayout()) return;

                const { label, description, amount, turns } = renderStatusDetail();

                cardDetail.innerHTML = `
                    <h3>${label}</h3>
                    <p class="detail-type">状態異常</p>
                    <p>${description}</p>
                    ${amount > 0 ? `<p>効果量：${amount.toLocaleString()}</p>` : ""}
                    <p class="detail-hate">残り${turns}ターン</p>
                `;
            };

            const hidePcStatusDetail = () => {
                if (isMobileLayout()) return;
                resetCardDetail();
            };

            icon.onmouseenter = showPcStatusDetail;
            icon.onmouseover = showPcStatusDetail;
            icon.onfocus = showPcStatusDetail;

            icon.onmouseleave = hidePcStatusDetail;
            icon.onmouseout = event => {
                if (icon.contains(event.relatedTarget)) return;
                hidePcStatusDetail();
            };
            icon.onblur = hidePcStatusDetail;

            icon.onmousedown = event => {
                event.stopPropagation();
            };

            icon.onclick = event => {
                event.preventDefault();
                event.stopPropagation();

                if (!isMobileLayout()) {
                    showPcStatusDetail();
                    return;
                }

                const statusKey = makeStatusEffectKey(icon);

                if (selectedMobileStatusKey === statusKey && mobileEffectOverlay.classList.contains("show")) {
                    selectedMobileStatusKey = "";
                    hideMobileEffect();
                    return;
                }

                const { label, description, amount, turns } = renderStatusDetail();

                selectedMobileCardInstanceId = "";
                selectedMobileFieldCardKey = "";
                selectedMobileStatusKey = statusKey;
                document.body.classList.remove("mobile-card-action-open");
                document.body.classList.remove("game-over-active");
                updateMobileActionPanel();
                renderHand();

                showMobileEffect({
                    name: label,
                    rarity: "C",
                    type: "状態異常",
                    effect: `${description}${amount > 0 ? `\n効果量：${amount.toLocaleString()}` : ""}`,
                    hateText: `残り${turns}ターン`
                });
            };
        });
    }

    document.addEventListener("mouseover", event => {
        const icon = event.target.closest?.(".status-effect-icon");
        if (!icon || isMobileLayout()) return;

        const label = icon.dataset.statusLabel || "状態異常";
        const description = icon.dataset.statusDescription || "";
        const amount = Number(icon.dataset.statusAmount || 0);
        const turns = Number(icon.dataset.statusTurns || 0);

        cardDetail.innerHTML = `
            <h3>${label}</h3>
            <p class="detail-type">状態異常</p>
            <p>${description}</p>
            ${amount > 0 ? `<p>効果量：${amount.toLocaleString()}</p>` : ""}
            <p class="detail-hate">残り${turns}ターン</p>
        `;
    });

    document.addEventListener("mouseout", event => {
        const icon = event.target.closest?.(".status-effect-icon");
        if (!icon || isMobileLayout()) return;
        if (icon.contains(event.relatedTarget)) return;

        resetCardDetail();
    });

    document.addEventListener("mouseover", event => {
        const span = event.target.closest?.(".spectator-trap-card");
        if (!span || isMobileLayout()) return;

        const fieldId = span.dataset.fieldId;
        if (!fieldId || !latestGame) return;

        const card = latestGame.turnOrder
            .flatMap(p => p.fieldCards || [])
            .find(c => c.fieldId === fieldId);
        if (!card) return;

        cardDetail.innerHTML = cardDetailHtml(card);
    });

    document.addEventListener("mouseout", event => {
        const span = event.target.closest?.(".spectator-trap-card");
        if (!span || isMobileLayout()) return;
        if (span.contains(event.relatedTarget)) return;

        resetCardDetail();
    });

    document.addEventListener("click", event => {
        const span = event.target.closest?.(".spectator-trap-card");
        if (!span || !isMobileLayout()) return;

        event.preventDefault();
        event.stopPropagation();

        const fieldId = span.dataset.fieldId;
        if (!fieldId || !latestGame) return;

        const card = latestGame.turnOrder
            .flatMap(p => p.fieldCards || [])
            .find(c => c.fieldId === fieldId);
        if (!card) return;

        const fieldKey = `spectator-trap-${fieldId}`;

        if (selectedMobileFieldCardKey === fieldKey && mobileEffectOverlay.classList.contains("show")) {
            selectedMobileFieldCardKey = "";
            hideMobileEffect();
            return;
        }

        selectedMobileCardInstanceId = "";
        selectedMobileStatusKey = "";
        selectedMobileFieldCardKey = fieldKey;
        document.body.classList.remove("mobile-card-action-open");
        updateMobileActionPanel();
        showMobileEffect(card);
    });

    function rarityLabel(rarity) {
        const labels = {
            C: "C / コモン",
            UC: "UC / アンコモン",
            R: "R / レア",
            SR: "SR / スーパーレア",
            UR: "UR / ウルトラレア"
        };

        return labels[rarity] || labels.C;
    }

    function normalizeRarity(rarity) {
        return ["C", "UC", "R", "SR", "UR"].includes(rarity) ? rarity : "C";
    }

    function rarityClass(rarity) {
        return `rarity-${normalizeRarity(rarity).toLowerCase()}`;
    }

    function cardDetailHtml(card) {
        const rarity = normalizeRarity(card.rarity);

        return `
            <h3>${card.name}</h3>
            <p class="detail-rarity ${rarityClass(rarity)}">${rarityLabel(rarity)}</p>
            <p class="detail-type">${card.type}</p>
            <p>${card.effect}</p>
            <p class="detail-hate">${card.hateText || ""}</p>
        `;
    }

    function getMeFromLatestGame() {
        if (!latestGame || !Array.isArray(latestGame.turnOrder)) return null;

        return latestGame.turnOrder.find(player => player.id === socket.id) || null;
    }

    function isSpectatorMode() {
        if (!latestGame) return false;
        return !latestGame.turnOrder.some(player => player.id === socket.id);
    }

    function isDefeatedViewer() {
        if (isSpectatorMode()) return true;
        const me = getMeFromLatestGame();

        return Boolean(me && me.defeated);
    }

    function spectatorEnemyHandHtml(me, enemy) {
        if (!me || !me.defeated) return "";
        if (!enemy || !Array.isArray(enemy.hand)) return "";

        const handCards = [];

        for (let i = 0; i < 4; i++) {
            const card = enemy.hand[i];

            if (!card) {
                handCards.push(`
                    <button class="spectator-hand-card spectator-empty-hand-card" type="button" disabled>
                        空
                    </button>
                `);
                continue;
            }

            handCards.push(`
                <button class="spectator-hand-card ${rarityClass(card.rarity)}" type="button" data-hand-index="${i}">
                    <span class="spectator-card-rarity">${normalizeRarity(card.rarity)}</span>
                    <span class="spectator-card-name">${card.name}</span>
                </button>
            `);
        }

        return `
            <div class="enemy-spectator-hand">
                <div class="enemy-spectator-hand-title">観戦：手札</div>
                <div class="enemy-spectator-hand-list">
                    ${handCards.join("")}
                </div>
            </div>
        `;
    }

    function bindSpectatorHandEvents(container, enemy) {
        if (!container || !enemy || !isDefeatedViewer()) return;

        container.querySelectorAll(".spectator-hand-card[data-hand-index]").forEach(cardButton => {
            const handIndex = Number(cardButton.dataset.handIndex);
            const card = enemy.hand?.[handIndex];

            if (!card) return;

            cardButton.onmouseenter = () => {
                cardDetail.innerHTML = cardDetailHtml(card);
            };

            cardButton.onmouseleave = () => {
                if (!isMobileLayout()) {
                    resetCardDetail();
                }
            };

            cardButton.onclick = event => {
                event.stopPropagation();
                cardDetail.innerHTML = cardDetailHtml(card);
                if (isMobileLayout()) {
                    showMobileEffect(card);
                }
            };
        });
    }


    function cardKindLabel(kind) {
        const labels = {
            attack: "攻撃",
            support: "防御/補助",
            hate: "妨害",
            trap: "罠",
            special: "特殊"
        };

        return labels[kind] || kind || "不明";
    }

    function specialEffectLabel(card) {
        if (!card.effectType && !card.ignoreTrap && !card.trapEffect) return "";

        const labels = {
            destroyTargetTraps: "伏せカード破壊",
            destroyAllEnemyTraps: "全体伏せカード破壊",
            skipTurn: "行動不能",
            slipDamage: "スリップダメージ",
            extraTurn: "追加ターン",
            discardTargetHand: "手札破壊",
            trapPierceDamage: "罠貫通",
            pierceDamage: "罠貫通",
            ignoreTrapDamage: "罠貫通",
            reflectDamage: "ダメージ反射",
            cancelHate: "ヘイト無効",
            cancelTrap: "罠効果無効",
            cancelTrapAndDestroyEnemyTraps: "罠無効＋伏せ破壊",
            damageAndHate: "反撃＋ヘイト"
        };

        if (card.ignoreTrap || card.pierceTrap) return "罠貫通";
        if (card.trapEffect) return labels[card.trapEffect] || card.trapEffect;
        return labels[card.effectType] || card.effectType || "";
    }

    function cardListStatsText() {
        const total = titleCardList.length;
        const counts = titleCardList.reduce((result, card) => {
            const rarity = normalizeRarity(card.rarity);
            result[rarity] = (result[rarity] || 0) + 1;
            return result;
        }, {});

        return `全${total}枚 / C:${counts.C || 0} UC:${counts.UC || 0} R:${counts.R || 0} SR:${counts.SR || 0} UR:${counts.UR || 0}`;
    }

    function normalizeCardKindFilterValue(card) {
        if (!card) return "unknown";
        if (card.kind) return card.kind;

        const type = card.type || "";

        if (type === "攻撃") return "attack";
        if (type === "防御" || type === "補助") return "support";
        if (type === "妨害") return "hate";
        if (type === "罠") return "trap";
        if (type === "特殊") return "special";

        return "unknown";
    }

    function matchesCardListKindFilter(card) {
        if (currentCardListKindFilter === "all") return true;

        if (currentCardListKindFilter === "special") {
            return card.kind === "special";
        }

        return normalizeCardKindFilterValue(card) === currentCardListKindFilter;
    }

    function matchesCardListSearch(card) {
        if (!currentCardListSearchText) return true;

        const searchSource = [
            card.name,
            card.type,
            card.kind,
            card.effect,
            card.hateText,
            specialEffectLabel(card)
        ].join(" ").toLowerCase();

        return searchSource.includes(currentCardListSearchText.toLowerCase());
    }

    function cardListFilterDescription() {
        const rarityText = currentCardListRarityFilter === "all"
            ? "全レアリティ"
            : currentCardListRarityFilter;

        const kindLabels = {
            all: "全種類",
            attack: "攻撃",
            support: "防御/補助",
            hate: "妨害",
            trap: "罠",
            special: "特殊"
        };

        const kindText = kindLabels[currentCardListKindFilter] || "全種類";
        const searchText = currentCardListSearchText
            ? ` / 検索：${currentCardListSearchText}`
            : "";

        return `${rarityText} / ${kindText}${searchText}`;
    }

    function updateCardListControlToggleText() {
        if (!cardListControlToggleButton || !cardListControls) return;

        const isOpen = cardListControls.classList.contains("open-card-list-controls");
        const hasFilter = currentCardListRarityFilter !== "all" ||
            currentCardListKindFilter !== "all" ||
            Boolean(currentCardListSearchText);

        cardListControlToggleButton.innerText = isOpen
            ? "検索・絞り込みを閉じる"
            : hasFilter
                ? `検索・絞り込みを開く（${cardListFilterDescription()}）`
                : "検索・絞り込みを開く";

        cardListControlToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    function setCardListControlsOpen(open) {
        if (!cardListControls) return;

        cardListControls.classList.toggle("open-card-list-controls", open);
        updateCardListControlToggleText();
    }

    function renderTitleCardList() {
        updateCardListControlToggleText();

        if (!cardListBody) return;

        const filteredCards = titleCardList.filter(card => {
            const rarityMatched = currentCardListRarityFilter === "all" ||
                normalizeRarity(card.rarity) === currentCardListRarityFilter;

            return rarityMatched &&
                matchesCardListKindFilter(card) &&
                matchesCardListSearch(card);
        });

        if (titleCardList.length === 0) {
            cardListBody.innerHTML = `
                <div class="card-list-empty">
                    カード情報を読み込み中です。
                </div>
            `;
            return;
        }

        if (filteredCards.length === 0) {
            cardListBody.innerHTML = `
                <div class="card-list-stats">${cardListStatsText()} / ${cardListFilterDescription()}</div>
                <div class="card-list-empty">
                    条件に合うカードがありません。
                </div>
            `;
            return;
        }

        const RARITY_SORT_ORDER = { C: 1, UC: 2, R: 3, SR: 4, UR: 5 };
        const sortedCards = [...filteredCards].sort((a, b) => {
            return (RARITY_SORT_ORDER[normalizeRarity(a.rarity)] || 0) - (RARITY_SORT_ORDER[normalizeRarity(b.rarity)] || 0);
        });

        const visibleCards = sortedCards.slice(0, cardListVisibleCount);
        const hasMoreCards = visibleCards.length < sortedCards.length;

        cardListBody.innerHTML = `
            <div class="card-list-stats">
                ${cardListStatsText()} / 表示:${visibleCards.length}/${sortedCards.length}枚 / ${cardListFilterDescription()}
            </div>
            <div class="card-list-grid">
                ${visibleCards.map(card => {
            const rarity = normalizeRarity(card.rarity);
            const specialLabel = specialEffectLabel(card);

            return `
                        <div class="card-list-item ${rarityClass(rarity)}">
                            <div class="card-list-item-head">
                                <span class="card-list-rarity ${rarityClass(rarity)}">${rarity}</span>
                                <strong>${card.name}</strong>
                            </div>
                            <div class="card-list-meta">
                                ${card.type || cardKindLabel(card.kind)} / ${cardKindLabel(card.kind)}
                                ${specialLabel ? ` / ${specialLabel}` : ""}
                            </div>
                            <p class="card-list-effect">${card.effect || "効果なし"}</p>
                            <div class="card-list-footer">
                                ${card.damage ? `<span>ダメージ：${Number(card.damage).toLocaleString()}</span>` : ""}
                                ${card.heal ? `<span>回復：${Number(card.heal).toLocaleString()}</span>` : ""}
                                ${card.hateText ? `<span>${card.hateText}</span>` : ""}
                            </div>
                        </div>
                    `;
        }).join("")}
            </div>
            ${hasMoreCards ? `
                <button type="button" class="card-list-more-button" id="cardListMoreButton">
                    さらに表示する（残り${sortedCards.length - visibleCards.length}枚）
                </button>
            ` : ""}
        `;

        const cardListMoreButton = document.getElementById("cardListMoreButton");

        if (cardListMoreButton) {
            cardListMoreButton.onclick = () => {
                cardListVisibleCount += 24;
                renderTitleCardList();
            };
        }
    }

    function openTitleCardList() {
        if (!cardListOverlay) return;

        if (isMobileLayout()) {
            setCardListControlsOpen(false);
        } else {
            setCardListControlsOpen(true);
        }

        cardListVisibleCount = 24;
        renderTitleCardList();
        cardListOverlay.style.display = "flex";
        cardListOverlay.setAttribute("aria-hidden", "false");
    }

    function closeTitleCardList() {
        if (!cardListOverlay) return;

        cardListOverlay.style.display = "none";
        cardListOverlay.setAttribute("aria-hidden", "true");
    }

    function resetCardDetail() {
        cardDetail.innerHTML = `
            <h3>カード効果</h3>
            <p>カードにカーソルを合わせると効果が表示されます。</p>
        `;
    }

    function cloneGame(game) {
        return game ? JSON.parse(JSON.stringify(game)) : null;
    }

    function getPlayerFromGame(game, playerId) {
        if (!game) return null;
        return game.turnOrder.find(player => player.id === playerId);
    }

    function getPlayerElement(playerId) {
        const me = latestGame?.turnOrder.find(player => player.id === socket.id);

        if (me && me.id === playerId) {
            return myPanel;
        }

        const enemies = latestGame?.turnOrder.filter(player => player.id !== socket.id) || [];
        const index = enemies.findIndex(player => player.id === playerId);

        if (index >= 0) {
            return enemySlots[index];
        }

        return battleField;
    }

    function showOverwriteTrapModal(data) {
        const oldOverlay = document.getElementById("overwriteTrapOverlay");
        if (oldOverlay) oldOverlay.remove();

        const overlay = document.createElement("div");
        overlay.id = "overwriteTrapOverlay";
        overlay.className = "trap-choice-overlay";

        overlay.innerHTML = `
        <div class="trap-choice-box light-trap-choice-box">
            <h2>伏せカードを上書き</h2>
            <p class="trap-choice-message">
                <strong>${data.newCard.name}</strong> をセットします。<br>
                上書きする伏せカードを選んでください（選ばれたカードは失われます）。
            </p>
            <div class="trap-new-card-preview">
                <div class="trap-section-title">セットするカード</div>
                <div class="trap-source-card-name">
                    ${data.newCard.name}
                    ${data.newCard.type ? `<span>${data.newCard.type}</span>` : ""}
                </div>
                <div class="trap-source-rarity ${rarityClass(data.newCard.rarity)}">${rarityLabel(data.newCard.rarity)}</div>
                <p>${data.newCard.effect || ""}</p>
                <small>発動条件：${data.newCard.conditionText}</small>
            </div>
            <div class="trap-choice-list compact-trap-choice-list">
                ${data.currentTraps.map(trap => `
                    <div
                        class="trap-choice-card compact-trap-card"
                        data-field-id="${trap.fieldId}"
                    >
                        <strong>${trap.name}</strong>
                        <em class="trap-choice-rarity ${rarityClass(trap.rarity)}">${rarityLabel(normalizeRarity(trap.rarity))}</em>
                        <span>${trap.effect}</span>
                        <small>発動条件：${trap.conditionText}</small>
                    </div>
                `).join("")}
            </div>
        </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelectorAll(".trap-choice-card").forEach(cardElement => {
            cardElement.onclick = () => {
                const fieldId = cardElement.dataset.fieldId;
                socket.emit("chooseOverwriteTrapResponse", {
                    choiceId: data.choiceId,
                    fieldId
                });
                overlay.remove();
            };
        });
    }

    function showTrapChoiceModal(data) {
        const oldOverlay = document.getElementById("trapChoiceOverlay");

        if (oldOverlay) {
            oldOverlay.remove();
        }

        const overlay = document.createElement("div");

        overlay.id = "trapChoiceOverlay";
        overlay.className = "trap-choice-overlay";

        const sourceCardName = data.context?.cardName || "不明なカード";
        const sourceCardType = data.context?.cardType || "";
        const sourceEffectText = data.context?.effect || "";
        const sourceResultText = data.context?.resultText || "";
        const sourceCardRarity = normalizeRarity(data.context?.cardRarity);
        const sourceActionText =
            data.context?.sourceActionText ||
            `${data.sourcePlayerName} のカードに反応できます。`;

        overlay.innerHTML = `
        <div class="trap-choice-box light-trap-choice-box">
            <h2>罠カード発動確認</h2>

            <div class="trap-source-box compact-source-box">
                <div class="trap-section-title">反応元カード</div>
                <div class="trap-source-card-name">
                    ${sourceCardName}
                    ${sourceCardType ? `<span>${sourceCardType}</span>` : ""}
                </div>
                <div class="trap-source-rarity ${rarityClass(sourceCardRarity)}">${rarityLabel(sourceCardRarity)}</div>
                <p>${sourceActionText}</p>
                ${sourceEffectText ? `<p class="trap-source-effect">${sourceEffectText}</p>` : ""}
                ${sourceResultText ? `<p class="trap-danger-text">${sourceResultText}</p>` : ""}
            </div>

            <p class="trap-choice-message">
                ${data.conditionText} に反応できる罠カードを選択してください。
            </p>

            <div class="trap-choice-list compact-trap-choice-list">
                ${data.traps.map(trap => `
                    <div
                        class="trap-choice-card compact-trap-card ${trap.canActivate ? "" : "disabled-trap-choice"}"
                        data-field-id="${trap.fieldId}"
                        data-can-activate="${trap.canActivate}"
                    >
                        <strong>${trap.name}</strong>
                        <em class="trap-choice-rarity ${rarityClass(trap.rarity)}">${rarityLabel(normalizeRarity(trap.rarity))}</em>
                        <span>${trap.canActivate ? trap.effect : trap.disabledReason}</span>
                        <small>発動条件：${trap.conditionText}</small>
                    </div>
                `).join("")}
            </div>

            <button class="trap-skip-button" id="trapSkipButton">
                発動しない
            </button>
        </div>
    `;

        document.body.appendChild(overlay);

        overlay.querySelectorAll(".trap-choice-card").forEach(cardElement => {
            cardElement.onclick = () => {
                const canActivate = cardElement.dataset.canActivate === "true";

                if (!canActivate) return;

                const fieldId = cardElement.dataset.fieldId;

                socket.emit("chooseTrapResponse", {
                    choiceId: data.choiceId,
                    fieldId
                });

                overlay.remove();
            };
        });

        document.getElementById("trapSkipButton").onclick = () => {
            socket.emit("chooseTrapResponse", {
                choiceId: data.choiceId,
                fieldId: null
            });

            overlay.remove();
        };
    }

    function showTurnAnnouncement(playerName, isMyTurn) {
        turnAnnouncement.innerHTML = `
            <div class="turn-announcement-text">
                ${isMyTurn ? "あなたのターン" : `${playerName} のターン`}
            </div>
        `;

        turnAnnouncement.classList.remove("show-turn-announcement");
        void turnAnnouncement.offsetWidth;
        turnAnnouncement.classList.add("show-turn-announcement");

        setTimeout(() => {
            turnAnnouncement.classList.remove("show-turn-announcement");
        }, 1500);
    }

    function showFloatingText(targetElement, text, className) {
        const targetRect = targetElement.getBoundingClientRect();
        const fieldRect = battleField.getBoundingClientRect();

        const popup = document.createElement("div");

        popup.className = `floating-effect ${className}`;
        popup.innerText = text;

        popup.style.left = `${targetRect.left - fieldRect.left + targetRect.width / 2}px`;
        popup.style.top = `${targetRect.top - fieldRect.top + targetRect.height / 2}px`;

        effectLayer.appendChild(popup);

        setTimeout(() => {
            popup.remove();
        }, 1200);
    }

    function showCardUseAnimation(text) {
        const effect = document.createElement("div");

        effect.className = "card-use-effect";
        effect.innerText = text;

        effectLayer.appendChild(effect);

        setTimeout(() => {
            effect.remove();
        }, 900);
    }

    function showDiscardAnimation(cardName) {
        const effect = document.createElement("div");

        effect.className = "discard-effect";
        effect.innerText = `捨て札：${cardName}`;

        effectLayer.appendChild(effect);

        setTimeout(() => {
            effect.remove();
        }, 900);
    }

    function showDrawAnimation(count) {
        if (count <= 0) return;

        const effect = document.createElement("div");

        effect.className = "draw-effect";
        effect.innerText = `+${count} Card`;

        effectLayer.appendChild(effect);

        setTimeout(() => {
            effect.remove();
        }, 1000);
    }

    function runAnimations(oldGame, newGame) {
        if (!newGame) return;

        const currentPlayer = newGame.turnOrder[newGame.currentTurnIndex];

        if (!oldGame && currentPlayer) {
            showTurnAnnouncement(currentPlayer.name, currentPlayer.id === socket.id);
            playSound("turnStart");
        }

        if (!oldGame) return;

        const oldTurnPlayer = oldGame.turnOrder[oldGame.currentTurnIndex];
        const newTurnPlayer = newGame.turnOrder[newGame.currentTurnIndex];

        if (oldTurnPlayer && newTurnPlayer && oldTurnPlayer.id !== newTurnPlayer.id) {
            showTurnAnnouncement(newTurnPlayer.name, newTurnPlayer.id === socket.id);
            playSound("turnStart");
        }

        newGame.turnOrder.forEach(newPlayer => {
            const oldPlayer = getPlayerFromGame(oldGame, newPlayer.id);

            if (!oldPlayer) return;

            if (newPlayer.defeated && !oldPlayer.defeated) {
                playSound("defeated");
            }

            if (newPlayer.followers < oldPlayer.followers) {
                const damage = oldPlayer.followers - newPlayer.followers;
                const targetElement = getPlayerElement(newPlayer.id);

                if (!targetElement) return;

                targetElement.classList.remove("damage-shake");
                void targetElement.offsetWidth;
                targetElement.classList.add("damage-shake");

                showFloatingText(targetElement, `-${damage.toLocaleString()}`, "damage-popup");

                setTimeout(() => {
                    targetElement.classList.remove("damage-shake");
                }, 500);
            }
        });

        const oldMe = getPlayerFromGame(oldGame, socket.id);
        const newMe = getPlayerFromGame(newGame, socket.id);

        if (oldMe && newMe && newMe.hand.length > oldMe.hand.length) {
            const currentTurnPlayer = newGame.turnOrder[newGame.currentTurnIndex];

            if (currentTurnPlayer && currentTurnPlayer.id === socket.id) {
                showDrawAnimation(newMe.hand.length - oldMe.hand.length);
            }
        }

        if (newGame.playedCards.length > oldGame.playedCards.length) {
            const latestLog = newGame.playedCards[newGame.playedCards.length - 1];

            if (!latestLog) return;

            const isMyAction = latestLog.playerId === socket.id;

            playSoundForPlayedCardLog(latestLog);

            if (latestLog.actionType === "discard") {
                if (isMyAction) {
                    showDiscardAnimation(latestLog.cardName || "カード");
                }

                return;
            }

            if (latestLog.actionType === "trap") {
                if (isMyAction) {
                    showCardUseAnimation(`${latestLog.cardName} を発動`);
                } else {
                    showCardUseAnimation(`${latestLog.playerName} の罠が発動`);
                }

                return;
            }

            showCardUseAnimation(`${latestLog.playerName}：${latestLog.cardName}`);
        }
    }

    function isMobileLayout() {
        return window.matchMedia("(max-width: 768px)").matches;
    }

    function getMe() {
        if (!latestGame) return null;
        return latestGame.turnOrder.find(player => player.id === socket.id);
    }

    function isMyTurnNow() {
        if (!latestGame || latestGame.gameOver) return false;

        const currentPlayer = latestGame.turnOrder[latestGame.currentTurnIndex];

        return currentPlayer && currentPlayer.id === socket.id;
    }

    function getSelectedMobileCard() {
        const me = getMe();

        if (!me || !selectedMobileCardInstanceId) return null;

        return me.hand.find(card => card.instanceId === selectedMobileCardInstanceId) || null;
    }

    function showMobileEffect(card) {
        if (!isMobileLayout() || !mobileEffectOverlay || !card) return;

        const rarity = normalizeRarity(card.rarity);

        mobileEffectOverlay.innerHTML = `
            <div class="mobile-effect-card">
                <div class="mobile-effect-title-row">
                    <span class="mobile-effect-rarity ${rarityClass(rarity)}">${rarity}</span>
                    <strong>${card.name}</strong>
                </div>
                <div class="mobile-effect-type">${card.type || "カード"}</div>
                <p>${card.effect || "効果なし"}</p>
                ${card.hateText ? `<div class="mobile-effect-hate">${card.hateText}</div>` : ""}
            </div>
        `;

        mobileEffectOverlay.classList.add("show");

    }

    function hideMobileEffect() {
        if (!mobileEffectOverlay) return;

        mobileEffectOverlay.classList.remove("show");
        mobileEffectOverlay.innerHTML = "";
    }

    function makeStatusEffectKey(icon) {
        return [
            icon.dataset.statusLabel || "",
            icon.dataset.statusDescription || "",
            icon.dataset.statusAmount || "0",
            icon.dataset.statusTurns || "0"
        ].join("|");
    }

    function showTrapWaitingNotice(message = "罠カード選択待ち") {
        if (!mobileTrapWaitingNotice) return;

        mobileTrapWaitingNotice.innerText = message;
        mobileTrapWaitingNotice.classList.add("show");
    }

    function hideTrapWaitingNotice() {
        if (!mobileTrapWaitingNotice) return;

        mobileTrapWaitingNotice.classList.remove("show");
    }

    function updateTrapWaitingNotice() {
        if (!latestGame || latestGame.gameOver) {
            hideTrapWaitingNotice();
            return;
        }

        if (latestGame.waitingTrapChoice) {
            const waitingName = latestGame.waitingTrapPlayerName || "他プレイヤー";
            const isMeWaiting = latestGame.waitingTrapPlayerId === socket.id;

            if (isMeWaiting) {
                hideTrapWaitingNotice();
                return;
            }

            showTrapWaitingNotice(`${waitingName} が罠を選択中`);
        } else {
            hideTrapWaitingNotice();
        }
    }

    mobileEffectOverlay.onclick = event => {
        if (event.target === mobileEffectOverlay) {
            clearMobileCardSelection();
        }
    };

    function clearMobileCardSelection() {
        selectedMobileCardInstanceId = "";
        selectedMobileFieldCardKey = "";
        selectedMobileStatusKey = "";
        hideMobileEffect();
        document.body.classList.remove("mobile-card-action-open");
        updateMobileActionPanel();
        renderHand();
    }

    function selectMobileCard(card) {
        if (!isMobileLayout()) return;

        if (selectedMobileCardInstanceId === card.instanceId) {
            clearMobileCardSelection();
            return;
        }

        selectedMobileFieldCardKey = "";
        selectedMobileStatusKey = "";
        selectedMobileCardInstanceId = card.instanceId;
        showMobileEffect(card);
        renderHand();
        updateMobileActionPanel();
    }

    function toggleMobileFieldCardEffect(card, fieldKey) {
        if (!isMobileLayout() || !card) return;

        if (selectedMobileFieldCardKey === fieldKey && mobileEffectOverlay.classList.contains("show")) {
            selectedMobileFieldCardKey = "";
            hideMobileEffect();
            return;
        }

        selectedMobileCardInstanceId = "";
        selectedMobileStatusKey = "";
        selectedMobileFieldCardKey = fieldKey;
        document.body.classList.remove("mobile-card-action-open");
        updateMobileActionPanel();
        showMobileEffect(card);
        renderHand();
    }

    function closeMobileHistory() {
        if (!historyPanel) return;

        historyPanel.classList.remove("show-mobile-history");
    }

    function toggleMobileHistory() {
        if (!isMobileLayout() || !historyPanel) return;

        const willOpen = !historyPanel.classList.contains("show-mobile-history");

        if (willOpen) {
            clearMobileCardSelection();
        }

        historyPanel.classList.toggle("show-mobile-history");
    }

    function closeMobileSettings() {
        if (!mobileSettingsOverlay) return;

        mobileSettingsOverlay.classList.remove("show-mobile-settings");
        mobileSettingsOverlay.innerHTML = "";
    }

    function openMobileSettings() {
        if (!mobileSettingsOverlay) return;

        clearMobileCardSelection();
        closeMobileHistory();

        const spectators = (latestGame && Array.isArray(latestGame.spectators))
            ? latestGame.spectators
            : [];

        const spectatorHtml = spectators.length === 0
            ? `<div class="settings-spectator-empty">観戦者はいません</div>`
            : spectators.map(s => `<div class="settings-spectator-item">👁 ${s.name}</div>`).join("");

        const turnOrderHtml = (() => {
            if (!latestGame) return "";
            const { turnOrder, currentTurnIndex } = latestGame;
            const items = turnOrder.map((player, index) => {
                const isCurrent = index === currentTurnIndex && !player.defeated;
                const isMe = player.id === socket.id;
                const name = isMe ? `${player.name}（あなた）` : player.name;
                const badge = player.defeated ? "オワコン" : (isCurrent ? "行動中" : "待機中");
                const cls = "turn-order-item" +
                    (isCurrent ? " turn-order-current" : "") +
                    (player.defeated ? " turn-order-defeated" : "");
                return `<li class="${cls}"><span class="turn-order-name">${name}</span><span class="turn-order-badge">${badge}</span></li>`;
            }).join("");
            return `
                <div class="settings-spectators-section">
                    <div class="settings-spectators-label">ターン順</div>
                    <ol class="turn-order-list">${items}</ol>
                </div>`;
        })();

        mobileSettingsOverlay.innerHTML = `
            <div class="mobile-settings-box">
                <div class="mobile-settings-header">
                    <strong>設定</strong>
                    <button id="mobileSettingsCloseButton" type="button" aria-label="設定を閉じる">×</button>
                </div>
                <div class="mobile-settings-room-id">
                    <span>ルームID</span>
                    <strong>${currentRoomId || "----"}</strong>
                </div>
                ${turnOrderHtml}
                <div class="settings-spectators-section">
                    <div class="settings-spectators-label">観戦者 (${spectators.length})</div>
                    ${spectatorHtml}
                </div>
                <div class="settings-actions-divider" role="separator"></div>
                <button id="mobileCardListButton" class="mobile-card-list-button" type="button">
                    カード一覧
                </button>
                <button id="mobileBugReportButton" class="mobile-bug-report-button" type="button">
                    バグ報告
                </button>
                <button id="mobileBattleLeaveButton" class="mobile-battle-leave-button" type="button">
                    退出してオワコンになる
                </button>
            </div>
        `;

        mobileSettingsOverlay.classList.add("show-mobile-settings");

        const closeButton = document.getElementById("mobileSettingsCloseButton");
        const cardListBtn = document.getElementById("mobileCardListButton");
        const leaveButton = document.getElementById("mobileBattleLeaveButton");

        if (closeButton) {
            closeButton.onclick = () => {
                closeMobileSettings();
            };
        }

        if (cardListBtn) {
            cardListBtn.onclick = () => {
                closeMobileSettings();
                openTitleCardList();
            };
        }

        const bugReportBtn = document.getElementById("mobileBugReportButton");
        if (bugReportBtn) {
            bugReportBtn.onclick = () => {
                closeMobileSettings();
                openBugReport();
            };
        }

        if (leaveButton) {
            leaveButton.onclick = () => {
                if (!currentRoomId) return;

                const ok = confirm("対戦から退出します。あなたはオワコンになります。よろしいですか？");

                if (!ok) return;

                socket.emit("battleLeaveRoom", {
                    roomId: currentRoomId
                });

                closeMobileSettings();
                resetToTitle();
            };
        }
    }

    function toggleMobileSettings() {
        if (!mobileSettingsOverlay) return;

        if (mobileSettingsOverlay.classList.contains("show-mobile-settings")) {
            closeMobileSettings();
        } else {
            openMobileSettings();
        }
    }

    mobileHistoryButton.onclick = () => {
        toggleMobileHistory();
    };

    mobileSettingsButton.onclick = () => {
        toggleMobileSettings();
    };

    if (mobileSettingsOverlay) {
        mobileSettingsOverlay.onclick = event => {
            if (event.target === mobileSettingsOverlay) {
                closeMobileSettings();
            }
        };
    }

    if (historyPanel) {
        historyPanel.onclick = event => {
            if (!isMobileLayout()) return;

            if (event.target === historyPanel) {
                closeMobileHistory();
            }
        };

        const historyTitle = historyPanel.querySelector("h3");

        if (historyTitle) {
            historyTitle.onclick = event => {
                if (!isMobileLayout()) return;

                event.stopPropagation();
                closeMobileHistory();
            };
        }
    }

    function openHistoryModal() {
        if (!historyModalOverlay || !historyModalBody) return;

        historyModalBody.innerHTML = "";

        if (!latestGame || !latestGame.playedCards || latestGame.playedCards.length === 0) {
            historyModalBody.innerHTML = `<div class="history-modal-empty">まだ使用されたカードはありません。</div>`;
        } else {
            [...latestGame.playedCards].reverse().forEach(card => {
                const logText = card.log || `${card.playerName} → ${card.targetName}`;
                historyModalBody.innerHTML += `
                    <div class="played-card">
                        <strong>${logWithCardLink(logText, card.cardName)}</strong><br>
                        ${card.hateText || ""}
                        ${playedCardExtraText(card)}
                    </div>
                `;
            });
        }

        historyModalOverlay.style.display = "flex";
    }

    function closeHistoryModal() {
        if (!historyModalOverlay) return;
        historyModalOverlay.style.display = "none";
    }

    if (historyDetailButton) {
        historyDetailButton.onclick = event => {
            event.stopPropagation();
            openHistoryModal();
        };
    }

    if (historyModalCloseButton) {
        historyModalCloseButton.onclick = () => closeHistoryModal();
    }

    if (historyModalOverlay) {
        historyModalOverlay.onclick = event => {
            if (event.target === historyModalOverlay) closeHistoryModal();
        };
    }

    function handleHistoryCardLinkClick(e) {
        const btn = e.target.closest(".history-card-link");
        if (!btn) return;
        const card = cardMasterMap[btn.dataset.cardName];
        if (!card) return;
        cardDetail.innerHTML = cardDetailHtml(card);
    }

    if (playedCardList) playedCardList.addEventListener("click", handleHistoryCardLinkClick);
    if (historyModalBody) historyModalBody.addEventListener("click", handleHistoryCardLinkClick);

    function updateMobileActionPanel() {
        if (!mobileActionPanel) return;

        const card = getSelectedMobileCard();

        if (!isMobileLayout() || !card) {
            mobileActionPanel.classList.remove("show");
            document.body.classList.remove("mobile-card-action-open");
            mobileActionPanel.innerHTML = "";
            return;
        }

        const isMyTurn = isMyTurnNow();
        const needsEnemyTarget = card.targetType === "enemy";
        const selectedEnemy = latestGame?.turnOrder.find(player => player.id === selectedTargetId);

        mobileActionPanel.innerHTML = `
            <div class="mobile-selected-card-name">
                ${card.name}
                ${needsEnemyTarget && selectedEnemy ? ` / 対象：${selectedEnemy.name}` : ""}
                ${needsEnemyTarget && !selectedEnemy ? " / 対象を選択してください" : ""}
            </div>
            <div class="mobile-action-buttons">
                <button id="mobileUseCardButton" ${isMyTurn ? "" : "disabled"}>
                    使う
                </button>
                <button id="mobileDiscardCardButton" ${isMyTurn ? "" : "disabled"}>
                    捨てる
                </button>
            </div>
        `;

        mobileActionPanel.classList.add("show");
        document.body.classList.add("mobile-card-action-open");

        document.getElementById("mobileUseCardButton").onclick = () => {
            playSelectedMobileCard();
        };

        document.getElementById("mobileDiscardCardButton").onclick = () => {
            discardSelectedMobileCard();
        };

    }

    function playSelectedMobileCard() {
        if (!latestGame || latestGame.gameOver) return;

        if (!isMyTurnNow()) {
            alert("今はあなたのターンではありません");
            return;
        }

        const card = getSelectedMobileCard();

        if (!card) return;

        let targetId = selectedTargetId;

        if (card.targetType === "self") {
            targetId = socket.id;
        }

        if (card.targetType === "enemy" && !targetId) {
            alert("対象プレイヤーを選択してください");
            return;
        }

        playSound(soundNameFromCard(card));

        socket.emit("playCard", {
            roomId: currentRoomId,
            cardInstanceId: card.instanceId,
            targetId
        });

        selectedMobileCardInstanceId = "";
        selectedMobileFieldCardKey = "";
        selectedMobileStatusKey = "";
        hideMobileEffect();
        updateMobileActionPanel();
    }

    function discardSelectedMobileCard() {
        if (!latestGame || latestGame.gameOver) return;

        if (!isMyTurnNow()) {
            alert("今はあなたのターンではありません");
            return;
        }

        const card = getSelectedMobileCard();

        if (!card) return;

        playSound("discard");

        socket.emit("discardCard", {
            roomId: currentRoomId,
            cardInstanceId: card.instanceId
        });

        selectedMobileCardInstanceId = "";
        selectedMobileFieldCardKey = "";
        selectedMobileStatusKey = "";
        hideMobileEffect();
        updateMobileActionPanel();
    }


    socket.on("cardList", cards => {
        titleCardList = Array.isArray(cards) ? cards : [];
        renderTitleCardList();
    });

    if (cardListButton) {
        cardListButton.onclick = () => {
            openTitleCardList();
        };
    }

    if (cardListCloseButton) {
        cardListCloseButton.onclick = () => {
            closeTitleCardList();
        };
    }

    if (cardListOverlay) {
        cardListOverlay.onclick = event => {
            if (event.target === cardListOverlay) {
                closeTitleCardList();
            }
        };
    }

    if (cardListControlToggleButton) {
        cardListControlToggleButton.onclick = () => {
            const isOpen = cardListControls?.classList.contains("open-card-list-controls");
            setCardListControlsOpen(!isOpen);
        };
    }

    cardListFilterButtons.forEach(button => {
        button.onclick = () => {
            const group = button.dataset.filterGroup || "rarity";
            const filter = button.dataset.filter || "all";

            if (group === "kind") {
                currentCardListKindFilter = filter;
            } else {
                currentCardListRarityFilter = filter;
            }

            cardListFilterButtons.forEach(filterButton => {
                const sameGroup = (filterButton.dataset.filterGroup || "rarity") === group;

                if (sameGroup) {
                    filterButton.classList.toggle("active-card-list-filter", filterButton === button);
                }
            });

            cardListVisibleCount = 24;
            renderTitleCardList();
        };
    });

    if (cardListSearchInput) {
        cardListSearchInput.oninput = () => {
            currentCardListSearchText = cardListSearchInput.value.trim();
            cardListVisibleCount = 24;

            clearTimeout(cardListSearchTimer);
            cardListSearchTimer = setTimeout(() => {
                renderTitleCardList();
            }, 120);
        };
    }

    const savedName = localStorage.getItem("playerName");

    if (savedName) {
        nameInput.value = savedName;
    }

    // ---- バグ報告モーダル ----
    const bugReportOverlay = document.getElementById("bugReportOverlay");
    const bugReportCloseBtn = document.getElementById("bugReportCloseButton");
    const bugReportSummary = document.getElementById("bugReportSummary");
    const bugReportDetail = document.getElementById("bugReportDetail");
    const bugReportStatus = document.getElementById("bugReportStatus");
    const bugReportSubmitBtn = document.getElementById("bugReportSubmitButton");
    const bugReportTitleBtn = document.getElementById("bugReportTitleButton");

    function openBugReport() {
        bugReportSummary.value = "";
        bugReportDetail.value = "";
        bugReportStatus.textContent = "";
        bugReportStatus.className = "bug-report-status";
        bugReportOverlay.style.display = "flex";
        bugReportSummary.focus();
    }

    function closeBugReport() {
        bugReportOverlay.style.display = "none";
    }

    async function submitBugReport() {
        const summary = bugReportSummary.value.trim();
        if (!summary) {
            bugReportStatus.textContent = "件名を入力してください";
            bugReportStatus.className = "bug-report-status error";
            return;
        }
        bugReportSubmitBtn.disabled = true;
        bugReportStatus.textContent = "送信中…";
        bugReportStatus.className = "bug-report-status";
        try {
            const res = await fetch("/api/bug-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: localStorage.getItem("playerName") || "不明",
                    summary,
                    detail: bugReportDetail.value.trim(),
                    roomId: currentRoomId || ""
                })
            });
            if (res.ok) {
                bugReportStatus.textContent = "送信しました！ありがとうございます";
                bugReportStatus.className = "bug-report-status success";
                setTimeout(closeBugReport, 1800);
            } else {
                throw new Error("server error");
            }
        } catch (_) {
            bugReportStatus.textContent = "送信に失敗しました。もう一度お試しください";
            bugReportStatus.className = "bug-report-status error";
        } finally {
            bugReportSubmitBtn.disabled = false;
        }
    }

    if (bugReportTitleBtn) bugReportTitleBtn.onclick = openBugReport;
    const bugReportCardListBtn = document.getElementById("bugReportCardListButton");
    if (bugReportCardListBtn) bugReportCardListBtn.onclick = openBugReport;
    if (bugReportCloseBtn) bugReportCloseBtn.onclick = closeBugReport;
    if (bugReportSubmitBtn) bugReportSubmitBtn.onclick = submitBugReport;
    if (bugReportOverlay) {
        bugReportOverlay.addEventListener("click", (e) => {
            if (e.target === bugReportOverlay) closeBugReport();
        });
    }

    createRoomButton.onclick = () => {
        const playerName = nameInput.value.trim();

        if (!playerName) {
            alert("名前を入力してください");
            return;
        }

        clearReconnectInfo();
        localStorage.setItem("playerName", playerName);
        socket.emit("createRoom", playerName);
    };

    joinRoomButton.onclick = () => {
        const playerName = nameInput.value.trim();

        if (!playerName) {
            alert("名前を入力してください");
            return;
        }

        const roomId = prompt("ルームIDを入力してください");

        if (!roomId) return;

        clearReconnectInfo();
        localStorage.setItem("playerName", playerName);

        socket.emit("joinRoom", {
            roomId,
            playerName
        });
    };

    socket.on("roomCreated", roomId => {
        currentRoomId = roomId;
        isHost = true;
        isReady = false;

        setScreenMode("lobby");
        setScreenMode("lobby");
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "flex";
        battleScreen.style.display = "none";

        roomIdText.innerText = `ルームID : ${roomId}`;

        leaveRoomButton.innerText = "ルーム解散";
        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");

        startGameButton.style.display = "block";
        startGameButton.disabled = true;
    });

    socket.on("joinSuccess", roomId => {
        currentRoomId = roomId;
        isHost = false;
        isReady = false;

        setScreenMode("lobby");
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "flex";
        battleScreen.style.display = "none";

        roomIdText.innerText = `ルームID : ${roomId}`;

        leaveRoomButton.innerText = "退出";
        readyButton.style.display = "";
        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");

        startGameButton.style.display = "none";
    });

    socket.on("spectatorJoinSuccess", ({ roomId, phase }) => {
        currentRoomId = roomId;
        isHost = false;
        isReady = true;
        endTurnRequestPending = false;
        previousGame = null;
        gameOverSoundPlayed = false;

        roomIdText.innerText = `ルームID : ${roomId}`;
        leaveRoomButton.innerText = "退出";
        readyButton.style.display = "none";
        startGameButton.style.display = "none";

        titleScreen.style.display = "none";

        if (phase === "battle") {
            setScreenMode("battle");
            lobbyScreen.style.display = "none";
            battleScreen.style.display = "block";
            gameOverOverlay.style.display = "none";
        } else if (phase === "draft") {
            setScreenMode("draft");
            lobbyScreen.style.display = "none";
            battleScreen.style.display = "none";
        } else {
            setScreenMode("lobby");
            lobbyScreen.style.display = "flex";
            battleScreen.style.display = "none";
        }
    });

    const RULE_DESCS = {
        normal: "インターネット世紀末の通常ルールです。",
        grudge: "プレイヤーを脱落させるとそのヘイト値が自分のヘイトに加算されます。ゲーム終了時のヘイトは次の試合の開始ヘイトに引き継がれます。",
        taiman: "1対1専用。ドラフトで20枚のデッキを組み戦います。"
    };

    const ruleSelector = document.getElementById("ruleSelector");
    const ruleDisplay = document.getElementById("ruleDisplay");
    const ruleDisplayLabel = document.getElementById("ruleDisplayLabel");
    const ruleSelectorDesc = document.getElementById("ruleSelectorDesc");
    const ruleClassicBtn = document.getElementById("ruleClassicBtn");
    const grudgeRuleBtn = document.getElementById("grudgeRuleBtn");
    const taimanModeBtn = document.getElementById("taimanModeBtn");
    const taimanFighterList = document.getElementById("taimanFighterList");
    const fighterSelectOpenBtn = document.getElementById("fighterSelectOpenBtn");
    const fighterModalOverlay = document.getElementById("fighterModalOverlay");
    const fighterModalCloseBtn = document.getElementById("fighterModalCloseBtn");

    const hostRuleDescToggleBtn = document.getElementById("hostRuleDescToggleBtn");
    const guestRuleDescToggleBtn = document.getElementById("guestRuleDescToggleBtn");
    const ruleDescModalOverlay = document.getElementById("ruleDescModalOverlay");
    const ruleDescModalTitle = document.getElementById("ruleDescModalTitle");
    const ruleDescModalBody = document.getElementById("ruleDescModalBody");
    const ruleDescModalCloseBtn = document.getElementById("ruleDescModalCloseBtn");

    let currentRuleLabel = "";
    let currentRuleDesc = "";

    function openRuleDescModal() {
        if (!ruleDescModalOverlay) return;
        if (ruleDescModalTitle) ruleDescModalTitle.textContent = currentRuleLabel;
        if (ruleDescModalBody) ruleDescModalBody.textContent = currentRuleDesc;
        ruleDescModalOverlay.style.display = "flex";
    }

    if (hostRuleDescToggleBtn) hostRuleDescToggleBtn.addEventListener("click", openRuleDescModal);
    if (guestRuleDescToggleBtn) guestRuleDescToggleBtn.addEventListener("click", openRuleDescModal);
    if (ruleDescModalCloseBtn) ruleDescModalCloseBtn.addEventListener("click", () => {
        ruleDescModalOverlay.style.display = "none";
    });
    if (ruleDescModalOverlay) ruleDescModalOverlay.addEventListener("click", e => {
        if (e.target === ruleDescModalOverlay) ruleDescModalOverlay.style.display = "none";
    });

    if (fighterSelectOpenBtn) fighterSelectOpenBtn.addEventListener("click", () => {
        if (fighterModalOverlay) fighterModalOverlay.style.display = "flex";
    });
    if (fighterModalCloseBtn) fighterModalCloseBtn.addEventListener("click", () => {
        if (fighterModalOverlay) fighterModalOverlay.style.display = "none";
    });
    if (fighterModalOverlay) fighterModalOverlay.addEventListener("click", e => {
        if (e.target === fighterModalOverlay) fighterModalOverlay.style.display = "none";
    });

    function applyRuleUI(drawRule, grudgeRule, taimanMode) {
        const isTaiman = Boolean(taimanMode);
        const isGrudge = !isTaiman && Boolean(grudgeRule);
        currentRuleDesc = isTaiman ? RULE_DESCS.taiman : isGrudge ? RULE_DESCS.grudge : RULE_DESCS.normal;
        currentRuleLabel = isTaiman ? "タイマンルール" : isGrudge ? "遺恨ルール" : "通常ルール";
        if (ruleDisplayLabel) ruleDisplayLabel.textContent = currentRuleLabel;
        if (fighterSelectOpenBtn) fighterSelectOpenBtn.style.display = isTaiman ? "inline-block" : "none";
        if (ruleClassicBtn) ruleClassicBtn.classList.toggle("rule-select-btn-active", !isGrudge && !isTaiman);
        if (grudgeRuleBtn) grudgeRuleBtn.classList.toggle("rule-select-btn-active", isGrudge);
        if (taimanModeBtn) taimanModeBtn.classList.toggle("rule-select-btn-active", isTaiman);
    }

    if (ruleClassicBtn) {
        ruleClassicBtn.onclick = () => {
            socket.emit("setTaimanMode", { roomId: currentRoomId, taimanMode: false });
            socket.emit("setGrudgeRule", { roomId: currentRoomId, grudgeRule: false });
        };
    }

    if (grudgeRuleBtn) {
        grudgeRuleBtn.onclick = () => {
            socket.emit("setTaimanMode", { roomId: currentRoomId, taimanMode: false });
            socket.emit("setGrudgeRule", { roomId: currentRoomId, grudgeRule: true });
        };
    }

    if (taimanModeBtn) {
        taimanModeBtn.onclick = () => {
            socket.emit("setTaimanMode", { roomId: currentRoomId, taimanMode: true });
        };
    }

    function renderTaimanFighterSelector(players, fighters) {
        if (!taimanFighterList) return;
        taimanFighterList.innerHTML = "";
        players.filter(p => !p.disconnected).forEach(p => {
            const isFighter = fighters.includes(p.id);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "taiman-fighter-btn" + (isFighter ? " taiman-fighter-selected" : "");
            btn.textContent = (isFighter ? "⚔ " : "") + p.name;
            btn.onclick = () => {
                let next = [...fighters];
                if (isFighter) {
                    next = next.filter(id => id !== p.id);
                } else {
                    if (next.length >= 2) next.shift();
                    next.push(p.id);
                }
                socket.emit("setTaimanFighters", { roomId: currentRoomId, fighters: next });
            };
            taimanFighterList.appendChild(btn);
        });
    }

    socket.on("updateRoom", ({ players, drawRule, grudgeRule, grudgeHate, taimanMode: tm, taimanFighters: tf }) => {
        drawRule = drawRule || "classic";
        isTaimanMode = Boolean(tm);
        taimanFighters = tf || [];
        playerList.innerHTML = "";

        const me = players.find(player => player.id === socket.id);
        const amSpectator = Boolean(me && me.spectator);

        if (me && !amSpectator) {
            isReady = me.ready;
            readyButton.style.display = "";
            readyButton.innerText = isReady ? "準備解除" : "準備完了";
            readyButton.classList.toggle("cancel-ready", isReady);
        } else if (amSpectator) {
            readyButton.style.display = "none";
        }

        players.forEach(player => {
            const isSpectatorPlayer = Boolean(player.spectator);
            const statusText = player.disconnected
                ? "再接続待ち"
                : isSpectatorPlayer
                    ? "観戦"
                    : player.ready
                        ? "準備完了"
                        : "待機中";

            const hate = (grudgeHate && !isSpectatorPlayer) ? (grudgeHate[player.id] || 0) : 0;
            const grudgeHateHtml = hate > 0
                ? `<span class="grudge-hate" title="遺恨ヘイト（次の試合の開始ヘイト）">${"🔴".repeat(hate)}</span>`
                : "";

            const isFighterPlayer = isTaimanMode && taimanFighters.includes(player.id);
            playerList.innerHTML += `
                <div class="player-card ${!isSpectatorPlayer && player.ready ? "ready" : "not-ready"} ${player.disconnected ? "disconnected-player-card" : ""} ${isSpectatorPlayer ? "spectator-player-card" : ""}">
                    <span class="player-name">${player.host ? "👑 " : ""}${isSpectatorPlayer ? "👁 " : ""}${isFighterPlayer ? "⚔ " : ""}${player.name}${disconnectedLabel(player)}</span>
                    <span class="player-status">${statusText}${grudgeHateHtml}</span>
                </div>
            `;
        });

        const activePlayers = players.filter(p => !p.spectator && !p.disconnected);
        const allReady = activePlayers.every(player => player.ready);

        let canStart;
        if (isTaimanMode) {
            const fighterObjs = taimanFighters.map(fid => players.find(p => p.id === fid)).filter(Boolean);
            canStart = fighterObjs.length === 2 && fighterObjs.every(p => p.ready && !p.disconnected);
        } else {
            canStart = activePlayers.length >= 2 && allReady;
        }

        if (isHost) {
            startGameButton.style.display = "block";
            startGameButton.disabled = !canStart;
            if (ruleSelector) ruleSelector.style.display = "block";
            if (ruleDisplay) ruleDisplay.style.display = "none";
            if (isTaimanMode) renderTaimanFighterSelector(players, taimanFighters);
        } else {
            startGameButton.style.display = "none";
            if (ruleSelector) ruleSelector.style.display = "none";
            if (ruleDisplay) ruleDisplay.style.display = "block";
        }

        applyRuleUI(drawRule, grudgeRule, isTaimanMode);
    });

    readyButton.onclick = () => {
        socket.emit("toggleReady", {
            roomId: currentRoomId
        });
    };

    leaveRoomButton.onclick = () => {
        if (isHost) {
            socket.emit("disbandRoom", currentRoomId);
        } else {
            socket.emit("leaveRoom", currentRoomId);
        }

        resetToTitle();
    };

    startGameButton.onclick = () => {
        socket.emit("startGame", currentRoomId);
    };

    socket.on("draftStarted", () => {
        setScreenMode("draft");
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "none";
    });

    socket.on("draftUpdate", data => {
        renderDraft(data);
    });

    const draftCardDetailEl = document.getElementById("draftCardDetail");

    function showDraftCardDetail(card) {
        if (!draftCardDetailEl) return;
        draftCardDetailEl.innerHTML = cardDetailHtml(card);
    }

    function resetDraftCardDetail() {
        if (!draftCardDetailEl) return;
        draftCardDetailEl.innerHTML = `<p class="draft-card-detail-hint">カードにカーソルを合わせると効果が表示されます</p>`;
    }

    if (draftScreen) {
        draftScreen.addEventListener("mouseover", e => {
            const el = e.target.closest("[data-draft-card]");
            if (!el) return;
            showDraftCardDetail(JSON.parse(el.dataset.draftCard));
        });
        draftScreen.addEventListener("mouseout", e => {
            const el = e.target.closest("[data-draft-card]");
            if (el && !el.contains(e.relatedTarget)) resetDraftCardDetail();
        });
        draftScreen.addEventListener("click", e => {
            const el = e.target.closest("[data-draft-card]");
            if (!el) return;
            showDraftCardDetail(JSON.parse(el.dataset.draftCard));
        });
    }

    function draftCardHtml(card) {
        const r = (card.rarity || "C").toLowerCase();
        const encoded = JSON.stringify({
            name: card.name || "",
            rarity: card.rarity || "C",
            type: card.type || "",
            effect: card.effect || "",
            hateText: card.hateText || ""
        }).replace(/'/g, "&#39;");
        return `<div class="draft-mini-card rarity-${r}" data-draft-card='${encoded}'>
            <span class="draft-mini-rarity">${card.rarity || "C"}</span>
            <span class="draft-mini-name">${card.name || ""}</span>
        </div>`;
    }

    function renderDraft(data) {
        const roundText = document.getElementById("draftRoundText");
        const statusText = document.getElementById("draftStatusText");
        if (roundText) roundText.textContent = `ラウンド ${data.round + 1} / 10`;

        const isMyTurn = data.waitingFor === socket.id;
        const waitingFighter = data.fighters.find(f => f.id === data.waitingFor);
        if (statusText) {
            statusText.textContent = isMyTurn
                ? "あなたのピック番です！"
                : `${waitingFighter ? waitingFighter.name : ""}のピック番です...`;
        }

        data.fighters.forEach((fighter, i) => {
            const nameEl = document.getElementById(`draftPicksName${i}`);
            const listEl = document.getElementById(`draftPicksList${i}`);
            if (nameEl) nameEl.textContent = fighter.name;
            if (listEl) {
                const picks = data.picks[fighter.id] || [];
                listEl.innerHTML = picks.map(draftCardHtml).join("");
            }
        });

        [0, 1].forEach(i => {
            const cards = document.getElementById(`draftOptionCards${i}`);
            const btn = document.getElementById(`draftPickBtn${i}`);
            const set = data.options[i] || [];
            if (cards) cards.innerHTML = set.map(draftCardHtml).join("");
            if (btn) {
                btn.disabled = !isMyTurn;
                btn.style.opacity = isMyTurn ? "1" : "0.3";
                btn.onclick = isMyTurn ? () => {
                    socket.emit("taimanDraftPick", { roomId: currentRoomId, setIndex: i });
                    btn.disabled = true;
                } : null;
            }
        });
    }

    socket.on("gameStarted", () => {
        document.body.classList.remove("game-over-active");
        setScreenMode("battle");
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "block";
        gameOverOverlay.style.display = "none";
        previousGame = null;
        gameOverSoundPlayed = false;
        playSound("gameStart");
    });

    socket.on("chooseTrap", data => {
        showTrapWaitingNotice("罠カードを選択してください");
        showTrapChoiceModal(data);
    });

    socket.on("chooseOverwriteTrap", data => {
        showOverwriteTrapModal(data);
    });

    socket.on("updateGame", game => {
        const oldGame = previousGame;

        latestGame = game;
        document.body.classList.toggle("spectating", isSpectatorMode());
        document.body.classList.toggle("player-owakon", !isSpectatorMode() && Boolean(getMeFromLatestGame()?.defeated));
        endTurnRequestPending = false;

        document.body.classList.remove("spectator-hand-view");

        updateTrapWaitingNotice();

        if (isMobileLayout() && selectedMobileCardInstanceId && !getSelectedMobileCard()) {
            selectedMobileCardInstanceId = "";
            hideMobileEffect();
            updateMobileActionPanel();
        }

        const enemies = latestGame.turnOrder.filter(player => {
            return player.id !== socket.id && !player.defeated;
        });

        const isKaikakou = p => Array.isArray(p.statusEffects) && p.statusEffects.some(e => e && e.type === "kagiaka" && Number(e.remainingTurns || 0) > 0);
        const preferredEnemy = enemies.find(e => !isKaikakou(e)) || enemies[0];

        if (!selectedTargetId && enemies.length > 0) {
            selectedTargetId = preferredEnemy.id;
        }

        if (
            selectedTargetId &&
            !latestGame.turnOrder.some(player => {
                return player.id === selectedTargetId && !player.defeated;
            })
        ) {
            selectedTargetId = preferredEnemy?.id || "";
        }

        const currentTarget = enemies.find(e => e.id === selectedTargetId);
        if (currentTarget && isKaikakou(currentTarget)) {
            const alt = enemies.find(e => !isKaikakou(e));
            if (alt) selectedTargetId = alt.id;
        }

        renderBattlePlayers();
        renderTurn();
        renderPlayedCards();
        renderMyFieldCards();
        renderHand();
        updateMobileActionPanel();

        runAnimations(oldGame, latestGame);

        previousGame = cloneGame(latestGame);

        const dvBtn = document.getElementById("deckViewerBtn");
        if (dvBtn) dvBtn.style.display = game.taimanMode ? "inline-block" : "none";

        if (Array.isArray(game.deckRefillEvents) && game.deckRefillEvents.length > 0) {
            game.deckRefillEvents.forEach(ev => showDeckRefillNotification(ev.playerName));
        }

        console.log("[updateGame] gameOver:", game.gameOver, "winner:", game.winner?.name);
        if (game.gameOver && game.winner) {
            showGameOver(game.winner);
        }
    });

    function fieldCardMiniHtml(card) {
        if (card.hidden) {
            return `<span class="mini-set-card">伏</span>`;
        }
        const shortName = card.name && card.name.length > 4
            ? card.name.substring(0, 3) + "…"
            : (card.name || "罠");
        if (card.fieldId) {
            return `<span class="mini-set-card revealed-set-card spectator-trap-card" title="${card.name}" data-field-id="${card.fieldId}">${shortName}</span>`;
        }
        return `<span class="mini-set-card revealed-set-card" title="${card.name}">${shortName}</span>`;
    }

    function renderBattlePlayers() {
        if (!latestGame) return;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);
        const spectator = isSpectatorMode();

        if (spectator) {
            const allPlayers = latestGame.turnOrder;
            const selectedPlayer = allPlayers.find(p => p.id === selectedTargetId) || allPlayers[0];
            const otherPlayers = allPlayers.filter(p => p.id !== selectedPlayer?.id);

            myPanel.classList.add("selected-target");
            myPanel.classList.toggle("max-hate-player", Boolean(selectedPlayer?.hate >= 3));
            myPanel.classList.toggle("defeated-player", Boolean(selectedPlayer?.defeated));
            myPanel.classList.toggle("choosing-trap-player", Boolean(latestGame.waitingTrapChoice && selectedPlayer?.id === latestGame.waitingTrapPlayerId));

            if (selectedPlayer) {
                myPanel.innerHTML = `
                    <div class="spectator-watching-label">👁 観戦中</div>
                    <div class="my-name">${selectedPlayer.defeated ? "💀 " : ""}${selectedPlayer.hate >= 3 ? "🔥 " : ""}${selectedPlayer.name}${disconnectedLabel(selectedPlayer)}</div>
                    <div class="follower-line ${selectedPlayer.defeated ? "owakon-text" : ""}">
                        ${followerText(selectedPlayer)}
                    </div>
                    <div class="panel-hate ${selectedPlayer.hate >= 3 ? "max-hate-text" : ""}">
                        ${hateIcons(selectedPlayer.hate)}
                    </div>
                    ${statusEffectsHtml(selectedPlayer)}
                    <div class="enemy-field-cards">
                        ${selectedPlayer.fieldCards.map(card => fieldCardMiniHtml(card)).join("")}
                    </div>
                `;
                bindStatusEffectEvents(myPanel);
            }

            enemySlots.forEach((slot, index) => {
                const player = otherPlayers[index];

                if (player) {
                    slot.classList.remove("empty-enemy");
                    slot.classList.toggle("selected-target", false);
                    slot.classList.toggle("max-hate-player", player.hate >= 3);
                    slot.classList.toggle("defeated-player", player.defeated);
                    slot.classList.remove("spectator-hand-owner");
                    slot.classList.toggle("choosing-trap-player", Boolean(latestGame.waitingTrapChoice && player.id === latestGame.waitingTrapPlayerId));

                    slot.innerHTML = `
                        <div class="enemy-hand-badge">🂠 ${player.handCount ?? player.hand.length}</div>
                        <div class="enemy-name">${player.defeated ? "💀 " : ""}${player.hate >= 3 ? "🔥 " : ""}${player.name}${disconnectedLabel(player)}</div>
                        <div class="follower-line ${player.defeated ? "owakon-text" : ""}">
                            ${followerText(player)}
                        </div>
                        <div class="panel-hate ${player.hate >= 3 ? "max-hate-text" : ""}">
                            ${hateIcons(player.hate)}
                        </div>
                        ${statusEffectsHtml(player)}
                        <div class="enemy-field-cards">
                            ${player.fieldCards.map(card => fieldCardMiniHtml(card)).join("")}
                        </div>
                    `;

                    bindStatusEffectEvents(slot);

                    slot.onclick = () => {
                        selectedTargetId = player.id;
                        renderBattlePlayers();
                        renderHand();
                        renderMyFieldCards();
                        updateMobileActionPanel();
                    };
                } else {
                    slot.classList.add("empty-enemy");
                    slot.classList.remove("selected-target");
                    slot.classList.remove("max-hate-player");
                    slot.classList.remove("defeated-player");
                    slot.classList.remove("spectator-hand-owner");
                    slot.classList.remove("choosing-trap-player");
                    slot.onclick = null;

                    slot.innerHTML = `
                        <div class="enemy-name">空席</div>
                        <div class="follower-line">-</div>
                        <div class="panel-hate">◇◇◇</div>
                    `;
                }
            });

            return;
        }

        if (me) {
            myPanel.classList.remove("selected-target");
            myPanel.classList.toggle("max-hate-player", me.hate >= 3);
            myPanel.classList.toggle("defeated-player", me.defeated);
            myPanel.classList.toggle("choosing-trap-player", Boolean(latestGame.waitingTrapChoice && me.id === latestGame.waitingTrapPlayerId));

            myPanel.innerHTML = `
                <div class="my-name">${me.defeated ? "💀 " : ""}${me.hate >= 3 ? "🔥 " : ""}${me.name}${disconnectedLabel(me)}</div>
                <div class="follower-line ${me.defeated ? "owakon-text" : ""}">
                    ${followerText(me)}
                </div>
                <div class="panel-hate ${me.hate >= 3 ? "max-hate-text" : ""}">
                    ${hateIcons(me.hate)}
                </div>
                ${statusEffectsHtml(me)}
            `;

            bindStatusEffectEvents(myPanel);
        }

        const enemies = latestGame.turnOrder.filter(player => player.id !== socket.id);

        const activeEnemies = enemies.filter(e => !e.defeated);
        const allEnemiesKaikakou = activeEnemies.length > 0 && activeEnemies.every(e =>
            Array.isArray(e.statusEffects) && e.statusEffects.some(s => s && s.type === "kagiaka" && Number(s.remainingTurns || 0) > 0)
        );

        battleField.classList.toggle("taiman-battle", Boolean(latestGame.taimanMode));

        enemySlots.forEach((slot, index) => {
            const enemy = enemies[index];

            if (enemy) {
                const enemyHasKaikakou = Array.isArray(enemy.statusEffects) && enemy.statusEffects.some(e => e && e.type === "kagiaka" && Number(e.remainingTurns || 0) > 0);

                slot.classList.remove("empty-enemy");
                slot.classList.toggle("selected-target", isMyTurnNow() && selectedTargetId === enemy.id && !allEnemiesKaikakou);
                slot.classList.toggle("max-hate-player", enemy.hate >= 3);
                slot.classList.toggle("defeated-player", enemy.defeated);
                slot.classList.toggle("kagiaka-player", enemyHasKaikakou);
                slot.classList.remove("spectator-hand-owner");
                slot.classList.toggle("choosing-trap-player", Boolean(latestGame.waitingTrapChoice && enemy.id === latestGame.waitingTrapPlayerId));

                slot.innerHTML = `
                    <div class="enemy-hand-badge">🂠 ${enemy.handCount ?? enemy.hand.length}</div>
                    <div class="enemy-name">${enemy.defeated ? "💀 " : ""}${enemy.hate >= 3 ? "🔥 " : ""}${enemyHasKaikakou ? "🔒 " : ""}${enemy.name}${disconnectedLabel(enemy)}</div>
                    <div class="follower-line ${enemy.defeated ? "owakon-text" : ""}">
                        ${followerText(enemy)}
                    </div>
                    <div class="panel-hate ${enemy.hate >= 3 ? "max-hate-text" : ""}">
                        ${hateIcons(enemy.hate)}
                    </div>
                    ${statusEffectsHtml(enemy)}
                    <div class="enemy-field-cards">
                        ${enemy.fieldCards.map(card => fieldCardMiniHtml(card)).join("")}
                    </div>
                `;

                bindStatusEffectEvents(slot);

                slot.onclick = () => {
                    if (me && me.defeated) {
                        selectedTargetId = enemy.id;
                        renderBattlePlayers();
                        renderHand();
                        renderMyFieldCards();
                        updateMobileActionPanel();
                        return;
                    }

                    if (enemy.defeated) return;
                    if (enemyHasKaikakou) return;

                    selectedTargetId = enemy.id;

                    renderBattlePlayers();
                    renderHand();
                    updateMobileActionPanel();
                };
            } else {
                slot.classList.add("empty-enemy");
                slot.classList.remove("selected-target");
                slot.classList.remove("max-hate-player");
                slot.classList.remove("defeated-player");
                slot.classList.remove("spectator-hand-owner");
                slot.classList.remove("choosing-trap-player");
                slot.onclick = null;

                slot.innerHTML = `
                    <div class="enemy-name">空席</div>
                    <div class="follower-line">-</div>
                    <div class="panel-hate">◇◇◇</div>
                `;
            }
        });
    }

    function renderTurn() {
        if (!latestGame) return;

        const currentPlayer = latestGame.turnOrder[latestGame.currentTurnIndex];
        const isMyTurn = currentPlayer.id === socket.id;

        turnPanel.innerHTML = `
            現在のターン<br>
            <span>${currentPlayer.name}</span>
        `;

        battleMessage.innerText = isMyTurn
            ? "あなたのターンです。対象を選び、カードを場に出せます。"
            : `${currentPlayer.name} のターンです。`;

        dropZone.classList.toggle("active-drop-zone", isMyTurn);
        discardZone.classList.toggle("active-discard-zone", isMyTurn);
        endTurnButton.disabled = !isMyTurn || endTurnRequestPending || latestGame.waitingTrapChoice;
    }

    function playedCardExtraText(card) {
        const lines = [];

        if (card.damageText) {
            lines.push(card.damageText);
        } else if (typeof card.damageAmount === "number") {
            if (card.damageCanceled) {
                lines.push(`ダメージ：0（無効 / 元ダメージ ${Number(card.originalDamageAmount || 0).toLocaleString()}）`);
            } else {
                lines.push(`ダメージ：${Number(card.damageAmount).toLocaleString()}`);
            }
        } else {
            const damageSourceText = `${card.hateText || ""} ${card.log || ""}`;
            const damageMatch = damageSourceText.match(/([0-9,]+)ダメージ/);

            if (damageMatch) {
                lines.push(`ダメージ：${damageMatch[1]}`);
            }
        }

        if (typeof card.healAmount === "number" && card.healAmount > 0) {
            lines.push(`回復：${Number(card.healAmount).toLocaleString()}`);
        }

        if (card.damageDetailText) {
            lines.push(card.damageDetailText);
        }

        if (card.bonusText) {
            lines.push(card.bonusText);
        }

        if (card.specialText) {
            lines.push(card.specialText);
        }

        if (card.trapDetailText) {
            lines.push(card.trapDetailText);
        }

        if (typeof card.hateAmount === "number" && card.hateAmount !== 0) {
            lines.push(`ヘイト：${card.hateAmount > 0 ? "+" : ""}${card.hateAmount}`);
        }

        return lines.map(line => `<div class="played-card-extra">${line}</div>`).join("");
    }

    function logWithCardLink(log, cardName) {
        if (!cardName || !cardMasterMap[cardName]) return log;
        const idx = log.indexOf(cardName);
        if (idx === -1) return log;
        const escaped = cardName.replace(/"/g, "&quot;");
        return log.slice(0, idx)
            + `<button class="history-card-link" data-card-name="${escaped}">${cardName}</button>`
            + log.slice(idx + cardName.length);
    }

    function renderPlayedCards() {
        if (!latestGame) return;

        playedCardList.innerHTML = "";

        [...latestGame.playedCards].reverse().forEach(card => {
            const logText = card.log || `${card.playerName} → ${card.targetName}`;
            playedCardList.innerHTML += `
                <div class="played-card">
                    <strong>${logWithCardLink(logText, card.cardName)}</strong><br>
                    ${card.hateText || ""}
                    ${playedCardExtraText(card)}
                </div>
            `;
        });
    }

    function renderMyFieldCards() {
        if (!latestGame) return;

        myFieldCards.innerHTML = "";

        const spectator = isSpectatorMode();

        if (spectator) {
            const allPlayers = latestGame.turnOrder;
            const watchedPlayer = allPlayers.find(p => p.id === selectedTargetId) || allPlayers[0];
            if (!watchedPlayer) return;

            for (let i = 0; i < 2; i++) {
                const card = watchedPlayer.fieldCards[i];
                const setCard = document.createElement("div");

                setCard.className = `set-card ${card ? "has-set-card" : ""}`;
                setCard.innerText = card ? "伏" : "空";

                if (card && !card.hidden) {
                    setCard.onmouseenter = () => {
                        cardDetail.innerHTML = cardDetailHtml(card);
                    };
                    setCard.onmouseleave = () => {
                        if (!isMobileLayout()) resetCardDetail();
                    };
                    setCard.onclick = () => {
                        if (isMobileLayout()) {
                            toggleMobileFieldCardEffect(card, card.fieldId || `field-card-${i}`);
                        } else {
                            cardDetail.innerHTML = cardDetailHtml(card);
                        }
                    };
                }

                myFieldCards.appendChild(setCard);
            }
            return;
        }

        const me = latestGame.turnOrder.find(player => player.id === socket.id);

        if (!me) return;

        for (let i = 0; i < 2; i++) {
            const card = me.fieldCards[i];

            const setCard = document.createElement("div");

            setCard.className = `set-card ${card ? "has-set-card" : ""}`;
            setCard.innerText = card ? "伏" : "空";

            if (card && !card.hidden) {
                setCard.onmouseenter = () => {
                    cardDetail.innerHTML = cardDetailHtml(card);
                };

                setCard.onmouseleave = () => {
                    if (!isMobileLayout()) {
                        resetCardDetail();
                    }
                };

                setCard.onclick = () => {
                    if (isMobileLayout()) {
                        toggleMobileFieldCardEffect(card, card.fieldId || `field-card-${i}`);
                    } else {
                        cardDetail.innerHTML = cardDetailHtml(card);
                    }
                };
            }

            myFieldCards.appendChild(setCard);
        }
    }

    function getSelectedSpectatorPlayer(me) {
        if (!latestGame) return null;

        const spectator = isSpectatorMode();

        if (!spectator && (!me || !me.defeated)) return null;

        const candidates = spectator
            ? latestGame.turnOrder.filter(p => !p.defeated)
            : latestGame.turnOrder.filter(p => p.id !== socket.id && !p.defeated);

        if (candidates.length === 0) {
            const allCandidates = spectator
                ? latestGame.turnOrder
                : latestGame.turnOrder.filter(p => p.id !== socket.id);
            const sel = allCandidates.find(p => p.id === selectedTargetId);
            return sel || allCandidates[0] || null;
        }

        const selected = candidates.find(p => p.id === selectedTargetId);
        return selected || candidates[0];
    }

    function renderHand() {
        if (!latestGame) return;

        const drawRule = latestGame.drawRule || "classic";
        const maxHand = 4;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);

        handArea.innerHTML = "";

        if (!me && !isSpectatorMode()) return;

        const spectatorPlayer = getSelectedSpectatorPlayer(me);
        const isSpectatorHand = Boolean(spectatorPlayer);
        const displayHand = isSpectatorHand ? (spectatorPlayer.hand || []) : (me ? me.hand || [] : []);

        handArea.classList.toggle("spectator-own-hand-area", isSpectatorHand);

        if (isSpectatorHand) {
            const notice = document.createElement("div");
            notice.className = "spectator-own-hand-notice";
            notice.innerText = isSpectatorMode()
                ? `観戦中：${spectatorPlayer.name} の手札`
                : `オワコン状態：${spectatorPlayer.name} の手札を観戦中`;
            handArea.appendChild(notice);
        }

        const slotCount = drawRule === "handManage" ? displayHand.length : 4;

        for (let i = 0; i < slotCount; i++) {
            const card = displayHand[i];

            const cardElement = document.createElement("div");

            if (!card) {
                cardElement.className = `hand-card empty-hand-card ${isSpectatorHand ? "spectator-own-hand-card" : ""}`;
                cardElement.innerHTML = `
                    <div class="card-name">空</div>
                    <div class="card-type">${isSpectatorHand ? "観戦中" : "次の自分のターンで補充"}</div>
                `;

                handArea.appendChild(cardElement);

                continue;
            }

            const isSelectedMobileCard = !isSpectatorHand && selectedMobileCardInstanceId === card.instanceId;

            cardElement.className = `hand-card ${rarityClass(card.rarity)} ${isSelectedMobileCard ? "selected-mobile-hand-card" : ""} ${isSpectatorHand ? "spectator-own-hand-card" : ""}`;
            cardElement.draggable = !isSpectatorHand && !isMobileLayout();

            cardElement.innerHTML = `
                <div class="card-rarity-badge ${rarityClass(card.rarity)}">${normalizeRarity(card.rarity)}</div>
                <div class="card-name">${card.name}</div>
                <div class="card-type">${card.type}</div>
                <div class="card-hate">${card.hateText}</div>
            `;

            cardElement.onmouseenter = () => {
                cardDetail.innerHTML = cardDetailHtml(card);
            };

            cardElement.onmouseleave = () => {
                if (!isMobileLayout() || selectedMobileCardInstanceId !== card.instanceId) {
                    resetCardDetail();
                }
            };

            cardElement.onclick = () => {
                if (isSpectatorHand) {
                    if (isMobileLayout()) {
                        const spectatorKey = `spectator-${i}`;
                        if (selectedMobileFieldCardKey === spectatorKey && mobileEffectOverlay.classList.contains("show")) {
                            selectedMobileFieldCardKey = "";
                            hideMobileEffect();
                        } else {
                            selectedMobileCardInstanceId = "";
                            selectedMobileStatusKey = "";
                            selectedMobileFieldCardKey = spectatorKey;
                            cardDetail.innerHTML = cardDetailHtml(card);
                            showMobileEffect(card);
                        }
                    } else {
                        selectedMobileCardInstanceId = "";
                        cardDetail.innerHTML = cardDetailHtml(card);
                        hideMobileEffect();
                    }
                    updateMobileActionPanel();
                    return;
                }

                selectMobileCard(card);
            };

            cardElement.ondragstart = () => {
                if (isSpectatorHand || isMobileLayout()) return false;
                draggedCard = card;
            };

            handArea.appendChild(cardElement);
        }

        if (drawRule === "handManage" && displayHand.length === 0 && !isSpectatorHand) {
            const empty = document.createElement("div");
            empty.className = "hand-empty-notice";
            empty.textContent = "手札なし（次のターンで4枚補充）";
            handArea.appendChild(empty);
        }
    }

    dropZone.ondragover = event => {
        event.preventDefault();
    };

    dropZone.ondrop = event => {
        event.preventDefault();

        if (!latestGame || latestGame.gameOver) return;

        const currentPlayer = latestGame.turnOrder[latestGame.currentTurnIndex];

        if (currentPlayer.id !== socket.id) {
            alert("今はあなたのターンではありません");
            return;
        }

        if (!draggedCard) return;

        let targetId = selectedTargetId;

        if (draggedCard.targetType === "self") {
            targetId = socket.id;
        }

        if (draggedCard.targetType === "enemy" && targetId) {
            const t = latestGame.turnOrder.find(p => p.id === targetId);
            const tIsKaikakou = t && Array.isArray(t.statusEffects) && t.statusEffects.some(e => e && e.type === "kagiaka" && Number(e.remainingTurns || 0) > 0);
            if (tIsKaikakou) {
                const alt = latestGame.turnOrder.find(p => p.id !== socket.id && !p.defeated && !(Array.isArray(p.statusEffects) && p.statusEffects.some(e => e && e.type === "kagiaka" && Number(e.remainingTurns || 0) > 0)));
                if (!alt) return;
                targetId = alt.id;
                selectedTargetId = alt.id;
            }
        }

        if (draggedCard.targetType === "enemy" && !targetId) {
            alert("対象プレイヤーを選択してください");
            return;
        }

        playSound(soundNameFromCard(draggedCard));

        socket.emit("playCard", {
            roomId: currentRoomId,
            cardInstanceId: draggedCard.instanceId,
            targetId
        });

        draggedCard = null;
    };

    discardZone.ondragover = event => {
        event.preventDefault();
    };

    discardZone.ondrop = event => {
        event.preventDefault();

        if (!latestGame || latestGame.gameOver) return;

        const currentPlayer = latestGame.turnOrder[latestGame.currentTurnIndex];

        if (currentPlayer.id !== socket.id) {
            alert("今はあなたのターンではありません");
            return;
        }

        if (!draggedCard) return;

        playSound("discard");

        socket.emit("discardCard", {
            roomId: currentRoomId,
            cardInstanceId: draggedCard.instanceId
        });

        draggedCard = null;
    };

    endTurnButton.onclick = () => {
        if (!latestGame || latestGame.gameOver) return;
        if (endTurnRequestPending) return;

        const currentPlayer = latestGame.turnOrder[latestGame.currentTurnIndex];

        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (latestGame.waitingTrapChoice) return;

        endTurnRequestPending = true;
        endTurnButton.disabled = true;
        playSound("turnEnd");

        socket.emit("endTurn", {
            roomId: currentRoomId,
            turnIndex: latestGame.currentTurnIndex,
            playerId: socket.id
        });
    };

    function renderGameOverKime(winnerId) {
        if (!gameOverKime || !latestGame) return;

        const me = latestGame.turnOrder.find(p => p.id === socket.id);
        const isWinner = winnerId === socket.id;

        if (!isWinner && me?.defeatCause?.cardName) {
            const cause = me.defeatCause;
            const rarity = normalizeRarity(cause.cardRarity);
            gameOverKime.innerHTML = `
                <div class="kime-label">💀 あなたを倒した決め手</div>
                <div class="kime-card-display">
                    <span class="kime-rarity-badge ${rarityClass(rarity)}">${rarity}</span>
                    <span class="kime-card-name">「${cause.cardName}」</span>
                </div>
                ${cause.playerName ? `<div class="kime-attacker">by ${cause.playerName}</div>` : ""}
            `;
        } else {
            gameOverKime.innerHTML = "";
        }
    }

    function renderGameOverResults(winnerId) {
        if (!gameOverResults) return;

        const players = (latestGame && Array.isArray(latestGame.turnOrder)) ? latestGame.turnOrder : [];

        const sorted = [...players].sort((a, b) => {
            if (a.id === winnerId) return -1;
            if (b.id === winnerId) return 1;
            return (b.followers || 0) - (a.followers || 0);
        });

        gameOverResults.innerHTML = sorted.map(player => {
            const isWinner = player.id === winnerId;
            const cause = player.defeatCause;
            const remaining = Number(player.followers || 0).toLocaleString();
            const damageTaken = Number(player.totalDamageTaken || 0).toLocaleString();

            const rarityLabel = (!isWinner && cause?.cardName)
                ? `<span class="game-over-result-rarity ${rarityClass(normalizeRarity(cause.cardRarity))}">${normalizeRarity(cause.cardRarity)}</span>`
                : "";

            const defeatDetail = (!isWinner && cause?.cardName)
                ? `<div class="game-over-defeat-detail">
                       ${rarityLabel}「${cause.cardName}」${cause.playerName ? ` by ${cause.playerName}` : ""}
                       ${cause.cardEffect ? `<div class="game-over-defeat-effect">${cause.cardEffect}</div>` : ""}
                   </div>`
                : (!isWinner ? `<div class="game-over-defeat-detail">オワコン</div>` : "");

            return `
                <div class="game-over-result-row ${isWinner ? "game-over-result-row-winner" : ""}">
                    <div class="game-over-result-header">
                        <span class="game-over-result-name">${player.name}</span>
                        <span class="game-over-result-status ${isWinner ? "game-over-result-winner" : "game-over-result-defeated"}">
                            ${isWinner ? "🏆 生き残った" : "💀 撃破"}
                        </span>
                    </div>
                    <div class="game-over-result-stats">
                        <span class="game-over-stat">残り <strong>${remaining}</strong> F</span>
                        <span class="game-over-stat game-over-stat-damage">被ダメ <strong>${damageTaken}</strong></span>
                    </div>
                    ${defeatDetail}
                </div>
            `;
        }).join("");
    }

    function showGameOver(winner) {
        console.log("[showGameOver] called", winner, "socket.id:", socket.id);
        const isWinner = winner.id === socket.id;

        document.body.classList.add("game-over-active");
        closeMobileHistory();
        closeMobileSettings();
        hideMobileEffect();
        hideTrapWaitingNotice();
        document.body.classList.remove("mobile-card-action-open");
        updateMobileActionPanel();

        gameOverText.innerText = isWinner
            ? "勝利！最後まで生き残った"
            : `${winner.name} の勝利`;

        renderGameOverKime(winner.id);
        renderGameOverResults(winner.id);

        gameOverOverlay.style.display = "flex";

        if (!gameOverSoundPlayed) {
            gameOverSoundPlayed = true;
            playSound(isWinner ? "victory" : "defeat");
        }
    }

    nextButton.onclick = () => {
        socket.emit("returnToRoom", currentRoomId);
    };

    function resetToTitle() {
        clearReconnectInfo();
        currentRoomId = "";
        isHost = false;
        isReady = false;
        latestGame = null;
        previousGame = null;
        gameOverSoundPlayed = false;
        selectedTargetId = "";
        selectedMobileCardInstanceId = "";
        selectedMobileStatusKey = "";
        draggedCard = null;
        document.body.classList.remove("mobile-card-action-open");
        document.body.classList.remove("spectator-hand-view");
        document.body.classList.remove("spectating");
        document.body.classList.remove("player-owakon");
        closeMobileHistory();
        closeMobileSettings();
        hideTrapWaitingNotice();
        updateMobileActionPanel();

        const trapOverlay = document.getElementById("trapChoiceOverlay");

        if (trapOverlay) {
            trapOverlay.remove();
        }

        hideMobileEffect();

        setScreenMode("title");
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "none";
        if (draftScreen) draftScreen.style.display = "none";
        titleScreen.style.display = "flex";
        gameOverOverlay.style.display = "none";
        if (deckViewerOverlay) deckViewerOverlay.style.display = "none";
        isTaimanMode = false;
        taimanFighters = [];

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    }

    socket.on("gameOver", winner => {
        if (winner) {
            showGameOver(winner);
        }
    });

    socket.on("returnToRoom", () => {
        latestGame = null;
        previousGame = null;
        gameOverSoundPlayed = false;
        endTurnRequestPending = false;
        selectedTargetId = "";
        selectedMobileCardInstanceId = "";
        selectedMobileStatusKey = "";
        draggedCard = null;

        document.body.classList.remove("mobile-card-action-open");
        document.body.classList.remove("spectator-hand-view");
        document.body.classList.remove("spectating");
        document.body.classList.remove("player-owakon");
        document.body.classList.remove("game-over-active");

        closeMobileHistory();
        closeMobileSettings();
        hideTrapWaitingNotice();
        hideMobileEffect();
        updateMobileActionPanel();

        const trapOverlay = document.getElementById("trapChoiceOverlay");
        if (trapOverlay) trapOverlay.remove();

        gameOverOverlay.style.display = "none";

        setScreenMode("lobby");
        titleScreen.style.display = "none";
        battleScreen.style.display = "none";
        lobbyScreen.style.display = "flex";
    });

    socket.on("roomDisbanded", () => {
        alert("ルームが解散されました");
        resetToTitle();
    });

    socket.on("roomFull", () => {
        alert("ルームが満員です");
        resetToTitle();
    });

    socket.on("errorMessage", message => {
        alert(message);
    });

    // ===== デッキ確認 (タイマンモード専用) =====
    const deckViewerBtn = document.getElementById("deckViewerBtn");
    const deckViewerOverlay = document.getElementById("deckViewerOverlay");
    const deckViewerCloseBtn = document.getElementById("deckViewerCloseBtn");
    const deckViewerBody = document.getElementById("deckViewerBody");
    const deckViewerCardDetailEl = document.getElementById("deckViewerCardDetail");
    const deckRefillNotification = document.getElementById("deckRefillNotification");

    let deckRefillNotifTimer = null;

    function showDeckRefillNotification(playerName) {
        if (!deckRefillNotification) return;
        deckRefillNotification.textContent = `${playerName} のデッキが補充されました！`;
        deckRefillNotification.style.display = "block";
        deckRefillNotification.style.opacity = "1";
        clearTimeout(deckRefillNotifTimer);
        deckRefillNotifTimer = setTimeout(() => {
            deckRefillNotification.style.opacity = "0";
            setTimeout(() => { deckRefillNotification.style.display = "none"; }, 400);
        }, 2800);
    }

    function dvCardChip(card) {
        if (!card) return "";
        const r = (card.rarity || "C").toLowerCase();
        const name = card.name || "不明";
        const encoded = JSON.stringify({
            name: card.name || "",
            rarity: card.rarity || "C",
            type: card.type || "",
            effect: card.effect || "",
            hateText: card.hateText || ""
        }).replace(/'/g, "&#39;");
        return `<span class="dv-card-chip rarity-${r}" title="${name}" data-dv-card='${encoded}'>${name}</span>`;
    }

    function renderDeckViewerCol(player, isMe) {
        const deck = Array.isArray(player.deck) ? player.deck : [];
        const used = Array.isArray(player.usedCards) ? player.usedCards : [];
        const hand = Array.isArray(player.hand) ? player.hand : [];

        const drawCount = Math.max(0, 4 - hand.length);
        const nextCards = deck.slice(0, drawCount);

        const nextSection = isMe
            ? `<div class="deck-viewer-section deck-viewer-next-card">
                <div class="deck-viewer-section-label">次のドロー (${nextCards.length}枚)</div>
                <div class="deck-viewer-card-list">${nextCards.length === 0 ? '<span class="dv-card-empty">なし</span>' : nextCards.map(dvCardChip).join("")}</div>
               </div>`
            : "";

        const deckHtml = deck.length === 0
            ? `<span class="dv-card-empty">デッキ切れ</span>`
            : deck.map(dvCardChip).join("");

        const usedHtml = used.length === 0
            ? `<span class="dv-card-empty">なし</span>`
            : used.map(dvCardChip).join("");

        const handSection = isMe
            ? `<div class="deck-viewer-section">
                <div class="deck-viewer-section-label">手札 (${hand.length}枚)</div>
                <div class="deck-viewer-card-list">${hand.length === 0 ? '<span class="dv-card-empty">なし</span>' : hand.map(dvCardChip).join("")}</div>
               </div>`
            : "";

        return `
          <div class="deck-viewer-col">
            <div class="deck-viewer-col-title">${player.name}${isMe ? "（自分）" : ""}</div>
            ${nextSection}
            <div class="deck-viewer-section">
              <div class="deck-viewer-section-label">残りデッキ <span class="deck-viewer-count">(${deck.length}枚)</span></div>
              <div class="deck-viewer-card-list">${deckHtml}</div>
            </div>
            ${handSection}
            <div class="deck-viewer-section">
              <div class="deck-viewer-section-label">使用済み <span class="deck-viewer-count">(${used.length}枚)</span></div>
              <div class="deck-viewer-card-list">${usedHtml}</div>
            </div>
          </div>`;
    }

    function openDeckViewer() {
        if (!latestGame || !latestGame.taimanMode) return;
        const players = latestGame.turnOrder;
        const myId = socket.id;
        const me = players.find(p => p.id === myId);
        const opponents = players.filter(p => p.id !== myId);

        let html = "";
        if (me) html += renderDeckViewerCol(me, true);
        opponents.forEach(op => { html += renderDeckViewerCol(op, false); });

        deckViewerBody.innerHTML = html;
        if (deckViewerCardDetailEl) {
            deckViewerCardDetailEl.innerHTML = `<p class="deck-viewer-card-detail-hint">カードをタップすると効果が表示されます</p>`;
        }
        deckViewerOverlay.style.display = "flex";
    }

    if (deckViewerBody) {
        deckViewerBody.addEventListener("click", e => {
            const chip = e.target.closest("[data-dv-card]");
            if (!chip || !deckViewerCardDetailEl) return;
            try {
                const card = JSON.parse(chip.dataset.dvCard);
                deckViewerCardDetailEl.innerHTML = cardDetailHtml(card);
            } catch (_) { }
        });
    }

    if (deckViewerBtn) deckViewerBtn.addEventListener("click", openDeckViewer);
    if (deckViewerCloseBtn) deckViewerCloseBtn.addEventListener("click", () => {
        deckViewerOverlay.style.display = "none";
    });
    if (deckViewerOverlay) deckViewerOverlay.addEventListener("click", e => {
        if (e.target === deckViewerOverlay) deckViewerOverlay.style.display = "none";
    });

    window.addEventListener("resize", () => {
        renderHand();
        updateMobileActionPanel();
    });
};