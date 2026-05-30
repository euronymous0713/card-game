function showTrapChoiceModal(data) {
    const oldOverlay = document.getElementById("trapChoiceOverlay");

    if (oldOverlay) {
        oldOverlay.remove();
    }

    const overlay = document.createElement("div");

    overlay.id = "trapChoiceOverlay";
    overlay.className = "trap-choice-overlay";

    const conditionText =
        data.condition === "onDamage"
            ? "ダメージを受けます。発動する罠を選んでください。"
            : data.condition === "onHateChange"
                ? "ヘイトが変動します。発動する罠を選んでください。"
                : "罠効果を受けます。発動する罠を選んでください。";

    const sourceCardName = data.context?.cardName || "不明なカード";
    const sourceCardType = data.context?.cardType || "";
    const sourceEffect = data.context?.effect || "";
    const sourceResultText = data.context?.resultText || "";
    const sourceActionText =
        data.context?.sourceActionText ||
        `${data.sourcePlayerName} のカードに反応できます。`;

    const boardPlayers = data.board?.turnOrder || [];
    const currentTurnPlayer =
        boardPlayers[data.board?.currentTurnIndex]?.name || "-";

    overlay.innerHTML = `
        <div class="trap-choice-box large-trap-choice-box">
            <h2>罠カード発動確認</h2>

            <div class="trap-source-box">
                <div class="trap-section-title">反応元カード</div>
                <div class="trap-source-card-name">
                    ${sourceCardName}
                    ${sourceCardType ? `<span>${sourceCardType}</span>` : ""}
                </div>
                <p>${sourceActionText}</p>
                ${sourceEffect ? `<p class="trap-source-effect">${sourceEffect}</p>` : ""}
                ${sourceResultText ? `<p class="trap-danger-text">${sourceResultText}</p>` : ""}
            </div>

            <div class="trap-board-box">
                <div class="trap-section-title">現在の盤面</div>
                <div class="trap-current-turn">現在のターン：${currentTurnPlayer}</div>

                <div class="trap-board-list">
                    ${boardPlayers.map(player => `
                        <div class="trap-board-player ${player.defeated ? "trap-board-defeated" : ""}">
                            <strong>${player.name}</strong>
                            <span>${player.defeated ? "オワコン" : `${player.followers.toLocaleString()} フォロワー`}</span>
                            <span>ヘイト ${"◆".repeat(player.hate)}${"◇".repeat(3 - player.hate)}</span>
                            <span>伏せ ${player.fieldCardCount}枚</span>
                        </div>
                    `).join("")}
                </div>
            </div>

            <p class="trap-choice-message">${conditionText}</p>

            <div class="trap-choice-list">
                ${data.traps.map(trap => `
                    <div class="trap-choice-card" data-field-id="${trap.fieldId}">
                        <strong>${trap.name}</strong>
                        <span>${trap.effect}</span>
                    </div>
                `).join("")}
            </div>

            <button class="trap-skip-button" id="trapSkipButton">
                発動しない
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll(".trap-choice-card").forEach(cardElement => {
        cardElement.onclick = () => {
            const fieldId = cardElement.dataset.fieldId;

            socket.emit("chooseTrapResponse", {
                choiceId: data.choiceId,
                fieldId
            });

            overlay.remove();
        };
    });

    document.getElementById("trapSkipButton").onclick = () => {
        socket.emit("chooseTrapResponse", {
            choiceId: data.choiceId,
            fieldId: null
        });

        overlay.remove();
    };
}