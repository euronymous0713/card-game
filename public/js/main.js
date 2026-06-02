const socket = io();
window.socket = socket;

window.onload = () => {
    const titleScreen = document.getElementById("titleScreen");
    const lobbyScreen = document.getElementById("lobbyScreen");
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
    const endTurnButton = document.getElementById("endTurnButton");
    const myFieldCards = document.getElementById("myFieldCards");

    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const gameOverText = document.getElementById("gameOverText");
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
        document.body.classList.toggle("battle-active", mode === "battle");
    }

    function saveReconnectInfo(roomId, reconnectToken) {
        if (!roomId || !reconnectToken) return;

        localStorage.setItem(RECONNECT_ROOM_KEY, roomId);
        localStorage.setItem(RECONNECT_TOKEN_KEY, reconnectToken);
    }

    function clearReconnectInfo() {
        localStorage.removeItem(RECONNECT_ROOM_KEY);
        localStorage.removeItem(RECONNECT_TOKEN_KEY);
    }

    function getReconnectInfo() {
        return {
            roomId: localStorage.getItem(RECONNECT_ROOM_KEY) || "",
            reconnectToken: localStorage.getItem(RECONNECT_TOKEN_KEY) || ""
        };
    }

    function attemptReconnect() {
        if (reconnectAttempted || currentRoomId) return;

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
        attemptReconnect();
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

    function isDefeatedViewer() {
        const me = getMeFromLatestGame();

        return Boolean(me && me.defeated);
    }

    function getSelectedSpectatorPlayer(me) {
        if (!latestGame || !me || !me.defeated) return null;

        const candidates = latestGame.turnOrder.filter(player => {
            return player.id !== socket.id && !player.defeated;
        });

        if (candidates.length === 0) return null;

        const selected = candidates.find(player => player.id === selectedTargetId);

        return selected || candidates[0];
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
                <button id="mobileBattleLeaveButton" class="mobile-battle-leave-button" type="button">
                    退出してオワコンになる
                </button>
            </div>
        `;

        mobileSettingsOverlay.classList.add("show-mobile-settings");

        const closeButton = document.getElementById("mobileSettingsCloseButton");
        const leaveButton = document.getElementById("mobileBattleLeaveButton");

        if (closeButton) {
            closeButton.onclick = () => {
                closeMobileSettings();
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
        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");

        startGameButton.style.display = "none";
    });

    socket.on("updateRoom", players => {
        playerList.innerHTML = "";

        const me = players.find(player => player.id === socket.id);

        if (me) {
            isReady = me.ready;
            readyButton.innerText = isReady ? "準備解除" : "準備完了";
            readyButton.classList.toggle("cancel-ready", isReady);
        }

        players.forEach(player => {
            const statusText = player.disconnected
                ? "再接続待ち"
                : player.ready
                    ? "準備完了"
                    : "待機中";

            playerList.innerHTML += `
                <div class="player-card ${player.ready ? "ready" : "not-ready"} ${player.disconnected ? "disconnected-player-card" : ""}">
                    <span class="player-name">${player.host ? "👑 " : ""}${player.name}${disconnectedLabel(player)}</span>
                    <span class="player-status">${statusText}</span>
                </div>
            `;
        });

        const allReady = players.every(player => player.ready && !player.disconnected);
        const canStart = players.length >= 2 && allReady;

        if (isHost) {
            startGameButton.style.display = "block";
            startGameButton.disabled = !canStart;
        } else {
            startGameButton.style.display = "none";
        }
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

    socket.on("updateGame", game => {
        const oldGame = previousGame;

        latestGame = game;
        endTurnRequestPending = false;

        document.body.classList.toggle("spectator-hand-view", isDefeatedViewer());

        if (isDefeatedViewer()) {
            selectedMobileCardInstanceId = "";
            selectedMobileFieldCardKey = "";
            hideMobileEffect();
        }

        updateTrapWaitingNotice();

        if (isMobileLayout() && selectedMobileCardInstanceId && !getSelectedMobileCard()) {
            selectedMobileCardInstanceId = "";
            hideMobileEffect();
            updateMobileActionPanel();
        }

        const enemies = latestGame.turnOrder.filter(player => {
            return player.id !== socket.id && !player.defeated;
        });

        if (!selectedTargetId && enemies.length > 0) {
            selectedTargetId = enemies[0].id;
        }

        if (
            selectedTargetId &&
            !latestGame.turnOrder.some(player => {
                return player.id === selectedTargetId && !player.defeated;
            })
        ) {
            selectedTargetId = enemies[0]?.id || "";
        }

        renderBattlePlayers();
        renderTurn();
        renderPlayedCards();
        renderMyFieldCards();
        renderHand();
        updateMobileActionPanel();

        runAnimations(oldGame, latestGame);

        previousGame = cloneGame(latestGame);

        if (game.gameOver && game.winner) {
            showGameOver(game.winner);
        }
    });

    function renderBattlePlayers() {
        if (!latestGame) return;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);
        const enemies = latestGame.turnOrder.filter(player => player.id !== socket.id);

        if (me) {
            myPanel.classList.toggle("max-hate-player", me.hate >= 3);
            myPanel.classList.toggle("defeated-player", me.defeated);

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

        enemySlots.forEach((slot, index) => {
            const enemy = enemies[index];

            if (enemy) {
                slot.classList.remove("empty-enemy");
                slot.classList.toggle("selected-target", selectedTargetId === enemy.id);
                slot.classList.toggle("max-hate-player", enemy.hate >= 3);
                slot.classList.toggle("defeated-player", enemy.defeated);

                slot.innerHTML = `
                    <div class="enemy-name">${enemy.defeated ? "💀 " : ""}${enemy.hate >= 3 ? "🔥 " : ""}${enemy.name}${disconnectedLabel(enemy)}</div>
                    <div class="follower-line ${enemy.defeated ? "owakon-text" : ""}">
                        ${followerText(enemy)}
                    </div>
                    <div class="panel-hate ${enemy.hate >= 3 ? "max-hate-text" : ""}">
                        ${hateIcons(enemy.hate)}
                    </div>
                    ${statusEffectsHtml(enemy)}
                    <div class="enemy-field-cards">
                        ${enemy.fieldCards.map(() => `<span class="mini-set-card">伏</span>`).join("")}
                    </div>
                `;

                bindStatusEffectEvents(slot);

                slot.onclick = () => {
                    if (enemy.defeated) return;

                    selectedTargetId = enemy.id;

                    renderBattlePlayers();
                    updateMobileActionPanel();
                };
            } else {
                slot.classList.add("empty-enemy");
                slot.classList.remove("selected-target");
                slot.classList.remove("max-hate-player");
                slot.classList.remove("defeated-player");
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

    function renderPlayedCards() {
        if (!latestGame) return;

        playedCardList.innerHTML = "";

        [...latestGame.playedCards].reverse().forEach(card => {
            playedCardList.innerHTML += `
                <div class="played-card">
                    <strong>${card.log || `${card.playerName} → ${card.targetName}`}</strong><br>
                    ${card.hateText || ""}
                    ${playedCardExtraText(card)}
                </div>
            `;
        });
    }

    function renderMyFieldCards() {
        if (!latestGame) return;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);

        myFieldCards.innerHTML = "";

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

    function renderHand() {
        if (!latestGame) return;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);

        handArea.innerHTML = "";

        if (!me) return;

        const spectatorTarget = getSelectedSpectatorPlayer(me);
        const displayHand = me.defeated
            ? (spectatorTarget?.hand || [])
            : me.hand;

        for (let i = 0; i < 4; i++) {
            const card = displayHand[i];
            const cardElement = document.createElement("div");

            if (!card) {
                cardElement.className = `hand-card empty-hand-card ${me.defeated ? "spectator-view-hand-card" : ""}`;
                cardElement.innerHTML = me.defeated
                    ? `
                        <div class="card-name">空</div>
                        <div class="card-type">${spectatorTarget ? `${spectatorTarget.name} の手札` : "観戦中"}</div>
                    `
                    : `
                        <div class="card-name">空</div>
                        <div class="card-type">次の自分のターンで補充</div>
                    `;

                handArea.appendChild(cardElement);
                continue;
            }

            const isSelectedMobileCard = !me.defeated && selectedMobileCardInstanceId === card.instanceId;

            cardElement.className = `hand-card ${rarityClass(card.rarity)} ${isSelectedMobileCard ? "selected-mobile-hand-card" : ""} ${me.defeated ? "spectator-view-hand-card" : ""}`;
            cardElement.draggable = !me.defeated && !isMobileLayout();

            cardElement.innerHTML = me.defeated
                ? `
                    <div class="card-rarity-badge ${rarityClass(card.rarity)}">${normalizeRarity(card.rarity)}</div>
                    <div class="card-name">${card.name}</div>
                    <div class="card-type">${spectatorTarget ? `${spectatorTarget.name} の手札` : "観戦中"}</div>
                    <div class="card-hate">${card.hateText || ""}</div>
                `
                : `
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
                if (me.defeated) {
                    cardDetail.innerHTML = cardDetailHtml(card);
                    return;
                }

                selectMobileCard(card);
            };

            cardElement.ondragstart = () => {
                if (me.defeated || isMobileLayout()) return false;
                draggedCard = card;
            };

            handArea.appendChild(cardElement);
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

    function showGameOver(winner) {
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

        gameOverOverlay.style.display = "flex";

        if (!gameOverSoundPlayed) {
            gameOverSoundPlayed = true;
            playSound(isWinner ? "victory" : "defeat");
        }
    }

    nextButton.onclick = () => {
        socket.emit("returnTitle", currentRoomId);
        resetToTitle();
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
        titleScreen.style.display = "flex";
        gameOverOverlay.style.display = "none";

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    }

    socket.on("gameOver", winner => {
        if (winner) {
            showGameOver(winner);
        }
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

    window.addEventListener("resize", () => {
        renderHand();
        updateMobileActionPanel();
    });
};