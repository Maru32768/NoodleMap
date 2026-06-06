# NoodleMap 改善提案

> 調査日: 2026-05-08
> 追記: 2026-05-31
> 対象ブランチ: `redeisng`

---

## 運用ルール

- タスクが完了したら、該当行の状態を `未着手` から `完了` に更新する。
- 新しい改善案を追加したら、詳細セクションだけでなく実装順まとめにも追加する。

---

## LLM 活用を見据えたデータ蓄積方針

LLM を入れる場合でも、LLM に検索や判定を丸投げせず、アプリ側で扱いやすい構造化データを先に蓄積する。自然文検索、推薦、訪問メモ要約、店舗特徴の整理に使えるよう、次のデータを優先して保存する。

- 店舗特徴: ジャンル、味の傾向、スープの濃さ、麺種、量、辛さ、初訪問向けメニューなどを `tags` や将来の詳細属性として持つ。
- ユーザー行動: 詳細閲覧、地図上の選択、検索条件、お気に入り、行きたい、食べたなどを、必要最小限のイベントとして残せる設計にする。
- 訪問記録: 訪問日、食べたメニュー、価格、評価、メモ、写真を `visit_logs` と関連テーブルに残す。
- 検索改善用ログ: 自然文検索を入れる場合は、元の入力、抽出された条件、表示候補、選択された店舗を保存できるようにする。

自由文はメモや説明生成に有用だが、検索・絞り込み・推薦の主軸は構造化データに置く。ベクトル DB や大規模な RAG は初期段階では不要で、まずはタグ、訪問ログ、検索ログをきれいに貯める。

---

## 📝 実装順まとめ

優先度ではなく依存関係で並べる。Google OAuth へ移行する前提のため、項目 5 (`BindJSON`) と項目 7 (パスワードバリデーション)
は単独対応せず、メール/パスワード認証の削除に吸収する。

### Phase 0. 方針確定・不要コード整理

| 状態 | 項目                          | 内容                                    |
|----|-----------------------------|---------------------------------------|
| 完了 | `fetch-place-info-tool` の削除 | Places の自動収集ツールなので、今後の「UI検索補助」方針と合わない |
| 完了 | 画像機能の扱い決定                   | 実装するなら保存方式を決める。やらないならモック UI を削除       |
| 完了 | Google Places 情報拡充の見送り      | 営業時間・電話番号・URL の自動保存はしない               |
| 完了 | `local.env` の整理               | `.env.example` を追加し、必要なキー名だけを残す       |

画像は取り扱う。保存形式は実装時に決める。

### Phase 1. アーキテクチャ改善

| 状態  | 項目                    | 内容                                                |
|-----|-----------------------|---------------------------------------------------|
| 完了 | TypeSpec導入            | TypeSpec によるスキーマ定義と OpenAPI 生成を導入する |
| 完了 | 生成 API 定義の利用        | 生成した OpenAPI をベースにフロントエンド型または API クライアントを生成して利用する |
| 完了 | バックエンドのソフトウェアーキテクチャ再考 | 薄い vertical slice 方針にし、usecase/domain レイヤーは必要になった時だけ追加する |
| 未着手 | ID体系の再考               |                                                   |
| 未着手 | RestaurntをShopにリネーム   |                                                   |
| 未着手 | `visited` を `eaten` にリネーム | DB カラム・API フィールド・Go 構造体の `Visited` を `Eaten` に統一する（フロントは「食べた」表記に変更済み） |
| 未着手 | カテゴリをコード固定化 | `categories` テーブルを廃止しラーメン/うどんをアプリ定数に移す |

### Phase 2. DB 基盤

| 状態  | 項目                     | 内容                             |
|-----|------------------------|--------------------------------|
| 完了  | goose 導入               | `db/init.sh` 依存からマイグレーション管理へ移行 |
| 完了 | PostgreSQL → SQLite 移行 | 個人利用・単一ホスト運用に寄せる               |
| 完了 | バックアップ/リストア簡略化         | SQLite `.db` ファイルベースに変更        |
| 未着手 | LLM向けデータ蓄積設計 | タグ、訪問ログ、検索ログ、ユーザー行動ログをどこまで保存するか決め、後続の店舗管理モデル拡張に反映する |

DB スキーマを大きく変える機能が多いため、タグ・訪問ログ・リンク・画像より先にマイグレーション基盤を入れる。

### Phase 3. 認証・セキュリティ基盤

| 状態  | 項目                      | 内容                                            |
|-----|-------------------------|-----------------------------------------------|
| 完了 | Google OAuth 移行         | メール/パスワード認証を削除                                |
| 完了 | 認証 Cookie を HttpOnly 化 | `localStorage` 保存をやめる                         |
| 完了 | セッション期限設定              | `sessions.expires_at` を付与し、漏洩時の有効期間を短くする              |
| 完了 | `temporary_users` 削除    | OAuth 移行に合わせて不要テーブルを削除                        |
| 完了 | 登録/ログイン画面整理             | `POST /login`, `POST /register`, パスワードフォームを削除 |
| 完了 | プロキシ信頼設定修正              | `SetTrustedProxies` を環境に合わせて制限                |
| 完了 | DBセッション管理への移行          | JWT + `token_version` ではなく、デバイス単位のセッションをDBで管理する |

この時点で項目 5 と 7 は消える。OAuth 移行前に現行ログインを残して運用する期間がある場合のみ `BindJSON` を先に直す。

