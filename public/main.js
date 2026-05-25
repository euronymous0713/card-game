const socket = io();

function hideAll() {
    document.getElementById("titleScreen").classList.add("hidden");
    document.getElementById("createRoomScreen").classList.add("hidden");
    document.getElementById("joinRoomScreen").classList.add("hidden");
    document.getElementById("roomScreen").classList.add("hidden");
}

function showCreateRoom() {
    hideAll();
    document.getElementById("createRoomScreen").classList.remove("hidden");
}

function showJoinRoom() {
    hideAll();
    document.getElementById("joinRoomScreen").classList.remove("hidden");
}

function backToTitle() {
    hideAll();
    document.getElementById("titleScreen").classList.remove("hidden");
}

function createRoom() {

    const name =
        document.getElementById("playerName").value;

    const roomCode =
        Math.random().toString(36).substring(2, 6);

    socket.emit("createRoom", {
        roomCode,
        name
    });
}

function joinRoom() {

    const name =
        document.getElementById("joinName").value;

    const roomCode =
        document.getElementById("roomCode").value;

    socket.emit("joinRoom", {
        roomCode,
        name
    });
}

socket.on("roomJoined", (room) => {

    hideAll();

    document.getElementById("roomScreen")
        .classList.remove("hidden");

    document.getElementById("roomInfo")
        .innerText =
        "ルームコード: " + room.roomCode;

    const playerList =
        document.getElementById("playerList");

    playerList.innerHTML = "";

    room.players.forEach(player => {

        const div = document.createElement("div");

        div.innerText = player.name;

        playerList.appendChild(div);

    });

});