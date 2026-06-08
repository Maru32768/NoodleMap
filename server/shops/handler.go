package shops

import (
	"database/sql"
	"errors"
	"net/http"
	"server/auth"
	"server/httperrors"
	"server/infra/db"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	store *db.Store
}

var errPermissionDenied = errors.New("permission denied")

func NewHandler(store *db.Store) *Handler {
	return &Handler{
		store: store,
	}
}

func (h *Handler) GetShops(ctx *gin.Context) {
	rs, err := h.findRegisteredShops(ctx)
	if err != nil {
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"shops": rs,
	})
}

func (h *Handler) GetTags(ctx *gin.Context) {
	tags, err := h.store.FindAllTags(ctx)
	if err != nil {
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	res := make([]Tag, 0, len(tags))
	for _, tag := range tags {
		res = append(res, tagFromDB(tag))
	}

	ctx.JSON(http.StatusOK, gin.H{
		"tags": res,
	})
}

func (h *Handler) SaveTags(ctx *gin.Context) {
	var command SaveTagsCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	tags, err := h.saveTags(ctx, command)
	if err != nil {
		switch {
		case errors.Is(err, errPermissionDenied):
			httperrors.Abort(ctx, http.StatusForbidden, httperrors.PermissionDenied, "permission denied")
		case errors.Is(err, errInvalidTagCommand):
			httperrors.BadRequest(ctx, "invalid tag")
		case errors.Is(err, errDuplicateTagSlug):
			httperrors.BadRequestWithFieldErrors(ctx, "duplicate slug", []httperrors.FieldError{{
				Field: "slug",
				Type:  httperrors.FieldDuplicate,
			}})
		default:
			ctx.Error(err)
			httperrors.InternalServerError(ctx)
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"tags": tags,
	})
}

func (h *Handler) AddShop(ctx *gin.Context) {
	var command AddShopCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	r, err := h.addShop(ctx, command)
	if err != nil {
		if errors.Is(err, errPermissionDenied) {
			httperrors.Abort(ctx, http.StatusForbidden, httperrors.PermissionDenied, "permission denied")
			return
		}
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.JSON(http.StatusOK, r)
}

func (h *Handler) UpdateShop(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		httperrors.BadRequest(ctx, "invalid id")
		return
	}

	var command UpdateShopCommand
	if err := ctx.BindJSON(&command); err != nil {
		httperrors.BadRequest(ctx, "invalid request")
		return
	}

	if err := h.updateShop(ctx, id, command); err != nil {
		if errors.Is(err, errPermissionDenied) {
			httperrors.Abort(ctx, http.StatusForbidden, httperrors.PermissionDenied, "permission denied")
			return
		}
		ctx.Error(err)
		httperrors.InternalServerError(ctx)
		return
	}

	ctx.Status(http.StatusOK)
}

func (h *Handler) findRegisteredShops(ctx *gin.Context) ([]RegisteredShop, error) {
	rs, err := h.store.FindAllShops(ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(rs))
	for _, r := range rs {
		ids = append(ids, r.ID)
	}

	tagsByShopID, err := h.findTagsByShopIDs(ctx, ids)
	if err != nil {
		return nil, err
	}

	res := make([]RegisteredShop, 0, len(rs))
	for _, r := range rs {
		res = append(res, RegisteredShop{
			ID:            r.ID,
			Name:          r.Name,
			Lat:           r.Lat,
			Lng:           r.Lng,
			Closed:        r.Closed,
			PostalCode:    r.PostalCode,
			Address:       r.Address,
			GooglePlaceID: r.GooglePlaceID,
			Eaten:         r.Eaten,
			Rate:          r.Rate,
			Favorite:      r.Favorite,
			Category:      r.Category,
			Tags:          tagsOrEmpty(tagsByShopID[r.ID]),
		})
	}

	return res, nil
}

func (h *Handler) addShop(ctx *gin.Context, command AddShopCommand) (*RegisteredShop, error) {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return nil, err
	}

	if !user.IsAdmin {
		return nil, errPermissionDenied
	}

	params := db.InsertShopParams{
		ID:            uuid.New(),
		Name:          command.Name,
		Lat:           command.Lat,
		Lng:           command.Lng,
		PostalCode:    command.PostalCode,
		Address:       command.Address,
		Closed:        command.Closed,
		GooglePlaceID: command.GooglePlaceID,
		Category:      command.Category,
	}

	if err := h.store.Tx(ctx, func(store *db.Store) error {
		if err := store.InsertShop(ctx, params); err != nil {
			return err
		}

		return replaceShopTags(ctx, store, params.ID, command.TagIDs)
	}); err != nil {
		return nil, err
	}

	tagsByShopID, err := h.findTagsByShopIDs(ctx, []uuid.UUID{params.ID})
	if err != nil {
		return nil, err
	}

	return &RegisteredShop{
		ID:            params.ID,
		Name:          params.Name,
		Lat:           params.Lat,
		Lng:           params.Lng,
		Closed:        params.Closed,
		Address:       params.Address,
		GooglePlaceID: params.GooglePlaceID,
		PostalCode:    params.PostalCode,
		Eaten:         false,
		Rate:          0,
		Favorite:      false,
		Category:      params.Category,
		Tags:          tagsOrEmpty(tagsByShopID[params.ID]),
	}, nil
}

