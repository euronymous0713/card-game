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

            // preload は metadata に抑えます。スマホで読み込み時に音が鳴る事故を避けるためです。
            audio.preload = "metadata";
            audio.volume = DEFAULT_VOLUME;

            sounds[key] = audio;
        });

        initialized = true;
    }

    function unlock() {
        // 以前はここで各音源を volume:0 で play/pause していました。
        // 一部スマホ環境ではその無音再生が通常音量で鳴ることがあるため、
        // unlock では再生せず「ユーザー操作済み」フラグだけ立てます。
        init();
        unlocked = true;
    }

    function play(name) {
        init();

        // 読み込み直後や、ユーザー操作前の socket 更新では鳴らさない。
        if (!unlocked) return;

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
        init();

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
