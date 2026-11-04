import { FieldError, FormField } from "@/components/form-field.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { SegmentedPicker } from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { useRefuseFileDrop } from "@/components/use-refuse-file-drop.ts";
import { useRevealFirstError } from "@/components/use-reveal-first-error.ts";
import {
  CATEGORY_OPTIONS,
  CategorySlug,
} from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { MealRecordEditor } from "@/features/meal-records/meal-record-editor.tsx";
import { mealRecordInputProps } from "@/features/meal-records/meal-record-input-props.ts";
import {
  Shop,
  UpdateShopCommand,
  useShops,
  useTags,
} from "@/features/shops/api/use-shops.ts";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import {
  clearShopFieldErrors,
  FieldErrorType,
  SHOP_NAME_KANA_MAX_LENGTH,
  ShopFieldErrors,
  toShopFieldErrors,
  UpdateShopField,
} from "@/features/shops/shop-field-errors.ts";
import {
  findShopLinkProblem,
  savableShopLinks,
  SHOP_LINK_TYPE_LABEL,
  SHOP_LINK_TYPES,
  SHOP_LINKS_MAX,
  ShopLinkInput,
  ShopLinkType,
  withLinkUrl,
} from "@/features/shops/shop-links.ts";
import type { WishLevel } from "@/features/shops/status.ts";
import { TagSelector } from "@/features/shops/tag-chips.tsx";
import { WishLevelSelect } from "@/features/shops/wish-level-select.tsx";
import { invalidRequestFieldErrors } from "@/utils/request.ts";
import {
  mealRecordFieldErrorMessage,
  SHOP_ALREADY_DELETED_TITLE,
  SHOP_UPDATE_FAILED_TITLE,
  shopFieldErrorMessage,
  shopLinkProblemMessage,
  toastApiError,
  toastError,
  toastShopFieldErrors,
} from "@/utils/toast.ts";
import { Box, Input, NativeSelect } from "@chakra-ui/react";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useRef, useState } from "react";

interface ShopEditDraft {
  id: string;
  name: string;
  nameKana?: string;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  googlePlaceId: string;
  category: CategorySlug;
  openedAt?: string;
  closedAt?: string;
  // 臨時休業; no start means none.
  closureStartsOn?: string;
  closureReopensOn?: string;
  // "" is 未設定.
  wishLevel: WishLevel | "";
  tagIds: string[];
  // Omitted when the cached shop has no `links` (older server), so saving keeps them.
  links?: ShopLinkInput[];
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="label"
      display="block"
      fontFamily="mono"
      fontSize="10px"
      letterSpacing="0.15em"
      textTransform="uppercase"
      color="nm.inkMuted"
      mb="5px"
    >
      {children}
    </Box>
  );
}

function FormInput({
  value,
  onChange,
  mono,
  type,
  step,
  placeholder,
  maxLength,
  ariaLabel,
}: {
  value: string | number;
  onChange: (v: string) => void;
  mono?: boolean;
  type?: string;
  step?: number;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
}) {
  return (
    <Input
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      step={step}
      placeholder={placeholder}
      maxLength={maxLength}
      w="100%"
      px="12px"
      py="8px"
      h="auto"
      bg="nm.bg"
      border="1px solid"
      borderColor="nm.line"
      borderRadius="nmMd"
      fontSize="13px"
      fontFamily={mono ? "mono" : "body"}
      color="nm.ink"
      _focus={{ borderColor: "nm.shu", bg: "white", boxShadow: "none" }}
      // Field.Root marks the input invalid; the borderColor above would hide it.
      _invalid={{ borderColor: "border.error" }}
    />
  );
}

const quietButtonProps = {
  variant: "plain",
  px: "14px",
  py: "9px",
  h: "auto",
  minH: "auto",
  fontSize: "13px",
  fontWeight: 500,
  rounded: "nmMd",
  bg: "nm.paper",
  color: "nm.inkMuted",
  border: "1px solid",
  borderColor: "nm.line",
  _hover: { borderColor: "nm.ink", color: "nm.ink" },
} as const;

