import { ShopEnrichmentModal } from "@/features/shop-enrichment/shop-enrichment-modal.tsx";
import type { Shop, Tag } from "@/features/shops/api/use-shops.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

const proposalLine = (
  shop: Shop,
  key: string,
  overrides: Record<string, unknown>,
) => ({
  kind: "proposal",
  runId: "b07-2026-11-06",
  shopId: shop.id,
  field: "opened_at",
  baseValue: null,
  proposedValue: "2020-06-28",
  evidence: [
    {
      url: "https://toho-seiso.example/news",
      sourceKind: "official_site",
      observedAt: "2026-11-06",
      note: "開店のお知らせ",
    },
  ],
  estimated: false,
  reviewReasons: [],
  dedupeKey: key,
  ...overrides,
});

const fileOf = (records: unknown[]) =>
  new File(
    [records.map((record) => JSON.stringify(record)).join("\n")],
    "accepted.jsonl",
  );

// As a browser does: the file shows only on drop, an untaken dragover or drop lets the browser open
// the file, and an effect of "none" refuses it.
const dropFile = (target: Element, file: File) => {
  const over = { types: ["Files"], files: [] as File[], dropEffect: "copy" };
  if (fireEvent.dragOver(target, { dataTransfer: over })) {
    return "opened";
  }
  if (over.dropEffect === "none") {
    return "refused";
  }
  return fireEvent.drop(target, { dataTransfer: { ...over, files: [file] } })
    ? "opened"
    : "dropped";
};

// Holds production's shops as a slow network would. `reached` settles once a read waits on them.
const holdShops = () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrive = () => {};
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  server.use(
    http.get("/api/v1/shops", async () => {
      arrive();
      await held;
      return HttpResponse.json({ shops });
    }),
  );
  return { release, reached };
};

const ready = async () => {
  renderWithProviders(<ShopEnrichmentModal open onClose={() => {}} />);
  const picker = await screen.findByLabelText("ファイルを選ぶ");
  await waitFor(() => expect(picker).toBeEnabled());
  return picker;
};

let shops: Shop[];
let tags: Tag[];
let puts: { id: string; body: Record<string, unknown> }[];

function serve() {
  server.use(
    http.get("/api/v1/shops", () => HttpResponse.json({ shops })),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags })),
    http.put("/api/v1/auth/shops/:id", async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      puts.push({ id: params.id as string, body });
      shops = shops.map((shop) =>
        shop.id === params.id
          ? makeShop({ ...shop, ...body, id: shop.id })
          : shop,
      );
      return new HttpResponse(null, { status: 200 });
    }),
  );
}

async function loadFile(records: unknown[]) {
  const user = userEvent.setup();
  await user.upload(await ready(), fileOf(records));
  return user;
}

beforeEach(() => {
  puts = [];
  tags = [];
  shops = [];
  serve();
});

