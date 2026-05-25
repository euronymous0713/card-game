const socket = io();

window.onload = () => {

    // =========================
    // 要素取得
    // =========================

    const titleScreen =
        document.getElementById("titleScreen");

    const lobbyScreen =
        document.getElementById("lobbyScreen");

    const createRoomButton =
        document.getElementById("createRoomButton");

    const joinRoomButton =
        document.getElementById("joinRoomButton");

    const readyButton =
        document.getElementById("readyButton");

    const leaveRoomButton =
        document.getElementById("leaveRoomButton");

    const startGameButton =
        document.getElementById("startGameButton");

    const roomIdText =
        document.getElementById("roomIdText");

    const playerList =
        document.getElementById("playerList");

    const nameInput =
        document.getElementById("nameInput");

    // =========================
    // 状態
    // =========================

    let currentRoomId = "";
    let isRoomOwner = false;
    let isReady = false;

    // 名前保持
    const savedName =
        localStorage.getItem("playerName");

    if (savedName) {
        nameInput.value = savedName;
    }

    // =========================
    // ルーム作成
    // =========================

    createRoomButton.onclick = () => {

        const playerName =
            nameInput.value.trim();

        if (!playerName) {
            alert("名前を入力してください");
            return;
        }

        localStorage.setItem(
            "playerName",
            playerName
        );

        socket.emit(
            "createRoom",
            playerName
        );

    };

    // =========================
    // ルーム参加
    // =========================

    joinRoomButton.onclick = () => {

        const playerName =
            nameInput.value.trim();

        if (!playerName) {
            alert("名前を入力してください");
            return;
        }

        const roomId =
            prompt("ルームIDを入力してください");

        if (!roomId) return;

        localStorage.setItem(
            "playerName",
            playerName
        );

        socket.emit("joinRoom", {
            roomId,
            playerName
        });

    };

    // =========================
    // ルーム作成成功
    // =========================

    socket.on("roomCreated", (roomId) => {

        currentRoomId = roomId;

        isRoomOwner = true;

        titleScreen.style.display = "none";
        lobbyScreen.style.display = "flex";

        roomIdText.innerText =
            `ルームID : ${roomId}`;

        leaveRoomButton.innerText =
            "ルーム解散";

        startGameButton.style.display =
            "block";

    });

    // =========================
    // ルーム参加成功
    // =========================

    socket.on("joinSuccess", (roomId) => {

        currentRoomId = roomId;

        isRoomOwner = false;

        titleScreen.style.display = "none";
        lobbyScreen.style.display = "flex";

        roomIdText.innerText =
            `ルームID : ${roomId}`;

        leaveRoomButton.innerText =
            "退出";

        startGameButton.style.display =
            "none";

    });

    // =========================
    // プレイヤー更新
    // =========================

    socket.on("updateRoom", (players) => {

        playerList.innerHTML = "";

        let allReady = true;

        // 自分の状態取得
        const me = players.find(
            p => p.id === socket.id
        );

        if (me) {

            isReady = me.ready;

            // ボタン見た目同期
            if (isReady) {

                readyButton.innerText =
                    "準備解除";

                readyButton.classList.add(
                    "cancel-ready"
                );

            } else {

                readyButton.innerText =
                    "準備完了";

                readyButton.classList.remove(
                    "cancel-ready"
                );

            }

        }

        players.forEach(player => {

            if (!player.ready) {
                allReady = false;
            }

            playerList.innerHTML += `

            <div class="
                player-card
                ${player.ready
                    ? "ready"
                    : "not-ready"}
            ">

                <span class="player-name">
                    ${player.name}
                </span>

                <span class="player-status">
                    ${player.ready
                    ? "準備完了"
                    : "待機中"}
                </span>

            </div>

        `;

        });

        // 開始ボタン制御
        if (isRoomOwner &&
            players.length >= 2) {

            startGameButton.disabled =
                !allReady;

        }

    });

    // =========================
    // 準備ボタン
    // =========================

    readyButton.onclick = () => {

        isReady = !isReady;

        socket.on("toggleReady", ({ roomId, ready }) => {

            const room = rooms[roomId];

            if (!room) return;

            const player = room.find(
                p => p.id === socket.id
            );

            if (!player) return;

            player.ready = ready;

            io.to(roomId).emit(
                "updateRoom",
                room
            );

        });

        // 文言変更
        if (isReady) {

            readyButton.innerText =
                "準備解除";

            readyButton.classList.add(
                "cancel-ready"
            );

        } else {

            readyButton.innerText =
                "準備完了";

            readyButton.classList.remove(
                "cancel-ready"
            );

        }

    };

    // =========================
    // 退出
    // =========================

    leaveRoomButton.onclick = () => {

        socket.emit(
            "leaveRoom",
            currentRoomId
        );

        titleScreen.style.display =
            "flex";

        lobbyScreen.style.display =
            "none";

        isReady = false;

        readyButton.innerText =
            "準備完了";

        readyButton.classList.remove(
            "cancel-ready"
        );

    };

    // =========================
    // ルーム解散
    // =========================

    socket.on("roomDisbanded", () => {

        alert(
            "ルームが解散されました"
        );

        titleScreen.style.display =
            "flex";

        lobbyScreen.style.display =
            "none";

        isReady = false;

        readyButton.innerText =
            "準備完了";

        readyButton.classList.remove(
            "cancel-ready"
        );

    });

    // =========================
    // ゲーム開始
    // =========================

    startGameButton.onclick = () => {

        alert("ゲーム開始！");

    };

    // =========================
    // エラー
    // =========================

    socket.on(
        "errorMessage",
        (message) => {

            alert(message);

        }
    );

};