### Phase 4. Google Places 経由の検索補助をバックエンド化

| 状態  | 項目              | 内容                                                        |
|-----|-----------------|-----------------------------------------------------------|
| 未着手 | APIキー分離         | フロント用 Maps JS キーとバックエンド用 Places キーを分離                     |
| 未着手 | Places 検索補助 API | `/api/v1/auth/google-places/autocomplete`, `/details` を追加 |
| 未着手 | 管理者限定・レート制限     | 店舗追加/編集時だけ利用できるようにする                                      |
| 未着手 | フロント置き換え        | `google-place-finder.tsx` が Google Places を直接叩かないようにする    |

目的は API キー保護・課金管理・濫用対策。自動収集ツール化はしない。

### Phase 5. 店舗管理モデルの拡張

| 状態  | 項目              | 内容                                     |
|-----|-----------------|----------------------------------------|
| 未着手 | サブカテゴリ / タグ     | `tags`, `restaurants_tags` を追加         |
| 未着手 | カテゴリ更新 TODO 解消  | 既存カテゴリ更新はタグ実装に合わせて再設計                  |
| 未着手 | 店舗リンク / SNS URL | `restaurant_links` を追加                 |
| 未着手 | 訪問ログ            | `visit_logs` を追加し、複数回訪問やメニュー記録に対応      |
| 未着手 | レストラン削除         | 関連データ削除または外部キー制約を整える                   |
| 未着手 | 画像アップロード        | 実装する場合は `restaurant_images` と保存先を完成させる |
| 完了 | 店舗一覧取得の小バグ修正   | `FindRegisteredRestaurants` の ID 配列生成を修正する |

ここが NoodleMap の主機能拡張。DB・認証・Places API の土台ができてからまとめて入れる。

### Phase 6. フロントエンド体験の整備

| 状態  | 項目           | 内容                     |
|-----|--------------|------------------------|
| 未着手 | 管理画面 UI 更新   | タグ、リンク、訪問ログ、画像、削除を操作できるようにする |
| 未着手 | 検索クエリ改善      | ひらがななどでも検索に引っかかるようにしたい |
| 未着手 | 検索/フィルタ拡張    | タグ、訪問ログ、リンク有無などで絞り込み   |
| 未着手 | 空状態・ローディング表示 | 検索0件、取得中、取得失敗を明示       |
| 未着手 | PWA インストール案内 | モバイル中心にホーム画面追加の控えめな導線を出す |
| 完了 | APIエラーハンドリング見直し | TypeSpec の typed error body、`openapi-fetch`、日本語 toast、mutation の `Result` 返却を導入 |
| 未着手 | フォーム field error 表示 | API の `fieldErrors` を各入力コンポーネントに表示する |
| 未着手 | 外部 API / fetch 失敗表示 | Google Places や SWR fetch 失敗時の画面表示を整える |
| 未着手 | 管理画面モバイルナビ整理 | リスト/地図ボタンに実際の表示切り替えを持たせる |
| 未着手 | マイページ / セッション管理 | 現在ログイン中のデバイス一覧を表示し、各セッションを個別に無効化できるようにする |

### Phase 7. 共有・OGP

| 状態  | 項目         | 内容                                       |
|-----|------------|------------------------------------------|
| 未着手 | 店舗詳細の個別URL | `/search?restaurant=<id>` で選択店舗を開けるようにする |
| 未着手 | 共有ボタン      | 店舗詳細からURLをコピー                            |
| 未着手 | `/r/:id`   | 通常ブラウザは検索URLへ誘導、SNSクローラーには OGP HTML を返す  |
| 未着手 | OGP画像生成    | 店名、タグ、評価、住所エリア、NoodleMap ロゴを含める          |

### Phase 8. 仕上げ

| 状態  | 項目         | 内容                          |
|-----|------------|-----------------------------|
| 未着手 | E2Eに近い手動確認 | 追加、編集、削除、検索、共有URL、OAuthログイン |
| 未着手 | テスト追加      | Go のサービス/ハンドラ中心に追加          |
| 未着手 | ドキュメント更新   | README、環境変数、デプロイ手順を更新       |

---

> 実装量は多いが、順番としては **DB基盤 → 認証 → Placesバックエンド化 → 店舗管理モデル拡張 → UI → 共有/OGP** が最も破綻しにくい。

---

## 🏗️ 認証システムの再設計

### A. Google OAuth への移行

現在のメール/パスワード認証を Google OAuth に置き換える。

**メリット:**

- パスワード管理が不要になり、セキュリティ問題 (項目 5, 7) がまるごと消える
- `VITE_GOOGLE_API_KEY` で使用済みの Google Cloud プロジェクトに OAuth 2.0 クライアントを追加するだけ
- 共有したい相手も Google アカウントでそのままログインできる
- `temporary_users` テーブル (項目 4) も合わせて削除できる

**admin 権限の管理:**
`users.is_admin` フラグは持たず、リクエスト時に Google アカウントのメールアドレスと `ADMIN_EMAIL` 環境変数を照合して
`isAdmin` を組み立てる。管理者変更は環境変数だけで完結させる。

**実装イメージ (工数感: 中):**

```
バックエンド
├── POST /auth/google  ← Google ID Token を受け取って検証
├── google-api-go-client で Token 検証
├── users テーブルに google_sub カラム追加、password カラム削除
└── sessions テーブルでデバイス単位のログイン状態を管理する

フロントエンド
├── @react-oauth/google を追加
├── <GoogleLogin> ボタンに差し替え
└── email/password フォームを削除
```

