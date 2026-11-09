import {
  MealRecord,
  useRevalidateRecords,
} from "@/features/meal-records/api/use-meal-records.ts";
import { groupPhotos, PhotoGroup } from "@/features/photo-import/grouping.ts";
import {
  buildPlan,
  decideAction,
  defaultChoice,
  EntryAction,
  MealRecordDetails,
  MealRecordKey,
  mealRecordKey,
  photoOrder,
  PlanEntry,
  recordsOf,
  RecordTarget,
  ShopChoice,
  TargetKey,
  targetKey,
  targetOf,
} from "@/features/photo-import/import-plan.ts";
import {
  Analysis,
  importReducer,
  INITIAL_IMPORT_STATE,
} from "@/features/photo-import/import-state.ts";
import {
  Candidate,
  Match,
  matchShop,
} from "@/features/photo-import/matching.ts";
import { Photo, readPhotos } from "@/features/photo-import/photos.ts";
import {
  fetchTargetMealRecords,
  runImport,
} from "@/features/photo-import/run-import.ts";
import type { Shop } from "@/features/shops/api/use-shops.ts";
import { forEachConcurrently } from "@/utils/concurrency.ts";
import { isApiError } from "@/utils/request.ts";
import { toastApiError, toastError } from "@/utils/toast.ts";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

export type RowTab = "undecided" | "ready" | "imported" | "skip";

/** One review row. Derived each render from analysis + review + current shops; never stored. */
export interface GroupRow {
  readonly group: PhotoGroup;
  /** The group's photos in the order they upload, which the admin may change while detailsKey is set. */
  readonly photos: readonly Photo[];
  readonly match: Match;
  readonly candidates: readonly Candidate[];
  /** review.choices.get(id) ?? defaultChoice(...) */
  readonly choice: ShopChoice;
  readonly tab: RowTab;
  /** Images already on that (target, day) mealRecord; null when it has none. */
  readonly existingImages: number | null;
  /** Photos of its (shop, day) beyond the per-mealRecord cap. */
  readonly overflow: number;
  /** The (shop, day) meal record the import makes or claims, whose details the admin may write; null otherwise. */
  readonly detailsKey: MealRecordKey | null;
}

export type PlanSummary = Record<EntryAction["kind"], number> &
  Record<"undecided", number>;

const LOAD_CONCURRENCY = 4;

// A file picked, dropped or pasted twice is the same photo. lastModified is
// left out: a photo exported to two folders carries two different ones.
const fileKey = (file: File) => `${file.name}|${file.size}`;

/** Every listed target's mealRecords; a failure rejects, since a plan on partial truth would duplicate. */
async function loadServerMealRecords(
  targets: readonly RecordTarget[],
  signal: AbortSignal,
): Promise<Map<TargetKey, readonly MealRecord[]>> {
  const mealRecords = new Map<TargetKey, readonly MealRecord[]>();
  await forEachConcurrently(targets, LOAD_CONCURRENCY, signal, async (t) => {
    mealRecords.set(targetKey(t), await fetchTargetMealRecords(t));
  });
  return mealRecords;
}

/**
 * Shops with mealRecords among the candidates of any group or the choices, and the venues
 * chosen: the only ones decideAction needs.
 */
function targetsToLoad(
  groups: readonly PhotoGroup[],
  shops: readonly Shop[],
  choices: Iterable<ShopChoice> = [],
) {
  const withRecords = new Set(
    shops.filter((s) => s.mealRecordCount > 0).map((s) => s.id),
  );
  const targets = new Map<TargetKey, RecordTarget>();
  const add = (target: RecordTarget | null) => {
    if (target && (target.kind === "venue" || withRecords.has(target.shopId))) {
      targets.set(targetKey(target), target);
    }
  };
  for (const group of groups) {
    const match = matchShop(group.center, shops);
    for (const c of "candidates" in match ? match.candidates : []) {
      add({ kind: "shop", shopId: c.shop.id });
    }
  }
  for (const choice of choices) {
    add(targetOf(choice));
  }
  return [...targets.values()];
}

function toastFailure(error: unknown) {
  if (isApiError(error)) {
    toastApiError(error);
  } else {
    toastError({ title: "写真を読み込めませんでした" });
  }
}

/**
 * The photo import as the modal sees it: the state machine, the rows and the
 * plan summary derived from it, and the async steps that move it.
 */
