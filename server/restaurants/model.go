package restaurants

import "github.com/google/uuid"

type Restaurant struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Lat           float64   `json:"lat"`
	Lng           float64   `json:"lng"`
	Address       string    `json:"address"`
	GooglePlaceID string    `json:"googlePlaceId"`
	Rate          string    `json:"rate"`
	Favorite      bool      `json:"favorite"`
}
