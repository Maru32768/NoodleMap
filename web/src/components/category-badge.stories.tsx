import { CategoryBadge } from "@/components/category-badge.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  component: CategoryBadge,
} satisfies Meta<typeof CategoryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ramen: Story = {
  args: { catType: "ramen" },
};

export const Udon: Story = {
  args: { catType: "udon" },
};
