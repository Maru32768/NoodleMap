import { FieldError, FormField } from "@/components/form-field.tsx";
import { Button } from "@/components/ui/button.tsx";
import type {
  MenuItem,
  MenuItemInput,
} from "@/features/meal-records/api/use-meal-records.ts";
import { mealRecordInputProps } from "@/features/meal-records/meal-record-input-props.ts";
import { formatPrice } from "@/features/meal-records/meal-record-list.tsx";
import type { FieldErrorType } from "@/features/shops/shop-field-errors.ts";
import {
  MENU_ITEM_NAME_MAX_LENGTH,
  MENU_ITEM_PRICE_MAX,
  MENU_ITEMS_MAX,
  menuItemFieldErrorMessage,
} from "@/utils/toast.ts";
import { Box, Input, Switch } from "@chakra-ui/react";
import { RefCallback, useEffect, useRef } from "react";

/** One 食べたメニュー as typed; the price stays a string so a cleared input stays blank. */
export interface MenuItemRow {
  // Stable across reordering, for React keys and per-row errors.
  rowId: number;
  name: string;
  isLimited: boolean;
  price: string;
}

export type MenuItemErrors = Partial<Record<"name" | "price", FieldErrorType>>;

let nextRowId = 0;
export const newMenuItemRow = (item?: MenuItem): MenuItemRow => ({
  rowId: nextRowId++,
  name: item?.name ?? "",
  isLimited: item?.isLimited ?? false,
  price: item?.price?.toString() ?? "",
});

// 限定 alone is content too: it needs a name like a price does.
const isBlankRow = (row: MenuItemRow, priceUnparsable: boolean) =>
  row.name.trim() === "" &&
  row.price.trim() === "" &&
  !row.isLimited &&
  !priceUnparsable;

function priceError(
  price: string,
  unparsable: boolean,
): FieldErrorType | undefined {
  if (unparsable) {
    return "invalid_format";
  }
  if (price.trim() === "") {
    return undefined;
  }
  const n = Number(price);
  if (!Number.isInteger(n)) {
    return "invalid_format";
  }
  return n < 0 || n > MENU_ITEM_PRICE_MAX ? "out_of_range" : undefined;
}

/**
 * Errors per row id. A row without name, price and 限定 is dropped on save;
 * a price or 限定 without a name is not. `unparsable` holds the rows whose price input
 * the browser could not read.
 */
export function validateMenuItems(
  rows: readonly MenuItemRow[],
  unparsable: ReadonlySet<number>,
): Record<number, MenuItemErrors> {
  const errors: Record<number, MenuItemErrors> = {};
  for (const row of rows) {
    const bad = unparsable.has(row.rowId);
    if (isBlankRow(row, bad)) {
      continue;
    }
    const rowErrors: MenuItemErrors = {};
    if (row.name.trim() === "") {
      rowErrors.name = "required";
    }
    const price = priceError(row.price, bad);
    if (price) {
      rowErrors.price = price;
    }
    if (rowErrors.name || rowErrors.price) {
      errors[row.rowId] = rowErrors;
    }
  }
  return errors;
}

/** The rows to save, blank ones dropped. Run after `validateMenuItems` found nothing. */
export function toMenuItemInputs(
  rows: readonly MenuItemRow[],
): MenuItemInput[] {
  return rows
    .filter((row) => !isBlankRow(row, false))
    .map((row) => ({
      name: row.name.trim(),
      isLimited: row.isLimited,
      price: row.price.trim() === "" ? undefined : Number(row.price),
    }));
}

/** The mealRecord's price as typed so far: the sum of the valid prices, or undefined without any. */
export function menuItemsTotal(
  rows: readonly MenuItemRow[],
): number | undefined {
  const prices = rows
    .filter((row) => !priceError(row.price, false) && row.price.trim() !== "")
    .map((row) => Number(row.price));
  return prices.length > 0 ? prices.reduce((a, b) => a + b, 0) : undefined;
}

