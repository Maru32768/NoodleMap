import type { IsoDate } from "@/features/meal-records/eaten-date.ts";
import type { PhotoGroup } from "@/features/photo-import/grouping.ts";
import {
  ImportPlan,
  mealRecordKey,
} from "@/features/photo-import/import-plan.ts";
import {
  Analysis,
  ImportAction,
  importReducer,
  ImportState,
  INITIAL_IMPORT_STATE,
  runProgressOf,
} from "@/features/photo-import/import-state.ts";
import { describe, expect, it } from "vitest";

const key = mealRecordKey(
  { kind: "shop", shopId: "shop" },
  "2023-04-01" as IsoDate,
);

const analysis: Analysis = {
  photos: [],
  rejected: [],
  groups: [],
  serverMealRecords: new Map(),
};
const plan: ImportPlan = { entries: [] };

const group = (...indexes: number[]): PhotoGroup => ({
  id: indexes[0],
  day: "2023-04-01" as IsoDate,
  photos: indexes.map((index) => ({
    index,
    file: new File([], `${index}.jpg`),
    capturedAt: new Date(0),
    dateSource: "exif",
    location: null,
  })),
  center: null,
});

const run = (state: ImportState, ...actions: ImportAction[]) =>
  actions.reduce(importReducer, state);

const review = run(
  INITIAL_IMPORT_STATE,
  { type: "read", total: 3 },
  { type: "analyzed", analysis },
);

