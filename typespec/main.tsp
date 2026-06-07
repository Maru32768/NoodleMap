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
  "internal_error",
}

union FieldErrorType {
  "required",
  "invalid_format",
  "out_of_range",
  "too_long",
  "unknown",
}

union GoogleAuthField {
  "credential",
}

union AddRestaurantField {
  "name",
  "lat",
  "lng",
  "postalCode",
  "address",
  "closed",
  "googlePlaceId",
  "category",
}

union CategorySlug {
  "ramen",
  "udon",
}

union UpdateRestaurantField {
  "name",
  "lat",
  "lng",
  "postalCode",
  "address",
  "closed",
  "googlePlaceId",
  "category",
  "visited",
  "rate",
  "favorite",
}

model GoogleAuthFieldError {
  field: GoogleAuthField;
  type: FieldErrorType;
  message?: string;
}

model AddRestaurantFieldError {
  field: AddRestaurantField;
  type: FieldErrorType;
  message?: string;
}

model UpdateRestaurantFieldError {
  field: UpdateRestaurantField;
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

model AddRestaurantBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: AddRestaurantFieldError[];
}

model UpdateRestaurantBadRequestErrorBody {
  type: "invalid_request";
  message?: string;
  fieldErrors?: UpdateRestaurantFieldError[];
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

model InternalErrorBody {
  type: "internal_error";
  message?: string;
}

alias ErrorBody =
  InvalidRequestErrorBody |
  GoogleAuthBadRequestErrorBody |
  AddRestaurantBadRequestErrorBody |
  UpdateRestaurantBadRequestErrorBody |
  AuthenticationRequiredErrorBody |
  PermissionDeniedErrorBody |
  SessionCreationFailedErrorBody |
  InternalErrorBody;

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

model InternalServerErrorResponse<TError> {
  @statusCode statusCode: 500;
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

model Restaurant {
  id: uuid;
  name: string;
  lat: float64;
  lng: float64;
  closed: boolean;
  postalCode: string;
  address: string;
  googlePlaceId: string;
  visited: boolean;
  rate: float64;
  favorite: boolean;
  category: CategorySlug;
}

model RestaurantsResponse {
  restaurants: Restaurant[];
}

model AddRestaurantRequest {
  name: string;
  lat: float64;
  lng: float64;
  postalCode: string;
  address: string;
  closed: boolean;
  googlePlaceId: string;
  category: CategorySlug;
}

model UpdateRestaurantRequest {
  name: string;
  lat: float64;
  lng: float64;
  postalCode: string;
  address: string;
  closed: boolean;
  googlePlaceId: string;
  category: CategorySlug;
  visited: boolean;
  rate: float64;
  favorite: boolean;
}

@get
@route("/restaurants")
op listRestaurants(): OkResponse<RestaurantsResponse> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/google")
op googleAuth(@body body: GoogleAuthRequest): OkResponse<AuthResponse> | BadRequestResponse<GoogleAuthBadRequestErrorBody> | InternalServerErrorResponse<SessionCreationFailedErrorBody>;

@get
@route("/auth/me")
op me(): OkResponse<User> | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/logout")
op logout(): OkEmptyResponse | BadRequestResponse<InvalidRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@post
@route("/auth/restaurants")
op addRestaurant(
  @body body: AddRestaurantRequest,
): OkResponse<Restaurant> | BadRequestResponse<AddRestaurantBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;

@put
@route("/auth/restaurants/{id}")
op updateRestaurant(
  @path id: uuid,
  @body body: UpdateRestaurantRequest,
): OkEmptyResponse | BadRequestResponse<UpdateRestaurantBadRequestErrorBody> | UnauthorizedResponse<AuthenticationRequiredErrorBody> | ForbiddenResponse<PermissionDeniedErrorBody> | InternalServerErrorResponse<InternalErrorBody>;
