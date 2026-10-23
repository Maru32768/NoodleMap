import { toaster } from "@/components/ui/toaster.tsx";
import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import { resetVisitUploads } from "@/features/visits/api/visit-uploads.ts";
import type { components } from "@/generated/api.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

type VisitLog = components["schemas"]["VisitLog"];
type VisitImage = components["schemas"]["VisitImage"];

afterEach(() => {
  toaster.remove();
  resetVisitUploads();
});

const shop = makeShop({ name: "中華そば 青葉", eaten: true, visitCount: 1 });

function image(n: number, caption?: string): VisitImage {
  return {
    id: `00000000-0000-4000-8000-0000000001${n.toString().padStart(2, "0")}`,
    url: `https://img.example.test/${n}.jpg`,
    width: 2048,
    height: 1536,
    caption,
  };
}

// Uploads (and their failures) are kept per visit outside React, so each
// test gets its own visit.
let nextVisit = 1;

function makeVisit(images: VisitImage[]): VisitLog {
  return {
    id: `00000000-0000-4000-8000-0000000002${(nextVisit++).toString().padStart(2, "0")}`,
    visitedOn: "2026-09-30",
    menuItems: [{ name: "中華そば", isLimited: false }],
    images,
  };
}

const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

/**
 * Renders the edit modal on 訪問ログ with one visit. Each upload response
 * appends an image to the served visit (as the server does); requests are
 * recorded.
 */
