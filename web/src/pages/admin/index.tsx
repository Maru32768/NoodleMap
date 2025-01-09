import { HStack, Input, Link, Text, VStack } from "@chakra-ui/react";
import {
  ListTable,
  useSortableListTableHeader,
} from "@/components/list-table.tsx";
import { useRestaurants } from "@/features/restaurants/api/use-restaurants.ts";
import { useCategories } from "@/features/categories/api/use-categories.ts";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip } from "@/components/ui/tooltip.tsx";

export default function AdminPage() {
  const { restaurants } = useRestaurants();
  const { categories } = useCategories();

  const tableData = useMemo(() => {
    return restaurants?.map((x) => {
      return {
        name: x.name,
        address: x.address,
        categoryLabel: (() => {
          if (x.categories.length === 0) {
            return "";
          }
          if (x.categories.length === 1) {
            return categories?.find((y) => y.id === x.categories[0])?.label;
          }

          return categories
            ?.filter((y) => x.categories.includes(y.id))
            .map((y) => y.label)
            .join(", ");
        })(),
        visited: x.visited,
        closed: x.closed,
        googlePlaceId: x.googlePlaceId,
      };
    });
  }, [restaurants, categories]);

  const { sortedData, createSortableColumn } = useSortableListTableHeader(
    tableData ?? [],
  );

  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const filteredData = useMemo(() => {
    return sortedData.filter((x) => {
      return (
        x.name.toLowerCase().includes(deferredKeyword.toLowerCase()) ||
        x.address.toLowerCase().includes(deferredKeyword.toLowerCase())
      );
    });
  }, [sortedData, deferredKeyword]);

  return (
    <VStack alignItems="start" boxSize="full" padding={4}>
      <VStack alignItems="start" boxSize="full">
        <HStack width="full">
          <Input
            width="24rem"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
            }}
          />
          <Text>{filteredData.length}件</Text>
          <Button colorPalette="teal">店舗追加</Button>
        </HStack>
        <ListTable
          data={filteredData}
          columns={[
            createSortableColumn({
              property: "categoryLabel",
              header: "カテゴリー",
              width: "8rem",
              render: (categoryLabel) => {
                return categoryLabel;
              },
            }),
            createSortableColumn({
              property: "name",
              header: "名前",
              width: "24rem",
              render: (name) => {
                return name;
              },
            }),
            createSortableColumn({
              property: "address",
              header: "住所",
              width: "12rem",
              render: (address) => {
                return (
                  <Tooltip content={address}>
                    <Text>{address}</Text>
                  </Tooltip>
                );
              },
            }),
            createSortableColumn({
              property: "visited",
              header: "訪問済み",
              width: "7rem",
              cellProps: { textAlign: "center" },
              render: (visited) => {
                return visited ? "◯" : "";
              },
            }),
            createSortableColumn({
              property: "closed",
              header: "閉店",
              width: "7rem",
              cellProps: { textAlign: "center" },
              render: (closed) => {
                return closed ? "◯" : "";
              },
            }),
            {
              property: "googlePlaceId",
              header: "Google Maps",
              width: "8rem",
              cellProps: { textAlign: "center" },
              render: (_, r) => {
                const restaurantUrl = new URL(
                  "https://www.google.com/maps/search/",
                );
                restaurantUrl.searchParams.set("api", "1");
                restaurantUrl.searchParams.set(
                  "query",
                  `${r.name} ${r.address}`,
                );
                restaurantUrl.searchParams.set(
                  "query_place_id",
                  r.googlePlaceId,
                );

                return (
                  <Button asChild variant="outline">
                    <Link href={restaurantUrl.toString()} target="_blank">
                      Google Mapsへ
                    </Link>
                  </Button>
                );
              },
            },
            {
              property: undefined,
              header: "編集",
              width: "8rem",
              cellProps: { textAlign: "center" },
              render: () => {
                return (
                  <HStack justifyContent="center">
                    <Button variant="outline">訪問情報</Button>
                    <Button variant="outline">お店情報</Button>
                  </HStack>
                );
              },
            },
          ]}
        />
      </VStack>
    </VStack>
  );
}
