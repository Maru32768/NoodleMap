import { ShopThumb } from "@/components/shop-thumb.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Shop } from "@/features/shops/api/use-shops.ts";
import {
  HeartIcon,
  MiniHearts,
} from "@/features/shops/rating-hearts.tsx";
import { favToHearts, SearchFilters } from "@/features/search/utils.ts";
import { Box, Input } from "@chakra-ui/react";
import { useState } from "react";
import { Virtuoso } from "react-virtuoso";

function StatusPill({ shop }: { shop: Shop }) {
  const props = shop.closed
    ? { bg: "nm.ink", color: "nm.paper", label: "閉店", border: undefined }
    : shop.visited
      ? { bg: "nm.matcha", color: "white", label: "食べた", border: undefined }
      : {
          bg: "nm.bgSoft",
          color: "nm.inkMuted",
          label: "気になる",
          border: "1px solid",
        };

  return (
    <Box
      position="absolute"
      top="0.75rem"
      right="0.625rem"
      fontFamily="mono"
      fontSize="0.5625rem"
      letterSpacing="0.1em"
      px="0.375rem"
      py="0.125rem"
      borderRadius="3px"
      textTransform="uppercase"
      bg={props.bg}
      color={props.color}
      border={props.border}
      borderColor={props.border ? "nm.line" : undefined}
    >
      {props.label}
    </Box>
  );
}

function ShopCard({
  shop,
  active,
  onClick,
}: {
  shop: Shop;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      display="flex"
      gap="0.75rem"
      px="0.625rem"
      py="0.75rem"
      borderRadius="nmMd"
      cursor="pointer"
      transition="background 0.15s"
      position="relative"
      borderBottom="1px solid"
      borderBottomColor="nm.lineFaint"
      bg={active ? "nm.bg" : "transparent"}
      boxShadow={
        active ? "inset 3px 0 0 var(--chakra-colors-nm-shu)" : undefined
      }
      opacity={shop.closed ? 0.55 : 1}
      _hover={{ bg: "nm.bg" }}
      onClick={onClick}
    >
      <ShopThumb
        catType={shop.category}
        closed={shop.closed}
        size="md"
      />

      <Box flex="1" minWidth="0">
        <Box
          fontSize="0.84375rem"
          fontWeight={600}
          color="nm.ink"
          mb="0.125rem"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {shop.name}
        </Box>
        <Box
          display="flex"
          alignItems="center"
          gap="0.375rem"
          fontSize="0.6875rem"
          color="nm.inkMuted"
          mb="0.25rem"
        >
          <Box as="span">
            {shop.category === "udon" ? "うどん" : "ラーメン"}
          </Box>
          <Box as="span" w="3px" h="3px" borderRadius="full" bg="nm.inkFaint" />
          <Box as="span">{shop.address.slice(0, 10)}...</Box>
        </Box>
        {shop.visited && !shop.closed ? (
          <MiniHearts rate={shop.rate} />
        ) : shop.closed ? (
          <Box as="span" fontSize="0.6875rem" color="nm.inkFaint">
            閉店
          </Box>
        ) : (
          <Box
            as="span"
            fontSize="0.6875rem"
            color="nm.kincha"
            fontWeight={600}
          >
            気になる
          </Box>
        )}
      </Box>

      <StatusPill shop={shop} />
    </Box>
  );
}

function Chip({
  active,
  color = "ink",
  dot,
  onClick,
  children,
}: {
  active: boolean;
  color?: "shu" | "matcha" | "kincha" | "ink";
  dot?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeBg =
    color === "shu"
      ? "nm.shu"
      : color === "matcha"
        ? "nm.matcha"
        : color === "kincha"
          ? "nm.kincha"
          : "nm.ink";

  return (
    <Button
      variant="plain"
      display="inline-flex"
      alignItems="center"
      gap="0.375rem"
      minW="auto"
      minH="auto"
      px="0.75rem"
      py="0.4375rem"
      bg={active ? activeBg : "nm.bg"}
      border="1px solid"
      borderColor={active ? activeBg : "nm.line"}
      borderRadius="999px"
      fontSize="0.75rem"
      fontWeight={500}
      color={active ? "nm.paper" : "nm.inkMuted"}
      transition="all 0.15s"
      userSelect="none"
      _hover={!active ? { borderColor: "nm.lineStrong", color: "nm.ink" } : {}}
      onClick={onClick}
    >
      {dot && (
        <Box
          as="span"
          w="6px"
          h="6px"
          borderRadius="full"
          bg={active ? "nm.paper" : "nm.inkFaint"}
          flexShrink={0}
        />
      )}
      {children}
    </Button>
  );
}

function HeartFilter({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const hearts = favToHearts(value);
  return (
    <Box display="flex" alignItems="center" gap="0.5rem">
      <Box position="relative" display="flex" gap="0.25rem" alignItems="center">
        {[1, 2, 3, 4, 5].map((i) => {
          const state =
            i <= hearts ? "full" : i - 0.5 <= hearts ? "half" : "empty";
          return (
            <Box
              key={i}
              w="28px"
              h="28px"
              display="grid"
              placeItems="center"
              color={state !== "empty" ? "nm.shu" : "nm.inkFaint"}
              opacity={state === "empty" ? 0.4 : 1}
              transition="color 0.15s, opacity 0.15s"
              pointerEvents="none"
            >
              <Box w="18px" h="18px">
                <HeartIcon state={state} />
              </Box>
            </Box>
          );
        })}
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            margin: 0,
          }}
        />
      </Box>
      {value > 0 && (
        <Button
          variant="plain"
          ml="auto"
          minW="auto"
          minH="auto"
          p="0"
          fontSize="0.6875rem"
          color="nm.inkFaint"
          fontFamily="mono"
          letterSpacing="0.05em"
          _hover={{ color: "nm.inkMuted" }}
          onClick={() => onChange(0)}
        >
          CLEAR
        </Button>
      )}
    </Box>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      fontFamily="mono"
      fontSize="0.625rem"
      letterSpacing="0.2em"
      color="nm.inkMuted"
      textTransform="uppercase"
      mb="0.625rem"
      display="flex"
      alignItems="center"
      gap="0.5rem"
      _after={{
        content: '""',
        flex: "1",
        h: "1px",
        bg: "nm.lineFaint",
        display: "block",
      }}
    >
      {children}
    </Box>
  );
}