const linkButtonProps = {
  variant: "plain",
  px: "8px",
  py: "6px",
  h: "auto",
  minH: "auto",
  minW: "auto",
  fontSize: "12px",
  color: "nm.inkMuted",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmMd",
  _hover: { borderColor: "nm.ink", color: "nm.ink" },
} as const;

// Editor rows carry a stable id so React keys survive reordering.
type ShopLinkRow = ShopLinkInput & { rowId: number };
type ShopEditState = Omit<ShopEditDraft, "links"> & {
  links: ShopLinkRow[];
};

let nextLinkRowId = 0;
const newLinkRow = (link: ShopLinkInput): ShopLinkRow => ({
  ...link,
  rowId: nextLinkRowId++,
});

type MoveDirection = "up" | "down";

function ShopLinksEditor({
  links,
  onChange,
}: {
  links: ShopLinkRow[];
  onChange: (links: ShopLinkRow[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ rowId: number; dir: MoveDirection } | null>(
    null,
  );
  // Keep focus on the moved link; at the top/bottom its pressed arrow is
  // disabled, so fall back to the other one.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) {
      return;
    }
    pendingFocus.current = null;
    const row = listRef.current?.querySelector(
      `[data-row-id="${target.rowId}"]`,
    );
    const same = row?.querySelector<HTMLButtonElement>(
      `[data-move="${target.dir}"]`,
    );
    const other = row?.querySelector<HTMLButtonElement>(
      `[data-move="${target.dir === "up" ? "down" : "up"}"]`,
    );
    (same && !same.disabled ? same : other)?.focus();
  });

  const update = (i: number, link: ShopLinkRow) =>
    onChange(links.map((l, j) => (j === i ? link : l)));
  const move = (i: number, dir: MoveDirection) => {
    const to = dir === "up" ? i - 1 : i + 1;
    const next = [...links];
    [next[i], next[to]] = [next[to], next[i]];
    pendingFocus.current = { rowId: links[i].rowId, dir };
    onChange(next);
  };

  return (
    <Box ref={listRef} display="flex" flexDirection="column" gap="8px">
      {links.map((link, i) => (
        <Box
          key={link.rowId}
          data-row-id={link.rowId}
          role="group"
          aria-label={`リンク ${i + 1}`}
          display="flex"
          flexWrap="wrap"
          gap="6px"
          alignItems="center"
        >
          <NativeSelect.Root width="120px" size="sm">
            <NativeSelect.Field
              aria-label="種類"
              value={link.type}
              onChange={(e) =>
                update(i, { ...link, type: e.target.value as ShopLinkType })
              }
            >
              {SHOP_LINK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SHOP_LINK_TYPE_LABEL[type]}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Box flex="2 1 220px">
            <FormInput
              value={link.url}
              onChange={(v) => update(i, withLinkUrl(link, v))}
              mono
              type="url"
              placeholder="https://..."
              ariaLabel="URL"
            />
          </Box>
          <Box flex="1 1 140px">
            <FormInput
              value={link.label ?? ""}
              onChange={(v) => update(i, { ...link, label: v })}
              placeholder="表示名（任意）"
              ariaLabel="表示名（任意）"
            />
          </Box>
          <Button
            {...linkButtonProps}
            aria-label="上へ"
            data-move="up"
            disabled={i === 0}
            onClick={() => move(i, "up")}
          >
            ↑
          </Button>
          <Button
            {...linkButtonProps}
            aria-label="下へ"
            data-move="down"
            disabled={i === links.length - 1}
            onClick={() => move(i, "down")}
          >
            ↓
          </Button>
          <Button
            {...linkButtonProps}
            aria-label="リンクを削除"
            onClick={() => onChange(links.filter((_, j) => j !== i))}
          >
            削除
          </Button>
        </Box>
      ))}
      <Box>
        <Button
          {...linkButtonProps}
          disabled={links.length >= SHOP_LINKS_MAX}
          onClick={() =>
            onChange([...links, newLinkRow({ type: "other", url: "" })])
          }
        >
          ＋ リンクを追加
        </Button>
      </Box>
    </Box>
  );
}