---

### B. JWT を localStorage から HttpOnly Cookie へ移行

| 項目  | 詳細                                                                  |
|-----|---------------------------------------------------------------------|
| 現状  | `web/src/features/auth/use-auth.ts:9,44` で `localStorage` に JWT を保存 |
| 問題  | XSS 脆弱性があると `localStorage.getItem("token")` でトークンが盗まれる              |
| 深刻度 | 中                                                                   |

**Cookie にすべき理由:**

|              | localStorage (現状) | HttpOnly Cookie (推奨)    |
|--------------|-------------------|-------------------------|
| XSS でのトークン窃取 | 可能                | 不可 (JS から読めない)          |
| CSRF         | 影響なし              | `SameSite=Strict` で防御可能 |
| 実装コスト        | 低                 | バック・フロント両方の変更が必要        |

**推奨構成:**

```
Set-Cookie: noodle_map_session=<session_token>; HttpOnly; Secure; SameSite=Lax; Path=/
```

フロントは `Authorization: Bearer` ヘッダーを手動でセットする処理 (`request.ts:66-68`) が不要になり、
`credentials: "include"` を fetch に追加するだけになる。

> **Google OAuth と組み合わせる場合:** OAuth フロー後にランダムな session token を HttpOnly Cookie にセットし、DB には hash のみ保存する。

---

### C. JWT の期限・保存方式を見直す

| 項目  | 詳細                                                                 |
|-----|--------------------------------------------------------------------|
| 場所  | `server/auth/handler.go`, `server/auth/token.go` |
| 現状  | JWT に `exp` / `iat` がなく、既存トークンを DB から再利用して返している             |
| 問題  | トークン漏洩時の有効期間が実質的に `tokens` テーブルから削除されるまで続く              |
| 深刻度 | 中                                                                  |

**提案:**

- JWT には短めの `exp` を入れる
- 長期ログインが必要なら refresh token を別に持つ
- logout 時の無効化だけに頼らず、期限切れで自然に失効する設計にする
- Google OAuth + HttpOnly Cookie 化に合わせて、`tokens` テーブルの役割を再定義する

個人利用であっても、共有相手にログインを開放するなら「漏れた時にどれくらい被害が続くか」を短くしておく価値が高い。

---

### D. JWT ではなく DB セッション管理へ移行する

Google OAuth 移行後のアプリ内ログイン状態は、必ずしも JWT である必要がない。HttpOnly Cookie に自前 JWT を保存し、
DB の `token_version` と照合する方式は軽量だが、次の制約があった。

- `token_version` がユーザー単位なので、PC でログアウトするとスマホなど他デバイスの JWT も失効する
- 現在ログイン中のデバイスやブラウザを一覧できない
- 特定デバイスだけをログアウトさせる操作ができない
- 結局 DB を見に行くなら、JWT の「DBアクセスなしで検証できる」利点が薄い

現在は `sessions` テーブルを追加し、Cookie にはランダムな session token を保存する方式に変更済み。

**スキーマ案:**

```sql
create table sessions
(
    id              text     not null primary key,
    user_id         text     not null references users (id),
    token_hash      text     not null unique,
    user_agent      text     null,
    ip_address      text     null,
    created_at      datetime not null default current_timestamp,
    expires_at      datetime not null
);
```

**運用方針:**

- ログインごとに新しい session を作成する
- Cookie には生の session token を入れ、DB には hash だけ保存する
- middleware は Cookie の token を hash 化して `sessions` を検索する
- 認証成功時に DB の `expires_at` と Cookie の Max-Age をどちらも延長する
- logout は現在の session を削除する
- 全端末ログアウトはその user の全 session を削除する
- `expires_at`, user agent, IP からマイページに「現在ログイン中のデバイス」を表示する

マイページを作るときは、現在のセッション一覧、最終利用時刻 (`expires_at - sessionTTL` から算出)、端末情報、各セッションの無効化ボタンを必須機能として入れる。

---

## 🔴 未実装・中途半端な機能

### 0. カテゴリをコード固定化する

| 項目 | 詳細 |
|----|------|
| 現状 | `categories` テーブルが DB に存在し、API 経由で取得している |
| 問題 | カテゴリは「ラーメン」「うどん」の2種類で事実上固定。DB・API・フロント全体に余分な複雑さが生じている |
| 方針 | カテゴリをアプリ定数として定義し、`categories` テーブル・`/api/v1/categories` エンドポイント・`useCategories` フックを削除する |

**変更範囲:**

- `db/`: `categories` テーブル・シードデータを削除（goose マイグレーションで対応）
- `server/categories/`: パッケージごと削除
- `server/restaurants/`: カテゴリ取得ロジックを定数判定に置き換え
- `web/src/features/categories/`: `useCategories` フックを削除
- フロントエンド各所: `allCategories` 引数を `getCategoryType` から除いて定数判定に変更
- `web/src/features/search/utils.ts`: `getCategoryType` をカテゴリ名ではなく `restaurant.categories` 内の固定スラッグで判定するよう変更

タグ機能（項目14）と組み合わせると「大分類はコード固定 + 細分類はタグ」という整理になる。

---

### 1. カテゴリ更新が完全に無効化されている