describe("ShopEnrichmentModal", () => {
  it("changes nothing until proposals are chosen, then sends only those", async () => {
    const filled = makeShop({ name: "空の店", address: "東京都杉並区" });
    const skipped = makeShop({ name: "見送る店" });
    shops = [filled, skipped];
    const user = await loadFile([
      proposalLine(filled, "a", {}),
      proposalLine(skipped, "b", { proposedValue: "2021-01-01" }),
    ]);

    const group = await screen.findByRole("group", { name: "空の店" });
    expect(within(group).getByText("2020-06-28")).toBeInTheDocument();
    expect(puts).toEqual([]);

    await user.click(within(group).getByLabelText("開店日を選択"));
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );

    await screen.findByText("反映が終わりました");
    expect(puts).toHaveLength(1);
    expect(puts[0].id).toBe(filled.id);
    expect(puts[0].body).toMatchObject({
      name: "空の店",
      address: "東京都杉並区",
      openedAt: "2020-06-28",
    });
    // Applied rows leave the default view once production reports the value.
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "空の店" })).toBeNull(),
    );
    expect(screen.getByRole("group", { name: "見送る店" })).toBeInTheDocument();
  });

  it("bulk selection leaves out proposals that need a person", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([
      proposalLine(shop, "plain", {
        field: "link",
        proposedValue: {
          type: "tabelog",
          url: "https://tabelog.com/tokyo/A1319/A131905/13000000/",
          label: null,
        },
      }),
      // The file cannot clear a field the validator always sends to a person.
      proposalLine(shop, "unchecked", {}),
      proposalLine(shop, "risky", {
        field: "closed_at",
        proposedValue: "2026-10-01",
        reviewReasons: ["high_impact_field"],
        evidence: [
          {
            url: "https://example.com/news",
            sourceKind: "official_site",
            observedAt: "2026-11-06",
            note: "閉店の告知",
          },
        ],
      }),
    ]);
    await screen.findByRole("group", { name: "店" });

    await user.click(
      screen.getByRole("button", { name: "表示中の一括可を選択" }),
    );
    expect(screen.getByLabelText("リンク: 食べログを選択")).toBeChecked();
    expect(screen.getByLabelText("開店日を選択")).not.toBeChecked();
    expect(screen.getByLabelText("閉店日を選択")).not.toBeChecked();
    expect(
      within(screen.getByRole("group", { name: "閉店日" })).getByText(
        "影響の大きい項目",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    ).toBeEnabled();
  });

  it("shows all three values for a conflict and keeps it out of bulk selection", async () => {
    const shop = makeShop({ name: "店", openedAt: "2019-01-01" });
    shops = [shop];
    const user = await loadFile([
      proposalLine(shop, "a", { baseValue: "2018-01-01" }),
    ]);
    await screen.findByText("本番の値が調査時と違う");
    expect(screen.getByText("2019-01-01")).toBeInTheDocument();
    expect(screen.getByText("2018-01-01")).toBeInTheDocument();
    expect(screen.getByText("2020-06-28")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "表示中の一括可を選択" }),
    );
    expect(screen.getByLabelText("開店日を選択")).not.toBeChecked();

    await user.click(screen.getByLabelText("開店日を選択"));
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );
    await screen.findByText("反映が終わりました");
    expect(puts[0].body).toMatchObject({ openedAt: "2020-06-28" });
  });

  it("refuses a value production changed after the screen loaded", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByLabelText("開店日を選択"));

    // Someone edits the shop on another device while this screen is open.
    shops = [makeShop({ ...shop, openedAt: "2019-01-01" })];
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );

    expect(
      await screen.findByText(/確認中に本番の値が変わったので/),
    ).toBeInTheDocument();
    expect(puts).toEqual([]);

    // The refused row must be chosen again: the same button must not send it on a second click.
    expect(
      await screen.findByText("本番の値が調査時と違う"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("開店日を選択")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "選択した 0 件を本番へ反映" }),
    ).toBeDisabled();

    await user.click(screen.getByLabelText("開店日を選択"));
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );
    await screen.findByText("反映が終わりました");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ openedAt: "2020-06-28" });
  });

  it("refuses a conflict that changed again after the admin chose it", async () => {
    const shop = makeShop({ name: "店", openedAt: "2019-01-01" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByLabelText("開店日を選択"));

    shops = [makeShop({ ...shop, openedAt: "2018-01-01" })];
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );

    expect(
      await screen.findByText(/確認中に本番の値が変わったので/),
    ).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it("takes back the choice when an edit is abandoned", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByRole("button", { name: "修正する" }));
    expect(screen.getByLabelText("開店日を選択")).toBeChecked();

    await user.click(screen.getByRole("button", { name: "修正をやめる" }));
    expect(screen.getByLabelText("開店日を選択")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "選択した 0 件を本番へ反映" }),
    ).toBeDisabled();
  });

  it("leaves an unchosen edit unchosen while its value is typed", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([
      proposalLine(shop, "a", {
        field: "name",
        baseValue: shop.name,
        proposedValue: "新しい店",
      }),
    ]);
    await user.click(await screen.findByRole("button", { name: "修正する" }));
    await user.click(screen.getByLabelText("店名を選択"));
    expect(screen.getByLabelText("店名を選択")).not.toBeChecked();

    await user.type(screen.getByLabelText("店名の修正"), "名");
    expect(screen.getByLabelText("店名を選択")).not.toBeChecked();
  });

  it("keeps a second link of a type out of bulk selection and shows the existing one", async () => {
    const shop = makeShop({
      name: "店",
      links: [{ type: "instagram", url: "https://www.instagram.com/right/" }],
    });
    shops = [shop];
    const user = await loadFile([
      proposalLine(shop, "a", {
        field: "link",
        proposedValue: {
          type: "instagram",
          url: "https://www.instagram.com/wrong/",
          label: null,
        },
      }),
    ]);
    expect(
      await screen.findByText("同じ種類のリンクがあります"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://www.instagram.com/right/"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "表示中の一括可を選択" }),
    );
    expect(
      screen.getByRole("button", { name: "選択した 0 件を本番へ反映" }),
    ).toBeDisabled();
  });

  it("shows a notice whose shop has no proposal, and keeps it after the proposals are applied", async () => {
    const quiet = makeShop({ name: "提案のない店" });
    const busy = makeShop({ name: "提案のある店", openedAt: "2020-06-28" });
    shops = [quiet, busy];
    const notice = (shop: Shop, note: string) => ({
      kind: "notice",
      runId: "b07-2026-11-06",
      shopId: shop.id,
      noticeKind: "closed_without_date",
      note,
      url: null,
    });
    const user = await loadFile([
      notice(quiet, "公式サイトに閉店の告知"),
      notice(busy, "移転の記載"),
      proposalLine(busy, "applied", {}),
    ]);
    const group = await screen.findByRole("group", { name: "提案のない店" });
    expect(
      within(group).getByText("閉店 (日付不明): 公式サイトに閉店の告知"),
    ).toBeInTheDocument();
    expect(screen.getByText("閉店 (日付不明): 移転の記載")).toBeInTheDocument();
    expect(screen.getByText("注意のある店舗: 2 店")).toBeInTheDocument();

    // A narrower view shows what it names, not every notice.
    await user.click(screen.getByRole("radio", { name: "適用済み (1)" }));
    expect(screen.queryByRole("group", { name: "提案のない店" })).toBeNull();
  });

  it("keeps the review when the replacement file is refused", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByLabelText("開店日を選択"));

    await user.upload(
      screen.getByLabelText("別のファイルを選ぶ"),
      fileOf([{ kind: "command", runId: "r" }]),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "読み込めませんでした",
    );
    expect(screen.getByLabelText("開店日を選択")).toBeChecked();
    // Nothing stays locked by the refused file.
    expect(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("別のファイルを選ぶ")).toBeEnabled();
  });

  it("loads a dropped file, and a second drop replaces the review", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = userEvent.setup();
    await ready();

    expect(
      dropFile(
        screen.getByText(/ここにドロップしてください/),
        fileOf([proposalLine(shop, "a", {})]),
      ),
    ).toBe("dropped");
    await user.click(await screen.findByLabelText("開店日を選択"));

    dropFile(
      screen.getByRole("group", { name: "店" }),
      fileOf([proposalLine(shop, "a", { runId: "b08-2026-11-13" })]),
    );
    expect(await screen.findByText(/^b08-2026-11-13 /)).toBeInTheDocument();
    expect(screen.queryByText(/^b07-2026-11-06 /)).toBeNull();
    expect(screen.getByLabelText("開店日を選択")).not.toBeChecked();
  });

  it("ignores a file dropped while a run is going", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put(`/api/v1/auth/shops/${shop.id}`, async () => {
        await held;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByLabelText("開店日を選択"));
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );
    await screen.findByRole("button", { name: "停止" });

    expect(
      dropFile(
        screen.getByRole("group", { name: "店" }),
        fileOf([proposalLine(shop, "a", { runId: "b08-2026-11-13" })]),
      ),
    ).toBe("refused");
    release();

    await screen.findByText("反映が終わりました");
  });

  it("starts no run while a replacement file is compared with production", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByLabelText("開店日を選択"));
    const { release, reached } = holdShops();

    await user.upload(
      screen.getByLabelText("別のファイルを選ぶ"),
      fileOf([proposalLine(shop, "a", { runId: "b08-2026-11-13" })]),
    );
    await reached;
    const apply = screen.getByRole("button", {
      name: "選択した 1 件を本番へ反映",
    });
    expect(apply).toBeDisabled();
    // The review takes no other file meanwhile.
    expect(screen.getByLabelText("別のファイルを選ぶ")).toBeDisabled();
    expect(
      dropFile(screen.getByRole("group", { name: "店" }), fileOf([])),
    ).toBe("refused");
    await user.click(apply);
    release();

    expect(await screen.findByText(/^b08-2026-11-13 /)).toBeInTheDocument();
    expect(screen.queryByText(/反映しています|反映が終わりました/)).toBeNull();
    expect(puts).toEqual([]);
  });

  it("refuses another file while one is compared with production", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    await ready();
    const area = screen.getByText(/ここにドロップしてください/);
    const { release, reached } = holdShops();

    expect(
      dropFile(
        area,
        fileOf([proposalLine(shop, "a", { runId: "b08-2026-11-13" })]),
      ),
    ).toBe("dropped");
    await reached;
    expect(dropFile(area, fileOf([]))).toBe("refused");
    expect(screen.getByLabelText("ファイルを選ぶ")).toBeDisabled();
    release();

    expect(await screen.findByText(/^b08-2026-11-13 /)).toBeInTheDocument();
  });

  it.each(["shops", "tags"] as const)(
    "refuses a file dropped before the %s load",
    async (pending) => {
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get(`/api/v1/${pending}`, async () => {
          await held;
          return HttpResponse.json({ shops, tags });
        }),
      );
      renderWithProviders(<ShopEnrichmentModal open onClose={() => {}} />);

      expect(
        dropFile(
          await screen.findByText(/ここにドロップしてください/),
          fileOf([]),
        ),
      ).toBe("refused");
      release();
    },
  );

  it("keeps the browser from opening a file dropped outside the drop area", async () => {
    await ready();

    expect(dropFile(screen.getByText("調査結果の取り込み"), fileOf([]))).toBe(
      "refused",
    );
  });

  it("sends an edited value and blocks an invalid one", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByRole("button", { name: "修正する" }));

    const input = screen.getByLabelText("開店日の修正");
    expect(screen.getByLabelText("開店日を選択")).toBeChecked();
    await user.clear(input);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "日付を入力してください",
    );
    expect(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    ).toBeDisabled();

    await user.type(input, "2021-02-03");
    await user.click(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    );
    await screen.findByText("反映が終わりました");
    expect(puts[0].body).toMatchObject({ openedAt: "2021-02-03" });
  });

  it("adds a tag and a link beside the shop's existing ones", async () => {
    const shoyu = makeTag({ slug: "shoyu", label: "醤油" });
    const miso = makeTag({ slug: "miso", label: "味噌" });
    tags = [shoyu, miso];
    const shop = makeShop({
      name: "店",
      tags: [shoyu],
      links: [{ type: "official", url: "https://example.com/" }],
    });
    shops = [shop];
    const user = await loadFile([
      proposalLine(shop, "tag", {
        field: "tag",
        proposedValue: "miso",
      }),
      proposalLine(shop, "link", {
        field: "link",
        proposedValue: {
          type: "tabelog",
          url: "https://tabelog.com/tokyo/A1319/A131905/13000000/",
          label: null,
        },
      }),
    ]);
    expect(await screen.findByText("味噌")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "表示中の一括可を選択" }),
    );
    await user.click(screen.getByLabelText("タグを選択"));
    await user.click(
      screen.getByRole("button", { name: "選択した 2 件を本番へ反映" }),
    );
    await screen.findByText("反映が終わりました");
    expect(puts).toHaveLength(1);
    expect(puts[0].body.tagIds).toEqual([shoyu.id, miso.id]);
    expect(puts[0].body.links).toEqual([
      { type: "official", url: "https://example.com/" },
      {
        type: "tabelog",
        url: "https://tabelog.com/tokyo/A1319/A131905/13000000/",
      },
    ]);
  });

  it("hides what production already holds, so loading a file again sends nothing", async () => {
    const shop = makeShop({ name: "店", openedAt: "2020-06-28" });
    shops = [shop];
    await loadFile([proposalLine(shop, "a", {})]);
    expect(
      await screen.findByRole("radio", { name: "適用済み (1)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "店" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "選択した 0 件を本番へ反映" }),
    ).toBeDisabled();
  });

  describe("when a run goes wrong", () => {
    const three = () => {
      const [a, b, c] = ["店A", "店B", "店C"].map((name) => makeShop({ name }));
      shops = [a, b, c];
      return [a, b, c];
    };
    const choose = async (targets: Shop[]) => {
      const user = await loadFile(
        targets.map((shop, i) => proposalLine(shop, `key-${i}`, {})),
      );
      await screen.findByRole("group", { name: "店A" });
      for (const shop of targets) {
        await user.click(
          within(screen.getByRole("group", { name: shop.name })).getByLabelText(
            "開店日を選択",
          ),
        );
      }
      return user;
    };
    const applyButton = () =>
      screen.getByRole("button", { name: /件を本番へ反映/ });
    const failPut = (shop: Shop, status: number) =>
      server.use(
        http.put(`/api/v1/auth/shops/${shop.id}`, () =>
          HttpResponse.json({ type: "internal", message: "x" }, { status }),
        ),
      );

    it("records a failed shop and carries on with the next", async () => {
      const [a, b, c] = three();
      failPut(b, 500);
      const user = await choose([a, b, c]);
      await user.click(applyButton());

      await screen.findByText("反映が終わりました");
      expect(puts.map((put) => put.id)).toEqual([a.id, c.id]);
      expect(screen.getByText(/反映 2 件/)).toBeInTheDocument();
      expect(
        within(
          screen.getByRole("list", { name: "反映できなかった項目" }),
        ).getByText(/^店B: /),
      ).toBeInTheDocument();
    });

    it("names the items the server refused", async () => {
      const [a] = three();
      server.use(
        http.put(`/api/v1/auth/shops/${a.id}`, () =>
          HttpResponse.json(
            {
              type: "invalid_request",
              message: "x",
              fieldErrors: [
                { field: "businessHours", type: "invalid_format" },
                { field: "closedAt", type: "out_of_range" },
              ],
            },
            { status: 400 },
          ),
        ),
      );
      const user = await choose([a]);
      await user.click(applyButton());

      await screen.findByText("反映が終わりました");
      expect(
        screen.getByRole("list", { name: "反映できなかった項目" }),
      ).toHaveTextContent(
        /^店A: 営業時間を確認してください.*、閉店日: 範囲外の値です$/,
      );
    });

    it("stops at an expired login and says so", async () => {
      const [a, b, c] = three();
      failPut(b, 401);
      const user = await choose([a, b, c]);
      await user.click(applyButton());

      await screen.findByText(/ログインが切れたため停止しました/);
      expect(puts.map((put) => put.id)).toEqual([a.id]);
    });

    it("stops before the next shop when asked", async () => {
      const [a, b, c] = three();
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.put(`/api/v1/auth/shops/${a.id}`, async () => {
          await held;
          puts.push({ id: a.id, body: {} });
          return new HttpResponse(null, { status: 200 });
        }),
      );
      const user = await choose([a, b, c]);
      await user.click(applyButton());
      await user.click(await screen.findByRole("button", { name: "停止" }));
      release();

      await screen.findByText("反映を停止しました");
      expect(puts.map((put) => put.id)).toEqual([a.id]);
    });

    it("sends nothing when production cannot be read first", async () => {
      const [a] = three();
      const user = await choose([a]);
      server.use(
        http.get("/api/v1/shops", () =>
          HttpResponse.json(
            { type: "internal", message: "x" },
            { status: 500 },
          ),
        ),
      );
      await user.click(applyButton());

      await screen.findByText("反映を停止しました");
      expect(puts).toEqual([]);
    });
  });

  it("explains a refused file and shows nothing from it", async () => {
    await loadFile([{ kind: "command", runId: "r" }]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "読み込めませんでした。1 行目: 未知のレコードです",
    );
    expect(screen.getByLabelText("ファイルを選ぶ")).toBeEnabled();
  });

  it("explains a folder dropped on the review and keeps the review", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    const user = await loadFile([proposalLine(shop, "a", {})]);
    await user.click(await screen.findByRole("button", { name: "修正する" }));
    const input = screen.getByLabelText("開店日の修正");
    await user.clear(input);
    await user.type(input, "2021-02-03");
    // Chromium hands a dropped folder over as an empty File whose read fails.
    const folder = new File([], "b07-2026-11-06");
    folder.text = () =>
      Promise.reject(new DOMException("not found", "NotFoundError"));

    dropFile(screen.getByRole("group", { name: "店" }), folder);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "読み込めませんでした。フォルダではないか、ほかのアプリで開いたままになっていないかを確かめてください",
    );
    expect(screen.getByLabelText("開店日を選択")).toBeChecked();
    expect(screen.getByLabelText("開店日の修正")).toHaveValue("2021-02-03");
    // Nothing stays locked by the unreadable file.
    expect(
      screen.getByRole("button", { name: "選択した 1 件を本番へ反映" }),
    ).toBeEnabled();
  });

  it("explains an empty file as empty, not as unreadable", async () => {
    await loadFile([]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "読み込めませんでした。レコードがありません",
    );
  });

  it("renders web text as text and links only with a safe rel", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    await loadFile([
      proposalLine(shop, "a", {
        field: "name",
        baseValue: shop.name,
        proposedValue: "<img src=x onerror=alert(1)>",
        reviewReasons: ["high_impact_field"],
      }),
    ]);
    expect(
      await screen.findByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
    const link = screen.getByRole("link", { name: "toho-seiso.example" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says a month-end closing date came from a news article that gave only the month", async () => {
    const shop = makeShop({ name: "店" });
    shops = [shop];
    await loadFile([
      proposalLine(shop, "a", {
        field: "closed_at",
        proposedValue: "2024-06-30",
        evidence: [
          {
            url: "https://www.yamatopi.jp/open-close/shouta.html",
            sourceKind: "news_site",
            observedAt: "2026-11-06",
            note: "2024年6月に閉店と報じた記事",
          },
        ],
        estimated: true,
        reviewReasons: ["high_impact_field", "estimated_date"],
      }),
    ]);
    expect(
      await screen.findByText("月までしか分からないので月末にした日付です"),
    ).toBeInTheDocument();
    // The filters list every label too, so look for the badge and the evidence line.
    expect(
      screen
        .getAllByText("月末とした閉店日")
        .some((element) => element.tagName !== "OPTION"),
    ).toBe(true);
    expect(screen.getByText(/地域のニュース · 2026-11-06/)).toBeInTheDocument();
  });

  it("shows notices next to the shop and names a shop production lost", async () => {
    const shop = makeShop({ name: "店" });
    const gone = "99999999-2222-4333-8444-555555555555";
    shops = [shop];
    await loadFile([
      proposalLine(shop, "a", {}),
      {
        kind: "notice",
        runId: "b07-2026-11-06",
        shopId: shop.id,
        noticeKind: "suspected_injection",
        note: "ページ内にAI宛の指示があった",
        url: null,
      },
      {
        ...proposalLine(shop, "b", {}),
        shopId: gone,
      },
    ]);
    expect(
      await screen.findByText("注入の疑い: ページ内にAI宛の指示があった"),
    ).toBeInTheDocument();
    const lost = screen.getByRole("group", {
      name: `本番にない店舗 (${gone})`,
    });
    expect(
      within(lost).getByText("本番に店舗がありません"),
    ).toBeInTheDocument();
  });
});
