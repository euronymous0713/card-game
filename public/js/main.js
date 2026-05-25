const socket = io();

window.onload = () => {

    // =========================
    // 要素取得
    // =========================

    const titleScreen = document.getElementById("titleScreen");
    const lobbyScreen = document.getElementById("lobbyScreen");

    const createRoomButton = document.getElementById("createRoomButton");
    const joinRoomButton = document.getElementById("joinRoomButton");

    const roomIdText = document.getElementById("roomIdText");
    const playerList = document.getElementById("playerList");

    const nameInput = document.getElementById("nameInput");

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
    // ルーム作成成功
    // =========================

    socket.on("roomCreated", (roomId) => {

        // タイトル画面を消す
        titleScreen.style.display = "none";

        // ロビー画面表示
        lobbyScreen.style.display = "block";

        roomIdText.innerHTML = `
            ルームID : ${roomId}
        `;

    });

    // =========================
    // 参加成功
    // =========================

    socket.on("joinSuccess", (roomId) => {

        titleScreen.style.display = "none";

        lobbyScreen.style.display = "block";

        roomIdText.innerHTML = `
            参加ルーム : ${roomId}
        `;

    });

    // =========================
    // プレイヤー一覧更新
    // =========================

    socket.on("updateRoom", (players) => {

        playerList.innerHTML = "";

        players.forEach(player => {

            playerList.innerHTML += `
                <div class="player-card">
                    ${player.name}
                </div>
            `;

        });

    });

    // =========================
    // エラー
    // =========================

    socket.on("errorMessage", (message) => {

        alert(message);

    });

};