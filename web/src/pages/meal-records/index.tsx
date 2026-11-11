import { ModalDialog } from "@/components/modal-dialog.tsx";
import {
  SegmentedOption,
  SegmentedPicker,
} from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import {
  CATEGORY_OPTIONS,
  type CategorySlug,
} from "@/features/categories/categories.ts";
import {
  useAllMealRecords,
  useMealRecordMutations,
} from "@/features/meal-records/api/use-meal-records.ts";
import {
  MealRecordForm,
  type RecordScope,
} from "@/features/meal-records/meal-record-form.tsx";
import { MealRecordGrid } from "@/features/meal-records/meal-record-grid.tsx";
import { mealRecordInputProps } from "@/features/meal-records/meal-record-input-props.ts";
import { MealRecordsLoadState } from "@/features/meal-records/meal-record-list.tsx";
import { BackToMapLink } from "@/features/meal-records/record-navigation.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { useDocumentTitle } from "@/utils/document-title.ts";
import { useIsPc } from "@/utils/use-is-pc.ts";
import { Box, Input, NativeSelect } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuListFilter } from "react-icons/lu";
import { useLocation, useSearchParams } from "react-router";

type CategoryChoice = CategorySlug | "all";
type Order = "desc" | "asc";

const CATEGORY_CHOICES: readonly SegmentedOption<CategoryChoice>[] = [
  { id: "all", label: "すべて" },
  ...CATEGORY_OPTIONS,
];
const ORDER_CHOICES: readonly SegmentedOption<Order>[] = [
  { id: "desc", label: "新しい順" },
  { id: "asc", label: "古い順" },
];

const ALL: RecordScope = { kind: "all" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The admin adds a 食べた記録 with no shop or venue preset, e.g. at a 催事 that has no page yet. */
function AddMealRecordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addMealRecord, updateMealRecord } = useMealRecordMutations();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <ModalDialog
      open={open}
      // A backdrop click or Esc leaves an edited draft open; キャンセル discards it.
      onOpenChange={(open) => !open && !dirty && !busy && onClose()}
      width="100%"
      maxWidth="640px"
      title="食べた記録を追加"
      // Sticky elements stop at the padding: the form's action row is the footer.
      bodyProps={{ pb: 0 }}
    >
      {/* The dialog mounts its content fresh on each open and unmounts it after the close animation. */}
      <MealRecordForm
        scope={ALL}
        onDirtyChange={setDirty}
        onBusyChange={setBusy}
        onCancel={onClose}
        onSave={(input, savedId) =>
          savedId ? updateMealRecord(savedId, input) : addMealRecord(input)
        }
        onSaved={() => {
          onClose();
          toaster.success({ description: "食べた記録を保存しました" });
        }}
      />
    </ModalDialog>
  );
}

