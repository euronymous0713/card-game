(() => {
    let latestTrapLogCount = 0;
    let isPlayingCutin = false;
    const cutinQueue = [];

    const style = document.createElement("style");

    style.innerHTML = `
        .trap-cutin-overlay {
            position: fixed;
            inset: 0;
            z-index: 12000;
            pointer-events: none;
            display: flex;
            justify-content: center;
            align-items: center;
            background:
                radial-gradient(circle, rgba(255, 0, 200, 0.18), rgba(0, 0, 0, 0.72));
            animation: trapCutinFade 1.45s ease-in-out forwards;
        }

        .trap-cutin-slash {
            position: absolute;
            width: 160%;
            height: 180px;
            transform: rotate(-8deg);
            background:
                linear-gradient(90deg,
                    transparent,
                    rgba(255, 176, 0, 0.08),
                    rgba(255, 176, 0, 0.88),
                    rgba(255, 0, 200, 0.92),
                    rgba(0, 255, 225, 0.85),
                    transparent);
            box-shadow:
                0 0 32px rgba(255, 176, 0, 0.75),
                0 0 70px rgba(255, 0, 200, 0.45);
            animation: trapSlashMove 1.45s ease-in-out forwards;
        }

        .trap-cutin-box {
            position: relative;
            width: min(760px, 90vw);
            padding: 26px 34px;
            border-radius: 22px;
            text-align: center;
            color: white;
            background: rgba(0, 0, 0, 0.82);
            border: 2px solid rgba(255, 176, 0, 0.9);
            box-shadow:
                0 0 28px rgba(255, 176, 0, 0.7),
                0 0 70px rgba(255, 0, 200, 0.35);
            animation: trapBoxPop 1.45s ease-in-out forwards;
        }

        .trap-cutin-label {
            margin-bottom: 8px;
            font-size: clamp(22px, 4vw, 42px);
            font-weight: 900;
            color: #ffb000;
            letter-spacing: 6px;
            text-shadow:
                0 0 14px rgba(255, 176, 0, 0.95),
                0 0 28px rgba(255, 0, 200, 0.65);
        }

        .trap-cutin-player {
            margin-bottom: 8px;
            font-size: clamp(15px, 2vw, 22px);
            color: #00ffe1;
            font-weight: bold;
        }

        .trap-cutin-card {
            font-size: clamp(24px, 4vw, 46px);
            font-weight: 900;
            color: white;
            text-shadow:
                0 0 10px rgba(255, 255, 255, 0.8),
                0 0 24px rgba(0, 255, 225, 0.55);
        }

        .trap-cutin-effect {
            margin-top: 10px;
            font-size: clamp(13px, 1.8vw, 18px);
            color: rgba(255, 255, 255, 0.82);
            line-height: 1.5;
        }

        @keyframes trapCutinFade {
            0% {
                opacity: 0;
            }

            12% {
                opacity: 1;
            }

            78% {
                opacity: 1;
            }

            100% {
                opacity: 0;
            }
        }

        @keyframes trapSlashMove {
            0% {
                transform: translateX(-120%) rotate(-8deg);
            }

            24% {
                transform: translateX(0) rotate(-8deg);
            }

            78% {
                transform: translateX(0) rotate(-8deg);
            }

            100% {
                transform: translateX(120%) rotate(-8deg);
            }
        }

        @keyframes trapBoxPop {
            0% {
                opacity: 0;
                transform: translateY(28px) scale(0.82);
            }

            18% {
                opacity: 1;
                transform: translateY(0) scale(1.04);
            }

            40% {
                transform: translateY(0) scale(1);
            }

            82% {
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            100% {
                opacity: 0;
                transform: translateY(-18px) scale(0.96);
            }
        }

        @media screen and (max-width: 768px) {
            .trap-cutin-box {
                padding: 20px 18px;
            }

            .trap-cutin-label {
                letter-spacing: 3px;
            }

            .trap-cutin-slash {
                height: 130px;
            }
        }
    `;

    document.head.appendChild(style);

    function waitForSocket() {
        if (!window.socket) {
            setTimeout(waitForSocket, 100);
            return;
        }

        window.socket.on("updateGame", handleUpdateGame);
    }

    function handleUpdateGame(game) {
        if (!game || !Array.isArray(game.playedCards)) return;

        const trapLogs = game.playedCards.filter(log => {
            return log.actionType === "trap" || log.actionType === "trapEffect";
        });

        if (trapLogs.length <= latestTrapLogCount) {
            latestTrapLogCount = trapLogs.length;
            return;
        }

        const newLogs = trapLogs.slice(latestTrapLogCount);

        latestTrapLogCount = trapLogs.length;

        newLogs.forEach(log => {
            enqueueCutin(log);
        });
    }

    function enqueueCutin(log) {
        cutinQueue.push(log);
        playNextCutin();
    }

    function playNextCutin() {
        if (isPlayingCutin) return;
        if (cutinQueue.length === 0) return;

        isPlayingCutin = true;

        const log = cutinQueue.shift();

        const overlay = document.createElement("div");
        overlay.className = "trap-cutin-overlay";

        const label =
            log.actionType === "trap"
                ? "TRAP ACTIVATED"
                : "TRAP EFFECT";

        const playerName = log.playerName || "プレイヤー";
        const cardName = log.cardName || "伏せカード";
        const effectText = log.hateText || log.log || "罠が発動した";

        overlay.innerHTML = `
            <div class="trap-cutin-slash"></div>

            <div class="trap-cutin-box">
                <div class="trap-cutin-label">${label}</div>
                <div class="trap-cutin-player">${playerName}</div>
                <div class="trap-cutin-card">${cardName}</div>
                <div class="trap-cutin-effect">${effectText}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();
            isPlayingCutin = false;
            playNextCutin();
        }, 1500);
    }

    waitForSocket();
})();