function renderImages({
  images = [] as VisitImage[],
  uploadResponse,
}: {
  images?: VisitImage[];
  uploadResponse?: (attempt: number) => Response | undefined;
} = {}) {
  let visit = makeVisit(images);
  const traffic = {
    uploads: 0,
    // Uploads and visit fetches in arrival order.
    log: [] as ("upload" | "visits")[],
    reorders: [] as string[][],
    captions: [] as { id: string; caption?: string }[],
    deleted: [] as string[],
    fetched: { visits: 0, shops: 0 },
  };
  server.use(
    http.get("/api/v1/shops", () => {
      traffic.fetched.shops++;
      return HttpResponse.json({ shops: [shop] });
    }),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.get(`/api/v1/shops/${shop.id}/visits`, () => {
      traffic.fetched.visits++;
      traffic.log.push("visits");
      return HttpResponse.json({ visits: [visit] });
    }),
    http.post(`/api/v1/auth/visits/${visit.id}/images`, async ({ request }) => {
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
      visit = { ...visit, images: [...visit.images, added] };
      return HttpResponse.json(added);
    }),
    http.put(
      `/api/v1/auth/visits/${visit.id}/images/order`,
      async ({ request }) => {
        const { imageIds } = (await request.json()) as { imageIds: string[] };
        traffic.reorders.push(imageIds);
        const byId = new Map(visit.images.map((i) => [i.id, i]));
        visit = { ...visit, images: imageIds.map((id) => byId.get(id)!) };
        return HttpResponse.json({ images: visit.images });
      },
    ),
    http.put(
      "/api/v1/auth/visit-images/:imageId",
      async ({ params, request }) => {
        const body = (await request.json()) as { caption?: string };
        const id = params.imageId as string;
        traffic.captions.push({ id, ...body });
        visit = {
          ...visit,
          images: visit.images.map((i) =>
            i.id === id ? { ...i, caption: body.caption } : i,
          ),
        };
        return HttpResponse.json(visit.images.find((i) => i.id === id));
      },
    ),
    http.delete("/api/v1/auth/visit-images/:imageId", ({ params }) => {
      traffic.deleted.push(params.imageId as string);
      visit = {
        ...visit,
        images: visit.images.filter((i) => i.id !== params.imageId),
      };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const onClose = vi.fn();
  renderWithProviders(
    <ShopEditModal
      shop={shop}
      open
      initialTab="visit"
      onClose={onClose}
      onDeleted={vi.fn()}
    />,
  );
  return Object.assign(traffic, { onClose });
}

const imageList = () => screen.findByRole("list", { name: "訪問画像" });
const fileInput = () => screen.getByLabelText("追加する画像ファイル");
const dropArea = () => screen.getByRole("group", { name: "画像の追加" });

async function upload(...files: File[]) {
  await screen.findByRole("list", { name: "訪問ログ" });
  await userEvent.upload(fileInput(), files);
}

describe("VisitImageManager", () => {
  it("marks the first image as the visit's 代表", async () => {
    renderImages({ images: [image(1, "味玉"), image(2)] });

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
    const traffic = renderImages();
    await screen.findByRole("list", { name: "訪問ログ" });
    await waitFor(() => expect(traffic.fetched.shops).toBeGreaterThan(0));
    const shopsBefore = traffic.fetched.shops;

    await upload(jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"));

    await waitFor(async () =>
      expect(within(await imageList()).getAllByRole("listitem")).toHaveLength(
        3,
      ),
    );
    expect(traffic.uploads).toBe(3);
    // Each upload starts only after the previous one finished and refetched
    // the visits; concurrent uploads would arrive back to back.
    const uploads = traffic.log.flatMap((entry, i) =>
      entry === "upload" ? [i] : [],
    );
    expect(uploads).toHaveLength(3);
    for (const [prev, next] of [
      [uploads[0], uploads[1]],
      [uploads[1], uploads[2]],
    ]) {
      expect(traffic.log.slice(prev + 1, next)).toContain("visits");
    }
    expect(traffic.fetched.visits).toBeGreaterThan(3);
    // The 代表写真 in the shop list is refetched after the last upload only.
    await waitFor(() =>
      expect(traffic.fetched.shops).toBeGreaterThan(shopsBefore),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(traffic.fetched.shops).toBe(shopsBefore + 1);
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
  });

  it("retries once after Retry-After when the server is busy", async () => {
    const traffic = renderImages({
      uploadResponse: (attempt) =>
        attempt === 1
          ? HttpResponse.json(
              { type: "visit_image_processing_busy" },
              { status: 503, headers: { "Retry-After": "0" } },
            )
          : undefined,
    });

    await upload(jpeg("a.jpg"));

    await waitFor(async () =>
      expect(within(await imageList()).getAllByRole("listitem")).toHaveLength(
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
          { type: "visit_image_limit_reached" },
          { status: 409 },
        ),
      "1つの訪問ログに追加できる画像は10枚までです",
    ],
    [
      "a server still busy after the retry",
      () =>
        HttpResponse.json(
          { type: "visit_image_processing_busy" },
          { status: 503, headers: { "Retry-After": "0" } },
        ),
      "サーバーが混み合っています。時間をおいてもう一度お試しください",
    ],
    [
      "no image storage",
      () =>
        HttpResponse.json(
          { type: "visit_images_storage_unconfigured" },
          { status: 503 },
        ),
      "画像の保存先が設定されていないため追加できません",
    ],
  ])("shows %s next to the file", async (_, response, message) => {
    renderImages({ uploadResponse: response });

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
    const traffic = renderImages();

    await upload(new File(["heic"], "ramen.heic", { type: "image/heic" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "この画像形式は読み込めません",
    );
    expect(traffic.uploads).toBe(0);
  });

  it("uploads only up to 10 images and then disables adding", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    const traffic = renderImages({ images: nine });

    await upload(jpeg("a.jpg"), jpeg("b.jpg"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1つの訪問ログに追加できる画像は10枚までです",
    );
    await waitFor(async () =>
      expect(within(await imageList()).getAllByRole("listitem")).toHaveLength(
        10,
      ),
    );
    expect(traffic.uploads).toBe(1);
    expect(screen.getByRole("button", { name: "画像を追加" })).toBeDisabled();
    expect(screen.getByText("画像は10枚までです")).toBeInTheDocument();
  });

  it("sends the whole new order when an image is moved", async () => {
    const traffic = renderImages({ images: [image(1), image(2), image(3)] });

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
    await waitFor(async () =>
      expect(
        within(await imageList())
          .getAllByRole("img")
          .map((img) => img.getAttribute("src")),
      ).toEqual([image(1).url, image(3).url, image(2).url]),
    );
  });

  it("saves a trimmed caption", async () => {
    const traffic = renderImages({ images: [image(1)] });

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
    const traffic = renderImages({ images: [image(1), image(2)] });

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
    await waitFor(async () =>
      expect(within(await imageList()).getAllByRole("listitem")).toHaveLength(
        1,
      ),
    );
  });

  it("keeps uploads and their failures across opening a visit form, locking the modal meanwhile", async () => {
    const traffic = renderImages({
      images: [image(1), image(2)],
      uploadResponse: (attempt) =>
        attempt === 1
          ? HttpResponse.json(
              { type: "visit_image_processing_busy" },
              { status: 503, headers: { "Retry-After": "1" } },
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
    // The visit cannot be deleted under its uploads.
    expect(
      screen.getByRole("button", { name: "訪問ログを削除" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "訪問を記録" }));
    expect(footerCancel()).toBeDisabled();

    // The retry fails while the form is open; closing it shows the failure.
    await waitFor(() => expect(traffic.uploads).toBe(2), { timeout: 3000 });
    await waitFor(() => expect(footerCancel()).toBeEnabled());
    await userEvent.click(
      within(screen.getByRole("group", { name: "訪問を記録" })).getByRole(
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
      screen.getByRole("button", { name: "訪問ログを削除" }),
    ).toBeEnabled();
  });

  it("locks deleting images while a reorder is in flight", async () => {
    const traffic = renderImages({ images: [image(1), image(2)] });
    let release = () => {};
    server.use(
      http.put("/api/v1/auth/visits/:visitId/images/order", async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await delay(0);
        return HttpResponse.json({ images: [image(2), image(1)] });
      }),
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
    const traffic = renderImages({ images: [image(1, "味玉")] });
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
    expect(screen.getByRole("list", { name: "訪問ログ" })).toBeInTheDocument();
  });

  it("hints at drop and paste only while images can be added", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    renderImages({ images: nine });
    await imageList();

    expect(
      screen.getByText("ドラッグ＆ドロップ・貼り付けでも追加できます"),
    ).toBeInTheDocument();
    await upload(jpeg("a.jpg"));
    await waitFor(() =>
      expect(screen.getByText("画像は10枚までです")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("ドラッグ＆ドロップ・貼り付けでも追加できます"),
    ).toBeNull();
  });

  it("queues dropped image files in order and ignores other files", async () => {
    // Every upload fails, so each file stays listed in queue order.
    const traffic = renderImages({
      uploadResponse: () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [{ field: "file", type: "too_long" }],
          },
          { status: 400 },
        ),
    });
    await screen.findByRole("list", { name: "訪問ログ" });
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
    expect(traffic.uploads).toBe(2);
  });

  it("drops only up to 10 images and refuses a drop when full", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => image(i + 1));
    const traffic = renderImages({ images: nine });
    await imageList();

    fireEvent.drop(dropArea(), {
      dataTransfer: { types: ["Files"], files: [jpeg("a.jpg"), jpeg("b.jpg")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1つの訪問ログに追加できる画像は10枚までです",
    );
    await waitFor(async () =>
      expect(within(await imageList()).getAllByRole("listitem")).toHaveLength(
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
    fireEvent.drop(dropArea(), { dataTransfer });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(traffic.uploads).toBe(1);
    expect(
      screen.getByRole("list", { name: "追加中の画像" }),
    ).not.toHaveTextContent("c.jpg");
  });

  it("uploads an image pasted while focus is in the image area", async () => {
    const traffic = renderImages();
    await screen.findByRole("list", { name: "訪問ログ" });
    const area = dropArea();
    // The area itself takes focus, so a paste reaches it.
    area.focus();
    expect(area).toHaveFocus();

    const pasted = fireEvent.paste(area, {
      clipboardData: {
        files: [new File(["png"], "image.png", { type: "image/png" })],
      },
    });

    expect(pasted).toBe(false);
    await waitFor(async () =>
      expect(within(await imageList()).getAllByRole("listitem")).toHaveLength(
        1,
      ),
    );
    expect(traffic.uploads).toBe(1);
  });

  it("leaves a paste into the caption input alone", async () => {
    const traffic = renderImages({ images: [image(1)] });
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
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(traffic.uploads).toBe(0);
    expect(screen.queryByRole("list", { name: "追加中の画像" })).toBeNull();
  });

  it("asks to save a new visit before adding images", async () => {
    renderImages();

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );

    expect(
      screen.getByText("画像は訪問を保存した後に追加できます"),
    ).toBeInTheDocument();
  });
});