| 項目 | 詳細                                                                                                 |
|----|----------------------------------------------------------------------------------------------------|
| 場所 | `server/restaurants/handler.go` / `web/src/features/restaurants/restaurant-edit-modal.tsx:274` |
| 状態 | バックエンドに `// TODO: impl updating categories` が残り、フロントの `<Select>` が `disabled` ハードコード               |
| 影響 | 店舗編集画面でカテゴリを変更できない                                                                                 |

**提案**: バックエンドの update 処理を完成させ、フロントの `disabled` を外す。

---

### 2. 画像アップロードがモック止まり

| 項目 | 詳細                                                             |
|----|----------------------------------------------------------------|
| 場所 | `web/src/pages/admin/image-uploader.tsx:28`                    |
| 状態 | `// Mock image upload` コメントがあり、base64 でメモリに持つだけ。DB/ストレージへの保存なし |
| 備考 | `restaurant_images` テーブルは存在し sqlc クエリも生成済みだが、API エンドポイントが未実装   |

**提案**: 使わないなら UI からタブごと削除してコードを整理する。実装するなら DB 保存または S3/GCS への upload
エンドポイントを追加する。

---

### 3. レストラン削除が存在しない

| 項目 | 詳細                                               |
|----|--------------------------------------------------|
| 場所 | フロント・バック共に未実装                                    |
| 状態 | `DELETE /restaurants/:id` エンドポイントなし、管理画面に削除ボタンなし |
| 影響 | 管理画面から店舗を消す手段がない                                 |

**提案**: `DELETE /restaurants/:id` エンドポイントと管理画面の削除ボタンを追加する。

---

### 4. `temporary_users` テーブルが完全に未使用

| 項目 | 詳細                                                         |
|----|------------------------------------------------------------|
| 場所 | `db/temporary_users/schema.sql` / `server/infra/models.go` |
| 状態 | スキーマ・クエリが生成されているが、どこからも参照されていない                            |

**提案**: 使う予定がなければテーブルとコードを削除してノイズを減らす。

---

## 🟡 セキュリティ上の問題点

### 5. Login の `BindJSON` エラーチェック漏れ → OAuth 移行で削除予定

| 項目  | 詳細                          |
|-----|-----------------------------|
| 場所  | `server/auth/handler.go:80` |
| 深刻度 | 高                           |

```go
// 現状: エラーを無視
ctx.BindJSON(&req)

// 修正案
if err := ctx.BindJSON(&req); err != nil {
ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
return
}
```

不正な JSON を送ると空文字で処理が続行される。
ただし Google OAuth へ移行する場合、メール/パスワードの `POST /login` 自体を削除するため、単独修正は不要。OAuth
移行前に現行ログインを残す場合のみ修正対象。

---

### 6. プロキシを全 IP 信頼している

| 項目  | 詳細                  |
|-----|---------------------|
| 場所  | `server/main.go:89` |
| 深刻度 | 中                   |

```go
// 現状: 全 IP を信頼
r.SetTrustedProxies([]string{"0.0.0.0/0", "::/0"})

// 修正案 (ローカル開発)
r.SetTrustedProxies(nil)
```

`X-Forwarded-For` の詐称が可能になり、IP ベースのレート制限等が意味をなさなくなる。

---

### 7. パスワードのバリデーションなし → OAuth 移行で削除予定

| 項目  | 詳細                                                                                    |
|-----|---------------------------------------------------------------------------------------|
| 場所  | `web/src/pages/login/index.tsx` / `web/src/pages/register/index.tsx` / `server/auth/` |
| 深刻度 | 低〜中                                                                                   |

フロント・バック共に「空でなければ OK」というチェックしかない。
ただし Google OAuth へ移行する場合、パスワード登録・ログインフォーム自体を削除するため、単独対応は不要。

---

### 7.1. `local.env` が git 管理対象になっている

| 項目  | 詳細                                                 |
|-----|----------------------------------------------------|
| 場所  | `batch/backup-db/local.env` / `cmd/restore-db/local.env` |
| 状態  | 現在の中身は空値テンプレートだが、ファイル自体は `git ls-files` に含まれている      |
| 深刻度 | 中                                                  |

AWS キーや DB パスワードを入れる想定のファイルが追跡対象になっているため、将来の事故が起きやすい。

**提案:**

- `local.env` は git 管理から外す
- `local.env.example` を追加し、必要なキー名だけを残す
- `.gitignore` に `local.env` / `*.local.env` を追加する
- 既に実値をコミットした履歴がある場合はキーをローテーションする

---

## 🟢 UI/UX 改善点

### 8. 検索・フィルタ結果が 0 件の時に何も表示されない

| 場所 | `web/src/pages/search/index.tsx` |
|----|----------------------------------|

フィルタを絞ると地図もリストも無言になる。「該当する店舗が見つかりませんでした」等の empty state を追加する。

---

### 9. 管理画面にローディング表示がない

| 場所 | `web/src/pages/admin/index.tsx` |
|----|---------------------------------|

SWR のローディング状態を見ていないため、データ取得中は画面が空のまま。スピナーや skeleton を追加する。

---

### 10. PWA インストール案内がない

PWA 対応済みであれば、スマホ利用時に「ホーム画面に追加できる」ことを控えめに案内するとよい。

