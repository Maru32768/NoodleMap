import { ShopThumb } from "@/components/shop-thumb.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  component: ShopThumb,
  args: { catType: "ramen", closed: false },
} satisfies Meta<typeof ShopThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ramen: Story = {};

export const Udon: Story = {
  args: { catType: "udon" },
};

export const Closed: Story = {
  args: { closed: true },
};

export const Large: Story = {
  args: { size: "lg" },
};
