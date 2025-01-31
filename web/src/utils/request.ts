import { token } from "@/features/auth/use-auth.ts";

export interface ApiResult<T> {
  readonly url: RequestInfo | URL;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly body: T;
}

export class ApiError extends Error {
  public readonly url: RequestInfo | URL;
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: unknown;

  constructor(response: ApiResult<unknown>, message: string) {
    super(message);

    this.url = response.url;
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = response.body;
  }
}

export async function get<T>(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, "method">,
) {
  return request<T>(input, {
    ...init,
    method: "GET",
  });
}

export async function post<T>(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, "method">,
) {
  return request<T>(input, {
    ...init,
    method: "POST",
  });
}

export async function put<T>(
  input: RequestInfo | URL,
  init?: Omit<RequestInit, "method">,
) {
  return request<T>(input, {
    ...init,
    method: "PUT",
  });
}

export async function request<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
      ...init?.headers,
    },
  });
  const body = await getResponseBody(res);
  catchError({
    url: input,
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    body,
  });

  return {
    url: input,
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    body: body as T,
  };
}

async function getResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("Content-Type")?.toLowerCase();
  if (!contentType) {
    return undefined;
  }

  const isJson = contentType.startsWith("application/json");
  if (isJson) {
    return await response.json();
  }

  const isBlob =
    contentType.startsWith("image/") ||
    contentType.startsWith("application/zip");
  if (isBlob) {
    return await response.blob();
  }

  return await response.text();
}

const errors: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

function catchError(result: ApiResult<unknown>): void {
  const error = errors[result.status];
  if (error) {
    throw new ApiError(result, error);
  }

  if (!result.ok) {
    throw new ApiError(result, "Unknown Error");
  }
}
