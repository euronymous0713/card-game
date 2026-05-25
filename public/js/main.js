const socket = io();

const createRoomButton =
    document.getElementById("createRoomButton");

const joinRoomButton =
    document.getElementById("joinRoomButton");

const roomInput =
    document.getElementById("roomInput");

const roomInfo =
    document.getElementById("roomInfo");

const playerList =
    document.getElementById("playerList");

// ルーム作成
createRoomButton.onclick = () => {

    socket.emit("createRoom");
};

// ルーム参加
joinRoomButton.onclick = () => {

    const roomId = roomInput.value;

    socket.emit("joinRoom", roomId);
};

// 作成成功
socket.on("roomCreated", (roomId) => {

    roomInfo.innerHTML =
        `ルーム番号: ${roomId}`;
});

// エラー
socket.on("joinError", (message) => {

    alert(message);
});

// プレイヤー更新
socket.on("updatePlayers", (players) => {

    playerList.innerHTML = `
        参加人数: ${players.length}/4
    `;
});