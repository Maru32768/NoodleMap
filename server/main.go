package main

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"

	"server/api"
	"server/auth"
	"server/backup"
	"server/categories"
	infraDB "server/infra/db"
	"server/middleware"
	"server/restaurants"
)

//go:embed data/sql/migrations
var migrations embed.FS

func main() {
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err := migrate(); err != nil {
			log.Fatal(err)
		}
		return
	}
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func migrate() error {
	dbPath := os.Getenv(DbPathEnv)
	if dbPath == "" {
		return fmt.Errorf("%s is missing", DbPathEnv)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.Up(db, "data/sql/migrations")
}

func run() error {
	dbPath := os.Getenv(DbPathEnv)
	if dbPath == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbPathEnv))
	}
	serverPort := os.Getenv(ServerPortEnv)
	if serverPort == "" {
		return errors.New(fmt.Sprintf("%s is missing.", ServerPortEnv))
	}
	tokenSecret := os.Getenv(TokenSecretEnv)
	if tokenSecret == "" {
		return errors.New(fmt.Sprintf("%s is missing.", TokenSecretEnv))
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	defer func(db *sql.DB) {
		if err := db.Close(); err != nil {
			log.Println(err)
		}
	}(db)

	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;"); err != nil {
		return fmt.Errorf("pragma: %w", err)
	}

	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("goose: set dialect: %w", err)
	}
	if err := goose.Up(db, "data/sql/migrations"); err != nil {
		return fmt.Errorf("goose: up: %w", err)
	}

	startBackupScheduler(db, backupConfig(dbPath))

	store := infraDB.NewStore(db)

	engine := gin.Default()
	engine.RedirectTrailingSlash = false
	engine.RedirectFixedPath = false
	engine.HandleMethodNotAllowed = false
	if err := engine.SetTrustedProxies([]string{"0.0.0.0/0", "::/0"}); err != nil {
		return err
	}
	engine.Use(middleware.NoCache())

	engine.GET("/health", func(ctx *gin.Context) {
		ctx.String(http.StatusOK, "ok")
	})

	restaurantHandler := restaurants.NewHandler(store)
	categoryHandler := categories.NewHandler(store)
	authHandler := auth.NewHandler(store, tokenSecret)
	api.RegisterHandlers(engine, api.NewHandler(authHandler, categoryHandler, restaurantHandler))

	if err := engine.Run(":" + serverPort); err != nil {
		return err
	}

	return nil
}

func backupConfig(dbPath string) backup.Config {
	snapshotPath := os.Getenv(BackupPathEnv)
	if snapshotPath == "" {
		snapshotPath = dbPath + ".bak"
	}
	return backup.Config{
		SnapshotPath: snapshotPath,
		S3Bucket:     os.Getenv(S3BucketEnv),
		S3Prefix:     os.Getenv(S3PrefixEnv),
		AWSRegion:    os.Getenv(AWSRegionEnv),
	}
}

func startBackupScheduler(db *sql.DB, cfg backup.Config) {
	go func() {
		var lastVersion int64 = -1

		for {
			var version int64
			if err := db.QueryRow("PRAGMA data_version").Scan(&version); err != nil {
				log.Printf("backup: data_version: %v", err)
				time.Sleep(30 * time.Minute)
				continue
			}
			if version == lastVersion {
				log.Println("backup: no changes since last backup, skipping")
				time.Sleep(30 * time.Minute)
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			if err := backup.Run(ctx, db, cfg); err != nil {
				log.Printf("backup error: %v", err)
			} else {
				lastVersion = version
			}
			cancel()
			time.Sleep(30 * time.Minute)
		}
	}()
}
