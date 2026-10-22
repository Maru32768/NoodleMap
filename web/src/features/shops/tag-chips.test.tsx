import { SYSTEM_TAGS } from "@/features/shops/status.ts";
import {
  getTagTextColor,
  SystemTagChips,
  TagChips,
  TagSelector,
} from "@/features/shops/tag-chips.tsx";
import { makeTag } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const shoyu = makeTag({ label: "醤油", color: "#8c2e21" });
const miso = makeTag({ label: "味噌", color: "#f2e6c9", category: "ramen" });
const kake = makeTag({ label: "かけ", color: "#6b7a3c", category: "udon" });

describe("getTagTextColor", () => {
  it("uses dark text on light backgrounds and white on dark ones", () => {
    expect(getTagTextColor("#f2e6c9")).toBe("nm.ink");
    expect(getTagTextColor("ffffff")).toBe("nm.ink");
    expect(getTagTextColor("#1a1614")).toBe("white");
  });

  it("falls back to white for colors it cannot parse", () => {
    expect(getTagTextColor("#fff")).toBe("white");
    expect(getTagTextColor("red")).toBe("white");
  });
});

describe("TagChips", () => {
  it("renders every tag label", () => {
    renderWithProviders(<TagChips tags={[shoyu, miso]} />);

    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.getByText("味噌")).toBeInTheDocument();
  });

  it("collapses tags beyond the limit into a count", () => {
    renderWithProviders(<TagChips tags={[shoyu, miso, kake]} limit={1} />);

    expect(screen.getByText("醤油")).toBeInTheDocument();
    expect(screen.queryByText("味噌")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders nothing without tags", () => {
    const { container } = render(<TagChips tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("SystemTagChips", () => {
  it("renders the system tag labels", () => {
    renderWithProviders(<SystemTagChips tags={SYSTEM_TAGS.slice(0, 2)} />);

    expect(screen.getByText("新店")).toBeInTheDocument();
    expect(screen.getByText("開店予定")).toBeInTheDocument();
  });
});

describe("TagSelector", () => {
  it("adds an unselected tag and removes a selected one", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <TagSelector
        tags={[shoyu, miso]}
        selectedIds={[shoyu.id]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "味噌" }));
    expect(onChange).toHaveBeenLastCalledWith([shoyu.id, miso.id]);

    await userEvent.click(screen.getByRole("button", { name: "醤油" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("shows only uncategorized tags and those of the given category", () => {
    renderWithProviders(
      <TagSelector
        tags={[shoyu, miso, kake]}
        selectedIds={[]}
        category="udon"
        onChange={() => {}}
      />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["醤油", "かけ"]);
  });
});
