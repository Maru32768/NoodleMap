import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "NoodleMap API" })
@server("/", "Current origin")
@route("/api/v1")
namespace NoodleMap;

@doc("UUID serialized as a string.")
scalar uuid extends string;

union ErrorType {
  "invalid_request",
  "authentication_required",
  "permission_denied",
  "google_auth_failed",
  "session_creation_failed",
  "not_found",
  "internal_error",
  "google_places_not_configured",
  "google_places_failed",
  "shop_has_visit_logs",
  "visit_image_limit_reached",
  "visit_image_processing_busy",
  "visit_images_storage_unconfigured",
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

union VisitLogField {
  "visitedOn",
  "menuName",
  "isLimitedMenu",
  "price",
  "rate",
  "eventName",
  "publicNote",
  "privateNote",
}

@doc("`file` is the uploaded image part; `imageIds` is the full ordered id list of a reorder.")
union VisitImageField {
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

model VisitLogFieldError {
  field: VisitLogField;
  type: FieldErrorType;
  message?: string;
}

model VisitImageFieldError {
  field: VisitImageField;
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

model VisitLogBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: VisitLogFieldError[];
}

model VisitImageBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: VisitImageFieldError[];
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

@doc("The shop has visit logs, so it cannot be deleted.")
model ShopHasVisitLogsErrorBody {
  type: "shop_has_visit_logs";
  message?: string;
}

@doc("The visit log already has the maximum number of images (10).")
model VisitImageLimitReachedErrorBody {
  type: "visit_image_limit_reached";
  message?: string;
}

@doc("Too many images are being processed right now; retry shortly.")
model VisitImageProcessingBusyErrorBody {
  type: "visit_image_processing_busy";
  message?: string;
}

@doc("The server has no storage for visit images configured.")
model VisitImagesStorageUnconfiguredErrorBody {
  type: "visit_images_storage_unconfigured";
  message?: string;
}

model InternalErrorBody {
  type: "internal_error";
  message?: string;
}

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
  InvalidRequestErrorBody |
  GoogleAuthBadRequestErrorBody |
  AddShopBadRequestErrorBody |
  UpdateShopBadRequestErrorBody |
  TagBadRequestErrorBody |
  AuthenticationRequiredErrorBody |
  PermissionDeniedErrorBody |
  SessionCreationFailedErrorBody |
  NotFoundErrorBody |
  ShopHasVisitLogsErrorBody |
  VisitLogBadRequestErrorBody |
  VisitImageBadRequestErrorBody |
  VisitImageLimitReachedErrorBody |
  VisitImageProcessingBusyErrorBody |
  VisitImagesStorageUnconfiguredErrorBody |
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

  @doc("Derived on the server: true when the shop has at least one visit log. Read-only.")
  eaten: boolean;

  @doc("Derived on the server: the rate of the latest visit log that has one, or 0 when none has. Read-only.")
  rate: float64;

  @doc("Derived on the server: true when the shop's rate comes from a visit log and is 80 or more. Read-only.")
  favorite: boolean;

  @doc("Number of visit logs of the shop. Read-only.")
  visitCount: int32;

  @doc("気になる度. Absent when not set. Kept after the shop is eaten, but only meaningful before.")
  wishLevel?: WishLevel;

  category: CategorySlug;
  tags: Tag[];

  @doc("External links (official site, SNS, ...) in display order.")
  links: ShopLink[];

