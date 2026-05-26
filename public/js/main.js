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
    const turnPanel = document.getElementById("turnPanel");
    const battleMessage = document.getElementById("battleMessage");
    const playedCardList = document.getElementById("playedCardList");
    const endTurnButton = document.getElementById("endTurnButton");
    const targetList = document.getElementById("targetList");
    const hateList = document.getElementById("hateList");

    const enemySlots = [
        document.getElementById("enemySlot1"),
        document.getElementById("enemySlot2"),
        document.getElementById("enemySlot3")
    ];

    const myPanel = document.getElementById("myPanel");

    let currentRoomId = "";
    let isHost = false;
    let isReady = false;
    let latestPlayers = [];
    let latestGame = null;
    let draggedCard = null;
    let selectedTargetId = "";

    const dummyCards = [
        {
            id: "card-1",
            name: "炎上パンチ",
            type: "攻撃",
            targetType: "enemy",
            hateTarget: "self",
            hateChange: 1,
            hateText: "自分のヘイト +1",
            effect: "相手に2,000フォロワーダメージ予定。派手に燃えるので自分のヘイトが1上がる。"
        },
        {
            id: "card-2",
            name: "お気持ち表明",
            type: "防御",
            targetType: "self",
            hateTarget: "self",
            hateChange: -1,
            hateText: "自分のヘイト -1",
            effect: "次に受けるダメージを軽減予定。長文で沈静化し、自分のヘイトが1下がる。"
        },
        {
            id: "card-3",
            name: "釣りスレ",
            type: "罠",
            targetType: "enemy",
            hateTarget: "target",
            hateChange: 1,
            hateText: "対象のヘイト +1",
            effect: "相手を釣る罠カード予定。対象のヘイトを1上げる。"
        },
        {
            id: "card-4",
            name: "古参アピール",
            type: "補助",
            targetType: "self",
            hateTarget: "self",
            hateChange: -1,
            hateText: "自分のヘイト -1",
            effect: "自分を回復予定。『昔はよかった』で自分のヘイトが1下がる。"
        }
    ];

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
        latestPlayers = players;
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

        currentRoomId = "";
        isHost = false;
        isReady = false;

        lobbyScreen.style.display = "none";
        battleScreen.style.display = "none";
        titleScreen.style.display = "flex";

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    };

    startGameButton.onclick = () => {
        socket.emit("startGame", currentRoomId);
    };

    socket.on("gameStarted", () => {
        titleScreen.style.display = "none";
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "block";
        renderHand();
    });

    socket.on("updateGame", (game) => {
        latestGame = game;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);
        const enemies = latestGame.turnOrder.filter(player => player.id !== socket.id);

        if (!selectedTargetId && enemies.length > 0) {
            selectedTargetId = enemies[0].id;
        }

        if (selectedTargetId && !latestGame.turnOrder.some(p => p.id === selectedTargetId)) {
            selectedTargetId = enemies[0]?.id || "";
        }

        renderBattlePlayers();
        renderTargetList();
        renderHateList();
        renderTurn();
        renderPlayedCards();
    });

    function renderBattlePlayers() {
        if (!latestGame) return;

        const me = latestGame.turnOrder.find(player => player.id === socket.id);
        const enemies = latestGame.turnOrder.filter(player => player.id !== socket.id);

        if (me) {
            myPanel.innerHTML = `
                <div class="my-name">${me.name}</div>
                <div><span>${me.followers.toLocaleString()}</span> フォロワー</div>
            `;
        }

        enemySlots.forEach((slot, index) => {
            const enemy = enemies[index];

            if (enemy) {
                slot.classList.remove("empty-enemy");
                slot.classList.toggle("selected-target", selectedTargetId === enemy.id);

                slot.innerHTML = `
                    <div class="enemy-name">${enemy.name}</div>
                    <div><span>${enemy.followers.toLocaleString()}</span> フォロワー</div>
                `;

                slot.onclick = () => {
                    selectedTargetId = enemy.id;
                    renderBattlePlayers();
                    renderTargetList();
                };
            } else {
                slot.classList.add("empty-enemy");
                slot.classList.remove("selected-target");
                slot.onclick = null;

                slot.innerHTML = `
                    <div class="enemy-name">空席</div>
                    <div><span>-</span> フォロワー</div>
                `;
            }
        });
    }

    function renderTargetList() {
        if (!latestGame) return;

        const enemies = latestGame.turnOrder.filter(player => player.id !== socket.id);

        targetList.innerHTML = "";

        enemies.forEach(enemy => {
            const button = document.createElement("button");

            button.className = "target-button";
            button.innerText = enemy.name;

            if (selectedTargetId === enemy.id) {
                button.classList.add("selected-target-button");
            }

            button.onclick = () => {
                selectedTargetId = enemy.id;
                renderBattlePlayers();
                renderTargetList();
            };

            targetList.appendChild(button);
        });
    }

    function renderHateList() {
        if (!latestGame) return;

        hateList.innerHTML = "";

        latestGame.turnOrder.forEach(player => {
            const hateIcons = "◆".repeat(player.hate) + "◇".repeat(3 - player.hate);

            hateList.innerHTML += `
                <div class="hate-row">
                    <span>${player.name}</span>
                    <strong>${hateIcons}</strong>
                </div>
            `;
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
        endTurnButton.disabled = !isMyTurn;
    }

    function renderPlayedCards() {
        if (!latestGame) return;

        playedCardList.innerHTML = "";

        latestGame.playedCards.slice(-5).forEach(card => {
            playedCardList.innerHTML += `
                <div class="played-card">
                    <strong>${card.playerName}</strong> → ${card.targetName}<br>
                    ${card.cardName} / ${card.hateText}
                </div>
            `;
        });
    }

    function renderHand() {
        handArea.innerHTML = "";

        dummyCards.forEach(card => {
            const cardElement = document.createElement("div");

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
                cardDetail.innerHTML = `
                    <h3>カード効果</h3>
                    <p>カードにカーソルを合わせると効果が表示されます。</p>
                `;
            };

            cardElement.ondragstart = () => {
                draggedCard = card;
            };

            handArea.appendChild(cardElement);
        });
    }

    dropZone.ondragover = (event) => {
        event.preventDefault();
    };

    dropZone.ondrop = (event) => {
        event.preventDefault();

        if (!latestGame) return;

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
            card: draggedCard,
            targetId
        });

        draggedCard = null;
    };

    endTurnButton.onclick = () => {
        socket.emit("endTurn", currentRoomId);
    };

    socket.on("roomDisbanded", () => {
        alert("ルームが解散されました");

        currentRoomId = "";
        isHost = false;
        isReady = false;

        lobbyScreen.style.display = "none";
        battleScreen.style.display = "none";
        titleScreen.style.display = "flex";

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    });

    socket.on("roomFull", () => {
        alert("ルームが満員です");
        titleScreen.style.display = "flex";
        lobbyScreen.style.display = "none";
        battleScreen.style.display = "none";
    });

    socket.on("errorMessage", (message) => {
        alert(message);
    });
};