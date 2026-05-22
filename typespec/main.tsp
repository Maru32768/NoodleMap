import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "NoodleMap API" })
@server("/", "Current origin")
@route("/api/v1")
namespace NoodleMap;

@doc("UUID serialized as a string.")
scalar uuid extends string;

model ErrorBody {
  error: string;
}

model BadRequestResponse {
  @statusCode statusCode: 400;
  @body body: ErrorBody;
}

model UnauthorizedResponse {
  @statusCode statusCode: 401;
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

model AuthRequest {
  email: string;
  password: string;
}

model AuthResponse {
  user: User;
  token: string;
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
@route("/register")
op register(@body body: AuthRequest): OkResponse<AuthResponse> | BadRequestResponse;

@post
@route("/login")
op login(@body body: AuthRequest): OkResponse<AuthResponse> | BadRequestResponse;

@get
@route("/auth/me")
@useAuth(BearerAuth)
op me(): OkResponse<User> | BadRequestResponse | UnauthorizedResponse | InternalServerErrorResponse;

@post
@route("/auth/logout")
@useAuth(BearerAuth)
op logout(): OkEmptyResponse | BadRequestResponse | UnauthorizedResponse | InternalServerErrorResponse;

@post
@route("/auth/restaurants")
@useAuth(BearerAuth)
op addRestaurant(
  @body body: AddRestaurantRequest,
): OkResponse<Restaurant> | BadRequestResponse | UnauthorizedResponse | InternalServerErrorResponse;

@put
@route("/auth/restaurants/{id}")
@useAuth(BearerAuth)
op updateRestaurant(
  @path id: uuid,
  @body body: UpdateRestaurantRequest,
): OkEmptyResponse | BadRequestResponse | UnauthorizedResponse | InternalServerErrorResponse;