**方針:**
- 強いモーダルではなく、初回だけ小さなバナーやトーストで案内する
- 文言は「PWA」ではなく「ホーム画面に追加」「アプリのように開ける」に寄せる
- Android/Chrome は `beforeinstallprompt` でインストール導線を出す
- iOS Safari は自動プロンプトが出せないため、手順説明を表示する
- `display-mode: standalone` でインストール済みなら案内しない
- 設定/メニュー内に「ホーム画面に追加」を常設し、初回バナーを閉じた後も見つけられるようにする

**文言例:**

```text
ホーム画面に追加すると、地図をアプリのように開けます。
```

---

### 11. Google Places 連携が名前・座標・住所しか使っていない ⚠️ 規約上の制約あり

| 場所 | `web/src/features/map/google-place-finder.tsx` |
|----|------------------------------------------------|

Places API のレスポンスから名前・座標・住所・郵便番号しか取得していない。電話番号・営業時間・公式 URL など豊富な情報が取れるが、
**拡充の前に規約を確認する必要がある。**

#### Google Maps Platform 規約における保存制限

> "You must not pre-fetch, cache, index, or store any Content, except that you may store: (a) **place IDs** ...
> indefinitely"
> — [Google Maps Platform Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)

| データ種別                                    | 保存の可否                                  |
|------------------------------------------|----------------------------------------|
| `place_id`                               | ✅ **明示的に許可。無期限保存可** (12ヶ月以上経過したら再取得推奨) |
| 名前・住所・座標・電話番号・営業時間など Places API から取得した情報 | ❌ **原則キャッシュ・保存禁止**                     |

#### 現状の問題点

現在も Places API 経由で取得した `name`・`address`・`postal_code` を DB に保存しており、**厳密には規約違反の可能性がある。
**
ただし `google_place_id` を保存しているため、表示時に都度 Places API から最新情報を引く設計に変えることが規約準拠の正しいアプローチ。

#### 方針決定: フォーム入力補助として割り切る

Places API は「検索して入力欄を自動補完するだけ」の用途に留め、ユーザーが確認・編集して保存したデータはユーザー自身のレコードとして扱う。
個人・非公開・非商用という条件下ではこの運用が現実的であり、`google_place_id` を保持しているため将来的な検証・更新にも対応できる。

- **拡充は非推奨**: 電話番号・営業時間・URL を新たに DB カラムに追加して保存すると違反が拡大するため、当初案 (項目10) は*
  *見送り**。
- **公開・商用化する際は再検討**: その時点で `google_place_id` のみ保存して表示時に都度取得する設計への移行を検討する。

---

### 12. Google Maps API キー分離 / Places 検索補助のバックエンド経由化

現在は `web/src/features/map/google-place-finder.tsx` から Google Maps JavaScript API の Places library を直接利用している。
`VITE_GOOGLE_API_KEY` はビルド後の JavaScript に埋め込まれるため、キー自体はブラウザから見える。

地図表示に使う Maps JavaScript API はクライアントサイド用 API
なのでフロントエンドで使ってよい。一方、店舗追加・編集時の検索補助 (`autocomplete` / `place details`)
は課金・濫用対策のためバックエンド経由に寄せる。

**推奨構成:**

| 用途                      | 所持場所                                    | 制限                                                |
|-------------------------|-----------------------------------------|---------------------------------------------------|
| Maps JavaScript API 用キー | フロントエンド (`VITE_GOOGLE_MAPS_JS_API_KEY`) | HTTP referrer 制限 + Maps JavaScript API のみに API 制限 |
| Places 検索補助用キー          | バックエンド環境変数 (`GOOGLE_PLACES_API_KEY`)    | サーバーIP制限 + Places API のみに API 制限                  |

**変更後のフロー:**

```text
frontend
  -> GET /api/v1/auth/google-places/autocomplete?q=...
  -> GET /api/v1/auth/google-places/details?placeId=...

backend
  -> Google Places API
```

**実装方針:**

- 検索補助 API は `auth` 配下に置き、管理者だけ利用可能にする
- フロントエンドは Google Places を直接叩かず、自前 API を叩く
- 入力文字数・呼び出し頻度に制限を入れる
- Google 由来データの自動収集・定期同期は行わない
- 既存の「UI上で検索 → オートフィル → ユーザー確認 → 追加」フローを維持する

バックエンド経由化の目的は API キー保護、課金管理、濫用対策であり、Google Places を自動収集ソースとして使うためではない。

---

### 13. エラーハンドリング全体の見直し

登録時の重複エラーに限らず、アプリ全体でエラーが不親切または不整合。

#### 対応済み

- TypeSpec に `type` ベースの typed error body を追加した。
- エンドポイントごとの `400` response body を分け、店舗追加/更新では `fieldErrors` と field 名 union を生成できるようにした。
- `api/openapi.yaml`, `web/src/generated/api.ts`, `server/api/api.gen.go` は TypeSpec から再生成する運用にした。
- フロントエンドは `openapi-fetch` の `createClient<paths>()` を使い、path/method/body/path params/error response を生成型に接続した。
- Mutation 系は `throw` ではなく `ApiMutationResult<TData, TErrorBody>` を返すようにし、呼び出し側で `fieldErrors` の型を保持できるようにした。
- `toastApiError()` は raw error や `JSON.stringify(err)` を表示せず、`type` / HTTP status を日本語メッセージへ変換するようにした。
- バックエンドは `server/httperrors` を追加し、公開用 error body と内部エラー詳細を分ける土台を作った。
- `permission_denied` は `500` ではなく `403` で返すようにした。

#### フロントエンド

