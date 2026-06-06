import type { components, paths } from "@/generated/api.ts";
import type { Result } from "@/utils/result.ts";
import { err, ok } from "@/utils/result.ts";
import createClient from "openapi-fetch";

type Schema = components["schemas"];

export type ApiErrorBody = Schema[Extract<keyof Schema, `${string}ErrorBody`>];

type ErrorType = components["schemas"]["ErrorType"];

type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch";

type OperationFor<
  TPath extends keyof paths,
  TMethod extends keyof paths[TPath] & HttpMethod,
> = NonNullable<paths[TPath][TMethod]>;

type ErrorResponseStatus<TStatus extends string | number> =
  `${TStatus}` extends `2${string}` ? never : TStatus;

type JsonResponseBody<TResponse> = TResponse extends {
  content: {
    "application/json": infer TBody;
  };
}
  ? TBody
  : never;

export type ApiErrorBodyFor<
  TPath extends keyof paths,
  TMethod extends keyof paths[TPath] & HttpMethod,
> = JsonResponseBody<
  OperationFor<TPath, TMethod> extends {
    responses: infer TResponses;
  }
    ? TResponses[ErrorResponseStatus<
        Extract<keyof TResponses, string | number>
      >]
    : never
> &
  ApiErrorBody;

export type ApiMutationResult<TData, TBody extends ApiErrorBody> = Result<
  TData,
  ApiError<TBody | undefined>
>;

type ApiErrorType<TBody> = TBody extends { type: infer TType }
  ? TType extends ErrorType
    ? TType
    : undefined
  : undefined;

export const apiClient = createClient<paths>({
  credentials: "include",
});

interface ApiErrorSource {
  readonly url: RequestInfo | URL;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly body: ApiErrorBody | undefined;
}

export class ApiError<
  TBody extends ApiErrorBody | undefined = ApiErrorBody | undefined,
> extends Error {
  public readonly url: RequestInfo | URL;
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: TBody;
  public readonly type: ApiErrorType<TBody>;

  constructor(response: ApiErrorSource & { body: TBody }, message: string) {
    super(message);

    this.url = response.url;
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = response.body;
    this.type = getErrorType(response.body) as ApiErrorType<TBody>;
  }
}

export function toApiError<TBody extends ApiErrorBody>(
  input: RequestInfo | URL,
  response: Response,
  body: TBody,
): ApiError<TBody> {
  const message = errors[response.status] ?? "Unknown Error";
  return new ApiError<TBody>(
    {
      url: input,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
    },
    message,
  );
}

export function toNetworkApiError(
  input: RequestInfo | URL,
  cause: unknown,
): ApiError<undefined> {
  const message = cause instanceof Error ? cause.message : "Network Error";
  return new ApiError<undefined>(
    {
      url: input,
      ok: false,
      status: 0,
      statusText: "Network Error",
      headers: new Headers(),
      body: undefined,
    },
    message,
  );
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function throwApiError<TBody extends ApiErrorBody>(
  input: RequestInfo | URL,
  response: Response,
  body: TBody,
): never {
  throw toApiError(input, response, body);
}

export function apiOk<TData>(data: TData): Result<TData, never> {
  return ok(data);
}

export function apiError<TBody extends ApiErrorBody>(
  input: RequestInfo | URL,
  response: Response,
  body: TBody,
): Result<never, ApiError<TBody>> {
  return err(toApiError(input, response, body));
}

export async function withApiResult<TData, TBody extends ApiErrorBody>(
  input: RequestInfo | URL,
  task: () => Promise<ApiMutationResult<TData, TBody>>,
): Promise<ApiMutationResult<TData, TBody>> {
  try {
    return await task();
  } catch (err) {
    return apiErrorFromUnknown(input, err);
  }
}

function apiErrorFromUnknown(
  input: RequestInfo | URL,
  cause: unknown,
): Result<never, ApiError<undefined>> {
  return err(toNetworkApiError(input, cause));
}

export async function withApiError<T>(
  input: RequestInfo | URL,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }

    throw toNetworkApiError(input, err);
  }
}

const errors: Readonly<Record<number, string>> = {
  0: "Network Error",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

const errorTypes = new Set<ErrorType>([
  "invalid_request",
  "authentication_required",
  "permission_denied",
  "google_auth_failed",
  "session_creation_failed",
  "internal_error",
]);

function getErrorType(body: ApiErrorBody | undefined): ErrorType | undefined {
  if (!isErrorBody(body)) {
    return undefined;
  }

  return body.type;
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  if (!body || typeof body !== "object" || !("type" in body)) {
    return false;
  }

  return isErrorType(body.type);
}

function isErrorType(type: unknown): type is ErrorType {
  return typeof type === "string" && errorTypes.has(type as ErrorType);
}
