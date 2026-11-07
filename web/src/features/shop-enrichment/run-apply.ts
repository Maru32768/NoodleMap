import {
  fetchShops,
  fetchTags,
  putShop,
} from "@/features/shops/api/use-shops.ts";
import { ApiError } from "@/utils/request.ts";
import { apiErrorText } from "@/utils/toast.ts";
import { groupBy } from "es-toolkit";
import type { Proposal } from "./proposal-file.ts";
import { currentValueOf, shopUpdateOf, stateOf } from "./review.ts";

export type ApplyItem = {
  /** Carries the edited value, when the admin edited it. */
  readonly proposal: Proposal;
  /** The production value on screen when the admin chose this. The choice holds only against that value. */
  readonly seenCurrent: ReturnType<typeof currentValueOf>;
};

export type ApplyProgress = {
  readonly shopsTotal: number;
  readonly shopsDone: number;
  readonly applied: number;
  /** Production already held the value, or nothing else was left to change. */
  readonly alreadyApplied: number;
  readonly failures: readonly {
    readonly shopId: string;
    readonly shopName: string;
    readonly message: string;
  }[];
};

export type ApplyOutcome = {
  readonly kind: "finished" | "stopped" | "unauthorized";
  readonly progress: ApplyProgress;
};

const CHANGED_MEANWHILE =
  "確認中に本番の値が変わったので反映しませんでした。読み込み直して確認してください";
const NO_SHOP = "本番に店舗がありません";
const NO_TAG = "本番にタグがありません";

/**
 * Applies the chosen proposals, one PUT per shop and one shop at a time. Each run starts from a fresh
 * read of production, so a value changed after the screen loaded is not overwritten. Retrying means
 * running again: what took effect shows as applied and is not sent twice.
 * shortcut: an edit between this read and a shop's PUT is overwritten, fine with one admin, upgrade with a server-side compare if that changes.
 */
export async function applyProposals(
  items: readonly ApplyItem[],
  options: { signal: AbortSignal; onProgress: (p: ApplyProgress) => void },
): Promise<ApplyOutcome> {
  const { signal, onProgress } = options;
  const byShop = Object.entries(groupBy(items, (item) => item.proposal.shopId));
  let progress: ApplyProgress = {
    shopsTotal: byShop.length,
    shopsDone: 0,
    applied: 0,
    alreadyApplied: 0,
    failures: [],
  };
  onProgress(progress);

  let shops;
  let tags;
  try {
    [shops, tags] = await Promise.all([fetchShops(), fetchTags()]);
  } catch (error) {
    return {
      kind: "stopped",
      progress: {
        ...progress,
        failures: [
          {
            shopId: "",
            shopName: "",
            message: apiErrorText(error as ApiError),
          },
        ],
      },
    };
  }
  const shopsById = new Map(shops.map((shop) => [shop.id, shop]));

  for (const [shopId, shopItems] of byShop) {
    if (signal.aborted) {
      return { kind: "stopped", progress };
    }
    const shop = shopsById.get(shopId);
    const failures = [...progress.failures];
    const fail = (message: string) =>
      failures.push({ shopId, shopName: shop?.name ?? shopId, message });

    const toSend: Proposal[] = [];
    let already = 0;
    for (const { proposal, seenCurrent } of shopItems) {
      const state = stateOf(proposal, shop, tags);
      if (state.kind === "applied") {
        already += 1;
      } else if (state.kind === "unavailable") {
        fail(state.reason === "shop_missing" ? NO_SHOP : NO_TAG);
      } else if (
        !shop ||
        JSON.stringify(currentValueOf(proposal, shop)) !==
          JSON.stringify(seenCurrent)
      ) {
        fail(CHANGED_MEANWHILE);
      } else {
        toSend.push(proposal);
      }
    }

    let applied = 0;
    if (shop && toSend.length > 0) {
      const result = await putShop(shopId, shopUpdateOf(shop, tags, toSend));
      if (result.ok) {
        applied = toSend.length;
      } else if (result.error.status === 401) {
        return { kind: "unauthorized", progress };
      } else {
        fail(apiErrorText(result.error));
      }
    }

    progress = {
      ...progress,
      shopsDone: progress.shopsDone + 1,
      applied: progress.applied + applied,
      alreadyApplied: progress.alreadyApplied + already,
      failures,
    };
    onProgress(progress);
  }
  return { kind: "finished", progress };
}
