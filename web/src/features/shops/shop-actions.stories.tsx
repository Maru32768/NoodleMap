import {
  buildGoogleMapsUrl,
  ShopActions,
  ShopAddressLink,
} from "@/features/shops/shop-actions.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

const shop = makeShop({ googlePlaceId: "ChIJ-example" });
const mapsUrl = buildGoogleMapsUrl(shop);

const meta = {
  component: ShopActions,
  decorators: [
    (Story) => (
      <Box display="flex" gap="0.625rem" w="24rem">
        <Story />
      </Box>
    ),
  ],
  args: { shop, mapsUrl, mapsLabel: "Google Maps" },
} satisfies Meta<typeof ShopActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Guest: Story = {};

export const Admin: Story = {
  args: { onAdminClick: fn() },
};

export const AddressLink: Story = {
  render: () => <ShopAddressLink address={shop.address} mapsUrl={mapsUrl} />,
};
