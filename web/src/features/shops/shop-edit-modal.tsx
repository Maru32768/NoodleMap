import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { AdminImage, ImageUploader } from "@/features/admin/image-uploader.tsx";
import {
  CATEGORY_OPTIONS,
  CategorySlug,
} from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { Shop, useShops, useTags } from "@/features/shops/api/use-shops.ts";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import {
  SHOP_LINK_TYPE_LABEL,
  SHOP_LINK_TYPES,
  SHOP_LINKS_MAX,
  ShopLinkInput,
  ShopLinkType,
  withLinkUrl,
} from "@/features/shops/shop-links.ts";
import { TagSelector } from "@/features/shops/tag-chips.tsx";
import {
  SHOP_LINK_URL_MISSING,
  toastApiError,
  toastError,
} from "@/utils/toast.ts";
import { Box, Input, NativeSelect } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

export interface ShopEditDraft {
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
  eaten: boolean;
  rate: number;
  images: AdminImage[];
  tagIds: string[];
  links: ShopLinkInput[];
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
    />
  );
}

function Toggle({
  label,
  on,
  color = "ink",
  onClick,
}: {
  label: string;
  on: boolean;
  color?: "ink" | "shu";
  onClick: () => void;
}) {
  const activeBg = color === "shu" ? "nm.shu" : "nm.ink";
  return (
    <Box
      as="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      w="40px"
      h="22px"
      rounded="full"
      bg={on ? activeBg : "nm.lineFaint"}
      border="2px solid"
      borderColor={on ? activeBg : "nm.line"}
      position="relative"
      transition="all 0.2s"
      onClick={onClick}
      cursor="pointer"
      flexShrink={0}
    >
      <Box
        position="absolute"
        top="1px"
        left={on ? "19px" : "1px"}
        w="16px"
        h="16px"
        rounded="full"
        bg="white"
        transition="left 0.2s"
        boxShadow="0 1px 3px rgba(0,0,0,0.2)"
      />
    </Box>
  );
}

