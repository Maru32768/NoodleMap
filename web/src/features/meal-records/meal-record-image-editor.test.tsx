import { toaster } from "@/components/ui/toaster.tsx";
import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import type { components } from "@/generated/api.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

type MealRecord = components["schemas"]["MealRecord"];
type MealRecordImage = components["schemas"]["MealRecordImage"];
type MealRecordInput = components["schemas"]["MealRecordInput"];

// jsdom has no object URLs.
let previews: string[];
beforeEach(() => {
  previews = [];
  URL.createObjectURL = () => {
    const url = `blob:preview-${previews.length + 1}`;
    previews.push(url);
    return url;
  };
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  toaster.remove();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
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

const RECORD_ID = "00000000-0000-4000-8000-000000000201";

const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

const png = (name = "image.png") =>
  new File(["png"], name, { type: "image/png" });

/**
 * The edit modal on 食べた記録, its fake server appending uploads to the one record
 * as the real one does. `traffic` lists every write in arrival order: uploads
 * as `upload:<number of the upload>`.
 */
async function renderModal({
  images = [],
  mealRecords,
  uploadResponse,
  captionResponse,
  deleteResponse,
}: {
  images?: MealRecordImage[];
  mealRecords?: MealRecord[];
  uploadResponse?: (attempt: number) => Response | undefined;
  captionResponse?: () => Response | undefined;
  deleteResponse?: () => Response | undefined;
} = {}) {
  let record: MealRecord = {
    id: RECORD_ID,
    eatenOn: "2026-09-30",
    shops: [shop],
    venue: { id: "venue-1", name: "ラーメンWalkerキッチン" },
    menuItems: [{ name: "中華そば", isLimited: false }],
    images,
  };
  const traffic: string[] = [];
  // How many writes had arrived at each refetch.
  const shopFetches: number[] = [];
  const recordFetches: number[] = [];
  let uploads = 0;
  server.use(
    http.get("/api/v1/venues", () => HttpResponse.json({ venues: [] })),
    http.get("/api/v1/shops", () => {
      shopFetches.push(traffic.length);
      return HttpResponse.json({ shops: [shop] });
    }),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.get(`/api/v1/shops/${shop.id}/meal-records`, () => {
      recordFetches.push(traffic.length);
      return HttpResponse.json({ mealRecords: mealRecords ?? [record] });
    }),
    http.post("/api/v1/auth/meal-records", async ({ request }) => {
      const input = (await request.json()) as MealRecordInput;
      traffic.push("post record");
      mealRecords = undefined;
      record = { ...record, ...input, images: [] } as unknown as MealRecord;
      return HttpResponse.json(record);
    }),
    http.put(`/api/v1/auth/meal-records/${RECORD_ID}`, () => {
      traffic.push("put record");
      return HttpResponse.json(record);
    }),
    http.post(
      `/api/v1/auth/meal-records/${RECORD_ID}/images`,
      ({ request }) => {
        // The multipart body cannot be read back (nor left unread for long) in
        // jsdom; check its type only.
        expect(request.headers.get("content-type")).toMatch(
          /^multipart\/form-data; boundary=/,
        );
        const attempt = ++uploads;
        traffic.push(`upload:${attempt}`);
        const custom = uploadResponse?.(attempt);
        if (custom) {
          return custom;
        }
        const added = image(50 + attempt);
        record = { ...record, images: [...record.images, added] };
        return HttpResponse.json(added);
      },
    ),
    http.put(
      `/api/v1/auth/meal-records/${RECORD_ID}/images/order`,
      async ({ request }) => {
        const { imageIds } = (await request.json()) as { imageIds: string[] };
        traffic.push(`order:${imageIds.join(",")}`);
        const byId = new Map(record.images.map((i) => [i.id, i]));
        record = { ...record, images: imageIds.map((id) => byId.get(id)!) };
        return HttpResponse.json({ images: record.images });
      },
    ),
    http.put(
      "/api/v1/auth/meal-record-images/:imageId",
      async ({ params, request }) => {
        const body = (await request.json()) as { caption?: string };
        const id = params.imageId as string;
        traffic.push(`caption:${id}:${body.caption}`);
        const custom = captionResponse?.();
        if (custom) {
          return custom;
        }
        record = {
          ...record,
          images: record.images.map((i) =>
            i.id === id ? { ...i, caption: body.caption } : i,
          ),
        };
        return HttpResponse.json(record.images.find((i) => i.id === id));
      },
    ),
    http.delete("/api/v1/auth/meal-record-images/:imageId", ({ params }) => {
      traffic.push(`delete:${params.imageId}`);
      const custom = deleteResponse?.();
      if (custom) {
        return custom;
      }
      record = {
        ...record,
        images: record.images.filter((i) => i.id !== params.imageId),
      };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { unmount } = renderWithProviders(
    <ShopEditModal
      shop={shop}
      open
      initialTab="mealRecord"
      onClose={vi.fn()}
      onDeleted={vi.fn()}
    />,
  );
  await screen.findByRole("dialog");
  return { traffic, shopFetches, recordFetches, unmount };
}

async function openEditForm() {
  await userEvent.click(
    await screen.findByRole("button", { name: "食べた記録を編集" }),
  );
}

async function openAddForm() {
  await userEvent.click(
    await screen.findByRole("button", { name: "食べた記録を追加" }),
  );
}

const IMAGE_LIST = { name: "記録の画像" } as const;
const imageList = () => screen.getByRole("list", IMAGE_LIST);
const tiles = () => within(imageList()).getAllByRole("listitem");
const tile = (n: number) =>
  within(imageList()).getByRole("listitem", { name: `画像 ${n}` });
const thumbs = () =>
  within(imageList())
    .getAllByRole("img")
    .map((img) => img.getAttribute("src"));
const fileInput = () => screen.getByLabelText("追加する画像ファイル");
const dropArea = () => screen.getByRole("group", { name: /^画像（/ });
const saveButton = () =>
  screen.getByRole("button", { name: "食べた記録を保存" });
const save = () => userEvent.click(saveButton());
const caption = (n: number) =>
  screen.getByRole("textbox", { name: `画像 ${n} のキャプション` });

/** Picks files and waits until every picked one has its preview. */
async function pick(...files: File[]) {
  const before = previews.length;
  await userEvent.upload(fileInput(), files);
  await waitFor(() => expect(previews).toHaveLength(before + files.length));
}

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

const savedToast = () => screen.findByText("食べた記録を保存しました");
const partlySavedToast = () =>
  screen.findByText("画像の一部を保存できませんでした");

describe("MealRecordImageEditor saving", () => {
  it("sends nothing until 食べた記録を保存, then deletes, uploads, captions and reorders in order", async () => {
    const { traffic } = await renderModal({
      images: [image(1), image(2, "味玉"), image(3)],
    });
    await openEditForm();

    await pick(jpeg("a.jpg"));
    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    );
    // 画像 1 and 3 remain with the picked one; the last saved one goes first.
    await userEvent.click(
      screen.getByRole("button", { name: "画像 2 を前に移動" }),
    );
    expect(thumbs()).toEqual([image(3).url, image(2).url, "blob:preview-1"]);
    fireEvent.change(caption(1), { target: { value: "  特製  " } });
    fireEvent.change(caption(3), { target: { value: "新しい" } });
    expect(traffic).toEqual([]);

    await save();

    expect(await savedToast()).toBeInTheDocument();
    expect(traffic).toEqual([
      "put record",
      `delete:${image(1).id}`,
      "upload:1",
      `caption:${image(3).id}:特製`,
      `caption:${image(51).id}:新しい`,
      `order:${[image(3).id, image(2).id, image(51).id].join(",")}`,
    ]);
    // Back on the list, whose gallery is read-only.
    const gallery = await screen.findByRole("list", IMAGE_LIST);
    await waitFor(() =>
      expect(
        Array.from(gallery.querySelectorAll("img")).map((img) => img.src),
      ).toEqual([image(3).url, image(2).url, image(51).url]),
    );
    expect(screen.queryByRole("button", { name: "画像 1 を削除" })).toBeNull();
    expect(screen.queryByLabelText("追加する画像ファイル")).toBeNull();
  });

  it("sends no reorder when uploads only append", async () => {
    const { traffic } = await renderModal({ images: [image(1)] });
    await openEditForm();

    await pick(jpeg("a.jpg"), jpeg("b.jpg"));
    await save();

    await savedToast();
    expect(traffic).toEqual(["put record", "upload:1", "upload:2"]);
  });

  it("uploads one at a time and refetches the shops' 代表写真 after the last", async () => {
    const { traffic, shopFetches, recordFetches } = await renderModal();
    await openEditForm();

    await pick(jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"));
    await save();

    await savedToast();
    expect(traffic).toEqual(["put record", "upload:1", "upload:2", "upload:3"]);
    // Each upload starts only after the previous one finished and refetched
    // the meal records; concurrent uploads would arrive back to back.
    expect(recordFetches).toEqual(expect.arrayContaining([2, 3, 4]));
    expect(shopFetches.at(-1)).toBe(traffic.length);
  });

  it("キャンセル after edits sends nothing and restores the list", async () => {
    const { traffic } = await renderModal({
      images: [image(1, "味玉"), image(2)],
    });
    await openEditForm();

    await pick(jpeg("a.jpg"));
    await userEvent.click(
      screen.getByRole("button", { name: "画像 2 を前に移動" }),
    );
    await userEvent.type(caption(1), "変更");
    await userEvent.click(
      screen.getByRole("button", { name: "画像 3 を削除" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await openEditForm();
    expect(thumbs()).toEqual([image(1).url, image(2).url]);
    expect(caption(1)).toHaveValue("味玉");
    expect(traffic).toEqual([]);
  });

  it("a new record posts first, then uploads against its id", async () => {
    const { traffic } = await renderModal({ mealRecords: [] });
    await openAddForm();
    expect(
      screen.queryByText("画像は食べた記録を保存した後に追加できます"),
    ).toBeNull();

    await pick(jpeg("a.jpg"), jpeg("b.jpg"));
    await userEvent.type(caption(1), "一枚目");
    await save();

    await savedToast();
    expect(traffic).toEqual([
      "post record",
      "upload:1",
      "upload:2",
      `caption:${image(51).id}:一枚目`,
    ]);
  });

  it("after a partial upload failure stays open, and a retry neither posts again nor re-uploads", async () => {
    const { traffic } = await renderModal({
      mealRecords: [],
      uploadResponse: (attempt) =>
        attempt === 2
          ? HttpResponse.json(
              {
                type: "invalid_request",
                fieldErrors: [{ field: "file", type: "too_long" }],
              },
              { status: 400 },
            )
          : undefined,
    });
    await openAddForm();

    await pick(jpeg("a.jpg"), jpeg("b.jpg"));
    await userEvent.type(caption(1), "一枚目");
    await save();

    expect(await partlySavedToast()).toBeInTheDocument();
    expect(traffic).toEqual([
      "post record",
      "upload:1",
      "upload:2",
      `caption:${image(51).id}:一枚目`,
    ]);
    expect(screen.queryByText("食べた記録を保存しました")).toBeNull();
    // The failure is on the image that failed, whose file stays in the draft.
    expect(tile(2)).toHaveTextContent("15MB以下の画像を選んでください");
    expect(tile(2)).toHaveTextContent("b.jpg");
    expect(tile(1)).not.toHaveTextContent("15MB以下の画像を選んでください");
    expect(thumbs()).toEqual([image(51).url, "blob:preview-2"]);

    traffic.length = 0;
    await save();

    expect(await savedToast()).toBeInTheDocument();
    expect(traffic).toEqual(["put record", "upload:3"]);
  });

  it("a retry after a failure in the edit form keeps images uploaded by the first try", async () => {
    const { traffic } = await renderModal({
      images: [image(1)],
      uploadResponse: (attempt) =>
        attempt === 1
          ? HttpResponse.json({ type: "internal_error" }, { status: 500 })
          : undefined,
    });
    await openEditForm();

    await pick(jpeg("a.jpg"), jpeg("b.jpg"));
    await userEvent.click(
      screen.getByRole("button", { name: "画像 3 を前に移動" }),
    );
    await save();
    await partlySavedToast();
    // The order waits: a reorder must name every image, and one is not saved.
    expect(traffic.filter((entry) => entry.startsWith("order"))).toEqual([]);

    traffic.length = 0;
    await save();

    await savedToast();
    expect(traffic).toEqual([
      "put record",
      "upload:3",
      `order:${[image(1).id, image(53).id, image(52).id].join(",")}`,
    ]);
  });

  it("says an upload could not be confirmed and retries it", async () => {
    const { traffic } = await renderModal({
      uploadResponse: (attempt) =>
        attempt === 1 ? HttpResponse.error() : undefined,
    });
    await openEditForm();

    await pick(jpeg("a.jpg"));
    await save();

    await partlySavedToast();
    expect(tile(1)).toHaveTextContent(
      "アップロードの完了を確認できませんでした",
    );
    await save();
    await savedToast();
    expect(traffic.filter((entry) => entry.startsWith("upload"))).toHaveLength(
      2,
    );
  });

  it("shows a caption error under its input and retries only the caption", async () => {
    let reject = true;
    const { traffic } = await renderModal({
      images: [image(1)],
      captionResponse: () =>
        reject
          ? HttpResponse.json(
              {
                type: "invalid_request",
                fieldErrors: [{ field: "caption", type: "too_long" }],
              },
              { status: 400 },
            )
          : undefined,
    });
    await openEditForm();

    await userEvent.type(caption(1), "長い");
    await save();

    await partlySavedToast();
    expect(
      await screen.findByRole("textbox", {
        name: "画像 1 のキャプション",
        description: "100文字以内で入力してください",
      }),
    ).toHaveFocus();

    reject = false;
    traffic.length = 0;
    await save();
    await savedToast();
    expect(traffic).toEqual(["put record", `caption:${image(1).id}:長い`]);
  });

  it("holds the reorder after a failed delete and tries the delete again", async () => {
    let reject = true;
    const { traffic } = await renderModal({
      images: [image(1), image(2), image(3)],
      deleteResponse: () =>
        reject
          ? HttpResponse.json({ type: "internal_error" }, { status: 500 })
          : undefined,
    });
    await openEditForm();

    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "画像 2 を前に移動" }),
    );
    await save();

    await partlySavedToast();
    expect(traffic).toEqual(["put record", `delete:${image(1).id}`]);

    reject = false;
    traffic.length = 0;
    await save();
    await savedToast();
    expect(traffic).toEqual([
      "put record",
      `delete:${image(1).id}`,
      `order:${[image(3).id, image(2).id].join(",")}`,
    ]);
  });

  it("counts deleting an image already gone as done", async () => {
    await renderModal({
      images: [image(1)],
      deleteResponse: () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
    });
    await openEditForm();

    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    );
    await save();

    expect(await savedToast()).toBeInTheDocument();
  });

  it("retries once after Retry-After when the server is busy", async () => {
    const { traffic } = await renderModal({
      uploadResponse: (attempt) =>
        attempt === 1
          ? HttpResponse.json(
              { type: "meal_record_image_processing_busy" },
              { status: 503, headers: { "Retry-After": "0" } },
            )
          : undefined,
    });
    await openEditForm();

    await pick(jpeg("a.jpg"));
    await save();

    await savedToast();
    expect(traffic).toEqual(["put record", "upload:1", "upload:2"]);
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
  ])("shows %s on the image", async (_, response, message) => {
    await renderModal({ uploadResponse: response });
    await openEditForm();

    await pick(jpeg("big.jpg"));
    await save();

    await partlySavedToast();
    expect(tile(1)).toHaveTextContent(message);
    expect(tile(1)).toHaveTextContent("big.jpg");
  });

  it("locks the form and the modal for the whole save, images included", async () => {
    // The upload counts as running until the list it refetches arrives; its
    // own multipart request cannot be left waiting under jsdom.
    let respond = () => {};
    const responded = new Promise<void>((resolve) => (respond = resolve));
    let uploaded = false;
    await renderModal({
      uploadResponse: () => {
        uploaded = true;
        return undefined;
      },
    });
    await openEditForm();
    server.use(
      http.get(`/api/v1/shops/${shop.id}/meal-records`, async () => {
        if (uploaded) {
          await responded;
        }
        return HttpResponse.json({ mealRecords: [] });
      }),
    );

    await pick(jpeg("a.jpg"));
    await save();

    expect(await screen.findByText("アップロード中…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
    expect(caption(1)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "画像を追加" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByText("保存していない入力があります。破棄しますか？"),
    ).toBeNull();
    fireEvent.drop(dropArea(), {
      dataTransfer: { types: ["Files"], files: [jpeg("late.jpg")] },
    });
    expect(tiles()).toHaveLength(1);

    respond();
    await savedToast();
    // The modal is unlocked again once the form has gone.
    await userEvent.click(
      await screen.findByRole("button", { name: "閉じる" }),
    );
  });

  it("asks before closing with only image edits unsaved", async () => {
    await renderModal({ images: [image(1)] });
    await openEditForm();

    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    );
    await userEvent.keyboard("{Escape}");

    expect(
      await screen.findByText("保存していない入力があります。破棄しますか？"),
    ).toBeInTheDocument();
  });
});

describe("MealRecordImageEditor editing", () => {
  it("marks the first image as the meal record's 代表", async () => {
    await renderModal({ images: [image(1, "味玉"), image(2)] });
    await openEditForm();

    const [first, second] = tiles();
    expect(within(first).getByText("代表")).toBeInTheDocument();
    expect(caption(1)).toHaveValue("味玉");
    expect(within(second).queryByText("代表")).toBeNull();
    expect(
      within(first).getByRole("button", { name: "画像 1 を前に移動" }),
    ).toBeDisabled();
    expect(
      within(second).getByRole("button", { name: "画像 2 を後ろに移動" }),
    ).toBeDisabled();
  });

  it("removes without asking, and revokes a removed preview", async () => {
    await renderModal({ images: [image(1)] });
    await openEditForm();

    await pick(jpeg("a.jpg"));
    await userEvent.click(
      screen.getByRole("button", { name: "画像 2 を削除" }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 を削除" }),
    );

    expect(screen.queryByRole("dialog", { name: /画像を削除/ })).toBeNull();
    expect(screen.queryByRole("list", IMAGE_LIST)).toBeNull();
  });

  it("revokes previews when the form goes away", async () => {
    const { unmount } = await renderModal();
    await openEditForm();

    await pick(jpeg("a.jpg"), jpeg("b.jpg"));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-2");
  });

  it("disables saving while a picked image is being prepared", async () => {
    await renderModal();
    await openEditForm();
    let finish: (header: ArrayBuffer) => void = () => {};
    const header = new Promise<ArrayBuffer>((resolve) => (finish = resolve));
    const slow = jpeg("slow.jpg");
    slow.slice = () => ({ arrayBuffer: () => header }) as Blob;

    await userEvent.upload(fileInput(), slow);

    expect(await within(tile(1)).findByRole("status")).toHaveTextContent(
      "準備中…",
    );
    expect(saveButton()).toBeDisabled();

    finish(new ArrayBuffer(0));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(thumbs()).toEqual(["blob:preview-1"]);
  });

  it("refuses a file the browser cannot read at once, naming it", async () => {
    const { traffic } = await renderModal({ images: [image(1)] });
    await openEditForm();

    await userEvent.upload(
      fileInput(),
      new File(["heic"], "ramen.heic", { type: "image/heic" }),
    );

    expect(
      await screen.findByText("この画像形式は読み込めません"),
    ).toBeInTheDocument();
    expect(screen.getByText("ramen.heic")).toBeInTheDocument();
    await waitFor(() => expect(tiles()).toHaveLength(1));
    expect(saveButton()).toBeEnabled();
    expect(traffic).toEqual([]);
  });

  it("takes only up to 10 images and then disables adding", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    await renderModal({ images: nine });
    await openEditForm();

    await userEvent.upload(fileInput(), [jpeg("a.jpg"), jpeg("b.jpg")]);

    expect(
      await screen.findByText("1つの食べた記録に追加できる画像は10枚までです"),
    ).toBeInTheDocument();
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
    expect(tiles()).toHaveLength(10);
    expect(screen.getByRole("button", { name: "画像を追加" })).toBeDisabled();
    expect(screen.getByText("画像は10枚までです")).toBeInTheDocument();
  });

  it("hints at drop and paste only while images can be added", async () => {
    reportFinePointer();
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    await renderModal({ images: nine });
    await openEditForm();

    await waitFor(() =>
      expect(dropArea()).toHaveAccessibleDescription(
        "この欄にドラッグ＆ドロップ・貼り付けでも追加できます",
      ),
    );
    await pick(jpeg("a.jpg"));
    expect(
      screen.queryByText(
        "この欄にドラッグ＆ドロップ・貼り付けでも追加できます",
      ),
    ).toBeNull();
    expect(dropArea()).not.toHaveAttribute("aria-describedby");
  });

  it("does not hint at drop and paste on a touch screen", async () => {
    await renderModal();
    await openEditForm();

    expect(screen.getByText("あと10枚・1枚目が代表")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "この欄にドラッグ＆ドロップ・貼り付けでも追加できます",
      ),
    ).toBeNull();
    expect(dropArea()).not.toHaveAttribute("aria-describedby");
  });

  it("takes dropped image files in order and ignores other files", async () => {
    await renderModal();
    await openEditForm();
    const files = [
      jpeg("a.jpg"),
      new File(["memo"], "memo.txt", { type: "text/plain" }),
      png("b.png"),
    ];
    const dataTransfer = { types: ["Files"], files, dropEffect: "none" };

    // Allowing the drop keeps the browser from opening the file.
    expect(fireEvent.dragOver(dropArea(), { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(fireEvent.drop(dropArea(), { dataTransfer })).toBe(false);

    await waitFor(() => expect(previews).toHaveLength(2));
    expect(tiles().map((item) => item.textContent)).toEqual([
      expect.stringContaining("a.jpg"),
      expect.stringContaining("b.png"),
    ]);
    expect(
      await screen.findByText("画像ファイルのみ追加できます"),
    ).toBeInTheDocument();
  });

  it("drops only up to 10 images and refuses dragging in when full", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    await renderModal({ images: nine });
    await openEditForm();

    fireEvent.drop(dropArea(), {
      dataTransfer: { types: ["Files"], files: [jpeg("a.jpg"), jpeg("b.jpg")] },
    });

    expect(
      await screen.findByText("1つの食べた記録に追加できる画像は10枚までです"),
    ).toBeInTheDocument();
    expect(tiles()).toHaveLength(10);

    const dataTransfer = {
      types: ["Files"],
      files: [jpeg("c.jpg")],
      dropEffect: "copy",
    };
    fireEvent.dragOver(dropArea(), { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("none");
  });

  it("highlights the area while files are dragged anywhere over it", async () => {
    await renderModal({ images: [image(1)] });
    await openEditForm();
    const list = imageList();
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

  it("never takes a thumbnail dragged within the page", async () => {
    await renderModal({ images: [image(1)] });
    await openEditForm();
    const thumb = within(imageList()).getByRole("img", { name: "画像 1" });
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
    // Refused by the window, so the browser neither opens nor drops it.
    expect(dataTransfer.dropEffect).toBe("none");
    fireEvent.drop(dropArea(), { dataTransfer });
    fireEvent.dragEnd(thumb, { dataTransfer });

    expect(tiles()).toHaveLength(1);
  });

  it("does not offer a drop for files the browser says are not images", async () => {
    await renderModal();
    await openEditForm();
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
    await renderModal();
    await openEditForm();
    const dataTransfer = { types: ["Files"], files: [jpeg("a.jpg")] };

    fireEvent.dragEnter(dropArea(), { dataTransfer });
    expect(dropArea()).toHaveAttribute("data-dragging");
    // Cancelled with Esc: no dragleave reaches the area.
    fireEvent.dragEnd(window);
    expect(dropArea()).not.toHaveAttribute("data-dragging");
  });

  it("refuses a file dropped elsewhere in the form instead of opening it", async () => {
    await renderModal();
    await openEditForm();
    const memo = screen.getByRole("textbox", { name: "メモ（公開）" });
    const dataTransfer = {
      types: ["Files"],
      files: [jpeg("a.jpg")],
      dropEffect: "copy",
    };

    expect(fireEvent.dragOver(memo, { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("none");
    expect(fireEvent.drop(memo, { dataTransfer })).toBe(false);
    expect(screen.queryByRole("list", IMAGE_LIST)).toBeNull();
  });

  it("takes an image pasted while focus is in the image area", async () => {
    await renderModal();
    await openEditForm();
    const area = dropArea();
    expect(area).toHaveAccessibleName("画像（2026/9/30）");
    // The area itself takes focus, so a paste reaches it.
    area.focus();
    expect(area).toHaveFocus();

    const pasted = fireEvent.paste(area, {
      clipboardData: { files: [png()] },
    });

    expect(pasted).toBe(false);
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(tiles()).toHaveLength(1);
  });

  it("leaves a paste into a caption input alone", async () => {
    await renderModal({ images: [image(1)] });
    await openEditForm();
    caption(1).focus();

    const pasted = fireEvent.paste(caption(1), {
      clipboardData: { files: [png()] },
    });

    expect(pasted).toBe(true);
    expect(tiles()).toHaveLength(1);
  });

  it("says a paste is over the limit when the meal record is full", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => image(i + 1));
    await renderModal({ images: ten });
    await openEditForm();
    dropArea().focus();

    fireEvent.paste(dropArea(), { clipboardData: { files: [png()] } });

    expect(
      await screen.findByText("1つの食べた記録に追加できる画像は10枚までです"),
    ).toBeInTheDocument();
    expect(screen.getByText("image.png")).toBeInTheDocument();
    expect(tiles()).toHaveLength(10);
  });

  it("ignores a paste while focus is outside the image area", async () => {
    await renderModal();
    await openEditForm();
    screen.getByRole("textbox", { name: "メモ（公開）" }).focus();

    const pasted = fireEvent.paste(document.activeElement!, {
      clipboardData: { files: [png()] },
    });

    expect(pasted).toBe(true);
    expect(screen.queryByRole("list", IMAGE_LIST)).toBeNull();
  });

  it("says a pasted file that is not an image cannot be added", async () => {
    await renderModal();
    await openEditForm();
    dropArea().focus();

    fireEvent.paste(dropArea(), {
      clipboardData: {
        files: [new File(["pdf"], "menu.pdf", { type: "application/pdf" })],
      },
    });

    expect(
      await screen.findByText("画像ファイルのみ追加できます"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", IMAGE_LIST)).toBeNull();
  });
});
