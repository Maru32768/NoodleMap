import { toaster } from "@/components/ui/toaster.tsx";
import { resetMealRecordUploads } from "@/features/meal-records/api/meal-record-uploads.ts";
import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import type { components } from "@/generated/api.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

type MealRecord = components["schemas"]["MealRecord"];
type MealRecordImage = components["schemas"]["MealRecordImage"];

afterEach(() => {
  toaster.remove();
  resetMealRecordUploads();
});

const shop = makeShop({
  name: "中華そば 青葉",
  eaten: true,
  mealRecordCount: 1,
});

function image(n: number, caption?: string): MealRecordImage {
  return {
    id: `00000000-0000-4000-8000-0000000001${n.toString().padStart(2, "0")}`,
    url: `https://img.example.test/${n}.jpg`,
    width: 2048,
    height: 1536,
    caption,
  };
}

// Uploads (and their failures) are kept per meal record outside React, so each
// test gets its own mealRecord.
let nextMealRecord = 1;

function makeMealRecord(images: MealRecordImage[]): MealRecord {
  return {
    id: `00000000-0000-4000-8000-0000000002${(nextMealRecord++).toString().padStart(2, "0")}`,
    eatenOn: "2026-09-30",
    shops: [shop],
    venue: { id: "venue-1", name: "ラーメンWalkerキッチン" },
    menuItems: [{ name: "中華そば", isLimited: false }],
    images,
  };
}

const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

/**
 * Renders the edit modal on 食べた記録 with one mealRecord. Each upload response
 * appends an image to the served meal record (as the server does); requests are
 * recorded.
 */