| 問題                                                              | 場所                                                    | 深刻度 |
|-----------------------------------------------------------------|-------------------------------------------------------|-----|
| フォーム API の `fieldErrors` を各入力コンポーネントにまだ表示していない | 管理画面の追加/編集フォーム | 中 |
| Google Places API のエラーが生のステータス文字列 (`ZERO_RESULTS` 等) のまま表示される   | `web/src/features/map/google-place-finder.tsx:78`     | 中   |
| SWR のエラー状態をどのページも表示していない (fetch 失敗時に画面が空のまま)                    | 各フック                                                  | 中   |

#### バックエンド

| 問題                                                             | 場所                                                                                           | 深刻度 |
|----------------------------------------------------------------|----------------------------------------------------------------------------------------------|-----|
| 重複 `google_place_id` 登録時など、DB 制約エラーを user-safe な typed error に変換する処理がまだ不足している | `server/restaurants/` | 高 |
| サーバー側のログ方針がまだ統一されていない | 全ハンドラ | 中 |

**残タスクの方向性:**

- フォームは API mutation の `result.error.body.fieldErrors` を各入力欄に接続する。
- Snackbar/toast に出すエラーと field error に落とすエラーの分岐を画面単位で実装する。
- Google Places のエラーもユーザー向けメッセージに変換する。
- SWR の `error` / `isLoading` を画面に反映し、取得失敗時に空画面にならないようにする。
- DB 制約エラーはサーバー側で typed error に変換し、内部詳細はログにだけ残す。

---

## 🧹 実装品質・小さなバグ

### 13.1. 店舗一覧取得時の ID 配列生成に空 UUID が混ざる

| 項目 | 詳細                                                    |
|----|-------------------------------------------------------|
| 場所 | `server/restaurants/handler.go`                 |
| 状態 | 修正済み。`make([]uuid.UUID, 0, len(rs))` で生成する |

```go
ids := make([]uuid.UUID, 0, len(rs))
for _, r := range rs {
    ids = append(ids, r.ID)
}
```

---

### 13.2. 管理画面のモバイル下部ナビが見た目だけになっている

| 項目 | 詳細                              |
|----|---------------------------------|
| 場所 | `web/src/pages/admin/index.tsx` |
| 状態 | 「リスト」「地図」のボタン表示はあるが、表示切り替えの状態管理がない |

モバイル管理画面では地図とリストを行き来したいはずなので、下部ナビに実際の view state を持たせる。
実装しないなら、押せる UI に見える要素を減らして誤操作感をなくす。

---

## 🗄️ データベース移行: PostgreSQL → SQLite

コスト削減のため PostgreSQL から軽量 DB への移行を検討。

### 移行難易度: 中

SQLite への移行は可能だが、以下の PostgreSQL 固有機能の書き換えが必要。

| 箇所                                 | 内容                                              | 対応コスト |
|------------------------------------|-------------------------------------------------|-------|
| `db/function/update_timestamp.sql` | PL/pgSQL トリガー → SQLite トリガー構文に書き換え (全8テーブル)     | 小     |
| `db/restaurants/query.sql`         | `ANY($1::uuid[])` → `IN (?, ?, ...)` に書き換え      | 小     |
| 全スキーマ                              | UUID 型 → TEXT、`timestamptz` → DATETIME          | 小     |
| 全クエリ                               | `::double precision` 等の型キャスト → `CAST()` に変換     | 小     |
| `server/main.go`                   | ドライバを `lib/pq` → `mattn/go-sqlite3` に変更、接続文字列変更 | 小     |
| `sqlc.yml`                         | engine を `postgresql` → `sqlite` に変更して再生成       | 小     |
| `db/init.sh`                       | `COPY` コマンド (PostgreSQL 専用) → INSERT 文に変換       | 小     |
| `docker-compose.yml`               | PostgreSQL サービスを削除                              | 極小    |

**総工数見積もり: 2〜3日**

### 選択肢の比較

| DB                              | 特徴                                  | 推奨度             |
|---------------------------------|-------------------------------------|-----------------|
| **SQLite** (`mattn/go-sqlite3`) | ファイルベース、ゼロ運用コスト、単一ホスト向け             | ◎ 個人利用なら最適      |
| **libsql / Turso**              | SQLite 互換 + エッジ分散対応、ドロップイン置換        | ○ 将来共有機能を強化するなら |
| **MySQL / MariaDB**             | PostgreSQL より移行しやすいが Docker 運用は変わらず | △ コスト削減効果が薄い    |
| **DuckDB**                      | 分析向け OLAP、トランザクション用途には不向き           | ✗ このプロジェクトには不向き |

### 推奨

個人利用・単一ホストであれば **SQLite** が最適。ファイル1つで完結し、Docker の PostgreSQL コンテナが不要になる。
将来的に共有機能を本格化する場合は **Turso** (libsql) への移行が自然な次のステップ。

---

## 🧱 バックエンドアーキテクチャ方針

ドメインロジックは今後も厚くなりにくいため、常設の `domain` / `usecase` レイヤーは置かない。
基本は薄い vertical slice とし、HTTP 境界・DB・外部 API の依存を分かりやすく保つ。

**方針:**

