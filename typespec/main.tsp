import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "NoodleMap API" })
@server("/", "Current origin")
@route("/api/v1")
namespace NoodleMap;

@doc("UUID serialized as a string.")
scalar uuid extends string;

union ErrorType {
  "request_body_too_large",
  "request_body_busy",
  "request_body_timeout",
  "backup_busy",
  "invalid_request",
  "authentication_required",
  "permission_denied",
  "google_auth_failed",
  "session_creation_failed",
  "not_found",
  "internal_error",
  "google_places_not_configured",
  "google_places_failed",
  "shop_has_meal_records",
  "meal_record_image_limit_reached",
  "meal_record_image_processing_busy",
  "meal_record_images_storage_unconfigured",
}

union FieldErrorType {
  "required",
  "invalid_format",
  "out_of_range",
  "too_long",
  "duplicate",
  "unknown",
}

union GoogleAuthField {
  "credential",
}

union AddShopField {
  "name",
  "nameKana",
  "lat",
  "lng",
  "postalCode",
  "address",
  "openedAt",
  "closedAt",
  "googlePlaceId",
  "category",
  "tagIds",
  "links",
  "wishLevel",
}

union CategorySlug {
  "ramen",
  "udon",
}

union ShopLinkType {
  "official",
  "twitter",
  "instagram",
  "facebook",
  "tabelog",
  "other",
}

union UpdateShopField {
  "name",
  "nameKana",
  "lat",
  "lng",
  "postalCode",
  "address",
  "openedAt",
  "closedAt",
  "googlePlaceId",
  "category",
  "eaten",
  "rate",
  "tagIds",
  "links",
  "wishLevel",
}

@doc("気になる度 of a shop not eaten yet: low = ちょっと気になる, medium = 気になる, high = 絶対行きたい.")
union WishLevel {
  "low",
  "medium",
  "high",
}

@doc("`menuItems` covers the list and each item; the message names the item (`menuItems[0].name`).")
union MealRecordField {
  "shopIds",
  "eatenOn",
  "menuItems",
  "rate",
  "venueName",
  "publicNote",
  "privateNote",
}

@doc("`file` is the uploaded image part; `imageIds` is the full ordered id list of a reorder.")
union MealRecordImageField {
  "file",
  "caption",
  "imageIds",
}

union TagField {
  "category",
  "label",
  "slug",
  "color",
  "sortOrder",
}

model GoogleAuthFieldError {
  field: GoogleAuthField;
  type: FieldErrorType;
  message?: string;
}

model AddShopFieldError {
  field: AddShopField;
  type: FieldErrorType;
  message?: string;
}

model UpdateShopFieldError {
  field: UpdateShopField;
  type: FieldErrorType;
  message?: string;
}

model MealRecordFieldError {
  field: MealRecordField;
  type: FieldErrorType;
  message?: string;
}

model MealRecordImageFieldError {
  field: MealRecordImageField;
  type: FieldErrorType;
  message?: string;
}

model TagFieldError {
  field: TagField;
  type: FieldErrorType;
  message?: string;
}

model InvalidRequestErrorBody {
  type: "invalid_request";
  message?: string;
}

model GoogleAuthBadRequestErrorBody {
  type: "invalid_request" | "google_auth_failed";
  message?: string;
  fieldErrors?: GoogleAuthFieldError[];
}

model AddShopBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: AddShopFieldError[];
}

model UpdateShopBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: UpdateShopFieldError[];
}

model MealRecordBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: MealRecordFieldError[];
}

model MealRecordImageBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: MealRecordImageFieldError[];
}

model TagBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: TagFieldError[];
}

model AuthenticationRequiredErrorBody {
  type: "authentication_required";
  message?: string;
}

model PermissionDeniedErrorBody {
  type: "permission_denied";
  message?: string;
}

model SessionCreationFailedErrorBody {
  type: "session_creation_failed";
  message?: string;
}

model NotFoundErrorBody {
  type: "not_found";
  message?: string;
}

@doc("The shop has meal records, so it cannot be deleted.")
model ShopHasMealRecordsErrorBody {
  type: "shop_has_meal_records";
  message?: string;
}

@doc("The meal record already has the maximum number of images (10).")
model MealRecordImageLimitReachedErrorBody {
  type: "meal_record_image_limit_reached";
  message?: string;
}

@doc("Too many images are being processed right now; retry shortly.")
model MealRecordImageProcessingBusyErrorBody {
  type: "meal_record_image_processing_busy";
  message?: string;
}

@doc("The server has no storage for meal record images configured.")
model MealRecordImagesStorageUnconfiguredErrorBody {
  type: "meal_record_images_storage_unconfigured";
  message?: string;
}