function FavPicker({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (rate: number) => void;
}) {
  return (
    <Box display="flex" alignItems="center" gap="8px">
      <MiniHearts rate={rate} />
      <Input
        type="number"
        min={0}
        max={100}
        step={1}
        value={rate}
        onChange={(e) => {
          // An empty or partial entry keeps the previous rate instead of becoming 0.
          const v = e.target.valueAsNumber;
          if (!Number.isNaN(v)) {
            onChange(Math.min(100, Math.max(0, v)));
          }
        }}
        width="72px"
        fontFamily="mono"
        fontSize="13px"
        textAlign="right"
      />
    </Box>
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
type ShopEditState = Omit<ShopEditDraft, "links"> & { links: ShopLinkRow[] };

let nextLinkRowId = 0;
const toLinkRow = (link: ShopLinkInput): ShopLinkRow => ({
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
              maxLength={2048}
              ariaLabel="URL"
            />
          </Box>
          <Box flex="1 1 140px">
            <FormInput
              value={link.label ?? ""}
              onChange={(v) => update(i, { ...link, label: v })}
              placeholder="表示名（任意）"
              maxLength={100}
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
            onChange([...links, toLinkRow({ type: "other", url: "" })])
          }
        >
          ＋ リンクを追加
        </Button>
      </Box>
    </Box>
  );
}

type Tab = "info" | "visit" | "images";

interface ShopEditModalProps {
  shop: Shop;
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onSave: (draft: ShopEditDraft) => Promise<void>;
  onDeleted: (id: string) => void;
}

export function ShopEditModal({
  shop,
  open,
  initialTab = "info",
  onClose,
  onSave,
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
    googlePlaceId: shop.googlePlaceId,
    category: shop.category,
    openedAt: shop.openedAt,
    closedAt: shop.closedAt,
    eaten: shop.eaten,
    rate: shop.rate ?? 0,
    images: [],
    tagIds: shop.tags.map((tag) => tag.id),
    // `links` is missing while an older server is still deployed.
    links: (shop.links ?? []).map(toLinkRow),
  }));
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Locks closing and saving while the DELETE is in flight.
  const [deleting, setDeleting] = useState(false);
  const { tags } = useTags();
  const { deleteShop } = useShops();

  const set = <K extends keyof ShopEditState>(k: K, v: ShopEditState[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setCategory = (category: ShopEditDraft["category"]) => {
    setDraft((current) => ({
      ...current,
      category,
      tagIds: current.tagIds.filter((tagId) => {
        const tag = tags?.find((candidate) => candidate.id === tagId);
        return !tag?.category || tag.category === category;
      }),
    }));
  };

  const handleSave = async () => {
    const isBlank = (value: string | undefined) => !value?.trim();
    if (draft.links.some((link) => isBlank(link.url) && !isBlank(link.label))) {
      setTab("info");
      toastError(SHOP_LINK_URL_MISSING);
      return;
    }
    // Rows left entirely empty are dropped instead of failing validation.
    const withLinks: ShopEditDraft = {
      ...draft,
      links: draft.links
        .filter((link) => !isBlank(link.url))
        .map(({ type, label, url }) => ({ type, label, url })),
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

    setSaving(true);
    try {
      await onSave(sanitizedDraft);
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

  const displayName = shop.name || "(名称未設定)";

  const TAB_LABELS: Record<Tab, string> = {
    info: "店舗情報",
    visit: "食べた記録",
    images: "画像",
  };

  return (
    <>
      <ModalDialog
        open={open}
        onOpenChange={(o) => !o && onClose()}
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
            {(["info", "visit", "images"] as Tab[]).map((t) => (
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
                {t === "images" && (
                  <>
                    <Box
                      as="span"
                      bg="nm.bg"
                      color="nm.inkMuted"
                      borderRadius="full"
                      px="8px"
                      py="1px"
                      minWidth={0}
                      minHeight={0}
                      fontSize="10px"
                      fontFamily="mono"
                    >
                      {draft.images.length}
                    </Box>
                    {draft.images.length === 0 && (
                      <Box
                        boxSize="6px"
                        rounded="full"
                        bg="nm.shu"
                        flexShrink={0}
                      />
                    )}
                  </>
                )}
              </Button>
            ))}
          </Box>

          {/* Content */}
          <Box px="22px" py="20px" flex="1" minH="0" overflowY="auto">
            {tab === "info" && (
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap="16px">
                <Box gridColumn="span 2">
                  <FieldLabel>カテゴリ</FieldLabel>
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
                </Box>
                {tags && (
                  <Box gridColumn="span 2">
                    <FieldLabel>タグ</FieldLabel>
                    <TagSelector
                      tags={tags}
                      selectedIds={draft.tagIds}
                      category={draft.category}
                      onChange={(ids) => set("tagIds", ids)}
                    />
                  </Box>
                )}
                <Box gridColumn="span 2">
                  <FieldLabel>
                    店名{" "}
                    <Box as="span" color="nm.shu">
                      *
                    </Box>
                  </FieldLabel>
                  <FormInput
                    value={draft.name}
                    onChange={(v) => set("name", v)}
                  />
                </Box>
                <Box gridColumn="span 2">
                  <FieldLabel>読み（ひらがな）</FieldLabel>
                  <FormInput
                    value={draft.nameKana ?? ""}
                    onChange={(v) => set("nameKana", v)}
                    maxLength={100}
                  />
                </Box>
                <Box gridColumn="span 2">
                  <FieldLabel>住所</FieldLabel>
                  <FormInput
                    value={draft.address}
                    onChange={(v) => set("address", v)}
                  />
                </Box>
                <Box>
                  <FieldLabel>郵便番号</FieldLabel>
                  <FormInput
                    value={draft.postalCode}
                    onChange={(v) => set("postalCode", v)}
                    mono
                    placeholder="000-0000"
                  />
                </Box>
                <Box>
                  <FieldLabel>Google Place ID</FieldLabel>
                  <FormInput
                    value={draft.googlePlaceId}
                    onChange={(v) => set("googlePlaceId", v)}
                    mono
                    placeholder="ChIJ..."
                  />
                </Box>
                <Box>
                  <FieldLabel>
                    緯度{" "}
                    <Box as="span" color="nm.shu">
                      *
                    </Box>
                  </FieldLabel>
                  <FormInput
                    value={draft.lat}
                    onChange={(v) => set("lat", parseFloat(v))}
                    mono
                    type="number"
                    step={0.000001}
                  />
                </Box>
                <Box>
                  <FieldLabel>
                    経度{" "}
                    <Box as="span" color="nm.shu">
                      *
                    </Box>
                  </FieldLabel>
                  <FormInput
                    value={draft.lng}
                    onChange={(v) => set("lng", parseFloat(v))}
                    mono
                    type="number"
                    step={0.000001}
                  />
                </Box>
                <Box>
                  <FieldLabel>開店日</FieldLabel>
                  <FormInput
                    value={draft.openedAt ?? ""}
                    onChange={(v) => set("openedAt", v || undefined)}
                    mono
                    type="date"
                  />
                </Box>
                <Box>
                  <FieldLabel>閉店日</FieldLabel>
                  <FormInput
                    value={draft.closedAt ?? ""}
                    onChange={(v) => set("closedAt", v || undefined)}
                    mono
                    type="date"
                  />
                </Box>
                <Box gridColumn="span 2">
                  <FieldLabel>リンク（公式サイト・SNS）</FieldLabel>
                  <ShopLinksEditor
                    links={draft.links}
                    onChange={(links) => set("links", links)}
                  />
                </Box>
              </Box>
            )}

            {tab === "visit" && (
              <Box>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  py="12px"
                >
                  <Box>
                    <Box fontSize="13px" fontWeight={500} color="nm.ink">
                      食べた
                    </Box>
                  </Box>
                  <Toggle
                    label="食べた"
                    on={draft.eaten}
                    color="shu"
                    onClick={() => set("eaten", !draft.eaten)}
                  />
                </Box>

                {draft.eaten && (
                  <Box
                    bg="nm.bg"
                    borderRadius="nmMd"
                    p="16px"
                    mt="12px"
                    display="flex"
                    flexDirection="column"
                    gap="14px"
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Box>
                        <Box
                          fontSize="12px"
                          fontFamily="mono"
                          letterSpacing="0.1em"
                          color="nm.inkMuted"
                          textTransform="uppercase"
                        >
                          評価
                        </Box>
                        <Box fontSize="11px" color="nm.inkMuted" mt="2px">
                          80以上でお気に入り
                        </Box>
                      </Box>
                      <FavPicker
                        rate={draft.rate}
                        onChange={(v) => set("rate", v)}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {tab === "images" && (
              <ImageUploader
                images={draft.images}
                onChange={(imgs) => set("images", imgs)}
              />
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
              disabled={saving || deleting}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              削除
            </Button>
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
              opacity={saving || deleting ? 0.6 : 1}
              _hover={{ bg: "nm.inkSoft" }}
              disabled={saving || deleting}
              onClick={handleSave}
            >
              保存{" "}
            </Button>
          </Box>
        </>
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
