const socket = io();

window.onload = () => {
    const titleScreen = document.getElementById("titleScreen");
    const lobbyScreen = document.getElementById("lobbyScreen");
    const battleScreen = document.getElementById("battleScreen");

    const createRoomButton = document.getElementById("createRoomButton");
    const joinRoomButton = document.getElementById("joinRoomButton");
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
    const endTurnButton = document.getElementById("endTurnButton");
    const myFieldCards = document.getElementById("myFieldCards");

    const gameOverOverlay = document.getElementById("gameOverOverlay");
    const gameOverText = document.getElementById("gameOverText");
    const nextButton = document.getElementById("nextButton");

    const enemySlots = [
        document.getElementById("enemySlot1"),
        document.getElementById("enemySlot2"),
        document.getElementById("enemySlot3")
    ];

    const myPanel = document.getElementById("myPanel");

    let currentRoomId = "";
    let isHost = false;
    let isReady = false;
    let latestGame = null;
    let draggedCard = null;
    let selectedTargetId = "";

    function hateIcons(hate) {
        return "◆".repeat(hate) + "◇".repeat(3 - hate);
    }

    function followerText(player) {
        return player.defeated
            ? "オワコン"
            : `${player.followers.toLocaleString()} フォロワー`;
    }

    function resetCardDetail() {
        cardDetail.innerHTML = `
            <h3>カード効果</h3>
            <p>カードにカーソルを合わせると効果が表示されます。</p>
        `;
    }

    const savedName = localStorage.getItem("playerName");
    if (savedName) nameInput.value = savedName;

    createRoomButton.onclick = () => {
        const playerName = nameInput.value.trim();
        if (!playerName) return alert("名前を入力してください");

        localStorage.setItem("playerName", playerName);
        socket.emit("createRoom", playerName);
    };

    joinRoomButton.onclick = () => {
        const playerName = nameInput.value.trim();
        if (!playerName) return alert("名前を入力してください");

        const roomId = prompt("ルームIDを入力してください");
        if (!roomId) return;

        localStorage.setItem("playerName", playerName);

        socket.emit("joinRoom", {
            roomId,
            playerName
        });
    };

    socket.on("roomCreated", (roomId) => {
        currentRoomId = roomId;
        isHost = true;
        isReady = false;

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

    socket.on("joinSuccess", (roomId) => {
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

    socket.on("updateRoom", (players) => {
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
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "block";
        gameOverOverlay.style.display = "none";
    });

    socket.on("updateGame", (game) => {
        latestGame = game;

        const enemies = latestGame.turnOrder.filter(player => {
            return player.id !== socket.id && !player.defeated;
        });

        if (!selectedTargetId && enemies.length > 0) {
            selectedTargetId = enemies[0].id;
        }

        if (selectedTargetId && !latestGame.turnOrder.some(player => player.id === selectedTargetId && !player.defeated)) {
            selectedTargetId = enemies[0]?.id || "";
        }

        renderBattlePlayers();
        renderTurn();
        renderPlayedCards();
        renderMyFieldCards();
        renderHand();

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
        endTurnButton.disabled = !isMyTurn;
    }

    function renderPlayedCards() {
        if (!latestGame) return;

        playedCardList.innerHTML = "";

        [...latestGame.playedCards].reverse().forEach(card => {
            playedCardList.innerHTML += `
                <div class="played-card">
                    <strong>${card.log || `${card.playerName} → ${card.targetName}`}</strong><br>
                    ${card.hateText}
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

            if (card) {
                setCard.onmouseenter = () => {
                    cardDetail.innerHTML = `
                        <h3>${card.name}</h3>
                        <p class="detail-type">${card.type}</p>
                        <p>${card.effect}</p>
                        <p class="detail-hate">${card.hateText || ""}</p>
                    `;
                };

                setCard.onmouseleave = () => {
                    resetCardDetail();
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

            cardElement.className = "hand-card";
            cardElement.draggable = true;

            cardElement.innerHTML = `
                <div class="card-name">${card.name}</div>
                <div class="card-type">${card.type}</div>
                <div class="card-hate">${card.hateText}</div>
            `;

            cardElement.onmouseenter = () => {
                cardDetail.innerHTML = `
                    <h3>${card.name}</h3>
                    <p class="detail-type">${card.type}</p>
                    <p>${card.effect}</p>
                    <p class="detail-hate">${card.hateText}</p>
                `;
            };

            cardElement.onmouseleave = () => {
                resetCardDetail();
            };

            cardElement.ondragstart = () => {
                draggedCard = card;
            };

            handArea.appendChild(cardElement);
        }
    }

    dropZone.ondragover = (event) => {
        event.preventDefault();
    };

    dropZone.ondrop = (event) => {
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

    discardZone.ondragover = (event) => {
        event.preventDefault();
    };

    discardZone.ondrop = (event) => {
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
        socket.emit("endTurn", currentRoomId);
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
        selectedTargetId = "";
        draggedCard = null;

        lobbyScreen.style.display = "none";
        battleScreen.style.display = "none";
        titleScreen.style.display = "flex";
        gameOverOverlay.style.display = "none";

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    }

    socket.on("gameOver", (winner) => {
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

    socket.on("errorMessage", (message) => {
        alert(message);
    });
};