import { toaster } from "@/components/ui/toaster.tsx";
import { AddModal } from "@/features/admin/add-modal.tsx";
import type { FindResult } from "@/features/map/google-place-finder.tsx";
import type { components } from "@/generated/api.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

// The toaster store is global; clear it so one test's toast never leaks into the next.
afterEach(() => toaster.remove());

const place: FindResult = {
  placeId: "picked-place",
  name: "麺屋ピック",
  address: "東京都千代田区丸の内１丁目",
  postalCode: "100-0005",
  lat: 35.6812,
  lng: 139.7671,
  closed: false,
};

// Stands in for GooglePlaceFinder, whose WebGL map cannot render in jsdom.
function StubPlaceFinder({
  onSelect,
}: {
  onSelect: (res: FindResult) => void;
}) {
  return (
    <button type="button" onClick={() => onSelect(place)}>
      場所を選ぶ
    </button>
  );
}

function renderAddModal(addResponse: () => Response) {
  server.use(
    http.get("/api/v1/shops", () => HttpResponse.json({ shops: [] })),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.post("/api/v1/auth/shops", addResponse),
  );
  const onClose = vi.fn();
  renderWithProviders(
    <AddModal
      open
      onClose={onClose}
      initialLatLng={{ lat: 35.6812, lng: 139.7671 }}
      PlaceFinder={StubPlaceFinder}
    />,
  );
  return { onClose };
}

function fieldErrorResponse(
  fieldErrors: components["schemas"]["AddShopFieldError"][],
) {
  return () =>
    HttpResponse.json(
      { type: "invalid_request", fieldErrors },
      { status: 400 },
    );
}

// The label is the input's previous sibling, as the e2e suite selects it.
function inputLabelled(label: string) {
  const input = screen.getByText(label).nextElementSibling;
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`no input after ${label}`);
  }
  return input;
}

async function fillNameAndSave() {
  await userEvent.type(inputLabelled("店名"), "麺屋テスト");
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
}

describe("AddModal", () => {
  it("adds the shop and closes", async () => {
    const { onClose } = renderAddModal(() =>
      HttpResponse.json(makeShop({ name: "麺屋テスト" })),
    );

    await fillNameAndSave();

    expect(await screen.findByText("店舗を追加しました")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a duplicate Google Place ID under its input until it is edited", async () => {
    const { onClose } = renderAddModal(
      fieldErrorResponse([{ field: "googlePlaceId", type: "duplicate" }]),
    );
    await userEvent.type(inputLabelled("Google Place ID"), "dup-place");

    await fillNameAndSave();

    const placeId = inputLabelled("Google Place ID");
    expect(
      await screen.findByText("Google Place ID が他の店舗と重複しています"),
    ).toBeInTheDocument();
    expect(placeId).toHaveAttribute("aria-invalid", "true");
    expect(placeId).toHaveAccessibleDescription(
      "Google Place ID が他の店舗と重複しています",
    );
    expect(screen.queryByText("店舗を追加できませんでした")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.type(placeId, "2");

    expect(
      screen.queryByText("Google Place ID が他の店舗と重複しています"),
    ).toBeNull();
    expect(placeId).not.toHaveAttribute("aria-invalid");
  });

  it("clears the errors of fields filled from a picked place", async () => {
    renderAddModal(
      fieldErrorResponse([
        { field: "googlePlaceId", type: "duplicate" },
        { field: "category", type: "invalid_format" },
      ]),
    );
    await fillNameAndSave();
    expect(
      await screen.findByText("Google Place ID が他の店舗と重複しています"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "場所を選ぶ" }));

    expect(inputLabelled("Google Place ID")).toHaveValue("picked-place");
    expect(
      screen.queryByText("Google Place ID が他の店舗と重複しています"),
    ).toBeNull();
    // カテゴリ is not filled from the place, so its error stays.
    expect(screen.getByText("形式が正しくありません")).toBeInTheDocument();
  });

  it("toasts a field error the form has no input for", async () => {
    renderAddModal(
      fieldErrorResponse([{ field: "links", type: "invalid_format" }]),
    );

    await fillNameAndSave();

    expect(
      await screen.findByText("店舗を追加できませんでした"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^リンクの内容を確認してください/),
    ).toBeInTheDocument();
  });

  it("toasts an error that belongs to no field", async () => {
    renderAddModal(() =>
      HttpResponse.json({ type: "internal_error" }, { status: 500 }),
    );

    await fillNameAndSave();

    expect(
      await screen.findByText("店舗を追加できませんでした"),
    ).toBeInTheDocument();
  });
});
