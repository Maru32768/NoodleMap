import { OverlayProgress } from "@/components/overlay-progress.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  component: OverlayProgress,
} satisfies Meta<typeof OverlayProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
