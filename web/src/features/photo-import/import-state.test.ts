import type { IsoDate } from "@/features/meal-records/eaten-date.ts";
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

const key = mealRecordKey("shop", "2023-04-01" as IsoDate);

const analysis: Analysis = {
  photos: [],
  rejected: [],
  groups: [],
  serverMealRecords: new Map(),
};
const plan: ImportPlan = { entries: [] };

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
    const serverMealRecords = new Map([["shop", []]]);

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
    const chosen = run(review, {
      type: "choose",
      groupId: 1,
      choice: { kind: "skip" },
    });
    const more: Analysis = { ...analysis, photos: [] };
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
