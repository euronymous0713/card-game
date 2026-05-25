const socket = io();

const log = document.getElementById("log");

document.getElementById("attack").onclick = () => {
    socket.emit("attack");
};

socket.on("message", (msg) => {
    log.innerHTML += `<p>${msg}</p>`;
});