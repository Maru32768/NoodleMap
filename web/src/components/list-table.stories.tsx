import {
  ListTable,
  useSortableListTableHeader,
} from "@/components/list-table.tsx";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { makeShop } from "@/test/fixtures.ts";
import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";

const shops = [
  makeShop({ name: "中華そば 青葉", address: "東京都中野区", rate: 92 }),
  makeShop({
    name: "讃岐うどん 花",
    address: "香川県高松市",
    rate: 78,
    category: "udon",
  }),
  makeShop({ name: "らぁ麺 はやし", address: "東京都渋谷区", rate: 85 }),
  makeShop({
    name: "閉店した店",
    address: "東京都新宿区",
    rate: 40,
    closedAt: "2020-01-01",
  }),
];

function SortableShopTable({ data }: { data: Shop[] }) {
  const { sortedData, createSortableColumn } = useSortableListTableHeader(
    data,
    "rate",
    "DESC",
  );

  return (
    <ListTable
      data={sortedData}
      emptyMessage="店舗がありません"
      columns={[
        createSortableColumn({
          property: "name",
          header: "店名",
          width: "40%",
          render: (name) => name,
        }),
        createSortableColumn({
          property: "address",
          header: "住所",
          width: "40%",
          render: (address) => address,
        }),
        createSortableColumn({
          property: "rate",
          header: "評価",
          width: "20%",
          render: (rate) => rate,
        }),
      ]}
    />
  );
}

const meta = {
  component: SortableShopTable,
  decorators: [
    (Story) => (
      <Box h="320px">
        <Story />
      </Box>
    ),
  ],
  args: { data: shops },
} satisfies Meta<typeof SortableShopTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SortableColumns: Story = {};

export const Empty: Story = {
  args: { data: [] },
};
