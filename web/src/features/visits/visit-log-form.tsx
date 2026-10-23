import { FormField } from "@/components/form-field.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useRevealFirstError } from "@/components/use-reveal-first-error.ts";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import {
  clearShopFieldErrors,
  ShopFieldErrors,
  toShopFieldErrors,
} from "@/features/shops/shop-field-errors.ts";
import type {
  SaveVisitErrorBody,
  VisitLog,
  VisitLogField,
  VisitLogInput,
} from "@/features/visits/api/use-visits.ts";
import {
  MenuItemErrors,
  MenuItemRow,
  MenuItemsEditor,
  newMenuItemRow,
  toMenuItemInputs,
  validateMenuItems,
} from "@/features/visits/menu-items-editor.tsx";
import {
  ApiMutationResult,
  invalidRequestFieldErrors,
} from "@/utils/request.ts";
import {
  toastApiError,
  toastError,
  VISIT_INPUT_INVALID_DESCRIPTION,
  VISIT_SAVE_FAILED_TITLE,
  visitFieldErrorMessage,
} from "@/utils/toast.ts";
import { Box, Input, Textarea } from "@chakra-ui/react";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useRef, useState } from "react";

// Strings as typed, so a cleared number input stays blank instead of becoming 0.
interface VisitDraft {
  visitedOn: string;
  menuItems: MenuItemRow[];
  rate: string;
  eventName: string;
  publicNote: string;
  privateNote: string;
}

// Inputs whose browser-parsed value can read as "" while they hold something.
// (Each menu item's price input is one too; see `priceInputs` in the form.)
type ParsedField = "visitedOn" | "rate";
const PARSED_FIELDS: readonly ParsedField[] = ["visitedOn", "rate"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const VISIT_FIELDS: readonly VisitLogField[] = [
  "visitedOn",
  "menuItems",
  "rate",
  "eventName",
  "publicNote",
  "privateNote",
];

// Also false for a field added on the server after this client was built.
function isVisitField(field: string): field is VisitLogField {
  return (VISIT_FIELDS as readonly string[]).includes(field);
}

/** Today in Japan (YYYY-MM-DD), the default 訪問日 of a new visit. */
export function todayInJapan(now: Date = new Date()): string {
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    now,
  );
}

function toDraft(visit: VisitLog | undefined): VisitDraft {
  if (!visit) {
    return {
      visitedOn: todayInJapan(),
      menuItems: [newMenuItemRow()],
      rate: "",
      eventName: "",
      publicNote: "",
      privateNote: "",
    };
  }
  return {
    visitedOn: visit.visitedOn ?? "",
    // An empty row to type into when the visit has no menu yet.
    menuItems:
      visit.menuItems.length > 0
        ? visit.menuItems.map(newMenuItemRow)
        : [newMenuItemRow()],
    rate: visit.rate?.toString() ?? "",
    eventName: visit.eventName ?? "",
    publicNote: visit.publicNote ?? "",
    privateNote: visit.privateNote ?? "",
  };
}

/**
 * Errors the server would reject (or could not even parse), caught before
 * saving. `unparsable` holds the inputs the browser could not read (a partial
 * date, "1e"): their value is "", which must not be saved as 未設定.
 */
