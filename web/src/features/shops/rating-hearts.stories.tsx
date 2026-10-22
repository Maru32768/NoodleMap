import { FavoriteRating, MiniHearts } from "@/features/shops/rating-hearts.tsx";
import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  component: FavoriteRating,
  decorators: [
    (Story) => (
      <Box w="16rem">
        <Story />
      </Box>
    ),
  ],
  args: { rate: 90 },
} satisfies Meta<typeof FavoriteRating>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  args: { rate: 100 },
};

export const HalfHeart: Story = {
  args: { rate: 70 },
};

export const Compact: Story = {
  args: { compact: true },
};

export const Unrated: Story = {
  args: { rate: undefined },
};

export const Mini: Story = {
  render: (args) => <MiniHearts rate={args.rate} />,
};
