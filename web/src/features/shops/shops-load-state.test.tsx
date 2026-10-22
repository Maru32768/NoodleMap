import { ShopsLoadState } from "@/features/shops/shops-load-state.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

describe("ShopsLoadState", () => {
  it("shows a spinner, not the content, while the shops are loading", async () => {
    server.use(
      http.get("/api/v1/shops", async () => {
        await delay("infinite");
        return HttpResponse.json({ shops: [] });
      }),
    );

    renderWithProviders(<ShopsLoadState>loaded</ShopsLoadState>);

    expect(await screen.findByLabelText("読み込み中")).toBeInTheDocument();
    expect(screen.queryByText("loaded")).not.toBeInTheDocument();
  });

  it("shows the load error inline and re-fetches on retry", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/shops", () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({ type: "internal_error" }, { status: 500 })
          : HttpResponse.json({ shops: [] });
      }),
    );

    renderWithProviders(<ShopsLoadState>loaded</ShopsLoadState>);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("店舗一覧を読み込めませんでした");
    // Inline only: the failure is not also toasted.
    expect(screen.getAllByText("店舗一覧を読み込めませんでした")).toHaveLength(
      1,
    );

    await userEvent.click(screen.getByRole("button", { name: "再試行" }));

    expect(await screen.findByText("loaded")).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