function validate(
  draft: VisitDraft,
  unparsable: ReadonlySet<ParsedField>,
): ShopFieldErrors<VisitLogField> {
  const errors: ShopFieldErrors<VisitLogField> = {};
  if (
    unparsable.has("visitedOn") ||
    (draft.visitedOn !== "" && !ISO_DATE.test(draft.visitedOn))
  ) {
    errors.visitedOn = "invalid_format";
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
function toInput(draft: VisitDraft): VisitLogInput {
  const text = (value: string) => value.trim() || undefined;
  const number = (value: string) =>
    value.trim() === "" ? undefined : Number(value);
  const menuItems = toMenuItemInputs(draft.menuItems);
  return {
    visitedOn: draft.visitedOn || undefined,
    menuItems: menuItems.length > 0 ? menuItems : undefined,
    rate: number(draft.rate),
    eventName: text(draft.eventName),
    publicNote: text(draft.publicNote),
    privateNote: text(draft.privateNote),
  };
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

const inputProps = {
  w: "100%",
  px: "12px",
  py: "8px",
  h: "auto",
  bg: "nm.paper",
  border: "1px solid",
  borderColor: "nm.line",
  borderRadius: "nmMd",
  fontSize: "13px",
  color: "nm.ink",
  _focus: { borderColor: "nm.shu", bg: "white", boxShadow: "none" },
  // Field.Root marks the input invalid; the borderColor above would hide it.
  _invalid: { borderColor: "border.error" },
} as const;

/**
 * Adds or edits one 訪問ログ. `onSave` resolves to the API result; field errors
 * appear under their inputs, anything else is toasted.
 */
export function VisitLogForm({
  visit,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  visit?: VisitLog;
  // Resolves to the API result, or null when the caller handled it.
  onSave: (
    input: VisitLogInput,
  ) => Promise<ApiMutationResult<VisitLog, SaveVisitErrorBody> | null>;
  onCancel: () => void;
  // Whether the draft differs from what the form started with.
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [initialDraft] = useState<VisitDraft>(() => toDraft(visit));
  const [draft, setDraft] = useState<VisitDraft>(initialDraft);
  const dirty = !isEqual(draft, initialDraft);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // A closed form has nothing left to lose.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [fieldErrors, setFieldErrors] = useState<
    ShopFieldErrors<VisitLogField>
  >({});
  const [menuItemErrors, setMenuItemErrors] = useState<
    Record<number, MenuItemErrors>
  >({});
  const { ref, reveal } = useRevealFirstError<HTMLDivElement>();
  const visitedOnRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  // Each menu item's price input by row id.
  const priceInputs = useRef(new Map<number, HTMLInputElement>());
  const priceRef = useCallback(
    (rowId: number, input: HTMLInputElement | null) => {
      if (input) {
        priceInputs.current.set(rowId, input);
      } else {
        priceInputs.current.delete(rowId);
      }
    },
    [],
  );

  const set = <K extends Exclude<keyof VisitDraft, "menuItems">>(
    k: K,
    v: VisitDraft[K],
  ) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setFieldErrors((errors) => clearShopFieldErrors(errors, [k]));
  };

  const setMenuItems = (
    menuItems: MenuItemRow[],
    edited?: { rowId: number; field: keyof MenuItemErrors },
  ) => {
    setDraft((d) => ({ ...d, menuItems }));
    setFieldErrors((errors) => clearShopFieldErrors(errors, ["menuItems"]));
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
  };

  const errorOf = (field: VisitLogField) => {
    const type = fieldErrors[field];
    return type && visitFieldErrorMessage(field, type);
  };

  const handleSave = async () => {
    const inputs = { visitedOn: visitedOnRef, rate: rateRef };
    const unparsable = new Set(
      PARSED_FIELDS.filter((k) => inputs[k].current?.validity.badInput),
    );
    const invalid = validate(draft, unparsable);
    const unparsablePrices = new Set(
      [...priceInputs.current]
        .filter(([, input]) => input.validity.badInput)
        .map(([rowId]) => rowId),
    );
    const invalidItems = validateMenuItems(draft.menuItems, unparsablePrices);
    setFieldErrors(invalid);
    setMenuItemErrors(invalidItems);
    if (
      Object.keys(invalid).length > 0 ||
      Object.keys(invalidItems).length > 0
    ) {
      reveal();
      return;
    }
    const result = await onSave(toInput(draft));
    if (!result || result.ok) {
      return;
    }
    const errors = invalidRequestFieldErrors(result.error.body);
    if (!errors) {
      toastApiError(result.error, { fallbackTitle: VISIT_SAVE_FAILED_TITLE });
      return;
    }
    const shown = errors.filter((e) => isVisitField(e.field));
    if (shown.length > 0) {
      setFieldErrors(toShopFieldErrors(shown));
      reveal();
    }
    if (shown.length < errors.length) {
      toastError({
        title: VISIT_SAVE_FAILED_TITLE,
        description: VISIT_INPUT_INVALID_DESCRIPTION,
      });
    }
  };

  const rate = draft.rate.trim() === "" ? undefined : Number(draft.rate);

  return (
    <Box
      ref={ref}
      role="group"
      aria-label={visit ? "訪問ログを編集" : "訪問を記録"}
      bg="nm.bg"
      borderRadius="nmMd"
      p="16px"
      display="grid"
      gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }}
      gap="14px"
    >
      <FormField
        label={<FieldLabel>訪問日（空欄で日付不明）</FieldLabel>}
        error={errorOf("visitedOn")}
      >
        <Input
          {...inputProps}
          type="date"
          fontFamily="mono"
          aria-label="訪問日"
          ref={visitedOnRef}
          value={draft.visitedOn}
          onChange={(e) => set("visitedOn", e.target.value)}
        />
      </FormField>
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
      <Box
        gridColumn={{ md: "span 2" }}
        role="group"
        aria-label="食べたメニュー"
      >
        <FieldLabel>食べたメニュー（価格は任意、円）</FieldLabel>
        <MenuItemsEditor
          rows={draft.menuItems}
          errors={menuItemErrors}
          listError={errorOf("menuItems")}
          onChange={setMenuItems}
          priceRef={priceRef}
        />
      </Box>
      <FormField
        label={<FieldLabel>催事・イベント名</FieldLabel>}
        error={errorOf("eventName")}
      >
        <Input
          {...inputProps}
          aria-label="催事・イベント名"
          maxLength={100}
          value={draft.eventName}
          onChange={(e) => set("eventName", e.target.value)}
        />
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
        {!visit && (
          <Box as="span" mr="auto" fontSize="11px" color="nm.inkMuted">
            画像は訪問を保存した後に追加できます
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
          訪問を保存
        </LoadableButton>
      </Box>
    </Box>
  );
}