model InternalErrorBody {
  type: "internal_error";
  message?: string;
}

model RequestBodyTooLargeErrorBody { type: "request_body_too_large"; message?: string; }
model RequestBodyBusyErrorBody { type: "request_body_busy"; message?: string; }
model RequestBodyTimeoutErrorBody { type: "request_body_timeout"; message?: string; }
model BackupBusyErrorBody { type: "backup_busy"; message?: string; }

// JSON bodies are limited to 256 KiB, eight concurrent calls, and ten seconds receiving time.
alias RequestBodyErrorResponse =
  { @statusCode statusCode: 413; @body body: RequestBodyTooLargeErrorBody; } |
  { @statusCode statusCode: 408; @body body: RequestBodyTimeoutErrorBody; } |
  ServiceUnavailableResponse<RequestBodyBusyErrorBody>;

@doc("The server has no Google Places API key configured.")
model GooglePlacesNotConfiguredErrorBody {
  type: "google_places_not_configured";
  message?: string;
}

@doc("The Google Places API request failed or returned an unusable response.")
model GooglePlacesFailedErrorBody {
  type: "google_places_failed";
  message?: string;
}

alias ErrorBody =
  RequestBodyTooLargeErrorBody |
  RequestBodyBusyErrorBody |
  RequestBodyTimeoutErrorBody |
  BackupBusyErrorBody |
  InvalidRequestErrorBody |
  GoogleAuthBadRequestErrorBody |
  AddShopBadRequestErrorBody |
  UpdateShopBadRequestErrorBody |
  TagBadRequestErrorBody |
  AuthenticationRequiredErrorBody |
  PermissionDeniedErrorBody |
  SessionCreationFailedErrorBody |
  NotFoundErrorBody |
  ShopHasMealRecordsErrorBody |
  MealRecordBadRequestErrorBody |
  MealRecordImageBadRequestErrorBody |
  MealRecordImageLimitReachedErrorBody |
  MealRecordImageProcessingBusyErrorBody |
  MealRecordImagesStorageUnconfiguredErrorBody |
  InternalErrorBody |
  GooglePlacesNotConfiguredErrorBody |
  GooglePlacesFailedErrorBody;

model BadRequestResponse<TError> {
  @statusCode statusCode: 400;
  @body body: TError;
}

model UnauthorizedResponse<TError> {
  @statusCode statusCode: 401;
  @body body: TError;
}

model ForbiddenResponse<TError> {
  @statusCode statusCode: 403;
  @body body: TError;
}

model NotFoundResponse<TError> {
  @statusCode statusCode: 404;
  @body body: TError;
}

model ConflictResponse<TError> {
  @statusCode statusCode: 409;
  @body body: TError;
}

model InternalServerErrorResponse<TError> {
  @statusCode statusCode: 500;
  @body body: TError;
}

model BadGatewayResponse<TError> {
  @statusCode statusCode: 502;
  @body body: TError;
}

model ServiceUnavailableResponse<TError> {
  @statusCode statusCode: 503;
  @body body: TError;
}

model OkResponse<T> {
  @statusCode statusCode: 200;
  @body body: T;
}

model OkEmptyResponse {
  @statusCode statusCode: 200;
}

model NoContentResponse {
  @statusCode statusCode: 204;
}

model User {
  id: uuid;
  email: string;
  isAdmin: boolean;
}

model GoogleAuthRequest {
  credential: string;
}

model AuthResponse {
  user: User;
}

@doc("A signed-in session (device) of the current user. `id` is not the session token.")
model AuthSession {
  id: uuid;
  userAgent?: string;

  @doc("Login time, ISO 8601 UTC.")
  createdAt: string;

  @doc("Approximate last use (expiry minus TTL; the expiry slides at most every 12 hours), ISO 8601 UTC.")
  lastUsedAt: string;

  @doc("True for the session that made this request.")
  current: boolean;
}

model SessionsResponse {
  sessions: AuthSession[];
}

