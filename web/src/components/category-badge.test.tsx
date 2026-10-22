import { CategoryBadge } from "@/components/category-badge.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("CategoryBadge", () => {
  it.each([
    ["ramen", "RAMEN"],
    ["udon", "UDON"],
  ] as const)("labels %s as %s", (catType, label) => {
    renderWithProviders(<CategoryBadge catType={catType} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