export interface SidebarProps {
  allShops: Shop[];
  sortedShops: Shop[];
  query: string;
  onQueryChange: (q: string) => void;
  filters: SearchFilters;
  onFilterChange: <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K],
  ) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export type ShopFiltersProps = Pick<
  SidebarProps,
  "filters" | "onFilterChange"
>;

export function ShopFilters({
  filters,
  onFilterChange,
}: ShopFiltersProps) {
  return (
    <Box
      px="1.25rem"
      pt="0.25rem"
      pb="1rem"
      borderBottom="1px solid"
      borderBottomColor="nm.line"
      overflowY="auto"
    >
      <Box pt="0.875rem" pb="0.625rem">
        <SectionLabel>カテゴリ — Category</SectionLabel>
        <Box display="flex" flexWrap="wrap" gap="0.375rem">
          <Chip
            color="shu"
            active={filters.ramen}
            onClick={() => onFilterChange("ramen", !filters.ramen)}
          >
            ラーメン
          </Chip>
          <Chip
            color="kincha"
            active={filters.udon}
            onClick={() => onFilterChange("udon", !filters.udon)}
          >
            うどん
          </Chip>
        </Box>
      </Box>

      <Box
        pt="0.875rem"
        pb="0.625rem"
        borderTop="1px dashed"
        borderTopColor="nm.lineFaint"
      >
        <SectionLabel>ステータス — Status</SectionLabel>
        <Box display="flex" flexWrap="wrap" gap="0.375rem">
          <Chip
            color="matcha"
            dot
            active={filters.visited}
            onClick={() => onFilterChange("visited", !filters.visited)}
          >
            食べた
          </Chip>
          <Chip
            color="kincha"
            dot
            active={filters.wish}
            onClick={() => onFilterChange("wish", !filters.wish)}
          >
            気になる
          </Chip>
          <Chip
            color="ink"
            active={filters.closed}
            onClick={() => onFilterChange("closed", !filters.closed)}
          >
            閉店
          </Chip>
        </Box>
      </Box>

      <Box
        pt="0.875rem"
        pb="0.625rem"
        borderTop="1px dashed"
        borderTopColor="nm.lineFaint"
      >
        <SectionLabel>お気に入り度 — Favorite</SectionLabel>
        <HeartFilter
          value={filters.favMin}
          onChange={(n) => onFilterChange("favMin", n)}
        />
        <Box
          mt="0.375rem"
          fontSize="0.6875rem"
          color="nm.inkMuted"
          fontFamily="mono"
        >
          {filters.favMin > 0 ? `${filters.favMin} 以上のみ表示` : "指定なし"}
        </Box>
      </Box>
    </Box>
  );
}

