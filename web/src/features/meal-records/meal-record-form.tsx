import { FormField } from "@/components/form-field.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { useRevealFirstError } from "@/components/use-reveal-first-error.ts";
import {
  MealRecord,
  MealRecordField,
  MealRecordInput,
  mealRecordInputOf,
  SaveMealRecordErrorBody,
} from "@/features/meal-records/api/use-meal-records.ts";
import { useVenues } from "@/features/meal-records/api/use-venues.ts";
import { japanDate } from "@/features/meal-records/eaten-date.ts";
import { mealRecordInputProps as inputProps } from "@/features/meal-records/meal-record-input-props.ts";
import {
  MenuItemErrors,
  MenuItemRow,
  MenuItemsEditor,
  newMenuItemRow,
  toMenuItemInputs,
  validateMenuItems,
} from "@/features/meal-records/menu-items-editor.tsx";
import { Shop, useShops } from "@/features/shops/api/use-shops.ts";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import {
  clearShopFieldErrors,
  ShopFieldErrors,
  toShopFieldErrors,
} from "@/features/shops/shop-field-errors.ts";
import {
  ApiMutationResult,
  invalidRequestFieldErrors,
} from "@/utils/request.ts";
import {
  MEAL_RECORD_INPUT_INVALID_DESCRIPTION,
  MEAL_RECORD_SAVE_FAILED_TITLE,
  mealRecordFieldErrorMessage,
  menuItemsServerErrorMessage,
  toastApiError,
  toastError,
} from "@/utils/toast.ts";
import { Box, Input, Textarea } from "@chakra-ui/react";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useRef, useState } from "react";
import Select from "react-select";

// Strings as typed, so a cleared number input stays blank instead of becoming 0.
interface MealRecordDraft {
  shopIds: string[];
  eatenOn: string;
  menuItems: MenuItemRow[];
  rate: string;
  // Shops whose own お気に入り度 takes this rate; undefined until ticked by hand (see defaultRateShopIds).
  rateShopIds?: string[];
  venueName: string;
  publicNote: string;
  privateNote: string;
}

