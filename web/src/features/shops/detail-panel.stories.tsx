import {
  CurrentUser,
  CurrentUserProvider,
  GUEST_USER,
} from "@/features/auth/use-current-user.ts";
import { DetailPanel } from "@/features/shops/detail-panel.tsx";
import { VisitLog, visitsKey } from "@/features/visits/api/use-visits.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SWRConfig, unstable_serialize } from "swr";

const admin: CurrentUser = {
  id: "00000000-0000-4000-8000-0000000000f6",
  email: "admin@example.com",
  type: "admin",
};

const shop = makeShop({
  name: "中華そば 青葉",
  address: "東京都中野区中野5-58-1",
  openedAt: "1996-10-01",
  rate: 90,
  tags: [
    makeTag({ label: "煮干し", color: "#6b5e52" }),
    makeTag({ label: "つけ麺", color: "#f2e6c9" }),
  ],
});

// Served from the SWR cache so the stories never hit the network.
const visits: VisitLog[] = [
  {
    id: "00000000-0000-4000-8000-0000000000c1",
    visitedOn: "2026-10-01",
    // 連食: two items in one visit.
    menuItems: [
      { name: "特製中華そば", isLimited: false, price: 1200 },
      { name: "味玉", isLimited: false, price: 150 },
    ],
    totalPrice: 1350,
    rate: 90,
    publicNote: "煮干しの香りが強い",
    privateNote: "次は味玉トッピング",
    images: [],
  },
  {
    id: "00000000-0000-4000-8000-0000000000c2",
    menuItems: [{ name: "冬季限定 味噌", isLimited: true }],
    eventName: "大つけ麺博",
    images: [],
  },
];

const meta = {
  component: DetailPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, { parameters, args }) => {
      const user = (parameters.currentUser as CurrentUser) ?? GUEST_USER;
      // Only the admin gets メモ（自分用） from the API.
      const served =
        user.type === "admin"
          ? visits
          : visits.map((visit) => ({ ...visit, privateNote: undefined }));
      return (
        <SWRConfig
          value={{
            fallback: {
              [unstable_serialize(visitsKey(args.shop.id, user))]: served,
            },
            revalidateOnMount: false,
          }}
        >
          <CurrentUserProvider value={user}>
            {/* The panel is absolutely positioned and hidden below the md breakpoint. */}
            <Box position="relative" h="100vh" minH="640px" bg="nm.bg">
              <Story />
            </Box>
          </CurrentUserProvider>
        </SWRConfig>
      );
    },
  ],
  args: { shop, onAdminEdit: fn(), onClose: fn() },
} satisfies Meta<typeof DetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Guest: Story = {};

export const Admin: Story = {
  parameters: { currentUser: admin },
};

export const WishListUdon: Story = {
  args: {
    shop: makeShop({
      name: "讃岐うどん 花",
      address: "香川県高松市",
      category: "udon",
      eaten: false,
    }),
  },
};

export const ClosingSoon: Story = {
  args: {
    shop: makeShop({ ...shop, closedAt: "2999-03-31" }),
  },
};

export const Closed: Story = {
  args: {
    shop: makeShop({ ...shop, closedAt: "2020-03-31" }),
  },
};
