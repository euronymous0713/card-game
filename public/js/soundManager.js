/* =========================================================
   インターネット世紀末 - 効果音管理
   public/js/soundManager.js
   ========================================================= */

window.SoundManager = (() => {
    const DEFAULT_VOLUME = 0.72;

    const SOUND_LIST = {
        gameStart: "sounds/game-start.wav",
        turnStart: "sounds/turn-start.wav",
        turnEnd: "sounds/turn-end.wav",
        discard: "sounds/discard.wav",
        attack: "sounds/attack.wav",
        heal: "sounds/heal.wav",
        setTrap: "sounds/set-trap.wav",
        trap: "sounds/trap.wav",
        hate: "sounds/hate.wav",
        special: "sounds/special.wav",
        defeated: "sounds/defeated.wav",
        victory: "sounds/victory.wav",
        defeat: "sounds/defeat.wav"
    };

    const sounds = {};
    let initialized = false;
    let unlocked = false;

    function init() {
        if (initialized) return;

        Object.entries(SOUND_LIST).forEach(([key, path]) => {
            const audio = new Audio(path);

            audio.preload = "auto";
            audio.volume = DEFAULT_VOLUME;

            sounds[key] = audio;
        });

        initialized = true;
    }

    function unlock() {
        init();

        if (unlocked) return;

        const unlockPromises = Object.values(sounds).map(audio => {
            const originalVolume = audio.volume;

            audio.volume = 0;

            return audio.play()
                .then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = originalVolume;
                })
                .catch(() => {
                    audio.volume = originalVolume;
                });
        });

        Promise.allSettled(unlockPromises).finally(() => {
            unlocked = true;
        });
    }

    function play(name) {
        init();

        const original = sounds[name];

        if (!original) return;

        const audio = original.cloneNode(true);

        audio.volume = original.volume;
        audio.currentTime = 0;

        audio.play().catch(() => {
            // ブラウザの自動再生制限や、音源未配置の場合はここに入ります。
            // ゲーム進行は止めないため、何もしません。
        });
    }

    function setVolume(volume) {
        const nextVolume = Math.max(0, Math.min(1, Number(volume)));

        Object.values(sounds).forEach(audio => {
            audio.volume = nextVolume;
        });
    }

    function getSoundList() {
        return { ...SOUND_LIST };
    }

    return {
        init,
        unlock,
        play,
        setVolume,
        getSoundList
    };
})();
