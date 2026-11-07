import type { Tag, UpdateShopCommand } from "@/features/shops/api/use-shops.ts";
import { isHttpUrl, SHOP_LINK_TYPES } from "@/features/shops/shop-links.ts";
import type { components } from "@/generated/api.ts";
import type { ClosureValue, Proposal } from "./proposal-file.ts";
import { isCalendarDate } from "./proposal-file.ts";

type ApiShop = components["schemas"]["Shop"];

/**
 * Where a proposal stands against production. Derived afresh every time, so loading the same file
 * again is safe and a run that stopped halfway continues by loading it again.
 */
export type ProposalState =
  /** Production already holds the proposed value. */
  | { readonly kind: "applied" }
  /** Production still holds the value the research saw, or the proposal only adds. */
  | { readonly kind: "ready" }
  /** Production changed since the research, or already has another link of this type: someone must compare. */
  | { readonly kind: "conflict" }
  | {
      readonly kind: "unavailable";
      readonly reason: "shop_missing" | "tag_missing";
    };

const sameClosure = (a: ClosureValue | null, b: ClosureValue | null): boolean =>
  a?.startsOn === b?.startsOn &&
  (a?.reopensOn ?? null) === (b?.reopensOn ?? null);

/** What the proposal would change or sit beside in production, which is what the admin compares it with. */
export function currentValueOf(
  proposal: Proposal,
  shop: ApiShop,
): string | ClosureValue | null {
  switch (proposal.field) {
    case "name":
      return shop.name;
    case "name_kana":
      return shop.nameKana ?? null;
    case "opened_at":
      return shop.openedAt ?? null;
    case "closed_at":
      return shop.closedAt ?? null;
    case "temporary_closure":
      return shop.temporaryClosure
        ? {
            startsOn: shop.temporaryClosure.startsOn,
            reopensOn: shop.temporaryClosure.reopensOn ?? null,
          }
        : null;
    case "link": {
      const urls = shop.links
        .filter((link) => link.type === proposal.proposedValue.type)
        .map((link) => link.url);
      return urls.length > 0 ? urls.join(" / ") : null;
    }
    case "tag":
      return null;
  }
}

export function stateOf(
  proposal: Proposal,
  shop: ApiShop | undefined,
  tags: readonly Tag[],
): ProposalState {
  if (!shop) {
    return { kind: "unavailable", reason: "shop_missing" };
  }
  switch (proposal.field) {
    case "link": {
      const { type, url } = proposal.proposedValue;
      const sameType = shop.links.filter((link) => link.type === type);
      if (sameType.some((link) => link.url === url.trim())) {
        return { kind: "applied" };
      }
      // A chain's page and a store's page can both be right, but only a person can tell: it may also be
      // the same account under another address, or a value the admin corrected on an earlier load.
      return sameType.length > 0 ? { kind: "conflict" } : { kind: "ready" };
    }
    case "tag":
      if (shop.tags.some((tag) => tag.slug === proposal.proposedValue)) {
        return { kind: "applied" };
      }
      return tags.some((tag) => tag.slug === proposal.proposedValue)
        ? { kind: "ready" }
        : { kind: "unavailable", reason: "tag_missing" };
    case "temporary_closure": {
      const current = currentValueOf(proposal, shop) as ClosureValue | null;
      if (sameClosure(current, proposal.proposedValue)) {
        return { kind: "applied" };
      }
      return sameClosure(current, proposal.baseValue)
        ? { kind: "ready" }
        : { kind: "conflict" };
    }
    case "name":
    case "name_kana":
    case "opened_at":
    case "closed_at": {
      const current = currentValueOf(proposal, shop);
      if (current === proposal.proposedValue) {
        return { kind: "applied" };
      }
      return current === proposal.baseValue
        ? { kind: "ready" }
        : { kind: "conflict" };
    }
  }
}

/** Only an untroubled proposal that fills or adds may be approved without reading it. */
export const canBulkApprove = (proposal: Proposal, state: ProposalState) =>
  state.kind === "ready" && proposal.reviewReasons.length === 0;

/** What is wrong with an edited value, or null. Edits come from a person, the file's values were parsed. */
export function editProblem(proposal: Proposal): string | null {
  switch (proposal.field) {
    case "opened_at":
    case "closed_at":
      return isCalendarDate(proposal.proposedValue)
        ? null
        : "日付を入力してください";
    case "temporary_closure": {
      const { startsOn, reopensOn } = proposal.proposedValue;
      if (!isCalendarDate(startsOn)) {
        return "開始日を入力してください";
      }
      if (reopensOn !== null && !isCalendarDate(reopensOn)) {
        return "再開日が正しくありません";
      }
      return reopensOn !== null && reopensOn <= startsOn
        ? "再開日は開始日より後にしてください"
        : null;
    }
    case "link":
      return isHttpUrl(proposal.proposedValue.url.trim())
        ? null
        : "http(s) の URL を入力してください";
    case "tag":
      return null;
    case "name":
    case "name_kana":
      return proposal.proposedValue.trim() === ""
        ? "値を入力してください"
        : null;
  }
}

const linkRank = (type: string) =>
  SHOP_LINK_TYPES.indexOf(type as (typeof SHOP_LINK_TYPES)[number]);

/**
 * The PUT body that changes only these proposals. updateShop replaces the whole shop and clears a
 * missing openedAt or closedAt, so every other value comes from `shop`, which must be fresh.
 * Optional fields this does not change stay out: the server keeps a missing one.
 */
export function shopUpdateOf(
  shop: ApiShop,
  tags: readonly Tag[],
  proposals: readonly Proposal[],
): UpdateShopCommand {
  const command: UpdateShopCommand = {
    name: shop.name,
    lat: shop.lat,
    lng: shop.lng,
    postalCode: shop.postalCode,
    address: shop.address,
    openedAt: shop.openedAt,
    closedAt: shop.closedAt,
    category: shop.category,
    tagIds: shop.tags.map((tag) => tag.id),
  };
  let links: NonNullable<UpdateShopCommand["links"]> | undefined;

  for (const proposal of proposals) {
    switch (proposal.field) {
      case "name":
        command.name = proposal.proposedValue.trim();
        break;
      case "name_kana":
        command.nameKana = proposal.proposedValue.trim();
        break;
      case "opened_at":
        command.openedAt = proposal.proposedValue;
        break;
      case "closed_at":
        command.closedAt = proposal.proposedValue;
        break;
      case "temporary_closure":
        command.temporaryClosure = {
          startsOn: proposal.proposedValue.startsOn,
          reopensOn: proposal.proposedValue.reopensOn ?? undefined,
        };
        break;
      case "tag": {
        const tag = tags.find((t) => t.slug === proposal.proposedValue);
        if (tag && !command.tagIds.includes(tag.id)) {
          command.tagIds.push(tag.id);
        }
        break;
      }
      case "link": {
        links ??= [...shop.links];
        const { type, url, label } = proposal.proposedValue;
        // After its own type's links, so the admin's existing order stays as it is.
        if (
          links.some((link) => link.type === type && link.url === url.trim())
        ) {
          break;
        }
        const rank = linkRank(type);
        const at = links.findLastIndex((link) => linkRank(link.type) <= rank);
        links.splice(at + 1, 0, {
          type,
          url: url.trim(),
          label: label ?? undefined,
        });
        break;
      }
    }
  }
  if (links) {
    command.links = links;
  }
  return command;
}
