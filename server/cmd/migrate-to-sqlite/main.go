// One-time migration tool: PostgreSQL → SQLite
// Usage:
//   go run . -pg "host=... port=5432 user=... password=... dbname=noodle_map sslmode=require" \
//            -sqlite /path/to/noodle_map.db
//
// Prerequisites:
//   1. Start the new server at least once so goose creates the SQLite schema.
//   2. Stop the server.
//   3. Run this tool to copy data.
//   4. Restart the server.

package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

func main() {
	pgDSN := flag.String("pg", os.Getenv("PG_DSN"), "PostgreSQL DSN (or PG_DSN env var)")
	sqlitePath := flag.String("sqlite", os.Getenv("SQLITE_PATH"), "SQLite file path (or SQLITE_PATH env var)")
	flag.Parse()

	if *pgDSN == "" {
		log.Fatal("PostgreSQL DSN is required via -pg flag or PG_DSN env var")
	}
	if *sqlitePath == "" {
		log.Fatal("SQLite path is required via -sqlite flag or SQLITE_PATH env var")
	}

	pg, err := sql.Open("postgres", *pgDSN)
	if err != nil {
		log.Fatalf("open postgres: %v", err)
	}
	defer pg.Close()
	if err := pg.Ping(); err != nil {
		log.Fatalf("ping postgres: %v", err)
	}
	log.Println("connected to PostgreSQL")

	lite, err := sql.Open("sqlite", *sqlitePath)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	defer lite.Close()
	// Disable FK checks during bulk import; WAL for performance
	if _, err := lite.Exec("PRAGMA foreign_keys=OFF; PRAGMA journal_mode=WAL;"); err != nil {
		log.Fatalf("pragma: %v", err)
	}
	defer lite.Exec("PRAGMA foreign_keys=ON;")
	log.Printf("opened SQLite: %s", *sqlitePath)

	type step struct {
		table   string
		migrate func(*sql.DB, *sql.DB) (int, error)
	}
	steps := []step{
		{"categories", migrateCategories},
		{"users", migrateUsers},
		{"user_tokens", migrateUserTokens},
		{"temporary_users", migrateTemporaryUsers},
		{"restaurants", migrateRestaurants},
		{"visited_restaurants", migrateVisitedRestaurants},
		{"restaurants_categories", migrateRestaurantsCategories},
		{"restaurant_images", migrateRestaurantImages},
	}

	total := 0
	for _, s := range steps {
		n, err := s.migrate(pg, lite)
		if err != nil {
			log.Fatalf("migrate %s: %v", s.table, err)
		}
		log.Printf("  %-30s %d rows", s.table, n)
		total += n
	}
	log.Printf("done: %d rows migrated", total)
}

func ts(t time.Time) string {
	return t.UTC().Format("2006-01-02 15:04:05")
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func migrateCategories(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`SELECT id::text, label, icon, created_at, updated_at FROM categories`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO categories (id, label, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, label, icon string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &label, &icon, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, label, icon, ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateUsers(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`SELECT id::text, email, password, salt, is_admin, created_at, updated_at FROM users`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO users (id, email, password, salt, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, email, password, salt string
		var isAdmin bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &email, &password, &salt, &isAdmin, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, email, password, salt, boolInt(isAdmin), ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateUserTokens(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`SELECT id::text, user_id::text, token, created_at, updated_at FROM user_tokens`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO user_tokens (id, user_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, userID, token string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &userID, &token, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, userID, token, ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateTemporaryUsers(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`SELECT id::text, email, token, created_at FROM temporary_users`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO temporary_users (id, email, token, created_at) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, email, token string
		var createdAt time.Time
		if err := rows.Scan(&id, &email, &token, &createdAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, email, token, ts(createdAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateRestaurants(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`
		SELECT id::text, name, lat, lng, postal_code, address, google_place_id, closed, created_at, updated_at
		FROM restaurants`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO restaurants (id, name, lat, lng, postal_code, address, google_place_id, closed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, name, postalCode, address, googlePlaceID string
		var lat, lng float64
		var closed bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &name, &lat, &lng, &postalCode, &address, &googlePlaceID, &closed, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, name, lat, lng, postalCode, address, googlePlaceID, boolInt(closed), ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateVisitedRestaurants(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`
		SELECT id::text, restaurant_id::text, rate::float8, favorite, created_at, updated_at
		FROM visited_restaurants`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO visited_restaurants (id, restaurant_id, rate, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, restaurantID string
		var rate float64
		var favorite bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &restaurantID, &rate, &favorite, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, restaurantID, rate, boolInt(favorite), ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateRestaurantsCategories(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`SELECT id::text, restaurant_id::text, category_id::text, created_at, updated_at FROM restaurants_categories`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO restaurants_categories (id, restaurant_id, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, restaurantID, categoryID string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &restaurantID, &categoryID, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, restaurantID, categoryID, ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}

func migrateRestaurantImages(pg, lite *sql.DB) (int, error) {
	rows, err := pg.Query(`SELECT id::text, restaurant_id::text, path, created_at, updated_at FROM restaurant_images`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	tx, err := lite.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT OR IGNORE INTO restaurant_images (id, restaurant_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var count int
	for rows.Next() {
		var id, restaurantID, path string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &restaurantID, &path, &createdAt, &updatedAt); err != nil {
			return count, err
		}
		if _, err := stmt.Exec(id, restaurantID, path, ts(createdAt), ts(updatedAt)); err != nil {
			return count, fmt.Errorf("row %s: %w", id, err)
		}
		count++
	}
	return count, tx.Commit()
}
