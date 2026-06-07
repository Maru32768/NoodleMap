import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { AdminImage, ImageUploader } from "@/features/admin/image-uploader.tsx";
import {
  CATEGORY_OPTIONS,
  CategorySlug,
} from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { MiniHearts } from "@/features/restaurants/rating-hearts.tsx";
import { Box, Input } from "@chakra-ui/react";
import { useState } from "react";

export interface RestaurantEditDraft {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  googlePlaceId: string;
  category: CategorySlug;
  closed: boolean;
  visited: boolean;
  favorite: boolean;
  rate: number;
  images: AdminImage[];
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
}: {
  value: string | number;
  onChange: (v: string) => void;
  mono?: boolean;
  type?: string;
  step?: number;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      step={step}
      placeholder={placeholder}
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
  on,
  color = "ink",
  onClick,
}: {
  on: boolean;
  color?: "ink" | "shu";
  onClick: () => void;
}) {
  const activeBg = color === "shu" ? "nm.shu" : "nm.ink";
  return (
    <Box
      as="button"
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
        onChange={(e) => onChange(Number(e.target.value))}
        width="72px"
        fontFamily="mono"
        fontSize="13px"
        textAlign="right"
      />
    </Box>
  );
}

type Tab = "info" | "visit" | "images";

interface RestaurantEditModalProps {
  shop: Restaurant;
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onSave: (draft: RestaurantEditDraft) => Promise<void>;
  onDelete?: (id: string) => void;
}

export function RestaurantEditModal({
  shop,
  open,
  initialTab = "info",
  onClose,
  onSave,
  onDelete,
}: RestaurantEditModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<RestaurantEditDraft>(() => ({
    id: shop.id,
    name: shop.name,
    address: shop.address,
    postalCode: shop.postalCode,
    lat: shop.lat,
    lng: shop.lng,
    googlePlaceId: shop.googlePlaceId,
    category: shop.category,
    closed: shop.closed,
    visited: shop.visited,
    favorite: shop.favorite ?? false,
    rate: shop.rate ?? 0,
    images: [],
  }));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof RestaurantEditDraft>(
    k: K,
    v: RestaurantEditDraft[K],
  ) => setDraft((d) => ({ ...d, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const TAB_LABELS: Record<Tab, string> = {
    info: "店舗情報",
    visit: "食べた記録",
    images: "画像",
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="100%"
      maxWidth="1040px"
      height="80vh"
      title={shop.name || "(名称未設定)"}
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
                      onClick={() => set("category", cat.id)}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </Box>
              </Box>
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
              <Box gridColumn="span 2">
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  py="12px"
                >
                  <Box>
                    <Box fontSize="13px" fontWeight={500} color="nm.ink">
                      閉店フラグ
                    </Box>
                  </Box>
                  <Toggle
                    on={draft.closed}
                    onClick={() => set("closed", !draft.closed)}
                  />
                </Box>
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
                  on={draft.visited}
                  color="shu"
                  onClick={() => set("visited", !draft.visited)}
                />
              </Box>

              {draft.visited && (
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
                    <Box
                      fontSize="12px"
                      fontFamily="mono"
                      letterSpacing="0.1em"
                      color="nm.inkMuted"
                      textTransform="uppercase"
                    >
                      お気に入り度
                    </Box>
                    <FavPicker
                      rate={draft.rate}
                      onChange={(v) => set("rate", v)}
                    />
                  </Box>
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Box
                      fontSize="12px"
                      fontFamily="mono"
                      letterSpacing="0.1em"
                      color="nm.inkMuted"
                      textTransform="uppercase"
                    >
                      お気に入り登録
                    </Box>
                    <Toggle
                      on={draft.favorite}
                      color="shu"
                      onClick={() => set("favorite", !draft.favorite)}
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
          {onDelete && (
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
              onClick={() => {
                if (confirm("この店舗を削除します。よろしいですか?")) {
                  onDelete(shop.id);
                }
              }}
            >
              削除
            </Button>
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
            opacity={saving ? 0.6 : 1}
            _hover={{ bg: "nm.inkSoft" }}
            disabled={saving}
            onClick={handleSave}
          >
            保存{" "}
          </Button>
        </Box>
      </>
    </ModalDialog>
  );
}