export default function MealRecordsPage() {
  useDocumentTitle("食べた記録");
  const { data, error, isValidating, mutate } = useAllMealRecords();
  const isAdmin = useCurrentUser().type === "admin";
  const [adding, setAdding] = useState(false);
  const { shops } = useShops();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  const isPc = useIsPc();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const rawCategory = params.get("category");
  const category: CategoryChoice =
    CATEGORY_OPTIONS.find((c) => c.id === rawCategory)?.id ?? "all";
  const order: Order = params.get("order") === "asc" ? "asc" : "desc";
  const venueId = params.get("venue") ?? "";
  const dateParam = (key: string) => {
    const value = params.get(key) ?? "";
    return ISO_DATE.test(value) ? value : "";
  };
  const from = dateParam("from");
  const to = dateParam("to");
  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      // Keeps the way back to the map (returnToSearch) across filter changes.
      { replace: true, state: location.state },
    );

  const categoryOf = useMemo(
    () => shops && new Map(shops.map((shop) => [shop.id, shop.category])),
    [shops],
  );
  // Only venues some record names, so no choice ends in an empty list.
  const venues = useMemo(() => {
    const byId = new Map(
      data?.flatMap((record) =>
        record.venue ? [[record.venue.id, record.venue.name] as const] : [],
      ),
    );
    return [...byId].sort(([, a], [, b]) => a.localeCompare(b, "ja"));
  }, [data]);
  const visible = useMemo(() => {
    if (!data) {
      return;
    }
    const filtered = data.filter(
      (record) =>
        // Until the shops load, the category is unknown and every record shows.
        (category === "all" ||
          !categoryOf ||
          // A collaboration shows under the category of any of its shops.
          record.shops.some((shop) => categoryOf.get(shop.id) === category)) &&
        (!venueId || record.venue?.id === venueId) &&
        // ISO dates compare as strings; an undated record matches no range.
        (!from || (!!record.eatenOn && record.eatenOn >= from)) &&
        (!to || (!!record.eatenOn && record.eatenOn <= to)),
    );
    // The server's newest-first order reversed: undated records, the oldest, come first.
    return order === "asc" ? filtered.toReversed() : filtered;
  }, [data, category, categoryOf, venueId, from, to, order]);

  // Phones keep the filters in a drawer so the album starts near the top.
  const activeFilterCount = [
    category !== "all",
    order === "asc",
    venueId,
    from,
    to,
  ].filter(Boolean).length;
  const filterControls = (
    <>
      <SegmentedPicker
        label="カテゴリ"
        variant="segment"
        options={CATEGORY_CHOICES}
        value={category}
        disabled={!categoryOf}
        onChange={(c) => setParam("category", c === "all" ? undefined : c)}
      />
      <SegmentedPicker
        label="並び順"
        variant="segment"
        options={ORDER_CHOICES}
        value={order}
        onChange={(o) => setParam("order", o === "asc" ? o : undefined)}
      />
      <NativeSelect.Root size="sm" width="auto" maxW="100%">
        <NativeSelect.Field
          aria-label="催事・出店先"
          bg="nm.paper"
          value={venueId}
          onChange={(e) => setParam("venue", e.target.value || undefined)}
        >
          <option value="">催事・出店先: すべて</option>
          {venues.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Box
        role="group"
        aria-label="食べた日"
        flex="1 1 auto"
        display="flex"
        alignItems="center"
        flexWrap="wrap"
        gap="6px"
        fontSize="12px"
        color="nm.inkMuted"
      >
        食べた日
        <Input
          {...mealRecordInputProps}
          type="date"
          aria-label="食べた日（から）"
          flex="1 1 0"
          minW="118px"
          maxW="150px"
          py="4px"
          fontFamily="mono"
          value={from}
          max={to || undefined}
          onChange={(e) => setParam("from", e.target.value || undefined)}
        />
        〜
        <Input
          {...mealRecordInputProps}
          type="date"
          aria-label="食べた日（まで）"
          flex="1 1 0"
          minW="118px"
          maxW="150px"
          py="4px"
          fontFamily="mono"
          value={to}
          min={from || undefined}
          onChange={(e) => setParam("to", e.target.value || undefined)}
        />
      </Box>
    </>
  );

  return (
    <Box ref={setScrollParent} h="100%" overflowY="auto" bg="nm.bg">
      <Box
        maxW="1280px"
        mx="auto"
        p={{ base: "20px", md: "40px" }}
        pb={{ base: "calc(20px + var(--nm-footer-h))", md: "40px" }}
      >
        <BackToMapLink />
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap="12px"
          mt="24px"
          mb="16px"
        >
          <Box display="flex" alignItems="baseline" gap="12px">
            <Box as="h1" fontSize="24px" fontWeight={700}>
              食べた記録
            </Box>
            {data && visible && (
              <Box
                role="status"
                fontFamily="mono"
                fontSize="13px"
                color="nm.inkMuted"
              >
                {visible.length === data.length
                  ? `${data.length}件`
                  : `${visible.length}件 / 全${data.length}件`}
              </Box>
            )}
          </Box>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              食べた記録を追加
            </Button>
          )}
        </Box>
        {isPc ? (
          <Box display="flex" gap="12px" flexWrap="wrap" mb="24px">
            {filterControls}
          </Box>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              mb="12px"
              onClick={() => setFiltersOpen(true)}
            >
              <LuListFilter aria-hidden="true" />
              絞り込み{activeFilterCount > 0 && `（${activeFilterCount}）`}
            </Button>
            <DrawerRoot
              open={filtersOpen}
              onOpenChange={(details) => setFiltersOpen(details.open)}
              placement="bottom"
            >
              <DrawerBackdrop />
              <DrawerContent borderTopRadius="nmLg">
                <DrawerHeader>
                  <DrawerTitle>絞り込み</DrawerTitle>
                </DrawerHeader>
                <DrawerCloseTrigger />
                <DrawerBody
                  display="flex"
                  flexDirection="column"
                  alignItems="flex-start"
                  gap="16px"
                  pb="calc(24px + env(safe-area-inset-bottom))"
                >
                  {filterControls}
                </DrawerBody>
              </DrawerContent>
            </DrawerRoot>
          </>
        )}
        <MealRecordsLoadState
          mealRecords={visible}
          error={error}
          isValidating={isValidating}
          onRetry={() => mutate()}
          emptyMessage={
            data?.length ? "条件に合う食べた記録がありません" : undefined
          }
        >
          {(records) => (
            <MealRecordGrid mealRecords={records} scrollParent={scrollParent} />
          )}
        </MealRecordsLoadState>
      </Box>
      {isAdmin && (
        <AddMealRecordDialog open={adding} onClose={() => setAdding(false)} />
      )}
    </Box>
  );
}
