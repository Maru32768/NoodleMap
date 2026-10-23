import { toaster } from "@/components/ui/toaster.tsx";
import { AddModal } from "@/features/admin/add-modal.tsx";
import type { FindResult } from "@/features/map/google-place-finder.tsx";
import type { Tag } from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

type AddShopRequest = components["schemas"]["AddShopRequest"];

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

function renderAddModal(
  addResponse: () => Response | Promise<Response>,
  tags: Tag[] = [],
  PlaceFinder: typeof StubPlaceFinder = StubPlaceFinder,
) {
  server.use(
    http.get("/api/v1/shops", () => HttpResponse.json({ shops: [] })),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags })),
    http.post("/api/v1/auth/shops", addResponse),
  );
  const onClose = vi.fn();
  renderWithProviders(
    <AddModal
      open
      onClose={onClose}
      initialLatLng={{ lat: 35.6812, lng: 139.7671 }}
      PlaceFinder={PlaceFinder}
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

  it("sends a blank Google Place ID as empty and trims a typed one", async () => {
    const bodies: AddShopRequest[] = [];
    renderAddModal(() => HttpResponse.json(makeShop()));
    server.use(
      http.post("/api/v1/auth/shops", async ({ request }) => {
        bodies.push((await request.json()) as AddShopRequest);
        return HttpResponse.json(makeShop());
      }),
    );

    await userEvent.type(inputLabelled("Google Place ID"), "   ");
    await fillNameAndSave();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].googlePlaceId).toBe("");

    await userEvent.type(inputLabelled("Google Place ID"), " ChIJ-typed ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].googlePlaceId).toBe("ChIJ-typed");
  });

  it("omits an unset 気になる度 and sends a chosen one", async () => {
    const bodies: AddShopRequest[] = [];
    renderAddModal(() => HttpResponse.json(makeShop()));
    server.use(
      http.post("/api/v1/auth/shops", async ({ request }) => {
        bodies.push((await request.json()) as AddShopRequest);
        return HttpResponse.json(makeShop());
      }),
    );

    await fillNameAndSave();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("wishLevel");

    const wishLevel = screen.getByRole("radiogroup", { name: "気になる度" });
    expect(
      within(wishLevel).getByRole("radio", { name: "未設定" }),
    ).toBeChecked();
    await userEvent.click(
      within(wishLevel).getByRole("radio", { name: "ちょっと気になる" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].wishLevel).toBe("low");
  });

  it("shows a duplicate Google Place ID under its input until it is edited", async () => {
    const { onClose } = renderAddModal(
      fieldErrorResponse([{ field: "googlePlaceId", type: "duplicate" }]),
    );
    await userEvent.type(inputLabelled("Google Place ID"), "dup-place");

    await fillNameAndSave();

    const placeIdInput = inputLabelled("Google Place ID");
    expect(
      await screen.findByText("Google Place ID が他の店舗と重複しています"),
    ).toBeInTheDocument();
    expect(placeIdInput).toHaveAttribute("aria-invalid", "true");
    expect(placeIdInput).toHaveFocus();
    // Ark links the error text to the input once it has observed it.
    await waitFor(() =>
      expect(placeIdInput).toHaveAccessibleDescription(
        "Google Place ID が他の店舗と重複しています",
      ),
    );
    expect(screen.queryByText("店舗を追加できませんでした")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.type(placeIdInput, "2");

    expect(
      screen.queryByText("Google Place ID が他の店舗と重複しています"),
    ).toBeNull();
    expect(placeIdInput).not.toHaveAttribute("aria-invalid");
  });

  it("clears the errors of fields a picked place changes", async () => {
    renderAddModal(
      fieldErrorResponse([
        { field: "googlePlaceId", type: "duplicate" },
        { field: "name", type: "required" },
        { field: "nameKana", type: "too_long" },
        { field: "category", type: "invalid_format" },
      ]),
    );
    await fillNameAndSave();
    expect(
      await screen.findByText("Google Place ID が他の店舗と重複しています"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "場所を選ぶ" }));

    expect(inputLabelled("Google Place ID")).toHaveValue("picked-place");
    expect(inputLabelled("店名")).toHaveValue("麺屋ピック");
    expect(
      screen.queryByText("Google Place ID が他の店舗と重複しています"),
    ).toBeNull();
    // A named place replaces the name and its reading.
    expect(screen.queryByText("入力してください")).toBeNull();
    expect(screen.queryByText("100文字以内で入力してください")).toBeNull();
    // カテゴリ is not filled from the place, so its error stays.
    expect(screen.getByText("形式が正しくありません")).toBeInTheDocument();
  });

  it("keeps a name typed while the place details load", async () => {
    let loadDetails!: () => void;
    const detailsLoaded = new Promise<void>(
      (resolve) => (loadDetails = resolve),
    );
    // Like GooglePlaceFinder: onSelect is the one from the render where the
    // admin picked the place, called after the details request returns.
    function SlowPlaceFinder({
      onSelect,
    }: {
      onSelect: (res: FindResult) => void;
    }) {
      return (
        <button
          type="button"
          onClick={async () => {
            await detailsLoaded;
            onSelect({ ...place, name: "" });
          }}
        >
          場所を選ぶ
        </button>
      );
    }
    renderAddModal(() => HttpResponse.json(makeShop()), [], SlowPlaceFinder);

    await userEvent.click(screen.getByRole("button", { name: "場所を選ぶ" }));
    await userEvent.type(inputLabelled("店名"), "後から入力");
    loadDetails();

    await waitFor(() =>
      expect(inputLabelled("Google Place ID")).toHaveValue("picked-place"),
    );
    expect(inputLabelled("店名")).toHaveValue("後から入力");
  });

  it("clears a tag error when changing the category drops the tag", async () => {
    const shoyu = makeTag({ label: "醤油", category: "ramen" });
    renderAddModal(fieldErrorResponse([{ field: "tagIds", type: "unknown" }]), [
      shoyu,
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "醤油" }));
    await fillNameAndSave();
    expect(
      await screen.findByText(/^存在しないタグが含まれています/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "うどん" }));

    expect(screen.queryByText(/^存在しないタグが含まれています/)).toBeNull();
  });

  it("clears old field errors when saving again", async () => {
    let calls = 0;
    renderAddModal(() =>
      calls++ === 0
        ? fieldErrorResponse([{ field: "category", type: "invalid_format" }])()
        : HttpResponse.json({ type: "internal_error" }, { status: 500 }),
    );
    await fillNameAndSave();
    expect(
      await screen.findByText("形式が正しくありません"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(
      await screen.findByText("店舗を追加できませんでした"),
    ).toBeInTheDocument();
    expect(screen.queryByText("形式が正しくありません")).toBeNull();
  });

  it("cannot be cancelled while saving", async () => {
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => (respond = resolve));
    const { onClose } = renderAddModal(async () => {
      await responded;
      return HttpResponse.json({ type: "internal_error" }, { status: 500 });
    });
    await fillNameAndSave();

    const cancel = screen.getByRole("button", { name: "キャンセル" });
    await waitFor(() => expect(cancel).toBeDisabled());
    respond();

    expect(
      await screen.findByText("店舗を追加できませんでした"),
    ).toBeInTheDocument();
    expect(cancel).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
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
