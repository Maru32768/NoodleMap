import type { MealRecordImage } from "@/features/meal-records/api/use-meal-record-images.ts";
import { MealRecordImageGallery } from "@/features/meal-records/meal-record-image-gallery.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

const images: MealRecordImage[] = [
  {
    id: "00000000-0000-4000-8000-0000000000c1",
    url: "https://img.example.test/1.jpg",
    width: 2048,
    height: 1536,
    caption: "特製中華そば",
  },
  {
    id: "00000000-0000-4000-8000-0000000000c2",
    url: "https://img.example.test/2.jpg",
    width: 1536,
    height: 2048,
  },
];

describe("MealRecordImageGallery", () => {
  it("shows lazily loaded thumbnails with their intrinsic size", () => {
    renderWithProviders(<MealRecordImageGallery images={images} />);

    const list = screen.getByRole("list", { name: "記録の画像" });
    // Decorative (alt=""): the button around each names it.
    const thumbs = list.querySelectorAll("img");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveAttribute("src", images[0].url);
    expect(thumbs[0]).toHaveAttribute("loading", "lazy");
    expect(thumbs[0]).toHaveAttribute("width", "2048");
    expect(thumbs[0]).toHaveAttribute("height", "1536");
  });

  it("renders nothing without images", () => {
    renderWithProviders(<MealRecordImageGallery images={[]} />);

    expect(screen.queryByRole("list", { name: "記録の画像" })).toBeNull();
  });

  it("opens a lightbox that steps through the images and closes on Esc", async () => {
    renderWithProviders(<MealRecordImageGallery images={images} />);

    await userEvent.click(
      screen.getByRole("button", { name: "画像 1 / 2: 特製中華そばを拡大" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "特製中華そば" }),
    ).toHaveAttribute("src", images[0].url);
    expect(within(dialog).getByText("特製中華そば")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "前の画像" }),
    ).toBeDisabled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "次の画像" }),
    );
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "画像 2 / 2" }),
    ).toHaveAttribute("src", images[1].url);
    expect(
      within(dialog).getByRole("button", { name: "次の画像" }),
    ).toBeDisabled();

    await userEvent.keyboard("{ArrowLeft}");
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
