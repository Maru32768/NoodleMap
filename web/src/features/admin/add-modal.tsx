import { FormField } from "@/components/form-field.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { useRevealFirstError } from "@/components/use-reveal-first-error.ts";
import { CATEGORY_OPTIONS } from "@/features/categories/categories.ts";
import {
  FindResult,
  GooglePlaceFinder,
} from "@/features/map/google-place-finder.tsx";
import {
  AddShopCommand,
  useShops,
  useTags,
} from "@/features/shops/api/use-shops.ts";
import {
  AddShopField,
  clearShopFieldErrors,
  SHOP_NAME_KANA_MAX_LENGTH,
  ShopFieldErrors,
  toShopFieldErrors,
} from "@/features/shops/shop-field-errors.ts";
import { TagSelector } from "@/features/shops/tag-chips.tsx";
import { invalidRequestFieldErrors } from "@/utils/request.ts";
import {
  SHOP_ADD_FAILED_TITLE,
  shopFieldErrorMessage,
  toastApiError,
  toastShopFieldErrors,
} from "@/utils/toast.ts";
import { Box, Input } from "@chakra-ui/react";
import { ComponentType, useState } from "react";

type AddDraft = AddShopCommand;

// Fields this form has an input for; an error on any other field is toasted.
const FIELDS_WITH_INPUT: readonly AddShopField[] = [
  "category",
  "tagIds",
  "name",
  "nameKana",
  "address",
  "postalCode",
  "googlePlaceId",
  "lat",
  "lng",
  "openedAt",
  "closedAt",
];

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  initialLatLng?: { lat: number; lng: number };
  // Replaceable because its WebGL map cannot render in jsdom tests.
  PlaceFinder?: ComponentType<{ onSelect: (res: FindResult) => void }>;
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
}: {
  value: string | number;
  onChange: (v: string) => void;
  mono?: boolean;
  type?: string;
  step?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Input
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

export function AddModal({
  open,
  onClose,
  initialLatLng,
  PlaceFinder = GooglePlaceFinder,
}: AddModalProps) {
  const [placeResult, setPlaceResult] = useState<FindResult | null>(null);
  const [draft, setDraft] = useState<AddDraft>(() => ({
    name: "",
    address: "",
    postalCode: "",
    lat: initialLatLng?.lat ?? 0,
    lng: initialLatLng?.lng ?? 0,
    googlePlaceId: "",
    openedAt: undefined,
    closedAt: undefined,
    category: "ramen",
    tagIds: [],
  }));
  const { tags } = useTags();
  const { addShop } = useShops();
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ShopFieldErrors<AddShopField>>(
    {},
  );

  const errorOf = (field: AddShopField) => {
    const type = fieldErrors[field];
    return type && shopFieldErrorMessage(field, type);
  };

  const { ref: formRef, reveal: revealFirstError } =
    useRevealFirstError<HTMLDivElement>();

  const clearErrors = (fields: readonly AddShopField[]) =>
    setFieldErrors((errors) => clearShopFieldErrors(errors, fields));

  // Editing a field clears its server-side error.
  const set = <K extends keyof AddDraft>(k: K, v: AddDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    clearErrors([k]);
  };

  const setCategory = (category: AddDraft["category"]) => {
    const fitsCategory = (tagId: string) => {
      const tag = tags?.find((candidate) => candidate.id === tagId);
      return !tag?.category || tag.category === category;
    };
    setDraft((d) => ({
      ...d,
      category,
      tagIds: (d.tagIds ?? []).filter(fitsCategory),
    }));
    clearErrors(
      (draft.tagIds ?? []).every(fitsCategory)
        ? ["category"]
        : ["category", "tagIds"],
    );
  };

  const handleSelect = (res: FindResult) => {
    setPlaceResult(res);
    // Decided from `res` alone: this can run after an await, when `draft` is stale.
    clearErrors([
      ...(res.name ? (["name", "nameKana"] as const) : []),
      "address",
      "postalCode",
      "lat",
      "lng",
      "googlePlaceId",
      "closedAt",
    ]);
    setDraft((d) => ({
      ...d,
      // Google may omit the name; keep what the admin typed (and its reading) rather than blanking it.
      name: res.name || d.name,
      nameKana: res.name ? undefined : d.nameKana,
      address: res.address,
      postalCode: res.postalCode,
      lat: res.lat,
      lng: res.lng,
      googlePlaceId: res.placeId,
      closedAt: undefined,
    }));
  };

  const hasInput = (field: AddShopField) =>
    FIELDS_WITH_INPUT.includes(field) && (field !== "tagIds" || !!tags);

  const handleSave = async () => {
    setFieldErrors({});
    setSaving(true);
    try {
      const result = await addShop(draft);
      if (!result.ok) {
        const errors = invalidRequestFieldErrors(result.error.body);
        if (!errors) {
          toastApiError(result.error, { fallbackTitle: SHOP_ADD_FAILED_TITLE });
          return;
        }
        const shown = errors.filter((e) => hasInput(e.field));
        if (shown.length > 0) {
          setFieldErrors(toShopFieldErrors(shown));
          revealFirstError();
        }
        toastShopFieldErrors(
          SHOP_ADD_FAILED_TITLE,
          errors.filter((e) => !hasInput(e.field)),
        );
        return;
      }

      onClose();
      toaster.success({ description: "店舗を追加しました" });
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    draft.name.trim() !== "" && draft.lat !== 0 && draft.lng !== 0;

  return (
    <ModalDialog
      open={open}
      // Closing while a save is in flight would drop its errors.
      onOpenChange={(o) => !o && !saving && onClose()}
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
            ref={formRef}
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
                    selectedIds={draft.tagIds ?? []}
                    category={draft.category}
                    onChange={(ids) => set("tagIds", ids)}
                  />
                </FormField>
              )}

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
                  value={draft.lat || ""}
                  onChange={(v) => set("lat", parseFloat(v) || 0)}
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
                  value={draft.lng || ""}
                  onChange={(v) => set("lng", parseFloat(v) || 0)}
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
              <PlaceFinder onSelect={handleSelect} />
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
            disabled={saving}
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