model Shop {
  id: uuid;
  name: string;

  @doc("Hiragana reading of the shop name, used for search. Absent when not set.")
  nameKana?: string;

  lat: float64;
  lng: float64;

  @doc("Opening date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when unknown.")
  openedAt?: string;

  @doc("Closing date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when the shop is not closing.")
  closedAt?: string;

  postalCode: string;
  address: string;

  @doc("Google Places place id. Absent when the shop was entered by hand.")
  googlePlaceId?: string;

  @doc("Derived on the server: true when the shop has at least one meal record. Read-only.")
  eaten: boolean;

  @doc("Derived on the server: the rate of the latest meal record that has one, or 0 when none has. Read-only.")
  rate: float64;

  @doc("Derived on the server: true when the shop's rate comes from a meal record and is 80 or more. Read-only.")
  favorite: boolean;

  @doc("Number of meal records of the shop. Read-only.")
  mealRecordCount: int32;

  @doc("気になる度. Absent when not set. Kept after the shop is eaten, but only meaningful before.")
  wishLevel?: WishLevel;

  category: CategorySlug;
  tags: Tag[];

  @doc("External links (official site, SNS, ...) in display order.")
  links: ShopLink[];

  @doc("Derived on the server: URL of the first image of the latest meal record that has images. Absent when none has.")
  coverPhotoUrl?: string;
}

@doc("One 食べた記録. Meal records are listed newest first: by eatenOn, those without one last, then by creation.")
model MealRecord {
  id: uuid;
  shops: MealRecordShop[];
  venue?: Venue;

  @doc("Eating date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when unknown.")
  eatenOn?: string;

  @doc("食べたメニュー in display order.")
  menuItems: MenuItem[];

  @doc("Derived on the server: the sum of the menu item prices. Absent when no item has a price.")
  totalPrice?: int32;

  @doc("0 to 100. Absent when the meal record is not rated.")
  rate?: float64;


  publicNote?: string;

  @doc("Only in responses to the admin; omitted for everyone else.")
  privateNote?: string;

  @doc("The meal record's images in display order; the first one represents the mealRecord.")
  images: MealRecordImage[];
}

model MealRecordShop {
  id: uuid;
  name: string;
}

model Venue {
  id: uuid;
  name: string;
}

model VenuesResponse {
  venues: Venue[];
}

model VenueMealRecordsResponse {
  venue: Venue;
  mealRecords: MealRecord[];
}

@doc("One 食べたメニュー of a meal record.")
model MenuItem {
  name: string;

  @doc("True for a 限定メニュー.")
  isLimited: boolean;

  @doc("Price in yen. Absent when not recorded.")
  price?: int32;
}

@doc("One 記録の画像: a JPEG whose long edge is at most 2048 px, already rotated upright.")
model MealRecordImage {
  id: uuid;

  @doc("Absolute URL of the JPEG.")
  url: string;

  width: int32;
  height: int32;

  caption?: string;
}

model MealRecordImagesResponse {
  images: MealRecordImage[];
}

@doc("A JPEG or PNG of at most 15 MB. HEIC and WebP are converted to JPEG by the client before upload.")
model UploadMealRecordImageRequest {
  file: HttpPart<File>;
}

@doc("Trimmed; blank or omitted clears the caption.")
model UpdateMealRecordImageRequest {
  @maxLength(100)
  caption?: string;
}

@doc("Every image id of the meal record exactly once, in the new display order.")
model ReorderMealRecordImagesRequest {
  @maxItems(10)
  imageIds: uuid[];
}

model MealRecordsResponse {
  mealRecords: MealRecord[];
}

@doc("""
  A meal record as written by the admin. Strings are trimmed and a blank string means not set.
  On update every field is replaced, so an omitted field is cleared.
  """)
model MealRecordInput {
  @minItems(1)
  shopIds: uuid[];
  @doc("ISO 8601 calendar date (YYYY-MM-DD), no later than tomorrow. Omit when unknown.")
  eatenOn?: string;

  @doc("食べたメニュー in display order, at most 10. Omit for none.")
  @maxItems(10)
  menuItems?: MenuItemInput[];

  @doc("0 to 100. Omit when not rated.")
  @minValue(0)
  @maxValue(100)
  rate?: float64;

  @maxLength(100)
  venueName?: string;

  @maxLength(2000)
  publicNote?: string;

  @maxLength(2000)
  privateNote?: string;
}

@doc("One 食べたメニュー as written by the admin. The name is trimmed and must not be blank.")
model MenuItemInput {
  @maxLength(200)
  name: string;

  @doc("True for a 限定メニュー. Omit for false.")
  isLimited?: boolean;

  @doc("Price in yen, 0 to 10,000,000. Omit when not recorded.")
  @minValue(0)
  @maxValue(10000000)
  price?: int32;
}

model ShopLink {
  type: ShopLinkType;

  @doc("Display text. Absent when not set; clients fall back to the type name.")
  label?: string;

  url: string;
}

@doc("An http(s) URL of at most 2048 characters with an optional label of at most 100 characters.")
model ShopLinkInput {
  type: ShopLinkType;

  @maxLength(100)
  label?: string;

  @maxLength(2048)
  url: string;
}