  @doc("Derived on the server: URL of the first image of the latest visit log that has images. Absent when none has.")
  coverPhotoUrl?: string;
}

@doc("One 訪問ログ. Visit logs are listed newest first: by visitedOn, those without one last, then by creation.")
model VisitLog {
  id: uuid;

  @doc("Visit date as an ISO 8601 calendar date (YYYY-MM-DD). Absent when unknown.")
  visitedOn?: string;

  menuName?: string;
  isLimitedMenu: boolean;

  @doc("Price in yen.")
  price?: int32;

  @doc("0 to 100. Absent when the visit is not rated.")
  rate?: float64;

  @doc("催事 (department store fair, ramen festival, ...) where the shop was visited.")
  eventName?: string;

  publicNote?: string;

  @doc("Only in responses to the admin; omitted for everyone else.")
  privateNote?: string;

  @doc("The visit's images in display order; the first one represents the visit.")
  images: VisitImage[];
}

@doc("One 訪問画像: a JPEG whose long edge is at most 2048 px, already rotated upright.")
model VisitImage {
  id: uuid;

  @doc("Absolute URL of the JPEG.")
  url: string;

  width: int32;
  height: int32;

  caption?: string;
}

model VisitImagesResponse {
  images: VisitImage[];
}

@doc("A JPEG or PNG of at most 15 MB. HEIC and WebP are converted to JPEG by the client before upload.")
model UploadVisitImageRequest {
  file: HttpPart<File>;
}

@doc("Trimmed; blank or omitted clears the caption.")
model UpdateVisitImageRequest {
  @maxLength(100)
  caption?: string;
}

@doc("Every image id of the visit log exactly once, in the new display order.")
model ReorderVisitImagesRequest {
  @maxItems(10)
  imageIds: uuid[];
}

model VisitLogsResponse {
  visits: VisitLog[];
}

@doc("""
  A visit log as written by the admin. Strings are trimmed and a blank string means not set.
  On update every field is replaced, so an omitted field is cleared.
  """)
model VisitLogInput {
  @doc("ISO 8601 calendar date (YYYY-MM-DD), no later than tomorrow. Omit when unknown.")
  visitedOn?: string;

  @maxLength(200)
  menuName?: string;

  isLimitedMenu: boolean;

  @doc("Price in yen, 0 to 10,000,000.")
  @minValue(0)
  @maxValue(10000000)
  price?: int32;

  @doc("0 to 100. Omit when not rated.")
  @minValue(0)
  @maxValue(100)
  rate?: float64;

  @maxLength(100)
  eventName?: string;

  @maxLength(2000)
  publicNote?: string;

  @maxLength(2000)
  privateNote?: string;
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

  @doc("Deprecated and ignored by the server: 食べた is derived from visit logs. Older clients still send it.")
  eaten?: boolean;

  @doc("Deprecated and ignored by the server: the shop's rate is derived from visit logs. Older clients still send it.")
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
): OkResponse<TagsResponse> | BadRequestResponse<TagBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/google")
op googleAuth(@body body: GoogleAuthRequest): OkResponse<AuthResponse> | BadRequestResponse<GoogleAuthBadRequestErrorBody> | InternalServerErrorResponse<SessionCreationFailedErrorBody>;

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

@post
@route("/auth/shops")
op addShop(
  @body body: AddShopRequest,
): OkResponse<Shop> | BadRequestResponse<AddShopBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@put
@route("/auth/shops/{id}")
op updateShop(
  @path id: uuid,
  @body body: UpdateShopRequest,
): OkEmptyResponse | BadRequestResponse<UpdateShopBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Deletes a shop with its tags and links. A shop with visit logs cannot be deleted (409).")
@delete
@route("/auth/shops/{id}")
op deleteShop(
  @path id: uuid,
): NoContentResponse | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | ConflictResponse<ShopHasVisitLogsErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("A shop's visit logs, newest first. privateNote is included only for the admin.")
@get
@route("/shops/{id}/visits")
op listVisitLogs(
  @path id: uuid,
): OkResponse<VisitLogsResponse> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/shops/{id}/visits")
op addVisitLog(
  @path id: uuid,
  @body body: VisitLogInput,
): OkResponse<VisitLog> | BadRequestResponse<VisitLogBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Replaces every field of a visit log.")
@put
@route("/auth/visits/{visitId}")
op updateVisitLog(
  @path visitId: uuid,
  @body body: VisitLogInput,
): OkResponse<VisitLog> | BadRequestResponse<VisitLogBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Deletes a visit log with its images.")
@delete
@route("/auth/visits/{visitId}")
op deleteVisitLog(
  @path visitId: uuid,
): NoContentResponse | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("""
  Adds an image at the end of a visit log's images (at most 10). The server applies the EXIF orientation,
  scales the long edge down to 2048 px and stores a JPEG without metadata.
  The request's Origin must be the site's own origin (403 otherwise).
  """)
@post
@route("/auth/visits/{visitId}/images")
op uploadVisitImage(
  @path visitId: uuid,
  @header contentType: "multipart/form-data",
  @multipartBody body: UploadVisitImageRequest,
): OkResponse<VisitImage> | BadRequestResponse<VisitImageBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | ConflictResponse<VisitImageLimitReachedErrorBody> | InternalServerErrorResponse<InternalErrorBody> | ServiceUnavailableResponse<VisitImageProcessingBusyErrorBody | VisitImagesStorageUnconfiguredErrorBody>;

@doc("Replaces the display order of a visit log's images.")
@put
@route("/auth/visits/{visitId}/images/order")
op reorderVisitImages(
  @path visitId: uuid,
  @body body: ReorderVisitImagesRequest,
): OkResponse<VisitImagesResponse> | BadRequestResponse<VisitImageBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@doc("Updates an image's caption.")
@put
@route("/auth/visit-images/{imageId}")
op updateVisitImage(
  @path imageId: uuid,
  @body body: UpdateVisitImageRequest,
): OkResponse<VisitImage> | BadRequestResponse<VisitImageBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | NotFoundResponse<NotFoundErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@delete
@route("/auth/visit-images/{imageId}")
op deleteVisitImage(
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
