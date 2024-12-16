package main

import (
	"database/sql"
	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"log"
	"net/http"
	"server/infrastructure"
	"server/restaurants"
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

	if err := db.Ping(); err != nil {
		return err
	}
	queries := infrastructure.New(db)

	engine := gin.Default()

	engine.GET("/health", func(ctx *gin.Context) {
		ctx.String(http.StatusOK, "ok")
	})

	apiGroup := engine.Group("/api")
	apiGroup.GET("/restaurants", func(ctx *gin.Context) {
		rs, _ := queries.FindAllRestaurants(ctx)
		visiteds, _ := queries.FindAllVisitedRestaurants(ctx)
		res := make([]restaurants.Restaurant, 10)

		for _, r := range rs {
			for _, visited := range visiteds {
				if visited.RestaurantID == r.ID {
					res = append(res, restaurants.Restaurant{
						ID:            r.ID,
						Name:          r.Name,
						Lat:           r.Lat,
						Lng:           r.Lng,
						Address:       r.Address,
						GooglePlaceID: r.GooglePlaceID,
						Rate:          visited.Rate,
						Favorite:      visited.Favorite,
					})
				}
			}
		}

		ctx.JSON(http.StatusOK, gin.H{
			"restaurants": res,
		})
	})

	authApiGroup := apiGroup.Group("/auth")
	authApiGroup.Use(func(ctx *gin.Context) {
		// TODO impl authentication
	})

	if err := engine.Run(":8888"); err != nil {
		return err
	}

	return nil
}
