import { Loading } from "@/components/loading.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  component: Loading,
} satisfies Meta<typeof Loading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {};

export const ExtraLarge: Story = {
  args: { size: "xl" },
};