type Tab = "info" | "mealRecord";

const TAB_LABELS: Record<Tab, string> = {
  info: "店舗情報",
  mealRecord: "食べた記録",
};

// Fields with an input, all on 店舗情報; an error on any other field (including
// a field added on the server after this client was built) is toasted.
const FIELDS_WITH_INPUT: readonly UpdateShopField[] = [
  "name",
  "nameKana",
  "lat",
  "lng",
  "postalCode",
  "address",
  "openedAt",
  "closedAt",
  "temporaryClosure",
  "googlePlaceId",
  "category",
  "tagIds",
  "links",
  "wishLevel",
];

function isUpdateShopField(key: string): key is UpdateShopField {
  return (FIELDS_WITH_INPUT as readonly string[]).includes(key);
}

// A blank お気に入り度 clears it.
const parseRate = (text: string) =>
  text.trim() === "" ? undefined : Number(text);

// `badInput`: the browser could not read the number, so its value reads as "".
function rateProblem(
  text: string,
  badInput: boolean | undefined,
): FieldErrorType | undefined {
  if (badInput) {
    return "invalid_format";
  }
  const rate = parseRate(text);
  if (rate === undefined) {
    return undefined;
  }
  if (!Number.isFinite(rate)) {
    return "invalid_format";
  }
  return rate < 0 || rate > 100 ? "out_of_range" : undefined;
}

// Compared as saved, so e.g. adding and removing a blank link row is no change.
const shopDraftAsSaved = ({ links, ...rest }: ShopEditState) => ({
  ...rest,
  links: savableShopLinks(links),
});

function toUpdateCommand(
  draft: ShopEditDraft,
  initialWishLevel: WishLevel | "",
): UpdateShopCommand {
  return {
    name: draft.name,
    nameKana: draft.nameKana ?? "",
    lat: draft.lat,
    lng: draft.lng,
    postalCode: draft.postalCode,
    address: draft.address,
    openedAt: draft.openedAt,
    closedAt: draft.closedAt,
    // Always sent: without startsOn it clears the stored 臨時休業.
    temporaryClosure: {
      startsOn: draft.closureStartsOn,
      reopensOn: draft.closureStartsOn ? draft.closureReopensOn : undefined,
    },
    // Blank clears the stored Place ID.
    googlePlaceId: draft.googlePlaceId.trim(),
    category: draft.category,
    // Omitted when unchanged so the stored value is kept; "" clears it.
    wishLevel:
      draft.wishLevel === initialWishLevel ? undefined : draft.wishLevel,
    tagIds: draft.tagIds,
    links: draft.links,
  };
}

