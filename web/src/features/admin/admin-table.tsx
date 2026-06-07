import {
  ListTable,
  ListTableColumnProps,
  useSortableListTableHeader,
} from "@/components/list-table.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { buildGoogleMapsUrl } from "@/features/restaurants/restaurant-actions.tsx";
import { favToHearts } from "@/features/search/utils.ts";
import { Box, Link } from "@chakra-ui/react";
import React, { useEffect } from "react";
import { TableVirtuosoHandle } from "react-virtuoso";

interface AdminTableProps {
  shops: Restaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string, tab?: "images") => void;
}

type AdminTableRow = Restaurant & {
  categorySort: string;
  favoriteSort: number;
};

function MiniHearts({ rate }: { rate: number | undefined }) {
  const n = favToHearts(rate);
  return (
    <Box display="flex" gap="1px" alignItems="center">
      {[1, 2, 3, 4, 5].map((i) => (
        <Box
          key={i}
          w="11px"
          h="11px"
          color={i <= n ? "nm.shu" : "nm.inkFaint"}
          opacity={i <= n ? 1 : 0.35}
          lineHeight="0"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
            <path d="M12 21s-7-4.35-9.5-9C1 8.5 3 5 6.5 5 8.5 5 10.5 6 12 8c1.5-2 3.5-3 5.5-3C21 5 23 8.5 21.5 12 19 16.65 12 21 12 21z" />
          </svg>
        </Box>
      ))}
    </Box>
  );
}

function CheckDot({
  on,
  variant,
}: {
  on: boolean;
  variant: "visited" | "closed";
}) {
  const activeColor = variant === "visited" ? "nm.matcha" : "nm.ink";
  return (
    <Box
      boxSize="20px"
      rounded="full"
      mx="auto"
      display="grid"
      placeItems="center"
      border="1.5px solid"
      borderColor={on ? activeColor : "nm.lineStrong"}
      bg={on ? activeColor : "nm.paper"}
      color={on ? "white" : "nm.ink"}
    >
      {on && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          width="10"
          height="10"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </Box>
  );
}

function RowActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="plain"
      title={title}
      w="28px"
      h="28px"
      minW="28px"
      p="0"
      display="grid"
      placeItems="center"
      color="nm.inkMuted"
      rounded="4px"
      transition="all 0.1s"
      _hover={{ bg: "nm.bgSoft", color: "nm.ink" }}
      _icon={{ w: "14px", h: "14px" }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function RowActionLink({
  title,
  href,
  onClick,
  children,
}: {
  title: string;
  href: string;
  onClick: React.MouseEventHandler<HTMLAnchorElement>;
  children: React.ReactNode;
}) {
  return (
    <Link
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      href={href}
      w="28px"
      h="28px"
      display="grid"
      placeItems="center"
      color="nm.inkMuted"
      rounded="4px"
      transition="all 0.1s"
      textDecoration="none"
      _hover={{ bg: "nm.bgSoft", color: "nm.ink", textDecoration: "none" }}
      css={{ "& svg": { width: "14px", height: "14px" } }}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

export function AdminTable({
  shops,
  selectedId,
  onSelect,
  onEdit,
}: AdminTableProps) {
  const tableRef = React.useRef<TableVirtuosoHandle>(null);
  const rows = shops.map((shop) => ({
    ...shop,
    categorySort: shop.category,
    favoriteSort: shop.rate ?? 0,
  }));

  const { sortedData, createSortableColumn } =
    useSortableListTableHeader<AdminTableRow>(rows, "name", "ASC");

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const selectedIndex = sortedData.findIndex(
      (shop) => shop.id === selectedId,
    );
    if (selectedIndex === -1) {
      return;
    }

    tableRef.current?.scrollToIndex({
      index: selectedIndex,
      align: "center",
      behavior: "smooth",
    });
  }, [selectedId, sortedData]);

  const columns: ListTableColumnProps<AdminTableRow>[] = [
    createSortableColumn({
      property: "categorySort",
      header: "カテゴリ",
      width: "82px",
      render: (_categorySort, shop) => {
        const catLabel = shop.category === "udon" ? "うどん" : "ラーメン";
        const bg = shop.category === "udon" ? "nm.kincha" : "nm.shu";
        return (
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            gap="4px"
            px="6px"
            py="2px"
            bg={bg}
            color="white"
            borderRadius="nmSm"
            fontSize="10px"
            fontFamily="mono"
            letterSpacing="0.1em"
            whiteSpace="nowrap"
          >
            <CategoryIcon
              category={shop.category}
              size={10}
              strokeWidth={1.8}
            />
            {catLabel}
          </Box>
        );
      },
    }),
    createSortableColumn({
      property: "name",
      header: "店名",
      width: "auto",
      render: (name) => <>{name}</>,
    }),
    createSortableColumn({
      property: "address",
      header: "住所",
      width: "26%",
      render: (address) => <Box>{address}</Box>,
    }),
    createSortableColumn({
      property: "visited",
      header: "食べた",
      width: "70px",
      render: (visited) => <CheckDot on={visited} variant="visited" />,
    }),
    createSortableColumn({
      property: "favoriteSort",
      header: "お気に入り",
      width: "100px",
      render: (_favoriteSort, shop) => <MiniHearts rate={shop.rate} />,
    }),
    createSortableColumn({
      property: "closed",
      header: "閉店",
      width: "60px",
      render: (closed) => <CheckDot on={closed} variant="closed" />,
    }),
    {
      property: undefined,
      header: "操作",
      width: "100px",
      render: (shop) => {
        const shopUrl = buildGoogleMapsUrl(shop);
        return (
          <Box display="inline-flex" gap="2px" justifyContent="flex-end">
            <RowActionButton
              title="編集"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(shop.id);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
              </svg>
            </RowActionButton>
            <RowActionButton
              title="画像"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(shop.id, "images");
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </RowActionButton>
            <RowActionLink
              title="Google Maps"
              href={shopUrl}
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </RowActionLink>
          </Box>
        );
      },
    },
  ];

  const getRowProps = (shop: AdminTableRow) => ({
    bg: shop.id === selectedId ? "nm.bg" : undefined,
    opacity: shop.closed ? 0.55 : 1,
    cursor: "pointer",
    transition: "background 0.1s",
    _hover: { bg: "nm.bgSoft" },
    onClick: () => onSelect(shop.id),
    onDoubleClick: () => onEdit(shop.id),
  });

  return (
    <Box h="100%" overflow="hidden">
      <ListTable
        virtuosoRef={tableRef}
        data={sortedData}
        columns={columns}
        emptyMessage="該当する店舗がありません"
        getRowProps={getRowProps}
      />
    </Box>
  );
}