- `api/`: OpenAPI 生成コードと transport adapter。request/response 変換とルーティング境界を担う。
- `auth/`, `restaurants/`, `categories/`: 機能単位の処理を置く。単純 CRUD は handler/repository だけでよい。
- `infra/`: DB、Google API、Storage など外部境界を置く。sqlc 生成コードは `infra/db` に集約する。
- `domain/` や `service.go` は常設しない。複数 repository をまたぐ処理、トランザクション、外部 API と DB の組み合わせが出た機能にだけ追加する。

sqlc の `emit_interface` は使わない。巨大な生成 interface ではなく、テストや差し替えが必要になった箇所にだけ小さい interface を手で定義する。

---

## 🔄 スキーママイグレーションの導入

### 現状の問題

`db/init.sh` は初回セットアップ専用のシェルスクリプトで、バージョン管理の仕組みがない。スキーマ変更のたびに手動で `psql` (
または SQLite であれば `sqlite3`) を叩く必要があり、変更履歴も追えない。

### 推奨: goose

```
go get github.com/pressly/goose/v3
```

- SQLite・PostgreSQL 両対応のため、DB移行前後で同じツールが使える
- マイグレーションファイルは SQL で書けるため sqlc との相性が良い
- DB 内の `goose_db_version` テーブルで適用済みバージョンを管理

**ディレクトリ構成イメージ:**

```
db/
  migrations/
    00001_init_schema.sql       -- +goose Up / -- +goose Down
    00002_add_google_sub.sql    ← Google OAuth 移行時
    00003_sqlite_migration.sql  ← SQLite 移行時
```

**現状の `db/init.sh` との関係:**
現行の init.sh は「最初の1回だけ動かす」用途なので、`00001_init_schema.sql` に変換して goose 管理下に置けばよい。
`db/init.sh` は削除できる。

---

## 📦 データマイグレーション

### PostgreSQL → SQLite 移行時の一回限りの移行

SQLite 移行を実施する際に既存データを引き継ぐための手順が必要。

**推奨手順:**

1. `pg_dump` で現在のデータを CSV/SQL にエクスポート
2. UUID を TEXT にキャストしながら SQLite の `.db` ファイルに INSERT
3. `goose up` で最新スキーマを適用済みの SQLite ファイルにデータを流し込む

既存の `cmd/restore-db` は PostgreSQL 専用のため、SQLite 移行後は **ファイルコピーによるバックアップ/リストア**
に置き換えるほうがシンプル。

### SQLite 移行後のバックアップ見直し

| 現状                                        | 移行後                            |
|-------------------------------------------|--------------------------------|
| `pg_dump` → gzip → S3 (`batch/backup-db`) | `.db` ファイルをそのままコピー → gzip → S3 |
| S3 から `pg_restore` (`cmd/restore-db`)     | S3 から `.db` ファイルをダウンロードして配置    |

SQLite のバックアップはファイルコピーで完結するため、`batch/backup-db` と `cmd/restore-db` の両コマンドを大幅に簡略化できる。

---

## ⏰ スケジューラ / バックグラウンドジョブ

### 現状

バックアップジョブ (`batch/backup-db`) は独立したバイナリとして存在するが、定期実行の仕組みがない。外部の cron や AWS
EventBridge で叩く前提と思われる。

### 欲しいジョブ

| ジョブ             | 内容                                             | 推奨頻度 |
|-----------------|------------------------------------------------|------|
| DB バックアップ       | SQLite `.db` ファイルを S3 にアップロード                  | 毎日   |
| Place ID リフレッシュ | Google 推奨: 12ヶ月以上古い `google_place_id` を再取得して更新 | 月1回  |

### 実装方針の選択肢

**① サーバー内蔵 (シンプル)**

`go-co-op/gocron` v2 をサーバープロセスに組み込む。

```go
// server/main.go
s := gocron.NewScheduler(time.UTC)
s.Every(1).Day().At("03:00").Do(backupJob)
s.Every(1).Month(1).Do(refreshPlaceIDsJob)
s.StartAsync()
```

- 追加インフラ不要、デプロイが単純
- サーバーが落ちるとジョブも止まる (個人用途なら許容範囲)

**② 外部 cron (現状維持・拡張)**

AWS EventBridge や systemd timer で `batch/backup-db` バイナリを定期実行。ジョブを増やすたびにバイナリを追加する。

**推奨:** 個人利用かつ単一ホストであれば **① サーバー内蔵** が最もシンプル。

---

## 🍜 個人ログ・共有向けの機能拡張案

本プロジェクトは「自分が行ったラーメン屋・うどん屋を管理する」ことが主目的なので、Google Maps から取得できる不安定な情報より、
**自分で管理する価値が高い情報**を厚くする方が相性が良い。

### 14. サブカテゴリ / タグ機能

現在のカテゴリは「ラーメン」「うどん」程度の大分類だが、実際に見返す時はさらに細かい分類で探したくなる。

**例:**

- ラーメン: 煮干し、家系、豚骨、味噌、二郎系、つけ麺、油そば
- うどん: 讃岐、武蔵野、稲庭、博多、伊勢、カレーうどん
- 横断タグ: 駅近、深夜営業、行列、現金のみ、デカ盛り、再訪したい

**設計方針:**
階層型の `sub_categories` より、複数付与できる `tags` として実装する方が柔軟。例えば「家系 + つけ麺」や「讃岐 +
カレーうどん」のような複合分類に対応しやすい。

**スキーマ案:**