interface ShopEditModalProps {
  shop: Shop;
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function ShopEditModal({
  shop,
  open,
  initialTab = "info",
  onClose,
  onDeleted,
}: ShopEditModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [initialDraft] = useState<ShopEditState>(() => ({
    id: shop.id,
    name: shop.name,
    nameKana: shop.nameKana ?? "",
    address: shop.address,
    postalCode: shop.postalCode,
    lat: shop.lat,
    lng: shop.lng,
    googlePlaceId: shop.googlePlaceId ?? "",
    category: shop.category,
    openedAt: shop.openedAt,
    closedAt: shop.closedAt,
    closureStartsOn: shop.temporaryClosure?.startsOn,
    closureReopensOn: shop.temporaryClosure?.reopensOn,
    wishLevel: shop.wishLevel ?? "",
    tagIds: shop.tags.map((tag) => tag.id),
    // `links` is missing while an older server is still deployed.
    links: (shop.links ?? []).map(newLinkRow),
  }));
  const [draft, setDraft] = useState(initialDraft);
  const [fieldErrors, setFieldErrors] = useState<
    ShopFieldErrors<UpdateShopField>
  >({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Locks closing and saving while the DELETE is in flight.
  const [deleting, setDeleting] = useState(false);
  // What the 気になる度 select started from: unchanged means omit (keep).
  const [initialWishLevel] = useState<WishLevel | "">(shop.wishLevel ?? "");
  // Undefined until touched: a record saved meanwhile can change the shop's rate.
  const [rateDraft, setRateDraft] = useState<string>();
  const [rateError, setRateError] = useState<FieldErrorType>();
  const rateRef = useRef<HTMLInputElement>(null);
  // An open meal record form replaces the tabs and the footer with its own actions.
  const [mealRecordFormOpen, setMealRecordFormOpen] = useState(false);
  const [mealRecordDraftDirty, setMealRecordDraftDirty] = useState(false);
  // A meal record save or delete in flight locks closing like the shop save does.
  const [mealRecordBusy, setMealRecordBusy] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const { tags } = useTags();
  const {
    shops,
    updateShop,
    deleteShop,
    setShopRate,
    mutate: mutateShops,
  } = useShops();
  const savedRate = (shops?.find((s) => s.id === shop.id) ?? shop).rate;
  const rateText = rateDraft ?? savedRate?.toString() ?? "";
  const rateToSave = parseRate(rateText);
  const rateChanged = rateDraft !== undefined && rateToSave !== savedRate;

  const { ref: formRef, reveal: revealFirstError } =
    useRevealFirstError<HTMLDivElement>();

  useRefuseFileDrop(open);

  const errorOf = (field: UpdateShopField) => {
    const type = fieldErrors[field];
    return type && shopFieldErrorMessage(field, type);
  };

  const clearErrors = (fields: readonly UpdateShopField[]) =>
    setFieldErrors((errors) => clearShopFieldErrors(errors, fields));

  // Editing a field clears its server-side error.
  const set = <K extends keyof ShopEditState>(k: K, v: ShopEditState[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (isUpdateShopField(k)) {
      clearErrors([k]);
    }
  };

  const setClosure = (
    k: "closureStartsOn" | "closureReopensOn",
    v: string | undefined,
  ) => {
    setDraft((d) => ({ ...d, [k]: v }));
    clearErrors(["temporaryClosure"]);
  };

  const draftTagIds = draft.tagIds;
  const setCategory = useCallback(
    (category: ShopEditDraft["category"]) => {
      const fitsCategory = (tagId: string) => {
        const tag = tags?.find((candidate) => candidate.id === tagId);
        return !tag?.category || tag.category === category;
      };
      // Tags that do not fit stay chosen but hidden, so switching back keeps
      // them; saving drops them, and with them their error.
      setDraft((current) => ({ ...current, category }));
      const cleared: UpdateShopField[] = draftTagIds.every(fitsCategory)
        ? ["category"]
        : ["category", "tagIds"];
      setFieldErrors((errors) => clearShopFieldErrors(errors, cleared));
    },
    [tags, draftTagIds],
  );

  // Whether the field's input is on screen to show an error.
  const hasInput = (field: UpdateShopField) =>
    isUpdateShopField(field) && (field !== "tagIds" || !!tags);

  const handleSave = async () => {
    const invalidRate = rateProblem(
      rateText,
      rateRef.current?.validity.badInput,
    );
    if (invalidRate) {
      setRateError(invalidRate);
      revealFirstError();
      return;
    }
    const problem = findShopLinkProblem(draft.links);
    if (problem) {
      toastError(shopLinkProblemMessage(problem));
      return;
    }
    const links = savableShopLinks(draft.links);
    const withLinks: ShopEditDraft = {
      ...draft,
      // Sending [] for a shop cached without links would delete its links.
      links: shop.links === undefined && links.length === 0 ? undefined : links,
    };
    const sanitizedDraft = tags
      ? {
          ...withLinks,
          tagIds: Array.from(
            new Set(
              draft.tagIds.filter((tagId) => {
                const tag = tags.find((candidate) => candidate.id === tagId);
                return (
                  !!tag && (!tag.category || tag.category === draft.category)
                );
              }),
            ),
          ),
        }
      : withLinks;

    setFieldErrors({});
    setSaving(true);
    try {
      const result = await updateShop(
        shop.id,
        toUpdateCommand(sanitizedDraft, initialWishLevel),
      );
      if (!result.ok) {
        if (result.error.type === "not_found") {
          toastApiError(result.error, {
            fallbackTitle: SHOP_ALREADY_DELETED_TITLE,
          });
          onDeleted(shop.id);
          onClose();
          return;
        }
        const errors = invalidRequestFieldErrors(result.error.body);
        if (errors) {
          const shown = errors.filter((e) => hasInput(e.field));
          if (shown.length > 0) {
            setFieldErrors(toShopFieldErrors(shown));
            revealFirstError();
          }
          toastShopFieldErrors(
            SHOP_UPDATE_FAILED_TITLE,
            errors.filter((e) => !hasInput(e.field)),
          );
          return;
        }
        toastApiError(result.error, {
          fallbackTitle: SHOP_UPDATE_FAILED_TITLE,
        });
        return;
      }
      if (rateChanged) {
        const rateResult = await setShopRate(shop.id, rateToSave);
        // Stays open: saving again converges.
        if (!rateResult.ok) {
          toastApiError(rateResult.error, {
            fallbackTitle: "店舗のお気に入り度を保存できませんでした",
          });
          return;
        }
      }

      onClose();
      toaster.success({ description: "保存しました" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteShop(shop.id);
      if (!result.ok) {
        toastApiError(result.error, {
          fallbackTitle: "店舗を削除できませんでした",
        });
        return;
      }

      setConfirmDeleteOpen(false);
      onDeleted(shop.id);
      onClose();
      toaster.success({ description: "店舗を削除しました" });
    } finally {
      setDeleting(false);
    }
  };

  const shopDraftDirty =
    rateChanged ||
    !isEqual(shopDraftAsSaved(draft), shopDraftAsSaved(initialDraft));

  // Asks before closing would drop an unsaved meal record or shop info draft.
  const requestClose = () => {
    if (mealRecordDraftDirty || shopDraftDirty) {
      setConfirmDiscardOpen(true);
    } else {
      onClose();
    }
  };

  // Adding a meal record found the shop deleted elsewhere.
  const handleShopGone = () => {
    toastError({ title: SHOP_ALREADY_DELETED_TITLE });
    void mutateShops();
    onDeleted(shop.id);
    onClose();
  };

  const locked = saving || deleting || mealRecordBusy;

  const displayName = shop.name || "(名称未設定)";
  const hasMealRecords = shop.mealRecordCount > 0;

  return (
    <>
      <ModalDialog
        open={open}
        // Closing while a save or delete is in flight would drop its errors.
        onOpenChange={(o) => !o && !locked && requestClose()}
        width="100%"
        maxWidth="1040px"
        height="90vh"
        title={displayName}
        subtitle={`EDIT · ${shop.id}`}
        icon={
          <CategoryIcon
            category={shop.category}
            size={18}
            strokeWidth={1.4}
            color="white"
          />
        }
        iconBg={shop.category === "udon" ? "nm.kincha" : "nm.shu"}
        bodyProps={{
          p: 0,
          overflow: "visible",
          display: "flex",
          flexDirection: "column",
        }}
        contentProps={{
          animation: "adm-modal-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)",
          // dvh: iOS toolbars must not push the footer off screen. 90vh stays
          // for browsers without it.
          css: {
            "@supports (height: 100dvh)": {
              height: "min(90vh, calc(100dvh - 2rem))",
            },
          },
        }}
      >
        <>
          {/* Tabs */}
          {!mealRecordFormOpen && (
            <Box
              display="flex"
              borderBottom="1px solid"
              borderBottomColor="nm.lineFaint"
              px="22px"
            >
              {(["info", "mealRecord"] as Tab[]).map((t) => (
                <Button
                  key={t}
                  variant="plain"
                  px="14px"
                  py="11px"
                  h="auto"
                  minH="auto"
                  fontSize="13px"
                  fontWeight={tab === t ? 600 : 400}
                  color={tab === t ? "nm.ink" : "nm.inkMuted"}
                  borderBottom="2px solid"
                  borderBottomColor={tab === t ? "nm.shu" : "transparent"}
                  borderRadius="0"
                  display="flex"
                  alignItems="center"
                  gap="6px"
                  _hover={{ color: "nm.ink" }}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                </Button>
              ))}
            </Box>
          )}

          {/* Content */}
          <Box
            ref={formRef}
            px="22px"
            pt="20px"
            // Sticky elements stop at the padding: the form's action row is the footer.
            pb={mealRecordFormOpen ? "0" : "20px"}
            flex="1"
            minH="0"
            overflowY="auto"
          >
            {tab === "info" && (
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap="16px">
                <FormField
                  gridColumn="span 2"
                  label={<FieldLabel>カテゴリ</FieldLabel>}
                  error={errorOf("category")}
                >
                  <SegmentedPicker
                    label="カテゴリ"
                    options={CATEGORY_OPTIONS}
                    value={draft.category}
                    onChange={setCategory}
                  />
                </FormField>
                {tags && (
                  <FormField
                    gridColumn="span 2"
                    label={<FieldLabel>タグ</FieldLabel>}
                    error={errorOf("tagIds")}
                  >
                    <TagSelector
                      tags={tags}
                      selectedIds={draft.tagIds}
                      category={draft.category}
                      onChange={(ids) => set("tagIds", ids)}
                    />
                  </FormField>
                )}
                <FormField
                  gridColumn="span 2"
                  label={<FieldLabel>気になる度</FieldLabel>}
                  error={errorOf("wishLevel")}
                >
                  <WishLevelSelect
                    value={draft.wishLevel}
                    onChange={(v) => set("wishLevel", v)}
                  />
                </FormField>
                <FormField
                  gridColumn="span 2"
                  label={
                    <FieldLabel>
                      店舗のお気に入り度（0〜100、空欄で未設定）
                    </FieldLabel>
                  }
                  error={
                    rateError && mealRecordFieldErrorMessage("rate", rateError)
                  }
                >
                  <Box display="flex" alignItems="center" gap="8px">
                    <Input
                      {...mealRecordInputProps}
                      aria-label="店舗のお気に入り度"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      w="88px"
                      fontFamily="mono"
                      placeholder="未設定"
                      ref={rateRef}
                      value={rateText}
                      onChange={(e) => {
                        setRateDraft(e.target.value);
                        setRateError(undefined);
                      }}
                    />
                    {rateToSave !== undefined &&
                      !rateProblem(rateText, false) && (
                        <MiniHearts rate={rateToSave} />
                      )}
                  </Box>
                </FormField>
                <FormField
                  gridColumn="span 2"
                  label={
                    <FieldLabel>
                      店名{" "}
                      <Box as="span" color="nm.shu">
                        *
                      </Box>
                    </FieldLabel>
                  }
                  error={errorOf("name")}
                >
                  <FormInput
                    value={draft.name}
                    onChange={(v) => set("name", v)}
                  />
                </FormField>
                <FormField
                  gridColumn="span 2"
                  label={<FieldLabel>読み（ひらがな）</FieldLabel>}
                  error={errorOf("nameKana")}
                >
                  <FormInput
                    value={draft.nameKana ?? ""}
                    onChange={(v) => set("nameKana", v)}
                    maxLength={SHOP_NAME_KANA_MAX_LENGTH}
                  />
                </FormField>
                <FormField
                  gridColumn="span 2"
                  label={<FieldLabel>住所</FieldLabel>}
                  error={errorOf("address")}
                >
                  <FormInput
                    value={draft.address}
                    onChange={(v) => set("address", v)}
                  />
                </FormField>
                <FormField
                  label={<FieldLabel>郵便番号</FieldLabel>}
                  error={errorOf("postalCode")}
                >
                  <FormInput
                    value={draft.postalCode}
                    onChange={(v) => set("postalCode", v)}
                    mono
                    placeholder="000-0000"
                  />
                </FormField>
                <FormField
                  label={<FieldLabel>Google Place ID</FieldLabel>}
                  error={errorOf("googlePlaceId")}
                >
                  <FormInput
                    value={draft.googlePlaceId}
                    onChange={(v) => set("googlePlaceId", v)}
                    mono
                    placeholder="ChIJ..."
                  />
                </FormField>
                <FormField
                  label={
                    <FieldLabel>
                      緯度{" "}
                      <Box as="span" color="nm.shu">
                        *
                      </Box>
                    </FieldLabel>
                  }
                  error={errorOf("lat")}
                >
                  <FormInput
                    value={draft.lat}
                    onChange={(v) => set("lat", parseFloat(v))}
                    mono
                    type="number"
                    step={0.000001}
                  />
                </FormField>
                <FormField
                  label={
                    <FieldLabel>
                      経度{" "}
                      <Box as="span" color="nm.shu">
                        *
                      </Box>
                    </FieldLabel>
                  }
                  error={errorOf("lng")}
                >
                  <FormInput
                    value={draft.lng}
                    onChange={(v) => set("lng", parseFloat(v))}
                    mono
                    type="number"
                    step={0.000001}
                  />
                </FormField>
                <FormField
                  label={<FieldLabel>開店日</FieldLabel>}
                  error={errorOf("openedAt")}
                >
                  <FormInput
                    value={draft.openedAt ?? ""}
                    onChange={(v) => set("openedAt", v || undefined)}
                    mono
                    type="date"
                  />
                </FormField>
                <FormField
                  label={<FieldLabel>閉店日</FieldLabel>}
                  error={errorOf("closedAt")}
                >
                  <FormInput
                    value={draft.closedAt ?? ""}
                    onChange={(v) => set("closedAt", v || undefined)}
                    mono
                    type="date"
                  />
                </FormField>
                <FormField
                  label={<FieldLabel>臨時休業 開始日</FieldLabel>}
                  error={errorOf("temporaryClosure")}
                >
                  <FormInput
                    value={draft.closureStartsOn ?? ""}
                    onChange={(v) =>
                      setClosure("closureStartsOn", v || undefined)
                    }
                    mono
                    type="date"
                  />
                </FormField>
                <FormField
                  label={<FieldLabel>再開日（未定なら空）</FieldLabel>}
                >
                  <Box display="flex" gap="8px" alignItems="center">
                    <FormInput
                      value={draft.closureReopensOn ?? ""}
                      onChange={(v) =>
                        setClosure("closureReopensOn", v || undefined)
                      }
                      mono
                      type="date"
                    />
                    {(draft.closureStartsOn || draft.closureReopensOn) && (
                      <Button
                        {...linkButtonProps}
                        flexShrink={0}
                        onClick={() => {
                          setClosure("closureStartsOn", undefined);
                          setClosure("closureReopensOn", undefined);
                        }}
                      >
                        休業をクリア
                      </Button>
                    )}
                  </Box>
                </FormField>
                <Box gridColumn="span 2">
                  <FieldLabel>リンク（公式サイト・SNS・予約）</FieldLabel>
                  <ShopLinksEditor
                    links={draft.links}
                    onChange={(links) => set("links", links)}
                  />
                  <FieldError error={errorOf("links")} />
                </Box>
              </Box>
            )}

            {tab === "mealRecord" && (
              <MealRecordEditor
                shopId={shop.id}
                onDirtyChange={setMealRecordDraftDirty}
                onBusyChange={setMealRecordBusy}
                onFormOpenChange={setMealRecordFormOpen}
                onShopGone={handleShopGone}
              />
            )}
          </Box>

          {/* Footer */}
          {!mealRecordFormOpen && (
            <Box
              display="flex"
              alignItems="center"
              gap="8px"
              px="22px"
              py="14px"
              borderTop="1px solid"
              borderTopColor="nm.lineFaint"
              bg="nm.bg"
            >
              {tab === "info" ? (
                <>
                  <Button
                    variant="plain"
                    px="14px"
                    py="9px"
                    h="auto"
                    minH="auto"
                    fontSize="13px"
                    fontWeight={600}
                    rounded="nmMd"
                    bg="transparent"
                    color="nm.shu"
                    border="1px solid"
                    borderColor="nm.shu"
                    _hover={{ bg: "nm.shu", color: "white" }}
                    // The server refuses (409) to delete a shop with meal records.
                    disabled={locked || hasMealRecords}
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    削除
                  </Button>
                  {hasMealRecords && (
                    <Box fontSize="11px" color="nm.inkMuted">
                      食べた記録がある店舗は削除できません
                    </Box>
                  )}
                  <Box flex="1" />
                  <Button
                    {...quietButtonProps}
                    disabled={locked}
                    onClick={onClose}
                  >
                    キャンセル
                  </Button>
                  <Button
                    variant="plain"
                    px="18px"
                    py="9px"
                    h="auto"
                    minH="auto"
                    fontSize="13px"
                    fontWeight={600}
                    rounded="nmMd"
                    bg="nm.ink"
                    color="nm.paper"
                    opacity={locked ? 0.6 : 1}
                    _hover={{ bg: "nm.inkSoft" }}
                    disabled={locked}
                    onClick={handleSave}
                  >
                    保存{" "}
                  </Button>
                </>
              ) : (
                <>
                  <Box flex="1" />
                  <Button
                    {...quietButtonProps}
                    disabled={locked}
                    onClick={requestClose}
                  >
                    閉じる
                  </Button>
                </>
              )}
            </Box>
          )}
        </>
      </ModalDialog>
      <ModalDialog
        open={confirmDiscardOpen}
        onOpenChange={(o) => !o && setConfirmDiscardOpen(false)}
        width="100%"
        maxWidth="420px"
        title="入力の破棄"
      >
        <Box fontSize="13px" color="nm.ink">
          保存していない入力があります。破棄しますか？
        </Box>
        <Box display="flex" justifyContent="flex-end" gap="8px" mt="20px">
          <Button
            {...quietButtonProps}
            onClick={() => {
              setConfirmDiscardOpen(false);
              if (!mealRecordDraftDirty) {
                setTab("info");
              }
            }}
          >
            入力に戻る
          </Button>
          <Button
            variant="plain"
            px="18px"
            py="9px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={600}
            rounded="nmMd"
            bg="nm.shu"
            color="white"
            _hover={{ opacity: 0.9 }}
            onClick={() => {
              setConfirmDiscardOpen(false);
              onClose();
            }}
          >
            破棄する
          </Button>
        </Box>
      </ModalDialog>
      <ModalDialog
        open={confirmDeleteOpen}
        onOpenChange={(o) => !deleting && setConfirmDeleteOpen(o)}
        width="100%"
        maxWidth="420px"
        title="店舗を削除"
      >
        <Box fontSize="13px" color="nm.ink">
          「{displayName}」を削除しますか？この操作は取り消せません。
        </Box>
        <Box display="flex" justifyContent="flex-end" gap="8px" mt="20px">
          <Button
            variant="plain"
            px="14px"
            py="9px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={500}
            rounded="nmMd"
            bg="nm.paper"
            color="nm.inkMuted"
            border="1px solid"
            borderColor="nm.line"
            _hover={{ borderColor: "nm.ink", color: "nm.ink" }}
            disabled={deleting}
            onClick={() => setConfirmDeleteOpen(false)}
          >
            キャンセル
          </Button>
          <LoadableButton
            variant="plain"
            px="18px"
            py="9px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={600}
            rounded="nmMd"
            bg="nm.shu"
            color="white"
            _hover={{ opacity: 0.9 }}
            onClick={handleDelete}
          >
            削除
          </LoadableButton>
        </Box>
      </ModalDialog>
    </>
  );
}
