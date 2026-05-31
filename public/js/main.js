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
    let endTurnRequestPending = false;
    let titleCardList = [];
    let currentCardListRarityFilter = "all";
    let currentCardListKindFilter = "all";
    let currentCardListSearchText = "";

    function setScreenMode(mode) {
        document.body.classList.toggle("title-active", mode === "title");
        document.body.classList.toggle("lobby-active", mode === "lobby");
        document.body.classList.toggle("battle-active", mode === "battle");
    }

    setScreenMode("title");


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

    function renderTitleCardList() {
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

        cardListBody.innerHTML = `
            <div class="card-list-stats">
                ${cardListStatsText()} / 表示:${filteredCards.length}枚 / ${cardListFilterDescription()}
            </div>
            <div class="card-list-grid">
                ${filteredCards.map(card => {
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
        `;
    }

    function openTitleCardList() {
        if (!cardListOverlay) return;

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
        }

        if (!oldGame) return;

        const oldTurnPlayer = oldGame.turnOrder[oldGame.currentTurnIndex];
        const newTurnPlayer = newGame.turnOrder[newGame.currentTurnIndex];

        if (oldTurnPlayer && newTurnPlayer && oldTurnPlayer.id !== newTurnPlayer.id) {
            showTurnAnnouncement(newTurnPlayer.name, newTurnPlayer.id === socket.id);
        }

        newGame.turnOrder.forEach(newPlayer => {
            const oldPlayer = getPlayerFromGame(oldGame, newPlayer.id);

            if (!oldPlayer) return;

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

    mobileHistoryButton.onclick = () => {
        toggleMobileHistory();
    };

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

        socket.emit("playCard", {
            roomId: currentRoomId,
            cardInstanceId: card.instanceId,
            targetId
        });

        selectedMobileCardInstanceId = "";
        selectedMobileFieldCardKey = "";
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

        socket.emit("discardCard", {
            roomId: currentRoomId,
            cardInstanceId: card.instanceId
        });

        selectedMobileCardInstanceId = "";
        selectedMobileFieldCardKey = "";
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

            renderTitleCardList();
        };
    });

    if (cardListSearchInput) {
        cardListSearchInput.oninput = () => {
            currentCardListSearchText = cardListSearchInput.value.trim();
            renderTitleCardList();
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
            playerList.innerHTML += `
                <div class="player-card ${player.ready ? "ready" : "not-ready"}">
                    <span class="player-name">${player.host ? "👑 " : ""}${player.name}</span>
                    <span class="player-status">${player.ready ? "準備完了" : "待機中"}</span>
                </div>
            `;
        });

        const allReady = players.every(player => player.ready);
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
        setScreenMode("battle");
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "block";
        gameOverOverlay.style.display = "none";
        previousGame = null;
    });

    socket.on("chooseTrap", data => {
        showTrapWaitingNotice("罠カードを選択してください");
        showTrapChoiceModal(data);
    });

    socket.on("updateGame", game => {
        const oldGame = previousGame;

        latestGame = game;
        endTurnRequestPending = false;

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
                <div class="my-name">${me.defeated ? "💀 " : ""}${me.hate >= 3 ? "🔥 " : ""}${me.name}</div>
                <div class="follower-line ${me.defeated ? "owakon-text" : ""}">
                    ${followerText(me)}
                </div>
                <div class="panel-hate ${me.hate >= 3 ? "max-hate-text" : ""}">
                    ${hateIcons(me.hate)}
                </div>
            `;
        }

        enemySlots.forEach((slot, index) => {
            const enemy = enemies[index];

            if (enemy) {
                slot.classList.remove("empty-enemy");
                slot.classList.toggle("selected-target", selectedTargetId === enemy.id);
                slot.classList.toggle("max-hate-player", enemy.hate >= 3);
                slot.classList.toggle("defeated-player", enemy.defeated);

                slot.innerHTML = `
                    <div class="enemy-name">${enemy.defeated ? "💀 " : ""}${enemy.hate >= 3 ? "🔥 " : ""}${enemy.name}</div>
                    <div class="follower-line ${enemy.defeated ? "owakon-text" : ""}">
                        ${followerText(enemy)}
                    </div>
                    <div class="panel-hate ${enemy.hate >= 3 ? "max-hate-text" : ""}">
                        ${hateIcons(enemy.hate)}
                    </div>
                    <div class="enemy-field-cards">
                        ${enemy.fieldCards.map(() => `<span class="mini-set-card">伏</span>`).join("")}
                    </div>
                `;

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

        for (let i = 0; i < 4; i++) {
            const card = me.hand[i];

            const cardElement = document.createElement("div");

            if (!card) {
                cardElement.className = "hand-card empty-hand-card";
                cardElement.innerHTML = `
                    <div class="card-name">空</div>
                    <div class="card-type">次の自分のターンで補充</div>
                `;

                handArea.appendChild(cardElement);

                continue;
            }

            const isSelectedMobileCard = selectedMobileCardInstanceId === card.instanceId;

            cardElement.className = `hand-card ${rarityClass(card.rarity)} ${isSelectedMobileCard ? "selected-mobile-hand-card" : ""}`;
            cardElement.draggable = !isMobileLayout();

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
                selectMobileCard(card);
            };

            cardElement.ondragstart = () => {
                if (isMobileLayout()) return false;
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

        socket.emit("endTurn", {
            roomId: currentRoomId,
            turnIndex: latestGame.currentTurnIndex,
            playerId: socket.id
        });
    };

    function showGameOver(winner) {
        const isWinner = winner.id === socket.id;

        gameOverText.innerText = isWinner
            ? "勝利！最後まで生き残った"
            : `${winner.name} の勝利`;

        gameOverOverlay.style.display = "flex";
    }

    nextButton.onclick = () => {
        socket.emit("returnTitle", currentRoomId);
        resetToTitle();
    };

    function resetToTitle() {
        currentRoomId = "";
        isHost = false;
        isReady = false;
        latestGame = null;
        previousGame = null;
        selectedTargetId = "";
        selectedMobileCardInstanceId = "";
        draggedCard = null;
        document.body.classList.remove("mobile-card-action-open");
        closeMobileHistory();
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