```sql
create table tags
(
    id          uuid         not null primary key,
    category_id uuid         null references categories (id),
    label       varchar(255) not null,
    slug        varchar(255) not null unique,
    color       varchar(32)  null,
    sort_order  integer      not null default 0,
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);

create table restaurants_tags
(
    id            uuid        not null primary key,
    restaurant_id uuid        not null references restaurants (id),
    tag_id        uuid        not null references tags (id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (restaurant_id, tag_id)
);
```

`category_id` は nullable にしておく。これにより「ラーメン配下の家系」のような分類タグと、「駅近」「行列」のような横断タグを同じ仕組みで扱える。

### 15. 訪問ログ

現在は店舗単位の `visited / rate / favorite` しかないため、同じ店に複数回行った記録や、食べたメニューが残せない。

**追加したい情報:**

- 訪問日
- 食べたメニュー
- 価格
- その日の評価
- メモ
- 写真との紐付け

**スキーマ案:**

```sql
create table visit_logs
(
    id            uuid           not null primary key,
    restaurant_id uuid           not null references restaurants (id),
    visited_at    date           not null,
    menu_name     varchar(255)   null,
    price         integer        null,
    rate          decimal        null,
    note          varchar(65535) null,
    created_at    timestamptz    not null default now(),
    updated_at    timestamptz    not null default now()
);
```

既存の `visited_restaurants` は「最新または集計値」として残すか、`visit_logs` から導出する形に寄せる。実装を単純にするなら、最初は
`visited_restaurants` を残して `visit_logs` を追加するのが安全。

### 16. 店舗リンク / SNS URL

営業日・営業時間は変動が大きく、自前管理するとすぐに情報が古くなる。営業時間は Google Maps への導線に任せ、アプリ側では管理しやすい
SNS / 公式 URL を持つのが現実的。

**持たせたいリンク種別:**

- 公式サイト
- X
- Instagram
- Facebook
- 食べログなどの外部ページ
- その他

**スキーマ案:**

```sql
create table restaurant_links
(
    id            uuid          not null primary key,
    restaurant_id uuid          not null references restaurants (id),
    type          varchar(32)   not null,
    label         varchar(255)  not null,
    url           varchar(2048) not null,
    sort_order    integer       not null default 0,
    created_at    timestamptz   not null default now(),
    updated_at    timestamptz   not null default now()
);
```

`restaurants` に `sns_url` を1本だけ追加するより、リンクテーブルとして複数持てるようにした方が後で困りにくい。URL のドメインから
`type` を自動推定できると入力体験も良い。

### 17. Google Maps 導線強化

営業日・営業時間・臨時休業は Google Maps に全寄せする。アプリ内で正確に管理しようとしない。

**追加・改善したい導線:**

- 店舗詳細に「Google Maps で開く」を常設
- SNS / 公式リンクの近くに配置
- 営業確認が必要な情報は Google Maps へ誘導
- アプリ内で持つ場合は `status_note` 程度の自由メモに留める

これにより、NoodleMap は「自分の分類・訪問記録・共有」に集中できる。

### 18. 店舗詳細の個別URL / 共有リンク

管理画面とは別に大きな共有ページを作るより、まずは **マップ上で店舗詳細を開いた状態をURLで表現できる**
ようにするのが自然。既存のマップ体験をそのまま共有できる。

**例:**

- `/search?restaurant=<restaurant_id>`
- `/search?restaurant=<restaurant_id>&lat=35.xxxxxx&lng=139.xxxxxx`
- `/r/<restaurant_id>` 共有・OGP向けの短縮URL

**共有URLを開いた時の挙動:**

- マップが該当店舗へ移動する
- 店舗ピンが選択状態になる
- 右側パネルまたはモバイル下部シートで店舗詳細を開く
- フィルタ条件に関係なく、選択店舗の詳細は表示できる
- 店舗詳細に「共有」ボタンを置き、現在の店舗URLをコピーできる

**実装内容:**

- `selectedId` を search params の `restaurant` と同期する
- 初期表示時に `restaurant` param を読んで該当店舗を選択する
- 選択店舗が現在のフィルタ条件では非表示でも、ピンまたは詳細パネルは表示できるようにする
- 店舗詳細に共有ボタンを追加する
- `/r/:id` は通常ブラウザでは `/search?restaurant=:id` へ誘導し、SNSクローラー向けには OGP 付き HTML を返す

将来的にタグ別一覧を共有したくなった場合は、`/search?tag=家系` のように既存検索URLを拡張する。最初から別の公開一覧ページを作る必要は薄い。

### 19. OGP 画像生成

店舗詳細の共有URLを SNS やチャットに貼った時に見栄えが良くなるため、OGP 画像生成は相性が良い。

**必要なエンドポイント例:**

```text
GET /r/:id
  og:title / og:description / og:image を埋め込んだ HTML を返す

GET /api/v1/og/restaurants/:id.png
  店舗情報を元に OGP 画像を生成して返す
```

SNS クローラーは通常 JavaScript を実行しないため、SPA の `index.html` だけでは OGP が正しく出ない。サーバー側で共有用 HTML
を返す必要がある。

**OGP に載せたい情報:**

- 店名
- 大分類 + タグ
- 訪問済み / 行きたい / 閉店
- お気に入り度
- 市区町村程度の住所
- NoodleMap ロゴ / URL

画像生成は Go サーバー側で `fogleman/gg` 等を使う構成がシンプル。既に `web/src/assets/NotoSansJP-Medium.ttf`
があるため、日本語描画用フォントとして活用できる。
