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

## 破損時のリストア

### 1. バックアップ一覧を確認（ローカルから）

```sh
aws s3 ls s3://noodle-map-bucket/db-backup/ --recursive
```

### 2. Renderのサービスを停止

Renderダッシュボード → `noodle-map-backend` → **Suspend Service**

> Shell はサービスが起動中にしか使えないため、**停止前に** Shell を開いておくこと。

### 3. Shell でS3から復元

```sh
# 停止前に開いておいたShellで実行

# 現在のDBをバックアップ（念のため）
cp /work/db-data/noodle_map.db /work/db-data/noodle_map.db.broken

# S3から復元したいバックアップをダウンロード
aws s3 cp s3://noodle-map-bucket/db-backup/YYYY/MM/DD/noodle_map-YYYYMMDD-HHMMSS.db.gz /work/db-data/noodle_map.db.gz

# 解凍して上書き
gunzip -c /work/db-data/noodle_map.db.gz > /work/db-data/noodle_map.db

# 整合性確認
sqlite3 /work/db-data/noodle_map.db "PRAGMA integrity_check;"
```

`integrity_check` が `ok` を返せばリストア成功。

### 4. サービスを再開

Renderダッシュボード → **Resume Service**

`/health` エンドポイントで正常動作を確認する。
