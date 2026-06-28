# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# サーバーを起動する
node server.js

# 依存パッケージをインストールする（初回）
npm install
```

## デプロイ

「デプロイして」と言われたら以下のコマンドを順番に実行する：

```bash
git add .
git commit -m "title screen"
git push
```

テストフレームワークは未導入。動作確認はブラウザで `http://localhost:3000` にアクセスして行う。

開発用デバッグパネルは URL に `?dev=1` を付けると表示される。

## アーキテクチャ

### 全体構成

Node.js (CommonJS) + Express + Socket.io のシングルページアプリ。サーバーとクライアントが Socket.io のイベントで全状態を同期する。

```
server.js          ← ゲームロジックの全体（ルーム管理・ターン進行・効果解決）
data/cards.js      ← カードマスターデータ（50枚）
public/
  index.html       ← 3画面を display:none で切り替えるSPA
  js/main.js       ← クライアントの全UI処理・Socket.io通信
  js/soundManager.js  ← window.SoundManager（効果音）
  js/trapCutin.js     ← 罠発動カットイン演出
  js/dev.js           ← デバッグパネル（?dev=1 のときのみ有効）
  css/style.css    ← 共通スタイル
  css/pc.css       ← PC向けレイアウト
  css/mobile.css   ← モバイル向けレイアウト
```

### サーバー側 (`server.js`)

ゲームの全ロジックがここに集約されている。

**状態管理**
- `rooms` オブジェクト：全ルームをインメモリで管理。各ルームは `players` 配列と `game` オブジェクトを持つ
- `pendingTrapChoices`：罠発動待機中の非同期処理をIDで管理

**ゲームの核心ルール**
- フォロワー数（初期 10,000）が HP。0 になると `defeated = true`（オワコン）
- ヘイト（0〜3）：3 のプレイヤーが攻撃を受けるとダメージ2倍
- カードは毎ターン手札が4枚になるよう補充される。レアリティは重み付き抽選（C=55%, UC=25%, R=13%, SR=5%, UR=2%）

**罠の非同期処理**
罠カードの発動は非同期コールバックチェーンで実装されている。`requestTrapChoice` → クライアントの `chooseTrap` イベント → `chooseTrapResponse` → `resolveTrapEffect` → `onResolved` コールバック。ネストした罠（罠への反応として罠を発動）にも対応する。

**プレイヤー視点の情報制御**
`createGameViewForPlayer` が各クライアントに送るゲーム状態を加工する。敵の手札・伏せカードの内容は隠蔽され（自分が脱落済みの場合は全開示）、ログも伏せカード設置・捨て札は伏せた情報として送る。

**再接続**
接続時に `reconnectToken` を発行してクライアントに保存させる。5分以内に再接続すれば `reconnectPlayer` イベントでソケットIDを差し替えてゲームを継続できる。

### クライアント側 (`public/js/main.js`)

`window.onload` の中に全処理が入っている。Socket.io のイベントを受けて DOM を更新する。

主なSocket.ioイベント（クライアント→サーバー）：
- `createRoom` / `joinRoom` / `leaveRoom` / `disbandRoom`
- `toggleReady` / `startGame`
- `playCard` / `discardCard` / `endTurn`
- `chooseTrapResponse`（罠選択の返答）
- `battleLeaveRoom`（対戦中の退出）

主なSocket.ioイベント（サーバー→クライアント）：
- `updateGame`：毎アクション後に各プレイヤー視点のゲーム状態を送信
- `chooseTrap`：罠発動の選択を要求（ゲームが一時停止する）
- `gameOver` / `gameStarted` / `roomDisbanded`

### カードデータ (`data/cards.js`)

各カードのフィールド：

| フィールド | 用途 |
|---|---|
| `kind` | `attack` / `support` / `hate` / `trap` / `special` |
| `targetType` | `enemy` / `self` / `allEnemies` |
| `effectType` | `special` の効果種別（`skipTurn`, `slipDamage`, `applyStatus`, `destroyTargetTraps` など） |
| `hateBonus` | ヘイト条件で追加ダメージ・効果（配列） |
| `rankBonus` | フォロワー順位（`leader` / `lowestFollowers`）で追加ダメージ・効果（配列） |
| `trapCondition` | `onDamage` / `onHateChange` / `onTrapEffect` |
| `trapEffect` | `reflectDamage` / `cancelHate` / `cancelTrap` / `damageAndHate` など |
| `ignoreTrap` | `true` のとき罠を無視してダメージを与える |