// Inputs whose browser-parsed value can read as "" while they hold something.
// (Each menu item's price input is one too; see `priceInputs` in the form.)
type ParsedField = "eatenOn" | "rate";
const PARSED_FIELDS: readonly ParsedField[] = ["eatenOn", "rate"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MEAL_RECORD_FIELDS: readonly MealRecordField[] = [
  "shopIds",
  "eatenOn",
  "menuItems",
  "rate",
  "venueName",
  "publicNote",
  "privateNote",
];

// Also false for a field added on the server after this client was built.
function isMealRecordField(field: string): field is MealRecordField {
  return (MEAL_RECORD_FIELDS as readonly string[]).includes(field);
}

/**
 * Where the admin adds and edits 食べた記録: a shop's edit modal, a 催事・出店先's
 * page, whose new records start with that venue and no shop, or the page of
 * every record, whose new records start with neither.
 */
export type RecordScope =
  | { kind: "shop"; shopId: string }
  | { kind: "venue"; venueId: string; venueName: string }
  | { kind: "all" };

export const recordScopeId = (scope: RecordScope) =>
  scope.kind === "shop"
    ? scope.shopId
    : scope.kind === "venue"
      ? scope.venueId
      : "all";

function toDraft(
  mealRecord: MealRecord | undefined,
  scope: RecordScope,
): MealRecordDraft {
  if (!mealRecord) {
    return {
      shopIds: scope.kind === "shop" ? [scope.shopId] : [],
      // Today in Japan, the default 食べた日 of a new mealRecord.
      eatenOn: japanDate(new Date()),
      menuItems: [newMenuItemRow()],
      rate: "",
      venueName: scope.kind === "venue" ? scope.venueName : "",
      publicNote: "",
      privateNote: "",
    };
  }
  return draftOf(mealRecordInputOf(mealRecord));
}

function draftOf(input: MealRecordInput): MealRecordDraft {
  return {
    shopIds: input.shopIds,
    eatenOn: input.eatenOn ?? "",
    // An empty row to type into when the meal record has no menu yet.
    menuItems: input.menuItems?.length
      ? input.menuItems.map(newMenuItemRow)
      : [newMenuItemRow()],
    rate: input.rate?.toString() ?? "",
    venueName: input.venueName ?? "",
    publicNote: input.publicNote ?? "",
    privateNote: input.privateNote ?? "",
  };
}

/**
 * Errors the server would reject (or could not even parse), caught before
 * saving. `unparsable` holds the inputs the browser could not read (a partial
 * date, "1e"): their value is "", which must not be saved as 未設定.
 */
function validate(
  draft: MealRecordDraft,
  unparsable: ReadonlySet<ParsedField>,
): ShopFieldErrors<MealRecordField> {
  const errors: ShopFieldErrors<MealRecordField> = {};
  // A record without shops is reachable only from its venue.
  if (draft.shopIds.length === 0 && draft.venueName.trim() === "") {
    errors.venueName = "required";
  }
  if (
    unparsable.has("eatenOn") ||
    (draft.eatenOn !== "" && !ISO_DATE.test(draft.eatenOn))
  ) {
    errors.eatenOn = "invalid_format";
  }
  const rate = draft.rate.trim();
  if (unparsable.has("rate")) {
    errors.rate = "invalid_format";
  } else if (rate !== "") {
    const n = Number(rate);
    if (!Number.isFinite(n)) {
      errors.rate = "invalid_format";
    } else if (n < 0 || n > 100) {
      errors.rate = "out_of_range";
    }
  }
  return errors;
}

// Only a truly empty field means not set; the server replaces every field, so
// blanks are omitted. Run after `validate` found nothing.
function toInput(draft: MealRecordDraft): MealRecordInput {
  const text = (value: string) => value.trim() || undefined;
  const number = (value: string) =>
    value.trim() === "" ? undefined : Number(value);
  const menuItems = toMenuItemInputs(draft.menuItems);
  return {
    shopIds: draft.shopIds,
    eatenOn: draft.eatenOn || undefined,
    menuItems: menuItems.length > 0 ? menuItems : undefined,
    rate: number(draft.rate),
    venueName: text(draft.venueName),
    publicNote: text(draft.publicNote),
    privateNote: text(draft.privateNote),
  };
}

/**
 * Shops ticked to take the rate until the admin ticks by hand. A new record of one shop
 * without a 限定 item rates that shop; a collaboration or 限定 often differs from the shop's
 * usual bowl. An edited record keeps rating the shops whose お気に入り度 it set.
 */
export function defaultRateShopIds(
  draft: Pick<MealRecordDraft, "shopIds" | "menuItems">,
  mealRecord: Pick<MealRecord, "rate"> | undefined,
  shops: readonly Pick<Shop, "id" | "rate">[] | undefined,
): string[] {
  if (mealRecord) {
    return mealRecord.rate === undefined
      ? []
      : draft.shopIds.filter(
          (id) =>
            shops?.find((shop) => shop.id === id)?.rate === mealRecord.rate,
        );
  }
  const limited = draft.menuItems.some((row) => row.isLimited);
  return draft.shopIds.length === 1 && !limited ? draft.shopIds : [];
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="label"
      display="block"
      fontSize="11px"
      color="nm.inkMuted"
      mb="5px"
    >
      {children}
    </Box>
  );
}

/**
 * Adds or edits one 食べた記録. `onSave` resolves to the API result; field errors
 * appear under their inputs, anything else is toasted.
 */
