module.exports = [
    {
        id: "card-1",
        name: "炎上パンチ",
        type: "攻撃",
        kind: "attack",
        targetType: "enemy",
        damage: 2000,
        heal: 0,
        hateTarget: "self",
        hateChange: 1,
        hateText: "自分のヘイト +1",
        effect: "対象に2,000フォロワーダメージ。対象のヘイトが3ならダメージ2倍。自分のヘイトが1上がる。"
    },
    {
        id: "card-2",
        name: "お気持ち表明",
        type: "防御",
        kind: "support",
        targetType: "self",
        damage: 0,
        heal: 1000,
        hateTarget: "self",
        hateChange: -1,
        hateText: "自分のヘイト -1",
        effect: "自分のフォロワーを1,000回復。長文で沈静化し、自分のヘイトが1下がる。"
    },
    {
        id: "card-3",
        name: "釣りスレ",
        type: "罠",
        kind: "trap",
        targetType: "self",
        damage: 0,
        heal: 0,
        hateTarget: "self",
        hateChange: 1,
        hateText: "自分のヘイト +1",
        effect: "自分の場に伏せる。最大2枚まで伏せられる。"
    },
    {
        id: "card-4",
        name: "古参アピール",
        type: "補助",
        kind: "support",
        targetType: "self",
        damage: 0,
        heal: 1000,
        hateTarget: "self",
        hateChange: -1,
        hateText: "自分のヘイト -1",
        effect: "自分のフォロワーを1,000回復。『昔はよかった』でヘイトが1下がる。"
    }
];