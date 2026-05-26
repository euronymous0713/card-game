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

    const dummyCards = [
        {
            name: "炎上パンチ",
            type: "攻撃",
            effect: "相手に2,000フォロワーダメージ。ネット民の怒りを叩きつける。"
        },
        {
            name: "お気持ち表明",
            type: "防御",
            effect: "次に受けるダメージを1,500軽減する。長文で場を制圧する。"
        },
        {
            name: "釣りスレ",
            type: "罠",
            effect: "相手が攻撃した時、1,000フォロワーダメージを返す。"
        },
        {
            name: "古参アピール",
            type: "補助",
            effect: "自分のフォロワーを1,000回復する。『昔はよかった』を発動。"
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

            if (isReady) {
                readyButton.classList.add("cancel-ready");
            } else {
                readyButton.classList.remove("cancel-ready");
            }
        }

        players.forEach(player => {
            playerList.innerHTML += `
                <div class="player-card ${player.ready ? "ready" : "not-ready"}">
                    <span class="player-name">
                        ${player.host ? "👑 " : ""}${player.name}
                    </span>

                    <span class="player-status">
                        ${player.ready ? "準備完了" : "待機中"}
                    </span>
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

        renderBattlePlayers();
        renderHand();
    });

    function renderBattlePlayers() {
        const me = latestPlayers.find(player => player.id === socket.id);
        const enemies = latestPlayers.filter(player => player.id !== socket.id);

        if (me) {
            myPanel.innerHTML = `
                <div class="my-name">${me.name}</div>
                <div><span>10,000</span> フォロワー</div>
            `;
        }

        enemySlots.forEach((slot, index) => {
            const enemy = enemies[index];

            if (enemy) {
                slot.classList.remove("empty-enemy");

                slot.innerHTML = `
                    <div class="enemy-name">${enemy.name}</div>
                    <div><span>10,000</span> フォロワー</div>
                `;
            } else {
                slot.classList.add("empty-enemy");

                slot.innerHTML = `
                    <div class="enemy-name">空席</div>
                    <div><span>-</span> フォロワー</div>
                `;
            }
        });
    }

    function renderHand() {
        handArea.innerHTML = "";

        dummyCards.forEach(card => {
            const cardElement = document.createElement("div");

            cardElement.className = "hand-card";

            cardElement.innerHTML = `
                <div class="card-name">${card.name}</div>
                <div class="card-type">${card.type}</div>
            `;

            cardElement.onmouseenter = () => {
                cardDetail.innerHTML = `
                    <h3>${card.name}</h3>
                    <p class="detail-type">${card.type}</p>
                    <p>${card.effect}</p>
                `;
            };

            cardElement.onmouseleave = () => {
                cardDetail.innerHTML = `
                    <h3>カード効果</h3>
                    <p>カードにカーソルを合わせると効果が表示されます。</p>
                `;
            };

            handArea.appendChild(cardElement);
        });
    }

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