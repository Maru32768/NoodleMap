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

model ErrorBody {
  type: ErrorType;
  message?: string;
}

model BadRequestResponse {
  @statusCode statusCode: 400;
  @body body: ErrorBody;
}

model UnauthorizedResponse {
  @statusCode statusCode: 401;
  @body body: ErrorBody;
}

model ForbiddenResponse {
  @statusCode statusCode: 403;
  @body body: ErrorBody;
}

model InternalServerErrorResponse {
  @statusCode statusCode: 500;
  @body body: ErrorBody;
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

model Category {
  id: uuid;
  label: string;
  icon: string;
}

model CategoriesResponse {
  categories: Category[];
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
  categories: uuid[];
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
  categories: uuid[];
}

model UpdateRestaurantRequest {
  name: string;
  lat: float64;
  lng: float64;
  postalCode: string;
  address: string;
  closed: boolean;
  googlePlaceId: string;
  visited: boolean;
  rate: float64;
  favorite: boolean;
}

@get
@route("/restaurants")
op listRestaurants(): OkResponse<RestaurantsResponse> | InternalServerErrorResponse;

@get
@route("/categories")
op listCategories(): OkResponse<CategoriesResponse> | InternalServerErrorResponse;

@post
@route("/auth/google")
op googleAuth(@body body: GoogleAuthRequest): OkResponse<AuthResponse> | BadRequestResponse | InternalServerErrorResponse;

@get
@route("/auth/me")
op me(): OkResponse<User> | BadRequestResponse | UnauthorizedResponse | InternalServerErrorResponse;

@post
@route("/auth/logout")
op logout(): OkEmptyResponse | BadRequestResponse | UnauthorizedResponse | InternalServerErrorResponse;

@post
@route("/auth/restaurants")
op addRestaurant(
  @body body: AddRestaurantRequest,
): OkResponse<Restaurant> | BadRequestResponse | UnauthorizedResponse | ForbiddenResponse | InternalServerErrorResponse;

@put
@route("/auth/restaurants/{id}")
op updateRestaurant(
  @path id: uuid,
  @body body: UpdateRestaurantRequest,
): OkEmptyResponse | BadRequestResponse | UnauthorizedResponse | ForbiddenResponse | InternalServerErrorResponse;
