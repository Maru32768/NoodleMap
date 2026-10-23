import { FieldError, FormField } from "@/components/form-field.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { useRevealFirstError } from "@/components/use-reveal-first-error.ts";
import {
  CATEGORY_OPTIONS,
  CategorySlug,
} from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import {
  Shop,
  UpdateShopCommand,
  useShops,
  useTags,
} from "@/features/shops/api/use-shops.ts";
import {
  clearShopFieldErrors,
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
import { VisitLogEditor } from "@/features/visits/visit-log-editor.tsx";
import { invalidRequestFieldErrors } from "@/utils/request.ts";
import {
  SHOP_ALREADY_DELETED_TITLE,
  SHOP_UPDATE_FAILED_TITLE,
  shopFieldErrorMessage,
  shopLinkProblemMessage,
  toastApiError,
  toastError,
  toastShopFieldErrors,
} from "@/utils/toast.ts";
import { Box, Input, NativeSelect } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

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

type Tab = "info" | "visit";

const TAB_LABELS: Record<Tab, string> = {
  info: "店舗情報",
  visit: "訪問ログ",
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
  "googlePlaceId",
  "category",
  "tagIds",
  "links",
  "wishLevel",
];

function isUpdateShopField(key: string): key is UpdateShopField {
  return (FIELDS_WITH_INPUT as readonly string[]).includes(key);
}

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
  const [draft, setDraft] = useState<ShopEditState>(() => ({
    id: shop.id,
    name: shop.name,
    nameKana: shop.nameKana,
    address: shop.address,
    postalCode: shop.postalCode,
    lat: shop.lat,
    lng: shop.lng,
    googlePlaceId: shop.googlePlaceId ?? "",
    category: shop.category,
    openedAt: shop.openedAt,
    closedAt: shop.closedAt,
    wishLevel: shop.wishLevel ?? "",
    tagIds: shop.tags.map((tag) => tag.id),
    // `links` is missing while an older server is still deployed.
    links: (shop.links ?? []).map(newLinkRow),
  }));
  const [fieldErrors, setFieldErrors] = useState<
    ShopFieldErrors<UpdateShopField>
  >({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Locks closing and saving while the DELETE is in flight.
  const [deleting, setDeleting] = useState(false);
  // What the 気になる度 select started from: unchanged means omit (keep).
  const [initialWishLevel] = useState<WishLevel | "">(shop.wishLevel ?? "");
  // The 訪問ログ tab stays mounted once opened so a visit draft survives tab
  // switches; closing or saving the shop with one unsaved asks first.
  const [visitTabOpened, setVisitTabOpened] = useState(initialTab === "visit");
  const [visitDraftDirty, setVisitDraftDirty] = useState(false);
  // A visit save or delete in flight locks closing like the shop save does.
  const [visitBusy, setVisitBusy] = useState(false);
  // Remounts the 訪問ログ tab to drop a discarded draft.
  const [visitEditorKey, setVisitEditorKey] = useState(0);
  const [discardAction, setDiscardAction] = useState<
    "close" | "save" | "delete" | null
  >(null);
  const { tags } = useTags();
  const { updateShop, deleteShop, mutate: mutateShops } = useShops();

  const { ref: formRef, reveal: revealFirstError } =
    useRevealFirstError<HTMLDivElement>();

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

  const setCategory = (category: ShopEditDraft["category"]) => {
    const fitsCategory = (tagId: string) => {
      const tag = tags?.find((candidate) => candidate.id === tagId);
      return !tag?.category || tag.category === category;
    };
    setDraft((current) => ({
      ...current,
      category,
      tagIds: current.tagIds.filter(fitsCategory),
    }));
    clearErrors(
      draft.tagIds.every(fitsCategory) ? ["category"] : ["category", "tagIds"],
    );
  };

  // Whether the field's input is on screen to show an error.
  const hasInput = (field: UpdateShopField) =>
    isUpdateShopField(field) && (field !== "tagIds" || !!tags);

  const handleSave = async () => {
    const problem = findShopLinkProblem(draft.links);
    if (problem) {
      setTab("info");
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
            setTab("info");
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

  const runAction = (action: "close" | "save" | "delete") => {
    switch (action) {
      case "close":
        onClose();
        return;
      case "save":
        void handleSave();
        return;
      case "delete":
        setConfirmDeleteOpen(true);
        return;
    }
  };

  // Asks before an action that would drop an unsaved visit draft.
  const guardVisitDraft = (action: "close" | "save" | "delete") => {
    if (visitDraftDirty) {
      setDiscardAction(action);
      return;
    }
    runAction(action);
  };

  const discardVisitDraft = () => {
    const action = discardAction;
    setDiscardAction(null);
    setVisitDraftDirty(false);
    setVisitEditorKey((key) => key + 1);
    if (action) {
      runAction(action);
    }
  };

  // Adding a visit found the shop deleted elsewhere.
  const handleShopGone = () => {
    toastError({ title: SHOP_ALREADY_DELETED_TITLE });
    void mutateShops();
    onDeleted(shop.id);
    onClose();
  };

  const locked = saving || deleting || visitBusy;

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t === "visit") {
      setVisitTabOpened(true);
    }
  };

  const displayName = shop.name || "(名称未設定)";
  const hasVisits = shop.visitCount > 0;

  return (
    <>
      <ModalDialog
        open={open}
        // Closing while a save or delete is in flight would drop its errors.
        onOpenChange={(o) => !o && !locked && guardVisitDraft("close")}
        width="100%"
        maxWidth="1040px"
        height="80vh"
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
        }}
      >
        <>
          {/* Tabs */}
          <Box
            display="flex"
            borderBottom="1px solid"
            borderBottomColor="nm.lineFaint"
            px="22px"
          >
            {(["info", "visit"] as Tab[]).map((t) => (
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
                onClick={() => selectTab(t)}
              >
                {TAB_LABELS[t]}
              </Button>
            ))}
          </Box>

          {/* Content */}
          <Box
            ref={formRef}
            px="22px"
            py="20px"
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
                  <Box display="flex" gap="6px" flexWrap="wrap">
                    {CATEGORY_OPTIONS.map((cat) => (
                      <Button
                        key={cat.id}
                        variant="plain"
                        px="10px"
                        py="5px"
                        h="auto"
                        minH="auto"
                        fontSize="12px"
                        fontWeight={draft.category === cat.id ? 600 : 400}
                        bg={draft.category === cat.id ? "nm.ink" : "nm.bg"}
                        color={
                          draft.category === cat.id ? "nm.paper" : "nm.inkMuted"
                        }
                        border="1px solid"
                        borderColor={
                          draft.category === cat.id ? "nm.ink" : "nm.line"
                        }
                        rounded="nmMd"
                        _hover={{ borderColor: "nm.ink" }}
                        onClick={() => setCategory(cat.id)}
                      >
                        {cat.label}
                      </Button>
                    ))}
                  </Box>
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
                <Box gridColumn="span 2">
                  <FieldLabel>リンク（公式サイト・SNS）</FieldLabel>
                  <ShopLinksEditor
                    links={draft.links}
                    onChange={(links) => set("links", links)}
                  />
                  <FieldError error={errorOf("links")} />
                </Box>
              </Box>
            )}

            {visitTabOpened && (
              <Box display={tab === "visit" ? "block" : "none"}>
                <VisitLogEditor
                  key={visitEditorKey}
                  shopId={shop.id}
                  onDirtyChange={setVisitDraftDirty}
                  onBusyChange={setVisitBusy}
                  onShopGone={handleShopGone}
                />
              </Box>
            )}
          </Box>

          {/* Footer */}
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
              // The server refuses (409) to delete a shop with visit logs.
              disabled={locked || hasVisits}
              onClick={() => guardVisitDraft("delete")}
            >
              削除
            </Button>
            {hasVisits && (
              <Box fontSize="11px" color="nm.inkMuted">
                訪問ログがある店舗は削除できません
              </Box>
            )}
            <Box flex="1" />
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
              disabled={locked}
              onClick={() => guardVisitDraft("close")}
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
              onClick={() => guardVisitDraft("save")}
            >
              保存{" "}
            </Button>
          </Box>
        </>
      </ModalDialog>
      <ModalDialog
        open={discardAction !== null}
        onOpenChange={(o) => !o && setDiscardAction(null)}
        width="100%"
        maxWidth="420px"
        title="訪問ログの入力"
      >
        <Box fontSize="13px" color="nm.ink">
          保存していない訪問ログがあります。破棄しますか？
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
            onClick={() => {
              setDiscardAction(null);
              selectTab("visit");
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
            onClick={discardVisitDraft}
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