const rowButtonProps = {
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

type MoveDirection = "up" | "down";

/**
 * Edits a meal record's 食べたメニュー: rows of name, 限定 and price that can be
 * added (up to 10), removed and reordered, with their total below.
 */
export function MenuItemsEditor({
  rows,
  errors,
  listError,
  onChange,
  priceRef,
}: {
  rows: readonly MenuItemRow[];
  errors: Readonly<Record<number, MenuItemErrors>>;
  // A server error on the list as a whole.
  listError?: string;
  // `field` is the part of the row that changed, so its error can be cleared.
  onChange: (
    rows: MenuItemRow[],
    edited?: { rowId: number; field: keyof MenuItemErrors },
  ) => void;
  // Registers each price input (its row id in `data-price-row`), to read
  // whether the browser could parse it.
  priceRef: RefCallback<HTMLInputElement>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ rowId: number; dir: MoveDirection } | null>(
    null,
  );
  // Keep focus on the moved row; at the top/bottom its pressed arrow is
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

  const update = (i: number, row: MenuItemRow, field?: keyof MenuItemErrors) =>
    onChange(
      rows.map((r, j) => (j === i ? row : r)),
      field && { rowId: row.rowId, field },
    );
  const move = (i: number, dir: MoveDirection) => {
    const to = dir === "up" ? i - 1 : i + 1;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    pendingFocus.current = { rowId: rows[i].rowId, dir };
    onChange(next);
  };
  const total = menuItemsTotal(rows);

  return (
    <Box ref={listRef} display="flex" flexDirection="column" gap="8px">
      {rows.map((row, i) => {
        const rowErrors = errors[row.rowId] ?? {};
        return (
          <Box
            key={row.rowId}
            data-row-id={row.rowId}
            role="group"
            aria-label={`メニュー ${i + 1}`}
            display="flex"
            flexWrap="wrap"
            gap="6px"
            alignItems="flex-start"
          >
            <Box flex="2 1 180px">
              <FormField
                error={
                  rowErrors.name &&
                  menuItemFieldErrorMessage("name", rowErrors.name)
                }
              >
                <Input
                  {...mealRecordInputProps}
                  aria-label="メニュー名"
                  placeholder="メニュー名"
                  maxLength={MENU_ITEM_NAME_MAX_LENGTH}
                  value={row.name}
                  onChange={(e) =>
                    update(i, { ...row, name: e.target.value }, "name")
                  }
                />
              </FormField>
            </Box>
            <Box flex="1 1 110px">
              <FormField
                error={
                  rowErrors.price &&
                  menuItemFieldErrorMessage("price", rowErrors.price)
                }
              >
                <Input
                  {...mealRecordInputProps}
                  type="number"
                  min={0}
                  step={1}
                  fontFamily="mono"
                  aria-label="価格"
                  placeholder="価格（円）"
                  data-price-row={row.rowId}
                  ref={priceRef}
                  value={row.price}
                  onChange={(e) =>
                    update(i, { ...row, price: e.target.value }, "price")
                  }
                />
              </FormField>
            </Box>
            <Switch.Root
              alignSelf="center"
              checked={row.isLimited}
              onCheckedChange={(e) =>
                update(i, { ...row, isLimited: e.checked })
              }
              size="sm"
            >
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label fontSize="13px">限定</Switch.Label>
            </Switch.Root>
            <Box display="flex" gap="4px" alignSelf="center">
              <Button
                {...rowButtonProps}
                aria-label="上へ"
                data-move="up"
                disabled={i === 0}
                onClick={() => move(i, "up")}
              >
                ↑
              </Button>
              <Button
                {...rowButtonProps}
                aria-label="下へ"
                data-move="down"
                disabled={i === rows.length - 1}
                onClick={() => move(i, "down")}
              >
                ↓
              </Button>
              <Button
                {...rowButtonProps}
                aria-label="メニューを削除"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                削除
              </Button>
            </Box>
          </Box>
        );
      })}
      <FieldError error={listError} />
      <Box display="flex" alignItems="center" gap="8px">
        <Button
          {...rowButtonProps}
          disabled={rows.length >= MENU_ITEMS_MAX}
          onClick={() => onChange([...rows, newMenuItemRow()])}
        >
          ＋ メニューを追加
        </Button>
        {total !== undefined && (
          <Box ml="auto" fontSize="13px" color="nm.ink">
            合計{" "}
            <Box as="span" fontFamily="mono">
              {formatPrice(total)}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