model Tag {
  id: uuid;
  category?: CategorySlug;
  label: string;
  slug: string;
  color: string;
  sortOrder: int32;
}

model ShopsResponse {
  shops: Shop[];
}

model TagsResponse {
  tags: Tag[];
}

model TagInput {
  id?: uuid;
  category?: CategorySlug;
  label: string;
  slug: string;
  color: string;
  sortOrder: int32;
}

model SaveTagsRequest {
  tags: TagInput[];
}

model AddShopRequest {
  name: string;
  nameKana?: string;
  lat: float64;
  lng: float64;
  postalCode: string;
  address: string;
  openedAt?: string;
  closedAt?: string;

  @doc("Omit (or send a blank string) for a shop entered by hand. Must be unique among shops when set.")
  googlePlaceId?: string;

  category: CategorySlug;
  tagIds: uuid[];

  @doc("Omit when not set.")
  wishLevel?: WishLevel;

  @doc("At most 10 links, stored in array order. Omit for none.")
  @maxItems(10)
  links?: ShopLinkInput[];
}

model UpdateShopRequest {
  name: string;

  @doc("Omit to keep the stored reading (older clients); a blank string clears it.")
  nameKana?: string;

  lat: float64;
  lng: float64;
  postalCode: string;
  address: string;
  openedAt?: string;
  closedAt?: string;

  @doc("Omit to keep the stored place id (older clients); a blank string clears it.")
  googlePlaceId?: string;

  category: CategorySlug;

  @doc("Deprecated and ignored by the server: 食べた is derived from meal records. Older clients still send it.")
  eaten?: boolean;

  @doc("Deprecated and ignored by the server: the shop's rate is derived from meal records. Older clients still send it.")
  rate?: float64;

  tagIds: uuid[];

  @doc("Omit to keep the stored 気になる度 (older clients); an empty string clears it.")
  wishLevel?: WishLevel | "";

  @doc("Omit to keep the stored links (older clients); an array replaces them all, in array order. At most 10.")
  @maxItems(10)
  links?: ShopLinkInput[];
}

model PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText?: string;
}

model PlaceSuggestionsResponse {
  suggestions: PlaceSuggestion[];
}

model PlaceDetails {
  placeId: string;
  name: string;
  postalCode: string;

  @doc("Formatted address without the leading country name and postal code.")
  address: string;

  lat: float64;
  lng: float64;

  @doc("True when Google reports the place as permanently closed.")
  closed: boolean;
}

@get
@route("/shops")
op listShops(): OkResponse<ShopsResponse> | InternalServerErrorResponse<InternalErrorBody>;

@get
@route("/tags")
op listTags(): OkResponse<TagsResponse> | InternalServerErrorResponse<InternalErrorBody>;

@put
@route("/auth/tags")
op saveTags(
  @body body: SaveTagsRequest,
): RequestBodyErrorResponse | OkResponse<TagsResponse> | BadRequestResponse<TagBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/google")
op googleAuth(@body body: GoogleAuthRequest): RequestBodyErrorResponse | OkResponse<AuthResponse> | BadRequestResponse<GoogleAuthBadRequestErrorBody> | InternalServerErrorResponse<SessionCreationFailedErrorBody>;

@get
@route("/auth/me")
op me(): OkResponse<User> | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/logout")
op logout(): OkEmptyResponse | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@get
@route("/auth/sessions")
op listSessions(): OkResponse<SessionsResponse> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Revokes one of the current user's sessions. Revoking the current session also clears the cookie.")
@delete
@route("/auth/sessions/{id}")
op revokeSession(
  @path id: uuid,
): OkEmptyResponse | UnauthorizedResponse<AuthenticationRequiredErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Revokes every session of the current user except the current one.")
@post
@route("/auth/sessions/revoke-others")
op revokeOtherSessions(): OkEmptyResponse | UnauthorizedResponse<AuthenticationRequiredErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Admin-only forced backup, even when the DB has not changed. Requires application/json Content-Type. Returns after snapshot and configured R2 upload complete.")
@post
@route("/auth/admin/backups")
op forceBackup(): NoContentResponse | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | ServiceUnavailableResponse<BackupBusyErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/shops")
op addShop(
  @body body: AddShopRequest,
): RequestBodyErrorResponse | OkResponse<Shop> | BadRequestResponse<AddShopBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@put
@route("/auth/shops/{id}")
op updateShop(
  @path id: uuid,
  @body body: UpdateShopRequest,
): RequestBodyErrorResponse | OkEmptyResponse | BadRequestResponse<UpdateShopBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Deletes a shop with its tags and links. A shop with meal records cannot be deleted (409).")
@delete
@route("/auth/shops/{id}")
op deleteShop(
  @path id: uuid,
): NoContentResponse | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | ConflictResponse<ShopHasMealRecordsErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("A shop's meal records, newest first. privateNote is included only for the admin.")
@get
@route("/shops/{id}/meal-records")
op listMealRecords(
  @path id: uuid,
): OkResponse<MealRecordsResponse> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/meal-records")
op addMealRecord(
  @body body: MealRecordInput,
): RequestBodyErrorResponse | OkResponse<MealRecord> | BadRequestResponse<MealRecordBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@get
@route("/venues")
op listVenues(): OkResponse<VenuesResponse> | InternalServerErrorResponse<InternalErrorBody>;

