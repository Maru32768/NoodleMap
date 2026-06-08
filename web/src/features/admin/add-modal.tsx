import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CATEGORY_OPTIONS } from "@/features/categories/categories.ts";
import {
  FindResult,
  GooglePlaceFinder,
} from "@/features/map/google-place-finder.tsx";
import {
  AddShopCommand,
  useTags,
} from "@/features/shops/api/use-shops.ts";
import { TagSelector } from "@/features/shops/tag-chips.tsx";
import { Box, Input } from "@chakra-ui/react";
import { useState } from "react";

export type AddDraft = AddShopCommand;

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: AddDraft) => Promise<void>;
  initialLatLng?: { lat: number; lng: number };
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

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <Box
      as="button"
      w="40px"
      h="22px"
      rounded="full"
      bg={on ? "nm.ink" : "nm.lineFaint"}
      border="2px solid"
      borderColor={on ? "nm.ink" : "nm.line"}
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

export function AddModal({
  open,
  onClose,
  onSave,
  initialLatLng,
}: AddModalProps) {
  const [placeResult, setPlaceResult] = useState<FindResult | null>(null);
  const [draft, setDraft] = useState<AddDraft>(() => ({
    name: "",
    address: "",
    postalCode: "",
    lat: initialLatLng?.lat ?? 0,
    lng: initialLatLng?.lng ?? 0,
    googlePlaceId: "",
    closed: false,
    category: "ramen",
    tagIds: [],
  }));
  const { tags } = useTags();
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof AddDraft>(k: K, v: AddDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setCategory = (category: AddDraft["category"]) => {
    setDraft((current) => ({
      ...current,
      category,
      tagIds: (current.tagIds ?? []).filter((tagId) => {
        const tag = tags?.find((candidate) => candidate.id === tagId);
        return !tag?.category || tag.category === category;
      }),
    }));
  };

  const handleSelect = (res: FindResult) => {
    setPlaceResult(res);
    setDraft((d) => ({
      ...d,
      name: res.name,
      address: res.address,
      postalCode: res.postalCode,
      lat: res.lat,
      lng: res.lng,
      googlePlaceId: res.placeId,
      closed: res.closed,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    draft.name.trim() !== "" && draft.lat !== 0 && draft.lng !== 0;

  return (
    <ModalDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="100%"
      maxWidth="1040px"
      title="新しい店舗を追加"
      subtitle="ADD NEW SHOP"
      icon={
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          width={18}
          height={18}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      }
      bodyProps={{ p: 0, overflow: "visible" }}
      contentProps={{
        animation: "adm-modal-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      <>
        {/* Body: split layout */}
        <Box
          display={{ base: "flex", md: "grid" }}
          flexDirection="column"
          gridTemplateColumns={{ md: "1fr 1fr" }}
          maxH="80vh"
        >
          {/* Form pane */}
          <Box
            overflowY="auto"
            px="22px"
            py="18px"
            borderRight={{ md: "1px solid" }}
            borderRightColor={{ md: "nm.lineFaint" }}
          >
            {/* Place banner */}
            {placeResult ? (
              <Box
                display="flex"
                alignItems="flex-start"
                gap="10px"
                p="12px"
                bg="rgba(107, 122, 60, 0.08)"
                border="1px solid"
                borderColor="nm.matcha"
                borderRadius="nmMd"
                mb="16px"
              >
                <Box
                  w="24px"
                  h="24px"
                  rounded="full"
                  bg="nm.matcha"
                  color="white"
                  display="grid"
                  placeItems="center"
                  flexShrink={0}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width={12}
                    height={12}
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </Box>
                <Box>
                  <Box fontSize="13px" fontWeight={600} color="nm.ink">
                    {placeResult.name}
                  </Box>
                  <Box fontSize="11px" color="nm.inkMuted" mt="2px">
                    {placeResult.address}
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box
                display="flex"
                alignItems="flex-start"
                gap="10px"
                p="12px"
                bg="nm.bg"
                border="1px solid"
                borderColor="nm.line"
                borderRadius="nmMd"
                mb="16px"
              >
                <Box
                  w="24px"
                  h="24px"
                  rounded="full"
                  bg="nm.inkFaint"
                  color="white"
                  display="grid"
                  placeItems="center"
                  flexShrink={0}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width={12}
                    height={12}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </Box>
                <Box>
                  <Box fontSize="13px" fontWeight={500} color="nm.inkMuted">
                    右のマップから場所を検索
                  </Box>
                  <Box fontSize="11px" color="nm.inkFaint" mt="2px">
                    Google Placeを選択すると自動入力されます{" "}
                  </Box>
                </Box>
              </Box>
            )}

            <Box display="grid" gridTemplateColumns="1fr 1fr" gap="14px">
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
                    selectedIds={draft.tagIds ?? []}
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
                  value={draft.lat || ""}
                  onChange={(v) => set("lat", parseFloat(v) || 0)}
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
                  value={draft.lng || ""}
                  onChange={(v) => set("lng", parseFloat(v) || 0)}
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
                    <Box fontSize="11px" color="nm.inkMuted" mt="2px">
                      ONにすると閉店として表示
                    </Box>
                  </Box>
                  <Toggle
                    on={draft.closed}
                    onClick={() => set("closed", !draft.closed)}
                  />
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Map pane */}
          <Box display="flex" flexDirection="column" minH="240px">
            <Box
              px="16px"
              py="10px"
              borderBottom="1px solid"
              borderBottomColor="nm.lineFaint"
              fontFamily="mono"
              fontSize="10px"
              letterSpacing="0.15em"
              color="nm.inkMuted"
              textTransform="uppercase"
            >
              Google Place 検索
            </Box>
            <Box flex="1" overflow="hidden">
              <GooglePlaceFinder onSelect={handleSelect} />
            </Box>
          </Box>
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
            bg="nm.shu"
            color="white"
            opacity={!canSave || saving ? 0.6 : 1}
            _hover={{ bg: "nm.shuDeep" }}
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            追加
          </Button>
        </Box>
      </>
    </ModalDialog>
  );
}
