package main

import (
	"database/sql"
	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"log"
	"net/http"
	"server/infrastructure"
	"server/restaurants"
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	db, err := sql.Open("postgres", "host=db port=5432 user=postgres password=password dbname=noodle_map sslmode=disable")
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
			log.Println("Waiting DB for 10 seconds")
			time.Sleep(10 * time.Second)
		} else {
			break
		}
	}

	engine := gin.Default()
	engine.GET("/health", func(ctx *gin.Context) {
		ctx.String(http.StatusOK, "ok")
	})
	apiGroup := engine.Group("/api")

	restaurantHandler := restaurants.NewHandler(restaurants.NewService(infrastructure.NewStore(db)))
	apiGroup.GET("/restaurants", restaurantHandler.GetRestaurants)

	authApiGroup := apiGroup.Group("/auth")
	authApiGroup.Use(func(ctx *gin.Context) {
		// TODO impl authentication
	})

	if err := engine.Run(":8888"); err != nil {
		return err
	}

	return nil
}
