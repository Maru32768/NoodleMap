import { SYSTEM_TAGS } from "@/features/shops/status.ts";
import {
  SystemTagChips,
  TagChips,
  TagSelector,
} from "@/features/shops/tag-chips.tsx";
import { makeTag } from "@/test/fixtures.ts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const tags = [
  makeTag({ label: "醤油", color: "#8c2e21" }),
  makeTag({ label: "味噌", color: "#f2e6c9", category: "ramen" }),
  makeTag({ label: "煮干し", color: "#6b5e52", category: "ramen" }),
  makeTag({ label: "かけ", color: "#6b7a3c", category: "udon" }),
];

const meta = {
  component: TagChips,
  args: { tags },
} satisfies Meta<typeof TagChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {};

export const ExtraSmall: Story = {
  args: { size: "xs" },
};

export const WithLimit: Story = {
  args: { limit: 2 },
};

export const SystemTags: Story = {
  render: () => (
    <SystemTagChips tags={SYSTEM_TAGS.filter((tag) => tag.showOnShop)} />
  ),
};

export const Selector: Story = {
  render: function Render(args) {
    const [selectedIds, setSelectedIds] = useState([args.tags[0].id]);
    return (
      <TagSelector
        tags={args.tags}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />
    );
  },
};

export const SelectorForUdon: Story = {
  render: (args) => (
    <TagSelector
      tags={args.tags}
      selectedIds={[]}
      category="udon"
      onChange={() => {}}
    />
  ),
};