export function usePhotoImport(shops: readonly Shop[]) {
  const [state, dispatch] = useReducer(importReducer, INITIAL_IMPORT_STATE);
  const revalidateAllMealRecords = useRevalidateRecords().all;
  const controller = useRef<AbortController>(null);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(
    null,
  );
  useEffect(() => () => controller.current?.abort(), []);

  const reviewed =
    state.kind === "select" || state.kind === "reading" ? null : state;
  const analysis = reviewed?.analysis;
  const review = reviewed?.review;

  const matches = useMemo(
    () => analysis?.groups.map((g) => matchShop(g.center, shops)) ?? [],
    [analysis?.groups, shops],
  );

  const derived = useMemo(() => {
    if (!analysis || !review) {
      return {
        rows: [],
        summary: null,
        plan: { entries: [] },
        photosByKey: new Map<MealRecordKey, Photo[]>(),
      };
    }
    const { groups, serverMealRecords } = analysis;
    const choices = groups.map(
      (group, i) =>
        review.choices.get(group.id) ??
        defaultChoice(group, matches[i], serverMealRecords),
    );
    const choiceByGroup = new Map(groups.map((g, i) => [g, choices[i]]));
    const plan = buildPlan(
      groups,
      (g) => choiceByGroup.get(g)!,
      review.excluded,
      review.details,
      review.order,
    );
    // Every photo of each (target, day), excluded ones too, in upload order: what a move reorders.
    const photosByKey = new Map<MealRecordKey, Photo[]>();
    groups.forEach((group, i) => {
      const target = targetOf(choices[i]);
      if (target) {
        const key = mealRecordKey(target, group.day);
        photosByKey.set(key, [
          ...(photosByKey.get(key) ?? []),
          ...group.photos,
        ]);
      }
    });
    for (const [key, photos] of photosByKey) {
      photos.sort(photoOrder(review.order.get(key)));
    }
    const entries = new Map<string, PlanEntry>(
      plan.entries.map((e) => [e.key, e]),
    );
    const actionOf = (entry: PlanEntry) =>
      decideAction(entry, recordsOf(serverMealRecords, entry.target));

    const rows: GroupRow[] = groups.map((group, i) => {
      const match = matches[i];
      const choice = choices[i];
      const candidates = "candidates" in match ? match.candidates : [];
      const target = targetOf(choice);
      if (!target) {
        return {
          group,
          photos: group.photos,
          match,
          candidates,
          choice,
          tab: choice.kind === "undecided" ? "undecided" : "skip",
          existingImages: null,
          overflow: 0,
          detailsKey: null,
        };
      }
      const key = mealRecordKey(target, group.day);
      const entry = entries.get(key);
      const own = new Set(group.photos);
      const action = entry && actionOf(entry);
      return {
        group,
        photos: photosByKey.get(key)!.filter((p) => own.has(p)),
        match,
        candidates,
        choice,
        tab: !action ? "skip" : action.kind === "done" ? "imported" : "ready",
        // Only the record this import adds to: another shop's or a collaboration is left alone.
        existingImages: action?.kind === "resume" ? action.uploaded : null,
        overflow: entry?.overflow ?? 0,
        // An existing same-day record is only added to, so what it says stays as it is.
        detailsKey:
          action?.kind === "create" || action?.kind === "claim"
            ? entry!.key
            : null,
      };
    });

    const summary: PlanSummary = {
      create: 0,
      claim: 0,
      resume: 0,
      done: 0,
      undecided: rows.filter((r) => r.tab === "undecided").length,
    };
    for (const entry of plan.entries) {
      summary[actionOf(entry).kind]++;
    }
    return { rows, summary, plan, photosByKey };
  }, [analysis, review, matches]);

  async function selectFiles(files: readonly File[]) {
    controller.current?.abort();
    const { signal } = (controller.current = new AbortController());
    dispatch({ type: "read", total: files.length });
    try {
      const { photos, rejected } = await readPhotos(files, {
        signal,
        onProgress: (done) => dispatch({ type: "readProgress", done }),
      });
      const groups = groupPhotos(photos);
      const serverMealRecords = await loadServerMealRecords(
        targetsToLoad(groups, shops),
        signal,
      );
      dispatch({
        type: "analyzed",
        analysis: { photos, rejected, groups, serverMealRecords },
      });
    } catch (error) {
      dispatch({ type: "readFailed" });
      if (!signal.aborted) {
        toastFailure(error);
      }
    }
  }

  async function appendFiles(files: readonly File[], analysis: Analysis) {
    controller.current?.abort();
    const { signal } = (controller.current = new AbortController());
    setAdding({ done: 0, total: files.length });
    try {
      const read = await readPhotos(files, {
        signal,
        onProgress: (done) => setAdding({ done, total: files.length }),
      });
      // Indexes go on from the files read so far, so exclusions keep pointing at their photos.
      const offset = analysis.photos.length + analysis.rejected.length;
      const photos = [
        ...analysis.photos,
        ...read.photos.map((p) => ({ ...p, index: p.index + offset })),
      ];
      const groups = groupPhotos(photos);
      // After a run the meal records read before it are out of date: read them all again.
      const stale = state.kind === "finished";
      const loaded = await loadServerMealRecords(
        targetsToLoad(groups, shops, review?.choices.values()).filter(
          (t) => stale || !analysis.serverMealRecords.has(targetKey(t)),
        ),
        signal,
      );
      dispatch({
        type: "appended",
        analysis: {
          photos,
          rejected: [...analysis.rejected, ...read.rejected],
          groups,
          serverMealRecords: new Map([
            ...(stale ? [] : analysis.serverMealRecords),
            ...loaded,
          ]),
        },
      });
    } catch (error) {
      if (!signal.aborted) {
        toastFailure(error);
      }
    } finally {
      setAdding(null);
    }
  }

  /**
   * Starts a selection, or adds to the one under review or just run. A file
   * already selected is skipped, so dropping it again never uploads it twice.
   */
  function addFiles(files: readonly File[]) {
    const reviewing = state.kind === "review" || state.kind === "finished";
    if ((!reviewing && state.kind !== "select") || adding) {
      return;
    }
    const known = new Set(
      reviewing
        ? [
            ...state.analysis.photos.map((p) => p.file),
            ...state.analysis.rejected.map((r) => r.file),
          ].map(fileKey)
        : [],
    );
    const fresh = files.filter((file) => {
      const key = fileKey(file);
      return !known.has(key) && Boolean(known.add(key));
    });
    if (fresh.length === 0) {
      return;
    }
    void (reviewing ? appendFiles(fresh, state.analysis) : selectFiles(fresh));
  }

  async function run() {
    if (state.kind !== "review") {
      return;
    }
    const { plan } = derived;
    controller.current?.abort();
    const { signal } = (controller.current = new AbortController());
    dispatch({ type: "start", plan });
    const outcome = await runImport(plan, {
      signal,
      onProgress: (progress) => dispatch({ type: "progress", progress }),
    });
    dispatch({ type: "finished", outcome });
    await revalidateAllMealRecords();
  }

  /** Back to review, with the server's mealRecords as they are after the run. */
  async function refresh() {
    if (state.kind !== "finished") {
      return;
    }
    controller.current?.abort();
    const { signal } = (controller.current = new AbortController());
    try {
      const serverMealRecords = await loadServerMealRecords(
        targetsToLoad(
          state.analysis.groups,
          shops,
          state.review.choices.values(),
        ),
        signal,
      );
      dispatch({ type: "refreshed", serverMealRecords });
    } catch (error) {
      if (!signal.aborted) {
        toastFailure(error);
      }
    }
  }

  /**
   * Takes the choice, then reads its shop's or venue's mealRecords if not read yet, so the row
   * learns whether that day's record already exists before details are written for it.
   */
  async function choose(groupId: number, choice: ShopChoice) {
    dispatch({ type: "choose", groupId, choice });
    const targets = targetsToLoad([], shops, [choice]).filter(
      (t) => !analysis?.serverMealRecords.has(targetKey(t)),
    );
    if (targets.length === 0) {
      return;
    }
    // Aborted by a new selection, an append or a run, after which these records may be stale.
    const { signal } = controller.current!;
    try {
      const serverMealRecords = await loadServerMealRecords(targets, signal);
      dispatch({ type: "loaded", serverMealRecords });
    } catch (error) {
      if (!signal.aborted) {
        toastFailure(error);
      }
    }
  }

  return {
    state,
    rows: derived.rows,
    summary: derived.summary,
    addFiles,
    /** Photos being added to the selection under review. */
    adding,
    choose,
    /** Takes the group as a shop-less record at `venueName`. */
    chooseVenue: (groupId: number, venueName: string) =>
      choose(groupId, { kind: "venue", venueName: venueName.trim() }),
    togglePhoto: (photoIndex: number) =>
      dispatch({ type: "togglePhoto", photoIndex }),
    /** Swaps a photo with the row's next (delta 1) or previous (-1) one, in its meal record's order. */
    movePhoto: (row: GroupRow, photoIndex: number, delta: -1 | 1) => {
      const shown = row.photos.map((p) => p.index);
      const target = shown[shown.indexOf(photoIndex) + delta];
      if (!row.detailsKey || target === undefined) {
        return;
      }
      const order = derived.photosByKey
        .get(row.detailsKey)!
        .map((p) => p.index);
      const to = order.indexOf(target);
      order.splice(order.indexOf(photoIndex), 1);
      order.splice(to, 0, photoIndex);
      dispatch({ type: "setOrder", key: row.detailsKey, order });
    },
    setDetails: (key: MealRecordKey, details: MealRecordDetails) =>
      dispatch({ type: "setDetails", key, details }),
    run,
    refresh,
    /** Aborts reading or the upload in flight. */
    stop: () => controller.current?.abort(),
    reset: () => dispatch({ type: "reset" }),
  };
}
