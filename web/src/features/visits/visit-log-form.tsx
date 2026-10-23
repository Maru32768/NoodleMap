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
  ApiMutationResult,
  invalidRequestFieldErrors,
} from "@/utils/request.ts";
import {
  toastApiError,
  toastError,
  VISIT_SAVE_FAILED_TITLE,
  visitFieldErrorMessage,
} from "@/utils/toast.ts";
import { Box, Input, Switch, Textarea } from "@chakra-ui/react";
import { useState } from "react";

// Strings as typed, so a cleared number input stays blank instead of becoming 0.
interface VisitDraft {
  visitedOn: string;
  menuName: string;
  isLimitedMenu: boolean;
  price: string;
  rate: string;
  eventName: string;
  publicNote: string;
  privateNote: string;
}

const VISIT_FIELDS: readonly VisitLogField[] = [
  "visitedOn",
  "menuName",
  "isLimitedMenu",
  "price",
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
      menuName: "",
      isLimitedMenu: false,
      price: "",
      rate: "",
      eventName: "",
      publicNote: "",
      privateNote: "",
    };
  }
  return {
    visitedOn: visit.visitedOn ?? "",
    menuName: visit.menuName ?? "",
    isLimitedMenu: visit.isLimitedMenu,
    price: visit.price?.toString() ?? "",
    rate: visit.rate?.toString() ?? "",
    eventName: visit.eventName ?? "",
    publicNote: visit.publicNote ?? "",
    privateNote: visit.privateNote ?? "",
  };
}

// Blank means not set; the server replaces every field, so blanks are omitted.
function toInput(draft: VisitDraft): VisitLogInput {
  const text = (value: string) => value.trim() || undefined;
  const number = (value: string) =>
    value.trim() === "" ? undefined : Number(value);
  return {
    visitedOn: draft.visitedOn || undefined,
    menuName: text(draft.menuName),
    isLimitedMenu: draft.isLimitedMenu,
    price: number(draft.price),
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
}: {
  visit?: VisitLog;
  onSave: (
    input: VisitLogInput,
  ) => Promise<ApiMutationResult<VisitLog, SaveVisitErrorBody>>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<VisitDraft>(() => toDraft(visit));
  const [fieldErrors, setFieldErrors] = useState<
    ShopFieldErrors<VisitLogField>
  >({});
  const { ref, reveal } = useRevealFirstError<HTMLDivElement>();

  const set = <K extends keyof VisitDraft>(k: K, v: VisitDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setFieldErrors((errors) => clearShopFieldErrors(errors, [k]));
  };

  const errorOf = (field: VisitLogField) => {
    const type = fieldErrors[field];
    return type && visitFieldErrorMessage(field, type);
  };

  const handleSave = async () => {
    setFieldErrors({});
    const result = await onSave(toInput(draft));
    if (result.ok) {
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
        description: "入力内容を確認してください",
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
          value={draft.visitedOn}
          onChange={(e) => set("visitedOn", e.target.value)}
        />
      </FormField>
      <FormField
        label={<FieldLabel>評価（0〜100、空欄で未評価）</FieldLabel>}
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
            aria-label="評価"
            placeholder="未評価"
            value={draft.rate}
            onChange={(e) => set("rate", e.target.value)}
          />
          {rate !== undefined && !Number.isNaN(rate) && (
            <MiniHearts rate={rate} />
          )}
        </Box>
      </FormField>
      <FormField
        label={<FieldLabel>食べたメニュー</FieldLabel>}
        error={errorOf("menuName")}
      >
        <Input
          {...inputProps}
          aria-label="食べたメニュー"
          maxLength={200}
          value={draft.menuName}
          onChange={(e) => set("menuName", e.target.value)}
        />
      </FormField>
      <FormField
        label={<FieldLabel>価格（円）</FieldLabel>}
        error={errorOf("price")}
      >
        <Input
          {...inputProps}
          type="number"
          min={0}
          step={1}
          fontFamily="mono"
          aria-label="価格"
          value={draft.price}
          onChange={(e) => set("price", e.target.value)}
        />
      </FormField>
      <FormField error={errorOf("isLimitedMenu")}>
        <Switch.Root
          checked={draft.isLimitedMenu}
          onCheckedChange={(e) => set("isLimitedMenu", e.checked)}
          size="sm"
        >
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label fontSize="13px">限定メニュー</Switch.Label>
        </Switch.Root>
      </FormField>
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
        justifyContent="flex-end"
        gap="8px"
      >
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
