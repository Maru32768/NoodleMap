package main

import (
	"database/sql"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"log"
	"net/http"
	"os"
	"server/api"
	"server/auth"
	"server/categories"
	"server/infra"
	"server/middleware"
	"server/restaurants"
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	dbHost := os.Getenv(DbHostEnv)
	if dbHost == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbHostEnv))
	}
	dbPort := os.Getenv(DbPortEnv)
	if dbPort == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbPortEnv))
	}
	dbUser := os.Getenv(DbUserEnv)
	if dbUser == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbUserEnv))
	}
	dbPassword := os.Getenv(DbPasswordEnv)
	if dbPassword == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbPasswordEnv))
	}
	dbName := os.Getenv(DbNameEnv)
	if dbName == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbNameEnv))
	}
	dbSslMode := os.Getenv(DbSslModeEnv)
	if dbSslMode == "" {
		return errors.New(fmt.Sprintf("%s is missing.", DbSslModeEnv))
	}
	serverPort := os.Getenv(ServerPortEnv)
	if serverPort == "" {
		return errors.New(fmt.Sprintf("%s is missing.", ServerPortEnv))
	}
	tokenSecret := os.Getenv(TokenSecretEnv)
	if tokenSecret == "" {
		return errors.New(fmt.Sprintf("%s is missing.", TokenSecretEnv))
	}

	db, err := sql.Open("postgres", fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s", dbHost, dbPort, dbUser, dbPassword, dbName, dbSslMode))
	if err != nil {
		return err
	}
	defer func(db *sql.DB) {
		err := db.Close()
		if err != nil {
			log.Println(err)
		}
	}(db)

	const DbRetryTimes = 5
	for i := 1; i <= DbRetryTimes; i++ {
		if err := db.Ping(); err != nil {
			if i == DbRetryTimes {
				return err
			}
			log.Printf("Waiting DB for 10 seconds. err=%s\n", err)
			time.Sleep(10 * time.Second)
		} else {
			break
		}
	}
	store := infra.NewStore(db)

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

	restaurantHandler := restaurants.NewHandler(restaurants.NewService(store))
	categoryHandler := categories.NewHandler(categories.NewService(store))
	authHandler := auth.NewHandler(auth.NewService(store, tokenSecret))
	api.RegisterHandlers(engine, api.NewHandler(authHandler, categoryHandler, restaurantHandler))

	if err := engine.Run(":" + serverPort); err != nil {
		return err
	}

	return nil
}
