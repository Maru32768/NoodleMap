# PostgreSQL → SQLite マイグレーション手順

## ローカルで検証してから本番適用する

---

## Step 1: PostgreSQL の DSN を取得する

Render ダッシュボード → `noodle-map-db` → **Info** タブ → **External Database URL** をコピーする。

```
postgresql://noodle_map_user:PASSWORD@HOST:5432/noodle_map
```

これを `-pg` フラグに使う形式に変換する（`postgresql://` → `postgres://` は不要、lib/pq はどちらも対応）。

---

## Step 2: ローカルで SQLite スキーマを作る

docker-compose でサーバーを起動して goose にスキーマを作らせる。

```sh
# SEED_DB は不要（スキーマだけ作れればよい）
docker-compose up server
# /health が返ったら Ctrl+C で停止
```

---

## Step 3: マイグレーションツールを実行する

migrate-to-sqlite は builder イメージのビルド時に `/work/cmd/migrate-to-sqlite/migrate-to-sqlite` としてビルド済み。

```sh
# builder イメージをビルド（未ビルドの場合）
docker-compose build server

# builder コンテナからマイグレーションを実行
docker run --rm \
  -v noodle-map-data:/work/data \
  --entrypoint sh noodle-map-server:builder \
  -c "/work/cmd/migrate-to-sqlite/migrate-to-sqlite \
    -pg 'host=HOST port=5432 user=noodle_map_user password=PASSWORD dbname=noodle_map sslmode=require' \
    -sqlite /work/db-data/noodle_map.db"
```

成功すると各テーブルの行数が表示される：

```
connected to PostgreSQL
opened SQLite: /tmp/noodle_map_test.db
  categories                     8 rows
  users                          3 rows
  user_tokens                    2 rows
  temporary_users                0 rows
  restaurants                    120 rows
  visited_restaurants            98 rows
  restaurants_categories         240 rows
  restaurant_images              45 rows
done: 516 rows migrated
```

---

## Step 4: データを目視確認する

```sh
sqlite3 /tmp/noodle_map_test.db
```

```sql
-- 行数確認
SELECT 'categories',        COUNT(*) FROM categories
UNION ALL
SELECT 'users',             COUNT(*) FROM users
UNION ALL
SELECT 'restaurants',       COUNT(*) FROM restaurants
UNION ALL
SELECT 'visited',           COUNT(*) FROM visited_restaurants
UNION ALL
SELECT 'rest_categories',   COUNT(*) FROM restaurants_categories
UNION ALL
SELECT 'images',            COUNT(*) FROM restaurant_images;

-- データサンプル確認
SELECT id, name, closed FROM restaurants LIMIT 5;
SELECT id, email, is_admin FROM users;
SELECT r.name, vr.rate, vr.favorite
FROM visited_restaurants vr JOIN restaurants r ON r.id = vr.restaurant_id
LIMIT 5;

-- 整合性チェック
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

`integrity_check` が `ok`、`foreign_key_check` が空であれば問題なし。

---

## Step 5: サーバーを起動して動作確認する

```sh
docker-compose up
```

ブラウザで動作確認後、問題なければ本番適用へ。

---

## 本番適用

### 1. master に push してデプロイする

Render が自動デプロイし、サーバーが起動して SQLite スキーマが作られる。

> **注意**: この時点ではデータが空の状態。

### 2. Render Shell でマイグレーションを実行する

`/work/cmd/migrate-to-sqlite/migrate-to-sqlite` はデプロイ済みイメージに同梱済み。

Render ダッシュボード → `noodle-map-backend` → **Shell**:

```sh
/work/cmd/migrate-to-sqlite/migrate-to-sqlite \
  -pg "host=HOST port=5432 user=noodle_map_user password=PASSWORD dbname=noodle_map sslmode=require" \
  -sqlite /work/db-data/noodle_map.db
```

### 3. データを確認する

```sh
sqlite3 /work/db-data/noodle_map.db "PRAGMA integrity_check;"
sqlite3 /work/db-data/noodle_map.db "SELECT COUNT(*) FROM restaurants;"
```

### 4. 動作確認後、PostgreSQL を削除する

動作が安定したら `render.yaml` から `databases:` ブロックを削除してコミット。