@get
@route("/venues/{venueId}/meal-records")
op listVenueMealRecords(@path venueId: uuid): OkResponse<VenueMealRecordsResponse> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Replaces every field of a meal record.")
@put
@route("/auth/meal-records/{mealRecordId}")
op updateMealRecord(
  @path mealRecordId: uuid,
  @body body: MealRecordInput,
): RequestBodyErrorResponse | OkResponse<MealRecord> | BadRequestResponse<MealRecordBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Deletes a meal record with its images.")
@delete
@route("/auth/meal-records/{mealRecordId}")
op deleteMealRecord(
  @path mealRecordId: uuid,
): NoContentResponse | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("""
  Adds an image at the end of a meal record's images (at most 10). The server applies the EXIF orientation,
  scales the long edge down to 2048 px and stores a JPEG without metadata.
  The request's Origin must be the site's own origin, or a localhost one on an http (local development) site;
  403 otherwise.
  """)
@post
@route("/auth/meal-records/{mealRecordId}/images")
op uploadMealRecordImage(
  @path mealRecordId: uuid,
  @header contentType: "multipart/form-data",
  @multipartBody body: UploadMealRecordImageRequest,
): OkResponse<MealRecordImage> | BadRequestResponse<MealRecordImageBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | ConflictResponse<MealRecordImageLimitReachedErrorBody> | InternalServerErrorResponse<InternalErrorBody> | ServiceUnavailableResponse<MealRecordImageProcessingBusyErrorBody | MealRecordImagesStorageUnconfiguredErrorBody>;

@doc("Replaces the display order of a meal record's images.")
@put
@route("/auth/meal-records/{mealRecordId}/images/order")
op reorderMealRecordImages(
  @path mealRecordId: uuid,
  @body body: ReorderMealRecordImagesRequest,
): RequestBodyErrorResponse | OkResponse<MealRecordImagesResponse> | BadRequestResponse<MealRecordImageBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Updates an image's caption.")
@put
@route("/auth/meal-record-images/{imageId}")
op updateMealRecordImage(
  @path imageId: uuid,
  @body body: UpdateMealRecordImageRequest,
): RequestBodyErrorResponse | OkResponse<MealRecordImage> | BadRequestResponse<MealRecordImageBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@delete
@route("/auth/meal-record-images/{imageId}")
op deleteMealRecordImage(
  @path imageId: uuid,
): NoContentResponse | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Admin-only Google Places (New) autocomplete proxy. A blank query returns no suggestions.")
@get
@route("/auth/google-places/autocomplete")
op googlePlacesAutocomplete(
  @query q: string,
  @doc("Client-generated token grouping an autocomplete session with its details call for billing.")
  @maxLength(36)
  @pattern("^[A-Za-z0-9_-]{1,36}$")
  @query
  sessionToken: string,
  @doc("With lng, biases suggestions toward this point, e.g. where a photo was taken. Ignored alone.")
  @minValue(-90)
  @maxValue(90)
  @query
  lat?: float64,
  @doc("With lat, biases suggestions toward this point. Ignored alone.")
  @minValue(-180)
  @maxValue(180)
  @query
  lng?: float64,
): OkResponse<PlaceSuggestionsResponse> | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody> | BadGatewayResponse<GooglePlacesFailedErrorBody> | ServiceUnavailableResponse<GooglePlacesNotConfiguredErrorBody>;

@doc("Admin-only Google Places (New) place details proxy.")
@get
@route("/auth/google-places/details")
op googlePlacesDetails(
  @query placeId: string,
  @doc("The token used by the autocomplete session this selection ends.")
  @maxLength(36)
  @pattern("^[A-Za-z0-9_-]{1,36}$")
  @query
  sessionToken: string,
): OkResponse<PlaceDetails> | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody> | BadGatewayResponse<GooglePlacesFailedErrorBody> | ServiceUnavailableResponse<GooglePlacesNotConfiguredErrorBody>;
