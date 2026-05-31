(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("dev") !== "1") {
        return;
    }

    let cardList = [];
    let gameState = null;

    const panel = document.createElement("div");

    panel.id = "devPanel";

    panel.innerHTML = `
        <div class="dev-header">
            <strong>DEV MODE</strong>
            <button id="devToggleButton">閉じる</button>
        </div>

        <div id="devBody">
            <label>対象プレイヤー</label>
            <select id="devPlayerSelect"></select>

            <label>フォロワー</label>
            <div class="dev-row">
                <input type="number" id="devFollowersInput" min="0" max="99999" value="10000">
                <button id="devSetFollowersButton">変更</button>
            </div>

            <label>ヘイト</label>
            <div class="dev-row">
                <input type="number" id="devHateInput" min="0" max="3" value="0">
                <button id="devSetHateButton">変更</button>
            </div>

            <label>追加カード</label>
            <select id="devCardSelect"></select>

            <button id="devAddCardButton">手札に追加</button>
            <button id="devDrawFullButton">手札を4枚まで補充</button>
            <button id="devClearHandButton">手札を空にする</button>
            <button id="devClearTrapsButton">伏せカード全削除</button>

            <p class="dev-note">
                URLに ?dev=1 がある時だけ表示されます。
            </p>
        </div>
    `;

    document.body.appendChild(panel);

    const style = document.createElement("style");

    style.innerHTML = `
        #devPanel {
            position: fixed;
            top: 12px;
            right: 12px;
            width: 280px;
            z-index: 9999;
            padding: 12px;
            border-radius: 14px;
            background: rgba(0, 0, 0, 0.88);
            border: 2px solid rgba(255, 176, 0, 0.8);
            box-shadow: 0 0 24px rgba(255, 176, 0, 0.35);
            color: white;
            font-family: "Segoe UI", sans-serif;
        }

        .dev-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #ffb000;
            margin-bottom: 10px;
        }

        #devToggleButton {
            padding: 6px 10px;
            font-size: 12px;
            border-radius: 8px;
            background: #333;
        }

        #devBody {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        #devPanel label {
            font-size: 12px;
            color: rgba(255,255,255,0.75);
        }

        #devPanel select,
        #devPanel input {
            width: 100%;
            padding: 8px;
            border-radius: 8px;
            border: none;
            outline: none;
            background: rgba(255,255,255,0.12);
            color: white;
        }

        #devPanel option {
            color: black;
        }

        .dev-row {
            display: flex;
            gap: 6px;
        }

        .dev-row input {
            flex: 1;
        }

        #devPanel button {
            padding: 8px 10px;
            font-size: 13px;
            border-radius: 8px;
        }

        .dev-note {
            margin-top: 6px;
            font-size: 11px;
            line-height: 1.5;
            color: rgba(255,255,255,0.45);
        }
    `;

    document.head.appendChild(style);

    const devBody = document.getElementById("devBody");
    const devToggleButton = document.getElementById("devToggleButton");

    const devPlayerSelect = document.getElementById("devPlayerSelect");
    const devFollowersInput = document.getElementById("devFollowersInput");
    const devHateInput = document.getElementById("devHateInput");
    const devCardSelect = document.getElementById("devCardSelect");

    const devSetFollowersButton = document.getElementById("devSetFollowersButton");
    const devSetHateButton = document.getElementById("devSetHateButton");
    const devAddCardButton = document.getElementById("devAddCardButton");
    const devDrawFullButton = document.getElementById("devDrawFullButton");
    const devClearHandButton = document.getElementById("devClearHandButton");
    const devClearTrapsButton = document.getElementById("devClearTrapsButton");

    devToggleButton.onclick = () => {
        if (devBody.style.display === "none") {
            devBody.style.display = "flex";
            devToggleButton.innerText = "閉じる";
        } else {
            devBody.style.display = "none";
            devToggleButton.innerText = "開く";
        }
    };

    function selectedPlayerId() {
        return devPlayerSelect.value;
    }

    function renderDevPanel() {
        if (!gameState) return;

        const currentSelectedPlayerId = devPlayerSelect.value;

        devPlayerSelect.innerHTML = "";

        gameState.turnOrder.forEach(player => {
            const option = document.createElement("option");

            option.value = player.id;
            option.innerText = `${player.name} / ${player.followers} / H${player.hate}`;

            devPlayerSelect.appendChild(option);
        });

        if (
            currentSelectedPlayerId &&
            gameState.turnOrder.some(player => player.id === currentSelectedPlayerId)
        ) {
            devPlayerSelect.value = currentSelectedPlayerId;
        }

        const selectedPlayer =
            gameState.turnOrder.find(player => player.id === devPlayerSelect.value);

        if (selectedPlayer) {
            devFollowersInput.value = selectedPlayer.followers;
            devHateInput.value = selectedPlayer.hate;
        }
    }

    function renderCardSelect() {
        devCardSelect.innerHTML = "";

        cardList.forEach(card => {
            const option = document.createElement("option");

            option.value = card.id;
            option.innerText = `[${card.rarity || "C"}] ${card.name} / ${card.type}`;

            devCardSelect.appendChild(option);
        });
    }

    window.socket?.on?.("devCardList", cards => {
        cardList = cards;
        renderCardSelect();
    });

    window.socket?.on?.("devGameState", game => {
        gameState = game;
        renderDevPanel();
    });

    devPlayerSelect.onchange = () => {
        renderDevPanel();
    };

    devSetFollowersButton.onclick = () => {
        window.socket.emit("devSetFollowers", {
            playerId: selectedPlayerId(),
            followers: Number(devFollowersInput.value)
        });
    };

    devSetHateButton.onclick = () => {
        window.socket.emit("devSetHate", {
            playerId: selectedPlayerId(),
            hate: Number(devHateInput.value)
        });
    };

    devAddCardButton.onclick = () => {
        window.socket.emit("devAddCard", {
            playerId: selectedPlayerId(),
            cardId: devCardSelect.value
        });
    };

    devDrawFullButton.onclick = () => {
        window.socket.emit("devDrawFull", {
            playerId: selectedPlayerId()
        });
    };

    devClearHandButton.onclick = () => {
        window.socket.emit("devClearHand", {
            playerId: selectedPlayerId()
        });
    };

    devClearTrapsButton.onclick = () => {
        window.socket.emit("devClearTraps", {
            playerId: selectedPlayerId()
        });
    };
})();