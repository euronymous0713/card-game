const socket = io();

window.onload = () => {
    const titleScreen = document.getElementById("titleScreen");
    const lobbyScreen = document.getElementById("lobbyScreen");

    const createRoomButton = document.getElementById("createRoomButton");
    const joinRoomButton = document.getElementById("joinRoomButton");
    const readyButton = document.getElementById("readyButton");
    const leaveRoomButton = document.getElementById("leaveRoomButton");
    const startGameButton = document.getElementById("startGameButton");

    const roomIdText = document.getElementById("roomIdText");
    const playerList = document.getElementById("playerList");
    const nameInput = document.getElementById("nameInput");

    let currentRoomId = "";
    let isHost = false;
    let isReady = false;

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

            readyButton.innerText = isReady
                ? "準備解除"
                : "準備完了";

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
        titleScreen.style.display = "flex";

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    };

    startGameButton.onclick = () => {
        socket.emit("startGame", currentRoomId);
    };

    socket.on("gameStarted", () => {
        lobbyScreen.style.display = "none";

        let gameScreen = document.getElementById("gameScreen");

        if (!gameScreen) {
            gameScreen = document.createElement("div");
            gameScreen.id = "gameScreen";
            gameScreen.innerHTML = `
                <h1 class="game-title">バトル開始</h1>
                <p class="subtitle">カードゲーム画面をここから作成します</p>
            `;
            document.body.appendChild(gameScreen);
        }

        gameScreen.style.display = "flex";
    });

    socket.on("roomDisbanded", () => {
        alert("ルームが解散されました");

        currentRoomId = "";
        isHost = false;
        isReady = false;

        lobbyScreen.style.display = "none";
        titleScreen.style.display = "flex";

        readyButton.innerText = "準備完了";
        readyButton.classList.remove("cancel-ready");
    });

    socket.on("roomFull", () => {
        alert("ルームが満員です");
        titleScreen.style.display = "flex";
        lobbyScreen.style.display = "none";
    });

    socket.on("errorMessage", (message) => {
        alert(message);
    });
};