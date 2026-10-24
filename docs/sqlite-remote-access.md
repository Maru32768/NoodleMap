# SQLiteデータへのリモートアクセス・リストア手順

本番環境（Render）でSQLiteのデータを直接参照・修正する方法をまとめます。

## 通常のデータ修正: Render Shell

Renderのダッシュボードからサービスのシェルに接続できます。

### 手順

1. [Render Dashboard](https://dashboard.render.com) を開く
2. `noodle-map-backend` サービスを選択
3. 上部タブの **Shell** をクリック
4. 以下のコマンドでSQLiteに接続:

```sh
sqlite3 /work/db-data/noodle_map.db
```

### よく使うSQLiteコマンド

```sql
-- テーブル一覧
.tables

-- テーブル定義確認
.schema restaurants

-- データ確認
SELECT * FROM restaurants LIMIT 10;

-- データ修正例
UPDATE restaurants SET closed = 1 WHERE id = 'xxx-xxx-xxx';

-- 終了
.quit
```

> **注意**: WALモードのため、サーバーが稼働中でも安全に操作できます。ただし変更は即座に反映されるので慎重に。

---

## バックアップの設定と手動実行

DB バックアップは非公開の Cloudflare R2 バケットへ保存します。Render の環境変数に
`BACKUP_R2_BUCKET` と、全用途で共通の `R2_ENDPOINT`（アカウントの S3 API URL）、
`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` を設定してください。
共通の3項目はすべて設定するか、すべて未設定にします。R2 を使う機能が1つでもあれば共通設定が必要です。
`BACKUP_R2_PREFIX` は任意です（Render の既定値は `db-backup`）。公開ドメインは不要です。
`BACKUP_R2_BUCKET` が未設定の場合はローカルの `BACKUP_PATH`（既定値は `DB_PATH.bak`）だけに保存します。
アプリ用トークンはバックアップ・OGP・訪問画像の3バケットへの Object Read & Write に限定し、
Terraform state バケットは含めません。Terraform 用の `AWS_*` 認証情報とは分けてください。
旧 `BACKUP_R2_ENDPOINT`、`BACKUP_R2_ACCESS_KEY_ID`、`BACKUP_R2_SECRET_ACCESS_KEY` は削除してください。
旧 `S3_BUCKET`、`S3_PREFIX`、`AWS_REGION`、AWS 認証情報はバックアップには使用しません。
既存の S3 オブジェクトは自動移動しないため、必要な履歴は別途 R2 へコピーしてください。

起動時と30分おきに、DB の変更があればバックアップします。管理者セッションで次を実行すると、
DB に変更がなくても新しいバックアップを作成します。

```sh
curl --fail-with-body -X POST \
  -H 'Content-Type: application/json' \
  --cookie 'noodle_map_session=YOUR_ADMIN_SESSION_TOKEN' \
  https://noodle-map.marulabs.dev/api/v1/auth/admin/backups
```

セッション Cookie はブラウザの実際の値を使用してください。JSON 本文は不要です。
保存とアップロードが完了すると `204`、未認証は `401`、管理者以外は `403`、
別のバックアップが実行中なら待機せず `503` を返します。バックアップ用バケットの
公開アクセスは無効にしてください。

## 破損時のリストア

### 1. バックアップ一覧を確認（ローカルから）

```sh
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws --endpoint-url "$R2_ENDPOINT" --region auto \
  s3 ls "s3://$BACKUP_R2_BUCKET/${BACKUP_R2_PREFIX:+$BACKUP_R2_PREFIX/}" --recursive
```

### 2. Renderのサービスを停止

Renderダッシュボード → `noodle-map-backend` → **Suspend Service**

> Shell はサービスが起動中にしか使えないため、**停止前に** Shell を開いておくこと。

### 3. Shell でR2から復元

```sh
# 停止前に開いておいたShellで実行

# 現在のDBをバックアップ（念のため）
cp /work/db-data/noodle_map.db /work/db-data/noodle_map.db.broken

# R2から復元したいバックアップをダウンロード（KEY は一覧に出た実際のオブジェクトキー）
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws --endpoint-url "$R2_ENDPOINT" --region auto \
  s3 cp "s3://$BACKUP_R2_BUCKET/KEY" /work/db-data/noodle_map.db.gz

# 解凍して上書き
gunzip -c /work/db-data/noodle_map.db.gz > /work/db-data/noodle_map.db

# 整合性確認
sqlite3 /work/db-data/noodle_map.db "PRAGMA integrity_check;"
```

`integrity_check` が `ok` を返せばリストア成功。

### 4. サービスを再開

Renderダッシュボード → **Resume Service**

`/health` エンドポイントで正常動作を確認する。
