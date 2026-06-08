package shops

import "github.com/google/uuid"

type RegisteredShop struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Lat           float64   `json:"lat"`
	Lng           float64   `json:"lng"`
	Closed        bool      `json:"closed"`
	PostalCode    string    `json:"postalCode"`
	Address       string    `json:"address"`
	GooglePlaceID string    `json:"googlePlaceId"`
	Eaten         bool      `json:"eaten"`
	Rate          float64   `json:"rate"`
	Favorite      bool      `json:"favorite"`
	Category      string    `json:"category"`
	Tags          []Tag     `json:"tags"`
}

type Tag struct {
	ID        uuid.UUID `json:"id"`
	Category  *string   `json:"category,omitempty"`
	Label     string    `json:"label"`
	Slug      string    `json:"slug"`
	Color     string    `json:"color"`
	SortOrder int64     `json:"sortOrder"`
}

type AddShopCommand struct {
	Name          string      `json:"name"`
	Lat           float64     `json:"lat"`
	Lng           float64     `json:"lng"`
	PostalCode    string      `json:"postalCode"`
	Address       string      `json:"address"`
	Closed        bool        `json:"closed"`
	GooglePlaceID string      `json:"googlePlaceId"`
	Category      string      `json:"category"`
	TagIDs        []uuid.UUID `json:"tagIds"`
}

type UpdateShopCommand struct {
	Name          string      `json:"name"`
	Lat           float64     `json:"lat"`
	Lng           float64     `json:"lng"`
	PostalCode    string      `json:"postalCode"`
	Address       string      `json:"address"`
	Closed        bool        `json:"closed"`
	GooglePlaceID string      `json:"googlePlaceId"`
	Category      string      `json:"category"`
	Eaten         bool        `json:"eaten"`
	Rate          float64     `json:"rate"`
	Favorite      bool        `json:"favorite"`
	TagIDs        []uuid.UUID `json:"tagIds"`
}

type SaveTagsCommand struct {
	Tags []TagInput `json:"tags"`
}

type TagInput struct {
	ID        *uuid.UUID `json:"id"`
	Category  *string    `json:"category"`
	Label     string     `json:"label"`
	Slug      string     `json:"slug"`
	Color     string     `json:"color"`
	SortOrder int64      `json:"sortOrder"`
}
