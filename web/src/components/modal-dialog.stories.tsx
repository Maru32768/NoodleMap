import { ModalDialog } from "@/components/modal-dialog.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuStore } from "react-icons/lu";
import { fn } from "storybook/test";

const meta = {
  component: ModalDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    width: "28rem",
    children: "閉店日を登録すると、地図上で閉店予定として表示されます。",
  },
} satisfies Meta<typeof ModalDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHeaderAndButtons: Story = {
  args: {
    icon: <LuStore />,
    title: "店舗を編集",
    subtitle: "SHOP SETTINGS",
    buttons: [
      { label: "キャンセル", onClick: fn() },
      {
        label: "保存",
        onClick: () => new Promise((resolve) => setTimeout(resolve, 1500)),
      },
    ],
  },
};

export const BodyOnly: Story = {};

export const WithoutCloseButton: Story = {
  args: {
    title: "確認",
    showCloseButton: false,
    buttons: [{ label: "OK", onClick: fn() }],
  },
};
