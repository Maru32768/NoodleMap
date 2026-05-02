import { Button } from "@/components/ui/button.tsx";
import { CategoryType } from "@/features/search/utils.ts";
import { Box } from "@chakra-ui/react";

type VisitFilter = "all" | "visited" | "wish" | "closed";

interface AdminFiltersProps {
  categoryFilter: CategoryType;
  setCategoryFilter: (v: CategoryType) => void;
  visitFilter: VisitFilter;
  setVisitFilter: (v: VisitFilter) => void;
  filteredCount: number;
  totalCount: number;
  onClearAll: () => void;
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="plain"
      px="10px"
      py="5px"
      minH="auto"
      h="auto"
      fontSize="12px"
      fontWeight={active ? "600" : "500"}
      color={active ? "nm.ink" : "nm.inkMuted"}
      bg={active ? "nm.paper" : "transparent"}
      rounded="4px"
      transition="all 0.15s"
      whiteSpace="nowrap"
      fontFamily="body"
      boxShadow={active ? "nmSm" : undefined}
      _hover={{ bg: active ? "nm.paper" : "transparent" }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function AdminFilters({
  categoryFilter,
  setCategoryFilter,
  visitFilter,
  setVisitFilter,
  filteredCount,
  totalCount,
  onClearAll,
}: AdminFiltersProps) {
  const hasFilters = categoryFilter !== "all" || visitFilter !== "all";

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
        <Box
          as="span"
          display={{ base: "none", md: "inline" }}
          fontFamily="mono"
          fontSize="9.5px"
          letterSpacing="0.18em"
          color="nm.inkMuted"
          textTransform="uppercase"
          mr="2px"
        >
          カテゴリ
        </Box>
        <Box
          display="inline-flex"
          bg="nm.bg"
          border="1px solid"
          borderColor="nm.line"
          rounded="nmMd"
          p="2px"
          gap="1px"
        >
          <SegBtn
            active={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
          >
            すべて
          </SegBtn>
          <SegBtn
            active={categoryFilter === "ramen"}
            onClick={() => setCategoryFilter("ramen")}
          >
            ラーメン
          </SegBtn>
          <SegBtn
            active={categoryFilter === "udon"}
            onClick={() => setCategoryFilter("udon")}
          >
            うどん
          </SegBtn>
        </Box>

        <Box
          display={{ base: "none", md: "block" }}
          w="1px"
          h="20px"
          bg="nm.line"
          mx="2px"
        />

        <Box
          as="span"
          display={{ base: "none", md: "inline" }}
          fontFamily="mono"
          fontSize="9.5px"
          letterSpacing="0.18em"
          color="nm.inkMuted"
          textTransform="uppercase"
          mr="2px"
        >
          状態
        </Box>
        <Box
          display="inline-flex"
          bg="nm.bg"
          border="1px solid"
          borderColor="nm.line"
          rounded="nmMd"
          p="2px"
          gap="1px"
        >
          <SegBtn
            active={visitFilter === "all"}
            onClick={() => setVisitFilter("all")}
          >
            全て
          </SegBtn>
          <SegBtn
            active={visitFilter === "visited"}
            onClick={() => setVisitFilter("visited")}
          >
            訪問済
          </SegBtn>
          <SegBtn
            active={visitFilter === "wish"}
            onClick={() => setVisitFilter("wish")}
          >
            未訪問
          </SegBtn>
          <SegBtn
            active={visitFilter === "closed"}
            onClick={() => setVisitFilter("closed")}
          >
            閉店
          </SegBtn>
        </Box>

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
          {filteredCount}
        </Box>
        <Box as="span">件</Box>
        <Box as="span" fontFamily="mono" color="nm.inkFaint">
          / {totalCount}
        </Box>
        <Box as="span" flex="1" />
      </Box>
    </>
  );
}

export type { VisitFilter };
