const socket = io();

window.onload = () => {

    // =========================
    // 要素取得
    // =========================

    const titleScreen = document.getElementById("titleScreen");
    const lobbyScreen = document.getElementById("lobbyScreen");

    const createRoomButton = document.getElementById("createRoomButton");
    const joinRoomButton = document.getElementById("joinRoomButton");

    const readyButton = document.getElementById("readyButton");
    const leaveRoomButton = document.getElementById("leaveRoomButton");
    const startButton = document.getElementById("startButton");

    const roomIdText = document.getElementById("roomIdText");
    const playerList = document.getElementById("playerList");

    const nameInput = document.getElementById("nameInput");

    let currentRoomId = "";
    let isHost = false;

    // =========================
    // ルーム作成
    // =========================

    createRoomButton.onclick = () => {

        const playerName = nameInput.value.trim();

        if (playerName === "") {
            alert("名前を入力してください");
            return;
        }

        socket.emit("createRoom", playerName);

    };

    // =========================
    // ルーム参加
    // =========================

    joinRoomButton.onclick = () => {

        const playerName = nameInput.value.trim();

        if (playerName === "") {
            alert("名前を入力してください");
            return;
        }

        const roomId = prompt("ルームIDを入力してください");

        if (!roomId) return;

        socket.emit("joinRoom", {
            roomId,
            playerName
        });

    };

    // =========================
    // 退出
    // =========================

    leaveRoomButton.onclick = () => {

        socket.emit("leaveRoom", currentRoomId);

        // タイトルへ戻る
        lobbyScreen.style.display = "none";
        titleScreen.style.display = "block";

        // 名前保持される
    };

    // =========================
    // 準備完了
    // =========================

    readyButton.onclick = () => {

        socket.emit("playerReady", currentRoomId);

    };

    // =========================
    // ゲーム開始
    // =========================

    startButton.onclick = () => {

        socket.emit("startGame", currentRoomId);

    };

    // =========================
    // ルーム作成成功
    // =========================

    socket.on("roomCreated", (roomId) => {

        currentRoomId = roomId;
        isHost = true;

        titleScreen.style.display = "none";
        lobbyScreen.style.display = "block";

        roomIdText.innerHTML = `
            ルームID : ${roomId}
        `;

    });

    // =========================
    // 参加成功
    // =========================

    socket.on("joinSuccess", (roomId) => {

        currentRoomId = roomId;

        titleScreen.style.display = "none";
        lobbyScreen.style.display = "block";

        roomIdText.innerHTML = `
            参加ルーム : ${roomId}
        `;

    });

    // =========================
    // プレイヤー更新
    // =========================

    socket.on("updateRoom", (players) => {

        playerList.innerHTML = "";

        let allReady = true;

        players.forEach(player => {

            if (!player.ready) {
                allReady = false;
            }

            playerList.innerHTML += `
                <div class="player-card">

                    ${player.name}

                    ${player.ready
                    ? "<span class='ready-text'>準備完了</span>"
                    : "<span class='not-ready-text'>待機中</span>"
                }

                </div>
            `;

        });

        // ホストのみゲーム開始表示
        if (isHost && players.length >= 2 && allReady) {

            startButton.style.display = "block";

        } else {

            startButton.style.display = "none";

        }

    });

    // =========================
    // ゲーム開始
    // =========================

    socket.on("gameStarted", () => {

        alert("ゲーム開始！");

    });

    // =========================
    // エラー
    // =========================

    socket.on("errorMessage", (message) => {

        alert(message);

    });

};