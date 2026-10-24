import type {
  VisitLog,
  VisitLogInput,
} from "@/features/visits/api/use-visits.ts";
import { server } from "@/test/server.ts";
import { http, HttpResponse } from "msw";

/**
 * A stateful fake of the visit endpoints the photo import calls: list a shop's
 * visits, add one, replace one, add an image. `log` records every write.
 */
export function fakeVisitServer(initial: Record<string, VisitLog[]> = {}) {
  const visits = new Map(
    Object.entries(initial).map(([shopId, list]) => [shopId, [...list]]),
  );
  const log: string[] = [];
  let nextId = 1;
  const newId = () =>
    `00000000-0000-4000-9000-${(nextId++).toString(16).padStart(12, "0")}`;
  const find = (visitId: string) =>
    [...visits.values()].flat().find((v) => v.id === visitId);
  const fields = (input: VisitLogInput) => ({
    visitedOn: input.visitedOn,
    menuItems: (input.menuItems ?? []).map((item) => ({
      name: item.name,
      isLimited: item.isLimited ?? false,
      price: item.price,
    })),
    rate: input.rate,
    eventName: input.eventName,
    publicNote: input.publicNote,
    privateNote: input.privateNote,
  });

  /**
   * Stores an uploaded image at the end of the visit's images, logged by its
   * position (`image 3` is the visit's third). The multipart body cannot be
   * read under jsdom, so which photo it was is unknown.
   */
  function saveImage({ params }: { params: { visitId?: unknown } }) {
    const visit = find(params.visitId as string)!;
    const image = {
      id: newId(),
      url: `https://img.example/${newId()}.jpg`,
      width: 2048,
      height: 1536,
    };
    visit.images.push(image);
    log.push(`image ${visit.images.length}`);
    return image;
  }

  server.use(
    http.get("/api/v1/shops/:id/visits", ({ params }) =>
      HttpResponse.json({
        visits: structuredClone(visits.get(params.id as string) ?? []),
      }),
    ),
    http.post("/api/v1/auth/shops/:id/visits", async ({ params, request }) => {
      const input = (await request.json()) as VisitLogInput;
      const visit: VisitLog = { id: newId(), images: [], ...fields(input) };
      const shopId = params.id as string;
      visits.set(shopId, [...(visits.get(shopId) ?? []), visit]);
      log.push(`create ${input.visitedOn}`);
      return HttpResponse.json(visit);
    }),
    http.put("/api/v1/auth/visits/:visitId", async ({ params, request }) => {
      const visit = find(params.visitId as string);
      if (!visit) {
        return HttpResponse.json({ type: "not_found" }, { status: 404 });
      }
      const input = (await request.json()) as VisitLogInput;
      Object.assign(visit, fields(input));
      log.push(`update ${JSON.stringify(input)}`);
      return HttpResponse.json(visit);
    }),
    http.post("/api/v1/auth/visits/:visitId/images", (info) =>
      HttpResponse.json(saveImage(info)),
    ),
  );

  return {
    log,
    saveImage,
    visitsOf: (shopId: string) => visits.get(shopId) ?? [],
  };
}