export function MealRecordForm({
  scope,
  mealRecord,
  importDraft,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  scope: RecordScope;
  mealRecord?: MealRecord;
  /** A meal record the photo import will make: its day and first shop come from the photos, so neither is edited. */
  importDraft?: MealRecordInput;
  // Resolves to the API result, or null when the caller handled it.
  onSave: (
    input: MealRecordInput,
  ) => Promise<ApiMutationResult<MealRecord, SaveMealRecordErrorBody> | null>;
  onCancel: () => void;
  // Whether the draft differs from what the form started with.
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const {
    shops,
    error: shopsError,
    isValidating: shopsLoading,
    mutate: retryShops,
  } = useShops();
  const venues = useVenues();
  const [initialDraft] = useState<MealRecordDraft>(() =>
    importDraft ? draftOf(importDraft) : toDraft(mealRecord, scope),
  );
  const [draft, setDraft] = useState<MealRecordDraft>(initialDraft);
  // Compared as saved, so e.g. adding and removing a blank menu row is no change.
  const dirty = !isEqual(toInput(draft), toInput(initialDraft));
  const rateShopIds = (
    draft.rateShopIds ?? defaultRateShopIds(draft, mealRecord, shops)
  ).filter((id) => draft.shopIds.includes(id));
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // A closed form has nothing left to lose.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [fieldErrors, setFieldErrors] = useState<
    ShopFieldErrors<MealRecordField>
  >({});
  const [menuItemErrors, setMenuItemErrors] = useState<
    Record<number, MenuItemErrors>
  >({});
  // A server error on the menu items, shown under the list.
  const [menuItemsError, setMenuItemsError] = useState<string>();
  const { ref, reveal } = useRevealFirstError<HTMLDivElement>();
  const eatenOnRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  // The menu items' price inputs, each with its row id in `data-price-row`.
  const priceInputs = useRef(new Set<HTMLInputElement>());
  const priceRef = useCallback((input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }
    priceInputs.current.add(input);
    return () => {
      priceInputs.current.delete(input);
    };
  }, []);

  const set = <K extends Exclude<keyof MealRecordDraft, "menuItems">>(
    k: K,
    v: MealRecordDraft[K],
  ) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setFieldErrors((errors) => clearShopFieldErrors(errors, [k]));
  };

  const setMenuItems = useCallback(
    (
      menuItems: MenuItemRow[],
      edited?: { rowId: number; field: keyof MenuItemErrors },
    ) => {
      setDraft((d) => ({ ...d, menuItems }));
      setMenuItemsError(undefined);
      if (edited) {
        setMenuItemErrors((errors) => {
          if (!errors[edited.rowId]?.[edited.field]) {
            return errors;
          }
          return {
            ...errors,
            [edited.rowId]: {
              ...errors[edited.rowId],
              [edited.field]: undefined,
            },
          };
        });
      }
    },
    [],
  );

  const errorOf = (field: MealRecordField) => {
    const type = fieldErrors[field];
    return type && mealRecordFieldErrorMessage(field, type);
  };

  const handleSave = async () => {
    const inputs = { eatenOn: eatenOnRef, rate: rateRef };
    const unparsable = new Set(
      PARSED_FIELDS.filter((k) => inputs[k].current?.validity.badInput),
    );
    const invalid = validate(draft, unparsable);
    const unparsablePrices = new Set(
      [...priceInputs.current]
        .filter((input) => input.validity.badInput)
        .map((input) => Number(input.dataset.priceRow)),
    );
    const invalidItems = validateMenuItems(draft.menuItems, unparsablePrices);
    setFieldErrors(invalid);
    setMenuItemErrors(invalidItems);
    setMenuItemsError(undefined);
    if (
      Object.keys(invalid).length > 0 ||
      Object.keys(invalidItems).length > 0
    ) {
      reveal();
      return;
    }
    const input = toInput(draft);
    const result = await onSave(
      input.rate === undefined || rateShopIds.length === 0
        ? input
        : { ...input, rateShopIds },
    );
    if (!result || result.ok) {
      return;
    }
    const errors = invalidRequestFieldErrors(result.error.body);
    if (!errors) {
      toastApiError(result.error, {
        fallbackTitle: MEAL_RECORD_SAVE_FAILED_TITLE,
      });
      return;
    }
    const shown = errors.filter((e) => isMealRecordField(e.field));
    if (shown.length > 0) {
      setFieldErrors(
        toShopFieldErrors(shown.filter((e) => e.field !== "menuItems")),
      );
      const menuItemsErrors = shown.filter((e) => e.field === "menuItems");
      setMenuItemsError(
        menuItemsErrors.length > 0
          ? [...new Set(menuItemsErrors.map(menuItemsServerErrorMessage))].join(
              "、",
            )
          : undefined,
      );
      reveal();
    }
    if (shown.length < errors.length) {
      toastError({
        title: MEAL_RECORD_SAVE_FAILED_TITLE,
        description: MEAL_RECORD_INPUT_INVALID_DESCRIPTION,
      });
    }
  };

  const rate = draft.rate.trim() === "" ? undefined : Number(draft.rate);
  const options = [
    ...new Map(
      [...(mealRecord?.shops ?? []), ...(shops ?? [])].map((shop) => [
        shop.id,
        { value: shop.id, label: shop.name },
      ]),
    ).values(),
  ];

  return (
    <Box
      ref={ref}
      role="group"
      aria-label={
        importDraft
          ? "取り込む食べた記録の内容"
          : mealRecord
            ? "食べた記録を編集"
            : "食べた記録を追加"
      }
      bg="nm.bg"
      borderRadius="nmMd"
      p="16px"
      display="grid"
      gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }}
      gap="14px"
    >
      <Box gridColumn={{ md: "span 2" }}>
        <FormField
          label={
            <FieldLabel>
              {importDraft
                ? "提供した店舗（複数選択可、写真の店舗は外せません）"
                : "提供した店舗（複数選択可、催事・出店先があれば空欄可）"}
            </FieldLabel>
          }
          error={errorOf("shopIds")}
        >
          <Select
            aria-label="提供した店舗"
            isMulti
            isClearable={false}
            isLoading={!shops && shopsLoading}
            isDisabled={!shops}
            options={options}
            value={options.filter((option) =>
              draft.shopIds.includes(option.value),
            )}
            placeholder="店舗名で検索"
            noOptionsMessage={() => "該当する店舗がありません"}
            onChange={(selected) => {
              const ids = selected.map((option) => option.value);
              // The photos' shop keys the imported meal record, so it stays.
              if (!importDraft || ids.includes(importDraft.shopIds[0])) {
                set("shopIds", ids);
              }
            }}
          />
        </FormField>
        {!!shopsError && (
          <Box role="alert" fontSize="12px">
            店舗一覧を読み込めませんでした。選択済みの店舗は保持しています。
            <LoadableButton size="xs" onClick={() => retryShops()}>
              再試行
            </LoadableButton>
          </Box>
        )}
      </Box>
      {!importDraft && (
        <FormField
          label={<FieldLabel>食べた日（空欄で日付不明）</FieldLabel>}
          error={errorOf("eatenOn")}
        >
          <Input
            {...inputProps}
            type="date"
            fontFamily="mono"
            aria-label="食べた日"
            ref={eatenOnRef}
            value={draft.eatenOn}
            onChange={(e) => set("eatenOn", e.target.value)}
          />
        </FormField>
      )}
      <Box>
        <FormField
          label={<FieldLabel>お気に入り度（0〜100、空欄で未設定）</FieldLabel>}
          error={errorOf("rate")}
        >
          <Box display="flex" alignItems="center" gap="8px">
            <Input
              {...inputProps}
              type="number"
              min={0}
              max={100}
              step={1}
              fontFamily="mono"
              aria-label="お気に入り度"
              placeholder="未設定"
              ref={rateRef}
              value={draft.rate}
              onChange={(e) => set("rate", e.target.value)}
            />
            {rate !== undefined && !Number.isNaN(rate) && (
              <MiniHearts rate={rate} />
            )}
          </Box>
        </FormField>
        {/* Outside the FormField, whose field context would hand the rate input's id to these inputs. */}
        {rate !== undefined && (
          <Box
            role="group"
            aria-label="店舗のお気に入り度への反映"
            mt="6px"
            display="grid"
            gap="4px"
          >
            {draft.shopIds.map((id) => (
              <Checkbox
                key={id}
                size="sm"
                checked={rateShopIds.includes(id)}
                onCheckedChange={(e) =>
                  set(
                    "rateShopIds",
                    e.checked === true
                      ? [...rateShopIds, id]
                      : rateShopIds.filter((other) => other !== id),
                  )
                }
              >
                <Box as="span" fontSize="12px">
                  {draft.shopIds.length === 1
                    ? "店舗のお気に入り度にも反映"
                    : `${options.find((o) => o.value === id)?.label ?? "店舗"}のお気に入り度にも反映`}
                </Box>
              </Checkbox>
            ))}
          </Box>
        )}
      </Box>
      <Box
        gridColumn={{ md: "span 2" }}
        role="group"
        aria-label="食べたメニュー"
      >
        <FieldLabel>食べたメニュー（価格は任意、円）</FieldLabel>
        <MenuItemsEditor
          rows={draft.menuItems}
          errors={menuItemErrors}
          listError={menuItemsError}
          onChange={setMenuItems}
          priceRef={priceRef}
        />
      </Box>
      <FormField
        label={<FieldLabel>催事・出店先</FieldLabel>}
        error={errorOf("venueName")}
      >
        <Input
          {...inputProps}
          aria-label="催事・出店先"
          maxLength={100}
          list="mealRecord-venue-names"
          value={draft.venueName}
          onChange={(e) => set("venueName", e.target.value)}
        />
        <datalist id="mealRecord-venue-names">
          {venues.data?.map((venue) => (
            <option key={venue.id} value={venue.name} />
          ))}
        </datalist>
        {!!venues.error && (
          <Box role="alert" fontSize="12px">
            出店先の候補を読み込めませんでした。名前の入力と保存はできます。
            <LoadableButton size="xs" onClick={() => venues.mutate()}>
              再試行
            </LoadableButton>
          </Box>
        )}
      </FormField>
      <Box gridColumn={{ md: "span 2" }}>
        <FormField
          label={<FieldLabel>メモ（公開）</FieldLabel>}
          error={errorOf("publicNote")}
        >
          <Textarea
            {...inputProps}
            aria-label="メモ（公開）"
            rows={3}
            maxLength={2000}
            value={draft.publicNote}
            onChange={(e) => set("publicNote", e.target.value)}
          />
        </FormField>
      </Box>
      <Box gridColumn={{ md: "span 2" }}>
        <FormField
          label={<FieldLabel>メモ（自分用）</FieldLabel>}
          error={errorOf("privateNote")}
        >
          <Textarea
            {...inputProps}
            aria-label="メモ（自分用）"
            rows={3}
            maxLength={2000}
            value={draft.privateNote}
            onChange={(e) => set("privateNote", e.target.value)}
          />
        </FormField>
      </Box>
      <Box
        gridColumn={{ md: "span 2" }}
        display="flex"
        alignItems="center"
        justifyContent="flex-end"
        flexWrap="wrap"
        gap="8px"
      >
        {!mealRecord && !importDraft && (
          <Box as="span" mr="auto" fontSize="11px" color="nm.inkMuted">
            画像は食べた記録を保存した後に追加できます
          </Box>
        )}
        <Button
          variant="plain"
          px="14px"
          py="8px"
          h="auto"
          minH="auto"
          fontSize="13px"
          rounded="nmMd"
          bg="nm.paper"
          color="nm.inkMuted"
          border="1px solid"
          borderColor="nm.line"
          _hover={{ borderColor: "nm.ink", color: "nm.ink" }}
          onClick={onCancel}
        >
          キャンセル
        </Button>
        <LoadableButton
          disabled={!mealRecord && !importDraft && !shops}
          variant="plain"
          px="18px"
          py="8px"
          h="auto"
          minH="auto"
          fontSize="13px"
          fontWeight={600}
          rounded="nmMd"
          bg="nm.ink"
          color="nm.paper"
          _hover={{ bg: "nm.inkSoft" }}
          onClick={handleSave}
        >
          {importDraft ? "この内容にする" : "食べた記録を保存"}
        </LoadableButton>
      </Box>
    </Box>
  );
}
