import {
  ApiError,
  apiOk,
  invalidRequestFieldErrors,
  isApiError,
  toApiError,
  withApiError,
  withApiResult,
} from "@/utils/request.ts";
import { describe, expect, it } from "vitest";

const URL = "/api/v1/shops";

function response(status: number) {
  return new Response(null, { status, statusText: `status ${status}` });
}

describe("toApiError", () => {
  it("carries the status, body, and typed error discriminator", () => {
    const body = { type: "permission_denied" as const, message: "nope" };

    const error = toApiError(URL, response(403), body);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Forbidden");
    expect(error.body).toEqual(body);
    expect(error.type).toBe("permission_denied");
  });

  it("leaves type undefined for an unknown error body type", () => {
    const body = { type: "teapot" } as unknown as { type: "internal_error" };

    const error = toApiError(URL, response(418), body);

    expect(error.type).toBeUndefined();
    expect(error.message).toBe("Unknown Error");
  });
});

describe("withApiError", () => {
  it("returns the task value", async () => {
    await expect(withApiError(URL, async () => 42)).resolves.toBe(42);
  });

  it("rethrows an ApiError unchanged", async () => {
    const apiError = toApiError(URL, response(404), {
      type: "invalid_request" as const,
    });

    await expect(
      withApiError(URL, async () => {
        throw apiError;
      }),
    ).rejects.toBe(apiError);
  });

  it("turns any other failure into a status 0 network ApiError", async () => {
    const error = await withApiError(URL, async () => {
      throw new TypeError("Failed to fetch");
    }).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 0,
      statusText: "Network Error",
      message: "Failed to fetch",
      body: undefined,
      type: undefined,
    });
  });

  it("uses a generic message when the cause is not an Error", async () => {
    const error = await withApiError(URL, async () => {
      throw "offline";
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, message: "Network Error" });
  });
});

describe("withApiResult", () => {
  it("returns the task result", async () => {
    await expect(
      withApiResult(URL, async () => apiOk("done")),
    ).resolves.toEqual({ ok: true, data: "done" });
  });

  it("returns a network error result instead of throwing", async () => {
    const result = await withApiResult(URL, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.status).toBe(0);
  });
});

describe("invalidRequestFieldErrors", () => {
  it("returns the field errors of an invalid_request body", () => {
    const fieldErrors = [
      { field: "nameKana" as const, type: "too_long" as const },
    ];

    expect(
      invalidRequestFieldErrors({ type: "invalid_request", fieldErrors }),
    ).toEqual(fieldErrors);
  });

  it("returns undefined when there are no field errors", () => {
    expect(
      invalidRequestFieldErrors({ type: "invalid_request" }),
    ).toBeUndefined();
    expect(
      invalidRequestFieldErrors({ type: "invalid_request", fieldErrors: [] }),
    ).toBeUndefined();
    expect(
      invalidRequestFieldErrors({ type: "internal_error" }),
    ).toBeUndefined();
    expect(invalidRequestFieldErrors(undefined)).toBeUndefined();
  });
});
