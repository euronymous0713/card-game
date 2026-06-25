(() => {
    let latestTrapLogCount = 0;
    let isPlayingCutin = false;
    const cutinQueue = [];

    const RARITY_ACCENT = {
        c: { accent: "#c7d3e0", soft: "rgba(190, 200, 215, 0.55)" },
        uc: { accent: "#44ffaa", soft: "rgba(68, 255, 170, 0.55)" },
        r: { accent: "#50b4ff", soft: "rgba(80, 180, 255, 0.55)" },
        sr: { accent: "#dc78ff", soft: "rgba(220, 120, 255, 0.6)" },
        ur: { accent: "#ffe880", soft: "rgba(255, 216, 92, 0.65)" }
    };

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
            overflow: hidden;
            background: radial-gradient(circle at 50% 50%, rgba(255, 0, 200, 0.16), rgba(0, 0, 0, 0.82) 72%);
            animation: trapCutinFade 1.7s ease-in-out forwards;
            --trap-accent: #ffb000;
            --trap-accent-soft: rgba(255, 176, 0, 0.6);
        }

        .trap-cutin-overlay::before {
            content: "";
            position: absolute;
            inset: 0;
            background: repeating-linear-gradient(
                to bottom,
                rgba(255, 255, 255, 0.05) 0px,
                rgba(255, 255, 255, 0.05) 1px,
                transparent 2px,
                transparent 4px
            );
            mix-blend-mode: screen;
            opacity: 0.35;
        }

        .trap-cutin-flash {
            position: absolute;
            inset: 0;
            background: radial-gradient(circle, var(--trap-accent-soft), transparent 68%);
            animation: trapFlashPop 0.5s ease-out forwards;
        }

        .trap-cutin-slash {
            position: absolute;
            width: 170%;
            height: 130px;
            background: linear-gradient(90deg, transparent, var(--trap-accent-soft) 18%, var(--trap-accent) 46%, rgba(255, 0, 200, 0.95) 62%, rgba(0, 255, 225, 0.85), transparent);
            box-shadow: 0 0 32px var(--trap-accent-soft), 0 0 70px rgba(255, 0, 200, 0.45);
            animation: trapSlashMove 0.55s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
        }

        .trap-cutin-slash.slash-2 {
            width: 150%;
            height: 64px;
            opacity: 0.8;
            animation: trapSlashMove2 0.6s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
            animation-delay: 0.07s;
        }

        .trap-cutin-box {
            position: relative;
            width: min(760px, 90vw);
            padding: 30px 40px;
            text-align: center;
            color: white;
            background: linear-gradient(160deg, rgba(8, 8, 16, 0.94), rgba(26, 8, 32, 0.94));
            clip-path: polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px);
            border: 2px solid var(--trap-accent);
            box-shadow:
                inset 0 0 30px rgba(0, 0, 0, 0.5),
                0 0 26px var(--trap-accent-soft),
                0 0 70px rgba(255, 0, 200, 0.3);
            animation: trapBoxPop 1.7s cubic-bezier(0.18, 0.85, 0.2, 1) forwards;
        }

        .trap-cutin-box::after {
            content: "";
            position: absolute;
            inset: 0;
            clip-path: polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px);
            background: linear-gradient(115deg, transparent 32%, rgba(255, 255, 255, 0.55) 48%, transparent 64%);
            background-size: 220% 220%;
            background-position: -130% -130%;
            animation: trapBorderSweep 1.1s ease-out 0.15s forwards;
            pointer-events: none;
        }

        .trap-cutin-label {
            margin-bottom: 8px;
            font-size: clamp(22px, 4vw, 40px);
            font-weight: 900;
            letter-spacing: 8px;
            color: var(--trap-accent);
            text-shadow:
                2px 0 rgba(255, 0, 200, 0.85),
                -2px 0 rgba(0, 255, 225, 0.85),
                0 0 20px var(--trap-accent-soft);
            animation: trapLabelGlitch 1.7s linear forwards;
        }

        .trap-cutin-player {
            margin-bottom: 8px;
            font-size: clamp(13px, 1.8vw, 19px);
            color: #8be9ff;
            font-weight: bold;
            letter-spacing: 3px;
            text-transform: uppercase;
            opacity: 0.85;
        }

        .trap-cutin-card {
            font-size: clamp(26px, 4.6vw, 48px);
            font-weight: 900;
            letter-spacing: 1px;
            transform: skewX(-4deg);
            display: inline-block;
            background: linear-gradient(90deg, #ffffff, var(--trap-accent) 75%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            filter: drop-shadow(0 0 16px var(--trap-accent-soft));
        }

        .trap-cutin-effect {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px dashed rgba(255, 255, 255, 0.25);
            font-family: Consolas, "SF Mono", "Courier New", monospace;
            font-size: clamp(13px, 1.8vw, 17px);
            color: rgba(255, 255, 255, 0.88);
            line-height: 1.6;
        }

        @keyframes trapCutinFade {
            0% { opacity: 0; }
            8% { opacity: 1; }
            85% { opacity: 1; }
            100% { opacity: 0; }
        }

        @keyframes trapFlashPop {
            0% { opacity: 0.9; }
            100% { opacity: 0; }
        }

        @keyframes trapSlashMove {
            0% { transform: translateX(-130%) rotate(-8deg); }
            100% { transform: translateX(130%) rotate(-8deg); }
        }

        @keyframes trapSlashMove2 {
            0% { transform: translateX(130%) rotate(7deg); }
            100% { transform: translateX(-130%) rotate(7deg); }
        }

        @keyframes trapBoxPop {
            0% { opacity: 0; transform: translateY(30px) scale(0.8) skewX(2deg); }
            14% { opacity: 1; transform: translateY(0) scale(1.05) skewX(0deg); }
            22% { transform: translateY(0) scale(1) skewX(0deg); }
            88% { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-16px) scale(0.97); }
        }

        @keyframes trapBorderSweep {
            0% { background-position: -130% -130%; }
            100% { background-position: 130% 130%; }
        }

        @keyframes trapLabelGlitch {
            0%, 100% { opacity: 1; transform: translate(0, 0); }
            4% { opacity: 0.5; transform: translate(-2px, 1px); }
            6% { opacity: 1; transform: translate(2px, -1px); }
            8% { transform: translate(0, 0); }
            40% { opacity: 0.65; transform: translate(1px, 0); }
            42% { opacity: 1; transform: translate(-1px, 0); }
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

        const trapActivateLogs = game.playedCards.filter(log => {
            return log.actionType === "trap";
        });

        if (trapActivateLogs.length <= latestTrapLogCount) {
            latestTrapLogCount = trapActivateLogs.length;
            return;
        }

        const newLogs = trapActivateLogs.slice(latestTrapLogCount);
        latestTrapLogCount = trapActivateLogs.length;

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
        const rarityKey = String(log.cardRarity || "c").toLowerCase();
        const accent = RARITY_ACCENT[rarityKey] || RARITY_ACCENT.c;

        const overlay = document.createElement("div");
        overlay.className = "trap-cutin-overlay";
        overlay.style.setProperty("--trap-accent", accent.accent);
        overlay.style.setProperty("--trap-accent-soft", accent.soft);

        overlay.innerHTML = `
            <div class="trap-cutin-flash"></div>
            <div class="trap-cutin-slash"></div>
            <div class="trap-cutin-slash slash-2"></div>

            <div class="trap-cutin-box">
                <div class="trap-cutin-label">TRAP ACTIVATED</div>
                <div class="trap-cutin-player">${log.playerName || "プレイヤー"}</div>
                <div class="trap-cutin-card">${log.cardName || "罠カード"}</div>
                <div class="trap-cutin-effect">${log.effect || log.hateText || log.log || "罠が発動した"}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();
            isPlayingCutin = false;
            playNextCutin();
        }, 1700);
    }

    waitForSocket();
})();