async function renderImages({
  images = [] as MealRecordImage[],
  uploadResponse,
}: {
  images?: MealRecordImage[];
  uploadResponse?: (attempt: number) => Response | undefined;
} = {}) {
  let mealRecord = makeMealRecord(images);
  const traffic = {
    uploads: 0,
    // Uploads and meal record fetches in arrival order.
    log: [] as ("upload" | "mealRecords")[],
    reorders: [] as string[][],
    captions: [] as { id: string; caption?: string }[],
    deleted: [] as string[],
    fetched: { mealRecords: 0, shops: 0 },
  };
  server.use(
    http.get("/api/v1/venues", () => HttpResponse.json({ venues: [] })),
    http.get("/api/v1/shops", () => {
      traffic.fetched.shops++;
      return HttpResponse.json({ shops: [shop] });
    }),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.get(`/api/v1/shops/${shop.id}/meal-records`, () => {
      traffic.fetched.mealRecords++;
      traffic.log.push("mealRecords");
      return HttpResponse.json({ mealRecords: [mealRecord] });
    }),
    http.post(
      `/api/v1/auth/meal-records/${mealRecord.id}/images`,
      async ({ request }) => {
        // The multipart body cannot be read back (nor left unread for long) in
        // jsdom; check its type only.
        expect(request.headers.get("content-type")).toMatch(
          /^multipart\/form-data; boundary=/,
        );
        const attempt = ++traffic.uploads;
        traffic.log.push("upload");
        const custom = uploadResponse?.(attempt);
        if (custom) {
          return custom;
        }
        const added = image(50 + attempt);
        mealRecord = { ...mealRecord, images: [...mealRecord.images, added] };
        return HttpResponse.json(added);
      },
    ),
    http.put(
      `/api/v1/auth/meal-records/${mealRecord.id}/images/order`,
      async ({ request }) => {
        const { imageIds } = (await request.json()) as { imageIds: string[] };
        traffic.reorders.push(imageIds);
        const byId = new Map(mealRecord.images.map((i) => [i.id, i]));
        mealRecord = {
          ...mealRecord,
          images: imageIds.map((id) => byId.get(id)!),
        };
        return HttpResponse.json({ images: mealRecord.images });
      },
    ),
    http.put(
      "/api/v1/auth/meal-record-images/:imageId",
      async ({ params, request }) => {
        const body = (await request.json()) as { caption?: string };
        const id = params.imageId as string;
        traffic.captions.push({ id, ...body });
        mealRecord = {
          ...mealRecord,
          images: mealRecord.images.map((i) =>
            i.id === id ? { ...i, caption: body.caption } : i,
          ),
        };
        return HttpResponse.json(mealRecord.images.find((i) => i.id === id));
      },
    ),
    http.delete("/api/v1/auth/meal-record-images/:imageId", ({ params }) => {
      traffic.deleted.push(params.imageId as string);
      mealRecord = {
        ...mealRecord,
        images: mealRecord.images.filter((i) => i.id !== params.imageId),
      };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const onClose = vi.fn();
  renderWithProviders(
    <ShopEditModal
      shop={shop}
      open
      initialTab="mealRecord"
      onClose={onClose}
      onDeleted={vi.fn()}
    />,
  );
  await screen.findByRole("dialog");
  return Object.assign(traffic, { onClose });
}

const IMAGE_LIST = { name: "記録の画像" } as const;
const imageList = () => screen.findByRole("list", IMAGE_LIST);
// For waitFor, which retries a synchronous query; a findBy inside it would
// spend the whole wait on one attempt.
const currentImageList = () => screen.getByRole("list", IMAGE_LIST);
const fileInput = () => screen.getByLabelText("追加する画像ファイル");
const dropArea = () => screen.getByRole("group", { name: /^画像（/ });

/** Reports a mouse (fine pointer), which the drop and paste hint is for. */
function reportFinePointer() {
  const original = window.matchMedia;
  window.matchMedia = (query: string) => ({
    ...original(query),
    matches: query === "(pointer: fine)",
  });
  onTestFinished(() => {
    window.matchMedia = original;
  });
}

async function upload(...files: File[]) {
  await screen.findByRole("list", { name: "食べた記録" });
  await userEvent.upload(fileInput(), files);
}

describe("MealRecordImageManager", () => {
  it("marks the first image as the meal record's 代表", async () => {
    await renderImages({ images: [image(1, "味玉"), image(2)] });

    const [first, second] = within(await imageList()).getAllByRole("listitem");
    expect(within(first).getByText("代表")).toBeInTheDocument();
    expect(within(first).getByText("味玉")).toBeInTheDocument();
    expect(within(second).queryByText("代表")).toBeNull();
    expect(
      within(first).getByRole("button", { name: "画像 1 を前に移動" }),
    ).toBeDisabled();
    expect(
      within(second).getByRole("button", { name: "画像 2 を後ろに移動" }),
    ).toBeDisabled();
  });

  it("uploads selected files one at a time, then refetches the shops once", async () => {
    const traffic = await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });
    await waitFor(() => expect(traffic.fetched.shops).toBeGreaterThan(0));
    const shopsBefore = traffic.fetched.shops;

    await upload(jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"));

    await waitFor(() =>
      expect(within(currentImageList()).getAllByRole("listitem")).toHaveLength(
        3,
      ),
    );
    expect(traffic.uploads).toBe(3);
    // Each upload starts only after the previous one finished and refetched
    // the meal records; concurrent uploads would arrive back to back.
    const uploads = traffic.log.flatMap((entry, i) =>
      entry === "upload" ? [i] : [],
    );
    expect(uploads).toHaveLength(3);
    for (const [prev, next] of [
      [uploads[0], uploads[1]],
      [uploads[1], uploads[2]],
    ]) {
      expect(traffic.log.slice(prev + 1, next)).toContain("mealRecords");
    }
    expect(traffic.fetched.mealRecords).toBeGreaterThan(3);
    // The 代表写真 in the shop list is refetched after the last upload only.
    await waitFor(() =>
      expect(traffic.fetched.shops).toBeGreaterThan(shopsBefore),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(traffic.fetched.shops).toBe(shopsBefore + 1);
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
  });

  it("retries once after Retry-After when the server is busy", async () => {
    const traffic = await renderImages({
      uploadResponse: (attempt) =>
        attempt === 1
          ? HttpResponse.json(
              { type: "meal_record_image_processing_busy" },
              { status: 503, headers: { "Retry-After": "0" } },
            )
          : undefined,
    });

    await upload(jpeg("a.jpg"));

    await waitFor(() =>
      expect(within(currentImageList()).getAllByRole("listitem")).toHaveLength(
        1,
      ),
    );
    expect(traffic.uploads).toBe(2);
  });

  it.each([
    [
      "a file too large",
      () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [{ field: "file", type: "too_long" }],
          },
          { status: 400 },
        ),
      "15MB以下の画像を選んでください",
    ],
    [
      "an unreadable file",
      () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [{ field: "file", type: "invalid_format" }],
          },
          { status: 400 },
        ),
      "JPEG・PNGとして読み込めない画像です",
    ],
    [
      "too many pixels",
      () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [{ field: "file", type: "out_of_range" }],
          },
          { status: 400 },
        ),
      "画像の画素数が大きすぎます",
    ],
    [
      "the image limit",
      () =>
        HttpResponse.json(
          { type: "meal_record_image_limit_reached" },
          { status: 409 },
        ),
      "1つの食べた記録に追加できる画像は10枚までです",
    ],
    [
      "a server still busy after the retry",
      () =>
        HttpResponse.json(
          { type: "meal_record_image_processing_busy" },
          { status: 503, headers: { "Retry-After": "0" } },
        ),
      "サーバーが混み合っています。時間をおいてもう一度お試しください",
    ],
    [
      "no image storage",
      () =>
        HttpResponse.json(
          { type: "meal_record_images_storage_unconfigured" },
          { status: 503 },
        ),
      "画像の保存先が設定されていないため追加できません",
    ],
  ])("shows %s next to the file", async (_, response, message) => {
    await renderImages({ uploadResponse: response });

    await upload(jpeg("big.jpg"));

    const pending = await screen.findByRole("list", { name: "追加中の画像" });
    expect(await within(pending).findByRole("alert")).toHaveTextContent(
      message,
    );
    expect(pending).toHaveTextContent("big.jpg");

    await userEvent.click(
      within(pending).getByRole("button", { name: "big.jpg の表示を消す" }),
    );
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
  });

  it("says when the browser cannot read the file and does not upload it", async () => {
    const traffic = await renderImages();

    await upload(new File(["heic"], "ramen.heic", { type: "image/heic" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "この画像形式は読み込めません",
    );
    expect(traffic.uploads).toBe(0);
  });

  it("uploads only up to 10 images and then disables adding", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    const traffic = await renderImages({ images: nine });

    await upload(jpeg("a.jpg"), jpeg("b.jpg"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1つの食べた記録に追加できる画像は10枚までです",
    );
    await waitFor(() =>
      expect(within(currentImageList()).getAllByRole("listitem")).toHaveLength(
        10,
      ),
    );
    expect(traffic.uploads).toBe(1);
    expect(screen.getByRole("button", { name: "画像を追加" })).toBeDisabled();
    expect(screen.getByText("画像は10枚までです")).toBeInTheDocument();
  });

  it("sends the whole new order when an image is moved", async () => {
    const traffic = await renderImages({
      images: [image(1), image(2), image(3)],
    });

    await userEvent.click(
      within(await imageList()).getByRole("button", {
        name: "画像 3 を前に移動",
      }),
    );

    await waitFor(() =>
      expect(traffic.reorders).toEqual([
        [image(1).id, image(3).id, image(2).id],
      ]),
    );
    await waitFor(() =>
      expect(
        within(currentImageList())
          .getAllByRole("img")
          .map((img) => img.getAttribute("src")),
      ).toEqual([image(1).url, image(3).url, image(2).url]),
    );
  });

  it("saves a trimmed caption", async () => {
    const traffic = await renderImages({ images: [image(1)] });

    const list = await imageList();
    await userEvent.click(
      within(list).getByRole("button", {
        name: "画像 1 のキャプションを編集",
      }),
    );
    await userEvent.type(
      within(list).getByRole("textbox", { name: "キャプション" }),
      "  特製中華そば  ",
    );
    await userEvent.click(within(list).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(traffic.captions).toEqual([
        { id: image(1).id, caption: "特製中華そば" },
      ]),
    );
    expect(await screen.findByText("特製中華そば")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "キャプション" })).toBeNull();
  });

  it("deletes an image after confirmation", async () => {
    const traffic = await renderImages({ images: [image(1), image(2)] });

    await userEvent.click(
      within(await imageList()).getByRole("button", { name: "画像 1 を削除" }),
    );
    const message = await screen.findByText(
      "この画像を削除しますか？この操作は取り消せません。",
    );
    await userEvent.click(
      within(message.closest<HTMLElement>("[role=dialog]")!).getByRole(
        "button",
        { name: "削除" },
      ),
    );

    expect(await screen.findByText("画像を削除しました")).toBeInTheDocument();
    expect(traffic.deleted).toEqual([image(1).id]);
    await waitFor(() =>
      expect(within(currentImageList()).getAllByRole("listitem")).toHaveLength(
        1,
      ),
    );
  });

  it("keeps uploads and their failures across opening a meal record form, locking the modal meanwhile", async () => {
    // The fake clock also follows real time, but the busy server asks for
    // 30 s, longer than the test may run: the retry happens only when the
    // test advances the clock, after the steps below.
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["setTimeout", "clearTimeout"],
    });
    const timeouts = vi.spyOn(globalThis, "setTimeout");
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const traffic = await renderImages({
      images: [image(1), image(2)],
      uploadResponse: (attempt) =>
        attempt === 1
          ? HttpResponse.json(
              { type: "meal_record_image_processing_busy" },
              { status: 503, headers: { "Retry-After": "30" } },
            )
          : HttpResponse.json(
              {
                type: "invalid_request",
                fieldErrors: [{ field: "file", type: "too_long" }],
              },
              { status: 400 },
            ),
    });
    const footerCancel = () =>
      screen
        .getAllByRole("button", { name: "キャンセル" })
        .find(
          (button) => !button.closest("[role=group]") && !button.closest("li"),
        )!;

    await upload(jpeg("a.jpg"), jpeg("b.jpg"));
    // a.jpg waits out the busy server; b.jpg is queued behind it.
    const pending = await screen.findByRole("list", { name: "追加中の画像" });
    await within(pending).findByText("アップロード中…");
    expect(screen.queryByRole("link", { name: shop.name })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "ラーメンWalkerキッチン" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByText("催事・出店先: ラーメンWalkerキッチン"),
    );
    expect(pending).toHaveTextContent("a.jpg");
    expect(
      within(await imageList()).getByRole("button", {
        name: "画像 2 を前に移動",
      }),
    ).toBeDisabled();
    await userEvent.click(
      within(pending).getByRole("button", {
        name: "b.jpg のアップロードをキャンセル",
      }),
    );
    expect(pending).not.toHaveTextContent("b.jpg");
    // The meal record cannot be deleted under its uploads.
    expect(
      screen.getByRole("button", { name: "食べた記録を削除" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "食べた記録を追加" }),
    );
    expect(footerCancel()).toBeDisabled();

    // The retry fails while the form is open; closing it shows the failure.
    expect(traffic.uploads).toBe(1);
    // The client waits out Retry-After before retrying.
    await waitFor(() =>
      expect(timeouts).toHaveBeenCalledWith(expect.any(Function), 30_000),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await waitFor(() => expect(traffic.uploads).toBe(2));
    await waitFor(() => expect(footerCancel()).toBeEnabled());
    await userEvent.click(
      within(screen.getByRole("group", { name: "食べた記録を追加" })).getByRole(
        "button",
        { name: "キャンセル" },
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "15MB以下の画像を選んでください",
    );
    expect(traffic.uploads).toBe(2);
    expect(
      within(await imageList()).getByRole("button", {
        name: "画像 2 を前に移動",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "食べた記録を削除" }),
    ).toBeEnabled();
  });

  it("locks deleting images while a reorder is in flight", async () => {
    const traffic = await renderImages({ images: [image(1), image(2)] });
    let release = () => {};
    server.use(
      http.put(
        "/api/v1/auth/meal-records/:mealRecordId/images/order",
        async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          await delay(0);
          return HttpResponse.json({ images: [image(2), image(1)] });
        },
      ),
    );
    const list = await imageList();

    await userEvent.click(
      within(list).getByRole("button", { name: "画像 2 を前に移動" }),
    );

    await waitFor(() =>
      expect(
        within(list).getByRole("button", { name: "画像 1 を削除" }),
      ).toBeDisabled(),
    );
    release();
    await waitFor(() =>
      expect(
        within(list).getByRole("button", { name: "画像 1 を削除" }),
      ).toBeEnabled(),
    );
    expect(traffic.deleted).toEqual([]);
  });

  it("cancels a caption edit on Esc without closing the modal", async () => {
    const traffic = await renderImages({ images: [image(1, "味玉")] });
    const list = await imageList();

    await userEvent.click(
      within(list).getByRole("button", {
        name: "画像 1 のキャプションを編集",
      }),
    );
    const input = within(list).getByRole("textbox", { name: "キャプション" });
    await userEvent.type(input, "追加");
    // An Esc that ends an IME composition leaves the edit open.
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(input).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(
      within(list).queryByRole("textbox", { name: "キャプション" }),
    ).toBeNull();
    expect(within(list).getByText("味玉")).toBeInTheDocument();
    expect(traffic.captions).toEqual([]);
    expect(traffic.onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("list", { name: "食べた記録" }),
    ).toBeInTheDocument();
  });

  it("hints at drop and paste only while images can be added", async () => {
    reportFinePointer();
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    await renderImages({ images: nine });
    await imageList();

    await waitFor(() =>
      expect(dropArea()).toHaveAccessibleDescription(
        "この欄にドラッグ＆ドロップ・貼り付けでも追加できます",
      ),
    );
    await upload(jpeg("a.jpg"));
    await waitFor(() =>
      expect(screen.getByText("画像は10枚までです")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(
        "この欄にドラッグ＆ドロップ・貼り付けでも追加できます",
      ),
    ).toBeNull();
    expect(dropArea()).not.toHaveAttribute("aria-describedby");
  });

  it("does not hint at drop and paste on a touch screen", async () => {
    await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });

    expect(screen.getByText("あと10枚・1枚目が代表")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "この欄にドラッグ＆ドロップ・貼り付けでも追加できます",
      ),
    ).toBeNull();
    expect(dropArea()).not.toHaveAttribute("aria-describedby");
  });

  it("queues dropped image files in order and ignores other files", async () => {
    // Every upload fails, so each file stays listed in queue order.
    const traffic = await renderImages({
      uploadResponse: () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [{ field: "file", type: "too_long" }],
          },
          { status: 400 },
        ),
    });
    await screen.findByRole("list", { name: "食べた記録" });
    const area = dropArea();
    const files = [
      jpeg("a.jpg"),
      new File(["memo"], "memo.txt", { type: "text/plain" }),
      new File(["png"], "b.png", { type: "image/png" }),
    ];
    const dataTransfer = { types: ["Files"], files, dropEffect: "none" };

    // Allowing the drop keeps the browser from opening the file.
    expect(fireEvent.dragOver(area, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(fireEvent.drop(area, { dataTransfer })).toBe(false);

    const pending = await screen.findByRole("list", { name: "追加中の画像" });
    await waitFor(() =>
      expect(within(pending).getAllByRole("alert")).toHaveLength(2),
    );
    expect(
      within(pending)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("a.jpg"),
      expect.stringContaining("b.png"),
    ]);
    expect(pending).not.toHaveTextContent("memo.txt");
    expect(
      await screen.findByText("画像ファイルのみ追加できます"),
    ).toBeInTheDocument();
    expect(traffic.uploads).toBe(2);
  });

  it("drops only up to 10 images and refuses dragging in when full", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    const traffic = await renderImages({ images: nine });
    await imageList();

    fireEvent.drop(dropArea(), {
      dataTransfer: { types: ["Files"], files: [jpeg("a.jpg"), jpeg("b.jpg")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1つの食べた記録に追加できる画像は10枚までです",
    );
    await waitFor(() =>
      expect(within(currentImageList()).getAllByRole("listitem")).toHaveLength(
        10,
      ),
    );
    expect(traffic.uploads).toBe(1);

    const dataTransfer = {
      types: ["Files"],
      files: [jpeg("c.jpg")],
      dropEffect: "copy",
    };
    fireEvent.dragOver(dropArea(), { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("none");
    // Should a drop still arrive, the file fails with the limit message
    // without being queued.
    fireEvent.drop(dropArea(), { dataTransfer });
    const pending = screen.getByRole("list", { name: "追加中の画像" });
    const [, dropped] = within(pending).getAllByRole("listitem");
    expect(dropped).toHaveTextContent("c.jpg");
    expect(within(dropped).getByRole("alert")).toHaveTextContent(
      "1つの食べた記録に追加できる画像は10枚までです",
    );
    expect(within(pending).queryByRole("status")).toBeNull();
    expect(traffic.uploads).toBe(1);
  });

  it("highlights the area while files are dragged anywhere over it", async () => {
    await renderImages({ images: [image(1)] });
    const list = await imageList();
    const area = dropArea();
    const dataTransfer = { types: ["Files"], files: [jpeg("a.jpg")] };

    fireEvent.dragEnter(area, { dataTransfer });
    // Entering a child leaves the area only for the browser, not the user.
    fireEvent.dragEnter(list, { dataTransfer });
    fireEvent.dragLeave(area, { dataTransfer });
    expect(area).toHaveAttribute("data-dragging");
    fireEvent.dragLeave(list, { dataTransfer });
    expect(area).not.toHaveAttribute("data-dragging");
  });

  it("never uploads a thumbnail dragged within the page", async () => {
    const traffic = await renderImages({ images: [image(1)] });
    const thumb = within(await imageList()).getByRole("img", {
      name: "画像 1",
    });
    expect(thumb).toHaveAttribute("draggable", "false");
    const types = ["Files"];
    const dataTransfer = {
      types,
      files: [jpeg("1.jpg")],
      dropEffect: "copy",
      setData: (type: string) => void types.push(type),
    };

    fireEvent.dragStart(thumb, { dataTransfer });
    fireEvent.dragOver(dropArea(), { dataTransfer });
    // Refused by the modal, so the browser neither opens nor drops it.
    expect(dataTransfer.dropEffect).toBe("none");
    fireEvent.drop(dropArea(), { dataTransfer });
    fireEvent.dragEnd(thumb, { dataTransfer });

    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
    expect(traffic.uploads).toBe(0);
  });

  it("does not offer a drop for files the browser says are not images", async () => {
    await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });
    const dataTransfer = {
      types: ["Files"],
      items: [{ kind: "file", type: "application/pdf" }],
      files: [],
      dropEffect: "copy",
    };

    fireEvent.dragEnter(dropArea(), { dataTransfer });
    fireEvent.dragOver(dropArea(), { dataTransfer });

    expect(dropArea()).not.toHaveAttribute("data-dragging");
    expect(dataTransfer.dropEffect).toBe("none");
  });

  it("drops the highlight when the drag ends anywhere", async () => {
    await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });
    const dataTransfer = { types: ["Files"], files: [jpeg("a.jpg")] };

    fireEvent.dragEnter(dropArea(), { dataTransfer });
    expect(dropArea()).toHaveAttribute("data-dragging");
    // Cancelled with Esc: no dragleave reaches the area.
    fireEvent.dragEnd(window);
    expect(dropArea()).not.toHaveAttribute("data-dragging");
  });

  it("refuses a file dropped elsewhere in the modal instead of opening it", async () => {
    await renderImages();
    const mealRecords = await screen.findByRole("list", { name: "食べた記録" });
    const dataTransfer = {
      types: ["Files"],
      files: [jpeg("a.jpg")],
      dropEffect: "copy",
    };

    expect(fireEvent.dragOver(mealRecords, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("none");
    expect(fireEvent.drop(mealRecords, { dataTransfer })).toBe(false);
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
  });

  it("uploads an image pasted while focus is in the image area", async () => {
    const traffic = await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });
    const area = dropArea();
    // Each meal record's area is named by its date.
    expect(area).toHaveAccessibleName("画像（2026/9/30）");
    // The area itself takes focus, so a paste reaches it.
    area.focus();
    expect(area).toHaveFocus();

    const pasted = fireEvent.paste(area, {
      clipboardData: {
        files: [new File(["png"], "image.png", { type: "image/png" })],
      },
    });

    expect(pasted).toBe(false);
    await waitFor(() =>
      expect(within(currentImageList()).getAllByRole("listitem")).toHaveLength(
        1,
      ),
    );
    expect(traffic.uploads).toBe(1);
  });

  it("leaves a paste into the caption input alone", async () => {
    const traffic = await renderImages({ images: [image(1)] });
    const list = await imageList();
    await userEvent.click(
      within(list).getByRole("button", {
        name: "画像 1 のキャプションを編集",
      }),
    );

    const pasted = fireEvent.paste(
      within(list).getByRole("textbox", { name: "キャプション" }),
      {
        clipboardData: {
          files: [new File(["png"], "image.png", { type: "image/png" })],
        },
      },
    );

    expect(pasted).toBe(true);
    // Queued files would be listed by now.
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
    expect(traffic.uploads).toBe(0);
  });

  it("says a paste is over the limit when the meal record is full", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => image(i + 1));
    const traffic = await renderImages({ images: ten });
    await imageList();
    dropArea().focus();

    fireEvent.paste(dropArea(), {
      clipboardData: {
        files: [new File(["png"], "image.png", { type: "image/png" })],
      },
    });

    const pending = screen.getByRole("list", { name: "追加中の画像" });
    expect(pending).toHaveTextContent("image.png");
    expect(within(pending).getByRole("alert")).toHaveTextContent(
      "1つの食べた記録に追加できる画像は10枚までです",
    );
    expect(traffic.uploads).toBe(0);
  });

  it("ignores a paste while focus is outside the image area", async () => {
    const traffic = await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });
    screen.getByRole("button", { name: "食べた記録を追加" }).focus();

    const pasted = fireEvent.paste(document.activeElement!, {
      clipboardData: {
        files: [new File(["png"], "image.png", { type: "image/png" })],
      },
    });

    expect(pasted).toBe(true);
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
    expect(traffic.uploads).toBe(0);
  });

  it("says a pasted file that is not an image cannot be added", async () => {
    const traffic = await renderImages();
    await screen.findByRole("list", { name: "食べた記録" });
    dropArea().focus();

    fireEvent.paste(dropArea(), {
      clipboardData: {
        files: [new File(["pdf"], "menu.pdf", { type: "application/pdf" })],
      },
    });

    expect(
      await screen.findByText("画像ファイルのみ追加できます"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
    expect(traffic.uploads).toBe(0);
  });

  it("asks to save a new meal record before adding images", async () => {
    await renderImages();

    await userEvent.click(
      await screen.findByRole("button", { name: "食べた記録を追加" }),
    );

    expect(
      screen.getByText("画像は食べた記録を保存した後に追加できます"),
    ).toBeInTheDocument();
  });
});
