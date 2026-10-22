import { LoadableButton } from "@/components/loadable-button.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

const meta = {
  component: LoadableButton,
  args: {
    children: "保存",
    onClick: () => new Promise((resolve) => setTimeout(resolve, 1500)),
  },
} satisfies Meta<typeof LoadableButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AsyncAction: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "保存" });

    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 3000 });
  },
};

export const ExternallyLoading: Story = {
  args: { loading: true },
};
