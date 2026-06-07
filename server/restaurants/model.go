package restaurants

import "github.com/google/uuid"

type RegisteredRestaurant struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Lat           float64   `json:"lat"`
	Lng           float64   `json:"lng"`
	Closed        bool      `json:"closed"`
	PostalCode    string    `json:"postalCode"`
	Address       string    `json:"address"`
	GooglePlaceID string    `json:"googlePlaceId"`
	Visited       bool      `json:"visited"`
	Rate          float64   `json:"rate"`
	Favorite      bool      `json:"favorite"`
	Category      string    `json:"category"`
}

type AddRestaurantCommand struct {
	Name          string  `json:"name"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	PostalCode    string  `json:"postalCode"`
	Address       string  `json:"address"`
	Closed        bool    `json:"closed"`
	GooglePlaceID string  `json:"googlePlaceId"`
	Category      string  `json:"category"`
}

type UpdateRestaurantCommand struct {
	Name          string  `json:"name"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	PostalCode    string  `json:"postalCode"`
	Address       string  `json:"address"`
	Closed        bool    `json:"closed"`
	GooglePlaceID string  `json:"googlePlaceId"`
	Category      string  `json:"category"`
	Visited       bool    `json:"visited"`
	Rate          float64 `json:"rate"`
	Favorite      bool    `json:"favorite"`
}
