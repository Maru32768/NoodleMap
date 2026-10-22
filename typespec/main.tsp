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
}

union CategorySlug {
  "ramen",
  "udon",
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
  googlePlaceId: string;
  eaten: boolean;
  rate: float64;

  @doc("Derived on the server: true when the shop is eaten and its rate is 80 or more. Read-only.")
  favorite: boolean;

  category: CategorySlug;
  tags: Tag[];
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
  googlePlaceId: string;
  category: CategorySlug;
  tagIds: uuid[];
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
  googlePlaceId: string;
  category: CategorySlug;
  eaten: boolean;
  rate: float64;
  tagIds: uuid[];
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
): OkEmptyResponse | BadRequestResponse<UpdateShopBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

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
