import {
  putVisit,
  visitInputOf,
  VisitLog,
} from "@/features/visits/api/use-visits.ts";
import { server } from "@/test/server.ts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

// What the server received, as JSON.
function capturePut(response: VisitLog) {
  const bodies: unknown[] = [];
  server.use(
    http.put("/api/v1/auth/visits/:visitId", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(response);
    }),
  );
  return bodies;
}

describe("visitInputOf", () => {
  it("sends every field of the visit back through a PUT", async () => {
    const visit: VisitLog = {
      id: "00000000-0000-4000-8000-0000000000a1",
      visitedOn: "2023-04-01",
      menuItems: [
        { name: "特製中華そば", isLimited: true, price: 1200 },
        { name: "味玉", isLimited: false },
      ],
      totalPrice: 1200,
      rate: 85,
      eventName: "ラーメン博",
      publicNote: "公開メモ",
      privateNote: "自分用メモ",
      images: [
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          url: "https://example.com/a.jpg",
          width: 640,
          height: 480,
        },
      ],
    };
    const bodies = capturePut(visit);

    await putVisit(visit.id, visitInputOf(visit));

    expect(bodies).toEqual([
      {
        visitedOn: "2023-04-01",
        menuItems: [
          { name: "特製中華そば", isLimited: true, price: 1200 },
          { name: "味玉", isLimited: false },
        ],
        rate: 85,
        eventName: "ラーメン博",
        publicNote: "公開メモ",
        privateNote: "自分用メモ",
      },
    ]);
  });

  it("leaves out what a dateless, unrated visit does not have", async () => {
    const visit: VisitLog = {
      id: "00000000-0000-4000-8000-0000000000a2",
      menuItems: [],
      images: [],
    };
    const bodies = capturePut(visit);

    await putVisit(visit.id, visitInputOf(visit));

    expect(bodies).toEqual([{ menuItems: [] }]);
  });
});