describe("importReducer", () => {
  it("reads, reviews, runs and finishes", () => {
    expect(
      run(
        INITIAL_IMPORT_STATE,
        { type: "read", total: 3 },
        { type: "readProgress", done: 2 },
      ),
    ).toEqual({ kind: "reading", done: 2, total: 3 });

    const running = run(review, { type: "start", plan });
    expect(running).toMatchObject({
      kind: "running",
      progress: runProgressOf(plan),
    });

    const outcome = {
      kind: "finished",
      progress: runProgressOf(plan),
    } as const;
    expect(run(running, { type: "finished", outcome })).toMatchObject({
      kind: "finished",
      outcome,
    });
  });

  it("records the admin's choices, details and toggles a photo's exclusion", () => {
    const state = run(
      review,
      { type: "choose", groupId: 4, choice: { kind: "skip" } },
      { type: "togglePhoto", photoIndex: 7 },
      { type: "togglePhoto", photoIndex: 8 },
      { type: "togglePhoto", photoIndex: 7 },
      { type: "setDetails", key, details: { shopIds: ["shop"], rate: 80 } },
    );

    expect(state.kind === "review" && state.review).toEqual({
      choices: new Map([[4, { kind: "skip" }]]),
      excluded: new Set([8]),
      order: new Map(),
      details: new Map([[key, { shopIds: ["shop"], rate: 80 }]]),
    });
  });

  it("goes back to review with fresh server meal records after a run, keeping the choices", () => {
    const chosen = run(review, {
      type: "choose",
      groupId: 4,
      choice: { kind: "skip" },
    });
    const serverMealRecords = new Map([[`shop:shop` as const, []]]);

    const state = run(
      chosen,
      { type: "start", plan },
      {
        type: "finished",
        outcome: { kind: "stopped", progress: runProgressOf(plan) },
      },
      { type: "refreshed", serverMealRecords },
    );

    expect(state).toMatchObject({
      kind: "review",
      analysis: { serverMealRecords },
    });
    expect(state.kind === "review" && state.review).toEqual(
      chosen.kind === "review" && chosen.review,
    );
  });

  it("adds photos in review and after a run, keeping the admin's decisions", () => {
    const chosen = run(
      INITIAL_IMPORT_STATE,
      { type: "read", total: 1 },
      { type: "analyzed", analysis: { ...analysis, groups: [group(1)] } },
      { type: "choose", groupId: 1, choice: { kind: "skip" } },
    );
    const more: Analysis = { ...analysis, groups: [group(1), group(2)] };
    const finished = run(
      chosen,
      { type: "start", plan },
      {
        type: "finished",
        outcome: { kind: "finished", progress: runProgressOf(plan) },
      },
    );

    for (const state of [chosen, finished]) {
      const appended = run(state, { type: "appended", analysis: more });
      expect(appended).toMatchObject({ kind: "review", analysis: more });
      expect(appended.kind === "review" && appended.review).toEqual(
        chosen.kind === "review" && chosen.review,
      );
    }
  });

  it("keeps each choice with its photos when added photos regroup them, asking again where merged choices differ", () => {
    const shop = { kind: "shop", shopId: "shop", source: "admin" } as const;
    const state = run(
      INITIAL_IMPORT_STATE,
      { type: "read", total: 8 },
      {
        type: "analyzed",
        analysis: {
          ...analysis,
          groups: [
            group(0, 1),
            group(2),
            group(3),
            group(4),
            group(7),
            group(8),
            group(9),
          ],
        },
      },
      { type: "choose", groupId: 0, choice: { kind: "skip" } },
      { type: "choose", groupId: 2, choice: shop },
      { type: "choose", groupId: 3, choice: { kind: "skip" } },
      { type: "choose", groupId: 8, choice: { kind: "skip" } },
      // Photo 5 was taken before photo 0; photo 6 between photos 2 and 3,
      // photo 10 between 4 and 7, photo 11 between 8 and 9.
      {
        type: "appended",
        analysis: {
          ...analysis,
          groups: [
            group(5, 0, 1),
            group(2, 6, 3),
            group(4, 10, 7),
            group(8, 11, 9),
          ],
        },
      },
    );

    // Group 9 had no choice, so its photos are asked about rather than skipped with group 8's.
    expect(state.kind === "review" && state.review.choices).toEqual(
      new Map([
        [5, { kind: "skip" }],
        [2, { kind: "undecided" }],
        [8, { kind: "undecided" }],
      ]),
    );
  });

  it("keeps meal records loaded while photos were added in review, but not those read before a run", () => {
    const records = (id: string) => new Map([[`shop:${id}` as const, []]]);
    const chosen = run(review, {
      type: "loaded",
      serverMealRecords: records("chosen"),
    });
    const more: Analysis = { ...analysis, serverMealRecords: records("added") };

    expect(run(chosen, { type: "appended", analysis: more })).toMatchObject({
      analysis: {
        serverMealRecords: new Map([...records("chosen"), ...records("added")]),
      },
    });
    const finished = run(
      chosen,
      { type: "start", plan },
      {
        type: "finished",
        outcome: { kind: "finished", progress: runProgressOf(plan) },
      },
    );
    expect(run(finished, { type: "appended", analysis: more })).toMatchObject({
      analysis: { serverMealRecords: records("added") },
    });
  });

  it("ignores what the current state does not accept", () => {
    const running = run(review, { type: "start", plan });

    for (const action of [
      { type: "choose", groupId: 1, choice: { kind: "skip" } },
      { type: "togglePhoto", photoIndex: 1 },
      { type: "start", plan },
      { type: "reset" },
      { type: "refreshed", serverMealRecords: new Map() },
      { type: "appended", analysis },
    ] satisfies ImportAction[]) {
      expect(importReducer(running, action)).toBe(running);
    }
    expect(importReducer(INITIAL_IMPORT_STATE, { type: "start", plan })).toBe(
      INITIAL_IMPORT_STATE,
    );
  });

  it("drops back to selecting when reading fails or on reset", () => {
    expect(
      run(
        INITIAL_IMPORT_STATE,
        { type: "read", total: 1 },
        { type: "readFailed" },
      ),
    ).toBe(INITIAL_IMPORT_STATE);
    expect(run(review, { type: "reset" })).toBe(INITIAL_IMPORT_STATE);
  });
});