func (h *Handler) updateShop(ctx *gin.Context, id uuid.UUID, command UpdateShopCommand) error {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return err
	}

	if !user.IsAdmin {
		return errPermissionDenied
	}

	params := db.UpdateShopParams{
		ID:            id,
		Name:          command.Name,
		Lat:           command.Lat,
		Lng:           command.Lng,
		PostalCode:    command.PostalCode,
		Address:       command.Address,
		Closed:        command.Closed,
		GooglePlaceID: command.GooglePlaceID,
		Category:      command.Category,
	}

	if err := h.store.Tx(ctx, func(store *db.Store) error {
		if err := store.UpdateShop(ctx, params); err != nil {
			return err
		}

		if command.Eaten {
			if err := store.UpsertEatenShop(ctx, db.UpsertEatenShopParams{
				ID:       uuid.New(),
				ShopID:   id,
				Rate:     command.Rate,
				Favorite: command.Favorite,
			}); err != nil {
				return err
			}
		} else {
			if err := store.DeleteEatenShopByShopId(ctx, id); err != nil {
				return err
			}
		}

		return replaceShopTags(ctx, store, id, command.TagIDs)
	}); err != nil {
		return err
	}

	return nil
}

var (
	errInvalidTagCommand = errors.New("invalid tag command")
	errDuplicateTagSlug  = errors.New("duplicate tag slug")
)

// saveTags replaces the entire tag set with the desired list in a single
// transaction: tags whose id is absent from the request are deleted, tags with
// an id are updated, and tags without an id are inserted. Applying the diff
// atomically avoids the partial-failure inconsistency of per-tag mutations.
func (h *Handler) saveTags(ctx *gin.Context, command SaveTagsCommand) ([]Tag, error) {
	user, err := auth.GetContextUser(ctx)
	if err != nil {
		return nil, err
	}
	if !user.IsAdmin {
		return nil, errPermissionDenied
	}

	seenSlugs := make(map[string]struct{}, len(command.Tags))
	for _, tag := range command.Tags {
		if !validTagInput(tag) {
			return nil, errInvalidTagCommand
		}
		if _, ok := seenSlugs[tag.Slug]; ok {
			return nil, errDuplicateTagSlug
		}
		seenSlugs[tag.Slug] = struct{}{}
	}

	if err := h.store.Tx(ctx, func(store *db.Store) error {
		existing, err := store.FindAllTags(ctx)
		if err != nil {
			return err
		}

		keep := make(map[uuid.UUID]struct{}, len(command.Tags))
		for _, tag := range command.Tags {
			if tag.ID != nil {
				keep[*tag.ID] = struct{}{}
			}
		}

		for _, tag := range existing {
			if _, ok := keep[tag.ID]; ok {
				continue
			}
			if err := store.DeleteTag(ctx, tag.ID); err != nil {
				return err
			}
		}

		for _, tag := range command.Tags {
			if tag.ID == nil {
				if err := store.InsertTag(ctx, db.InsertTagParams{
					ID:        uuid.New(),
					Category:  nullableCategory(tag.Category),
					Label:     tag.Label,
					Slug:      tag.Slug,
					Color:     tag.Color,
					SortOrder: tag.SortOrder,
				}); err != nil {
					return err
				}
				continue
			}

			if err := store.UpdateTag(ctx, db.UpdateTagParams{
				ID:        *tag.ID,
				Category:  nullableCategory(tag.Category),
				Label:     tag.Label,
				Slug:      tag.Slug,
				Color:     tag.Color,
				SortOrder: tag.SortOrder,
			}); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}

	tags, err := h.store.FindAllTags(ctx)
	if err != nil {
		return nil, err
	}

	res := make([]Tag, 0, len(tags))
	for _, tag := range tags {
		res = append(res, tagFromDB(tag))
	}

	return res, nil
}

func (h *Handler) findTagsByShopIDs(ctx *gin.Context, ids []uuid.UUID) (map[uuid.UUID][]Tag, error) {
	res := make(map[uuid.UUID][]Tag, len(ids))
	if len(ids) == 0 {
		return res, nil
	}

	rows, err := h.store.FindTagsByShopIds(ctx, ids)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		res[row.ShopID] = append(res[row.ShopID], tagFromShopTagRow(row))
	}

	return res, nil
}

func replaceShopTags(ctx *gin.Context, store *db.Store, shopID uuid.UUID, tagIDs []uuid.UUID) error {
	if err := store.DeleteShopTagsByShopId(ctx, shopID); err != nil {
		return err
	}

	for _, tagID := range tagIDs {
		if err := store.InsertShopTag(ctx, db.InsertShopTagParams{
			ID:     uuid.New(),
			ShopID: shopID,
			TagID:  tagID.String(),
		}); err != nil {
			return err
		}
	}

	return nil
}

func tagFromDB(tag db.Tag) Tag {
	var category *string
	if tag.Category.Valid {
		category = &tag.Category.String
	}

	return Tag{
		ID:        tag.ID,
		Category:  category,
		Label:     tag.Label,
		Slug:      tag.Slug,
		Color:     tag.Color,
		SortOrder: tag.SortOrder,
	}
}

func tagsOrEmpty(tags []Tag) []Tag {
	if tags == nil {
		return []Tag{}
	}

	return tags
}

func validTagInput(tag TagInput) bool {
	return tag.Label != "" && tag.Slug != "" && tag.Color != ""
}

func nullableCategory(category *string) sql.NullString {
	if category == nil || *category == "" {
		return sql.NullString{}
	}

	return sql.NullString{
		String: *category,
		Valid:  true,
	}
}

func tagFromShopTagRow(row db.FindTagsByShopIdsRow) Tag {
	var category *string
	if row.Category.Valid {
		category = &row.Category.String
	}

	return Tag{
		ID:        row.ID,
		Category:  category,
		Label:     row.Label,
		Slug:      row.Slug,
		Color:     row.Color,
		SortOrder: row.SortOrder,
	}
}
