import {
  SegmentedOption,
  SegmentedPicker,
} from "@/components/segmented-picker.tsx";
import {
  CATEGORY_OPTIONS,
  type CategorySlug,
} from "@/features/categories/categories.ts";
import { useAllMealRecords } from "@/features/meal-records/api/use-meal-records.ts";
import { MealRecordGrid } from "@/features/meal-records/meal-record-grid.tsx";
import { MealRecordsLoadState } from "@/features/meal-records/meal-record-list.tsx";
import { BackToMapLink } from "@/features/meal-records/record-navigation.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { useDocumentTitle } from "@/utils/document-title.ts";
import { Box } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

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

export default function MealRecordsPage() {
  useDocumentTitle("食べた記録");
  const { data, error, isValidating, mutate } = useAllMealRecords();
  const { shops } = useShops();
  const [params, setParams] = useSearchParams();
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

  const rawCategory = params.get("category");
  const category: CategoryChoice =
    CATEGORY_OPTIONS.find((c) => c.id === rawCategory)?.id ?? "all";
  const order: Order = params.get("order") === "asc" ? "asc" : "desc";
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
      { replace: true },
    );

  const categoryOf = useMemo(
    () => shops && new Map(shops.map((shop) => [shop.id, shop.category])),
    [shops],
  );
  const visible = useMemo(() => {
    if (!data) {
      return;
    }
    // Until the shops load, the category is unknown and every record shows.
    const filtered =
      category === "all" || !categoryOf
        ? data
        : // A collaboration shows under the category of any of its shops.
          data.filter((record) =>
            record.shops.some((shop) => categoryOf.get(shop.id) === category),
          );
    // The server's newest-first order reversed: undated records, the oldest, come first.
    return order === "asc" ? filtered.toReversed() : filtered;
  }, [data, category, categoryOf, order]);

  return (
    <Box ref={setScrollParent} h="100%" overflowY="auto" bg="nm.bg">
      <Box maxW="1280px" mx="auto" p={{ base: "20px", md: "40px" }}>
        <BackToMapLink />
        <Box as="h1" fontSize="24px" fontWeight={700} mt="24px" mb="16px">
          食べた記録
        </Box>
        <Box display="flex" gap="12px" flexWrap="wrap" mb="24px">
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
        </Box>
        <MealRecordsLoadState
          mealRecords={visible}
          error={error}
          isValidating={isValidating}
          onRetry={() => mutate()}
        >
          {(records) => (
            <MealRecordGrid mealRecords={records} scrollParent={scrollParent} />
          )}
        </MealRecordsLoadState>
      </Box>
    </Box>
  );
}
