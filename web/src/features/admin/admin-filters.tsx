import {
  SegmentedOption,
  SegmentedPicker,
  SegmentedToggles,
} from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { VisitFilter } from "@/features/admin/visit-filter.ts";
import { CategoryType, toggleWishLevel } from "@/features/search/utils.ts";
import {
  WISH_LEVEL_LABEL,
  WISH_LEVELS,
  WishLevel,
} from "@/features/shops/status.ts";
import { Box } from "@chakra-ui/react";

interface AdminFiltersProps {
  categoryFilter: CategoryType;
  setCategoryFilter: (v: CategoryType) => void;
  visitFilter: VisitFilter;
  setVisitFilter: (v: VisitFilter) => void;
  wishLevels: WishLevel[];
  setWishLevels: (v: WishLevel[]) => void;
  // undefined until the shop list has loaded.
  filteredCount: number | undefined;
  totalCount: number | undefined;
  onClearAll: () => void;
}

const CATEGORY_OPTIONS: readonly SegmentedOption<CategoryType>[] = [
  { id: "all", label: "すべて" },
  { id: "ramen", label: "ラーメン" },
  { id: "udon", label: "うどん" },
];

const VISIT_OPTIONS: readonly SegmentedOption<VisitFilter>[] = [
  { id: "all", label: "全て" },
  { id: "eaten", label: "食べた" },
  { id: "wish", label: "気になる" },
  { id: "closed", label: "閉店" },
];

const WISH_LEVEL_OPTIONS: readonly SegmentedOption<WishLevel>[] =
  WISH_LEVELS.map((level) => ({ id: level, label: WISH_LEVEL_LABEL[level] }));

// Visual only: each group carries its own accessible name, also on mobile
// where these labels are hidden.
function GroupLabel({
  children,
  ml,
  dimmed = false,
}: {
  children: React.ReactNode;
  ml?: string;
  dimmed?: boolean;
}) {
  return (
    <Box
      as="span"
      aria-hidden
      display={{ base: "none", md: "inline" }}
      fontFamily="mono"
      fontSize="9.5px"
      letterSpacing="0.18em"
      color="nm.inkMuted"
      textTransform="uppercase"
      ml={ml}
      mr="2px"
      opacity={dimmed ? 0.45 : undefined}
    >
      {children}
    </Box>
  );
}

export function AdminFilters({
  categoryFilter,
  setCategoryFilter,
  visitFilter,
  setVisitFilter,
  wishLevels,
  setWishLevels,
  filteredCount,
  totalCount,
  onClearAll,
}: AdminFiltersProps) {
  const hasFilters =
    categoryFilter !== "all" || visitFilter !== "all" || wishLevels.length > 0;

  return (
    <>
      <Box
        display="flex"
        flexWrap={{ base: "nowrap", md: "wrap" }}
        gap={{ base: "6px", md: "8px" }}
        alignItems="center"
        p={{ base: "8px 12px", md: "10px 18px" }}
        borderBottom="1px solid"
        borderBottomColor="nm.lineFaint"
        overflowX={{ base: "auto", md: "visible" }}
      >
        <GroupLabel>カテゴリ</GroupLabel>
        <SegmentedPicker
          label="カテゴリ"
          variant="segment"
          options={CATEGORY_OPTIONS}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />

        <Box
          display={{ base: "none", md: "block" }}
          w="1px"
          h="20px"
          bg="nm.line"
          mx="2px"
        />

        <GroupLabel>状態</GroupLabel>
        <SegmentedPicker
          label="状態"
          variant="segment"
          options={VISIT_OPTIONS}
          value={visitFilter}
          onChange={setVisitFilter}
        />

        <GroupLabel ml="6px" dimmed={visitFilter === "eaten"}>
          気になる度
        </GroupLabel>
        {/* Eaten shops are never narrowed by 気になる度, so 食べた leaves it nothing to do. */}
        <SegmentedToggles
          label="気になる度"
          options={WISH_LEVEL_OPTIONS}
          value={wishLevels}
          onToggle={(level) =>
            setWishLevels(toggleWishLevel(wishLevels, level))
          }
          disabled={visitFilter === "eaten"}
        />

        <Box flex="1" />
        {hasFilters && (
          <Button
            variant="plain"
            px="8px"
            py="4px"
            minH="auto"
            h="auto"
            fontSize="11px"
            fontFamily="mono"
            letterSpacing="0.08em"
            color="nm.inkMuted"
            textTransform="uppercase"
            _hover={{ color: "nm.shuDeep" }}
            onClick={onClearAll}
          >
            × クリア
          </Button>
        )}
      </Box>

      <Box
        display="flex"
        alignItems="center"
        gap="12px"
        p={{ base: "6px 12px", md: "6px 18px" }}
        bg="nm.bg"
        borderBottom="1px solid"
        borderBottomColor="nm.line"
        fontSize="12px"
        color="nm.inkMuted"
      >
        <Box
          as="span"
          fontFamily="display"
          fontSize="15px"
          fontWeight="700"
          color="nm.ink"
        >
          {filteredCount ?? "–"}
        </Box>
        <Box as="span">件</Box>
        <Box as="span" fontFamily="mono" color="nm.inkFaint">
          / {totalCount ?? "–"}
        </Box>
        <Box as="span" flex="1" />
      </Box>
    </>
  );
}