export function Sidebar({
  allShops,
  sortedShops,
  query,
  onQueryChange,
  filters,
  onFilterChange,
  selectedId,
  onSelect,
}: SidebarProps) {
  const [localQuery, setLocalQuery] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setLocalQuery(query);
    setPrevQuery(query);
  }

  return (
    <Box
      as="aside"
      bg="nm.paper"
      borderRight="1px solid"
      borderRightColor="nm.line"
      display={{ base: "none", md: "flex" }}
      flexDirection="column"
      overflow="hidden"
      position="relative"
      zIndex={500}
      h="100%"
      w="23.75rem"
      maxW="100%"
      flexShrink={0}
    >
      {/* Brand */}
      <Box
        px="1.625rem"
        pt="1.375rem"
        pb="1.125rem"
        borderBottom="1px solid"
        borderBottomColor="nm.line"
        display="flex"
        alignItems="center"
        gap="0.875rem"
      >
        <Box
          w="44px"
          h="44px"
          borderRadius="full"
          bg="nm.shu"
          display="grid"
          placeItems="center"
          position="relative"
          flexShrink={0}
          boxShadow="inset 0 0 0 2px rgba(255,255,255,0.18), 0 2px 6px rgba(140, 46, 33, 0.3)"
          _before={{
            content: '""',
            position: "absolute",
            inset: "0.375rem",
            borderRadius: "full",
            bg: "nm.paper",
          }}
          _after={{
            content: '"麺"',
            position: "relative",
            fontFamily: "display",
            fontWeight: "700",
            fontSize: "1.25rem",
            color: "nm.shuDeep",
            lineHeight: "1",
          }}
          aria-hidden={true}
        />
        <Box display="flex" flexDirection="column" lineHeight="1.15">
          <Box
            as="span"
            fontFamily="display"
            fontSize="1.125rem"
            fontWeight={700}
            color="nm.ink"
            letterSpacing="0.01em"
          >
            Maru&apos;s Noodle Map
          </Box>
          <Box
            as="span"
            fontFamily="mono"
            fontSize="0.625rem"
            letterSpacing="0.18em"
            color="nm.inkMuted"
            textTransform="uppercase"
            mt="0.125rem"
          >
            Ramen &amp; Udon Log
          </Box>
        </Box>
      </Box>

      {/* Search */}
      <Box px="1.25rem" pt="1rem" pb="0.75rem" position="relative">
        <Box
          position="absolute"
          left="2rem"
          top="50%"
          transform="translateY(-50%)"
          w="16px"
          h="16px"
          color="nm.inkMuted"
          pointerEvents="none"
          zIndex={1}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            style={{ width: "100%", height: "100%" }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </Box>
        <Input
          w="100%"
          pl="2.375rem"
          pr={localQuery ? "2.25rem" : "0.875rem"}
          py="0.6875rem"
          h="auto"
          bg="nm.bg"
          border="1px solid"
          borderColor="nm.line"
          borderRadius="nmMd"
          fontSize="0.875rem"
          color="nm.ink"
          outline="none"
          transition="border-color 0.15s, background 0.15s"
          _focus={{ borderColor: "nm.shu", bg: "white" }}
          _placeholder={{ color: "nm.inkFaint" }}
          placeholder="店名、エリアで検索..."
          value={localQuery}
          onChange={(e) => {
            setLocalQuery(e.target.value);
            onQueryChange(e.target.value);
          }}
        />
        {localQuery && (
          <Button
            variant="plain"
            position="absolute"
            right="1.75rem"
            top="50%"
            transform="translateY(-50%)"
            w="22px"
            h="22px"
            minW="22px"
            minH="22px"
            p="0"
            borderRadius="full"
            bg="nm.inkFaint"
            color="nm.paper"
            display="grid"
            placeItems="center"
            fontSize="0.6875rem"
            opacity={0.7}
            _hover={{ opacity: 1 }}
            onClick={() => {
              setLocalQuery("");
              onQueryChange("");
            }}
          >
            ×
          </Button>
        )}
      </Box>

      {/* Count */}
      <Box
        px="1.25rem"
        pb="0.75rem"
        display="flex"
        alignItems="baseline"
        gap="0.5rem"
      >
        <Box
          as="span"
          fontFamily="display"
          fontSize="1.75rem"
          fontWeight={700}
          color="nm.ink"
          lineHeight="1"
        >
          {sortedShops.length}
        </Box>
        <Box
          as="span"
          fontSize="0.6875rem"
          color="nm.inkMuted"
          letterSpacing="0.1em"
        >
          件 / SHOPS
        </Box>
        <Box
          as="span"
          fontFamily="mono"
          fontSize="0.6875rem"
          color="nm.inkFaint"
          ml="auto"
        >
          of {allShops.length}
        </Box>
      </Box>

      <ShopFilters filters={filters} onFilterChange={onFilterChange} />

      {/* List */}
      <Box flex="1" overflow="hidden" display="flex" flexDirection="column">
        <Box
          px="1.25rem"
          pt="0.625rem"
          pb="0.375rem"
          display="flex"
          alignItems="baseline"
          justifyContent="space-between"
          flexShrink={0}
        >
          <Box
            as="span"
            fontFamily="mono"
            fontSize="0.625rem"
            letterSpacing="0.2em"
            color="nm.inkMuted"
            textTransform="uppercase"
          >
            結果 — Results
          </Box>
        </Box>

        {sortedShops.length === 0 ? (
          <Box
            textAlign="center"
            px="1.25rem"
            py="2.5rem"
            color="nm.inkFaint"
            fontSize="0.8125rem"
          >
            <Box
              fontFamily="display"
              fontSize="1.125rem"
              color="nm.inkMuted"
              mb="0.375rem"
            >
              該当なし
            </Box>
            <Box>条件を変えて再度お試しください</Box>
          </Box>
        ) : (
          <Virtuoso
            style={{ flex: 1 }}
            data={sortedShops}
            itemContent={(_index, r) => (
              <Box px="0.75rem" pb="0">
                <ShopCard
                  key={r.id}
                  shop={r}
                  active={r.id === selectedId}
                  onClick={() => onSelect(r.id)}
                />
              </Box>
            )}
            overscan={200}
          />
        )}
      </Box>
    </Box>
  );
}
