import { groupPhotos, PhotoGroup } from "@/features/photo-import/grouping.ts";
import {
  buildPlan,
  decideAction,
  defaultChoice,
  EntryAction,
  PlanEntry,
  ServerVisits,
  ShopChoice,
  visitKey,
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
import { readPhotos } from "@/features/photo-import/photos.ts";
import { runImport } from "@/features/photo-import/run-import.ts";
import type { Shop } from "@/features/shops/api/use-shops.ts";
import {
  fetchVisits,
  useRevalidateAllVisits,
  VisitLog,
} from "@/features/visits/api/use-visits.ts";
import { forEachConcurrently } from "@/utils/concurrency.ts";
import { isApiError } from "@/utils/request.ts";
import { toastApiError, toastError } from "@/utils/toast.ts";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

export type RowTab = "undecided" | "ready" | "imported" | "skip";

/** One review row. Derived each render from analysis + review + current shops; never stored. */
export interface GroupRow {
  readonly group: PhotoGroup;
  readonly match: Match;
  readonly candidates: readonly Candidate[];
  /** review.choices.get(id) ?? defaultChoice(...) */
  readonly choice: ShopChoice;
  readonly tab: RowTab;
  /** Images already on that (shop, day) visit; null when it has none. */
  readonly existingImages: number | null;
  /** Photos of its (shop, day) beyond the per-visit cap. */
  readonly overflow: number;
}

export type PlanSummary = Record<EntryAction["kind"], number> &
  Record<"undecided", number>;

const LOAD_CONCURRENCY = 4;

// A file picked, dropped or pasted twice is the same photo. lastModified is
// left out: a photo exported to two folders carries two different ones.
const fileKey = (file: File) => `${file.name}|${file.size}`;

/** Every listed shop's visits; a failure rejects, since a plan on partial truth would duplicate. */
async function loadServerVisits(
  shopIds: readonly string[],
  signal: AbortSignal,
): Promise<ServerVisits> {
  const visits = new Map<string, readonly VisitLog[]>();
  await forEachConcurrently(shopIds, LOAD_CONCURRENCY, signal, async (id) => {
    visits.set(id, await fetchVisits(id));
  });
  return visits;
}

/** Shops with visits among the candidates of any group: the only ones decideAction needs. */
function shopsToLoad(groups: readonly PhotoGroup[], shops: readonly Shop[]) {
  const ids = new Set<string>();
  for (const group of groups) {
    const match = matchShop(group.center, shops);
    for (const c of "candidates" in match ? match.candidates : []) {
      if (c.shop.visitCount > 0) {
        ids.add(c.shop.id);
      }
    }
  }
  return [...ids];
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
  const revalidateAllVisits = useRevalidateAllVisits();
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
      return { rows: [], summary: null, plan: { entries: [] } };
    }
    const { groups, serverVisits } = analysis;
    const choices = groups.map(
      (group, i) =>
        review.choices.get(group.id) ??
        defaultChoice(group, matches[i], serverVisits),
    );
    const choiceByGroup = new Map(groups.map((g, i) => [g, choices[i]]));
    const plan = buildPlan(
      groups,
      (g) => choiceByGroup.get(g)!,
      review.excluded,
    );
    const entries = new Map<string, PlanEntry>(
      plan.entries.map((e) => [e.key, e]),
    );
    const actionOf = (entry: PlanEntry) =>
      decideAction(entry, serverVisits.get(entry.shopId) ?? []);

    const rows: GroupRow[] = groups.map((group, i) => {
      const match = matches[i];
      const choice = choices[i];
      const candidates = "candidates" in match ? match.candidates : [];
      if (choice.kind !== "shop") {
        return {
          group,
          match,
          candidates,
          choice,
          tab: choice.kind === "undecided" ? "undecided" : "skip",
          existingImages: null,
          overflow: 0,
        };
      }
      const entry = entries.get(visitKey(choice.shopId, group.day));
      const sameDay = (serverVisits.get(choice.shopId) ?? []).filter(
        (v) => v.visitedOn === group.day,
      );
      return {
        group,
        match,
        candidates,
        choice,
        tab: !entry
          ? "skip"
          : actionOf(entry).kind === "done"
            ? "imported"
            : "ready",
        existingImages: sameDay.length
          ? Math.max(...sameDay.map((v) => v.images.length))
          : null,
        overflow: entry?.overflow ?? 0,
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
    return { rows, summary, plan };
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
      const serverVisits = await loadServerVisits(
        shopsToLoad(groups, shops),
        signal,
      );
      dispatch({
        type: "analyzed",
        analysis: { photos, rejected, groups, serverVisits },
      });
    } catch (error) {
      dispatch({ type: "readFailed" });
      if (!signal.aborted) {
        toastFailure(error);
      }
    }
  }

  async function appendFiles(files: readonly File[], analysis: Analysis) {
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
      // After a run the visits read before it are out of date: read them all again.
      const stale = state.kind === "finished";
      const loaded = await loadServerVisits(
        shopsToLoad(groups, shops).filter(
          (id) => stale || !analysis.serverVisits.has(id),
        ),
        signal,
      );
      dispatch({
        type: "appended",
        analysis: {
          photos,
          rejected: [...analysis.rejected, ...read.rejected],
          groups,
          serverVisits: new Map([
            ...(stale ? [] : analysis.serverVisits),
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
    const { signal } = (controller.current = new AbortController());
    dispatch({ type: "start", plan });
    const outcome = await runImport(plan, {
      signal,
      onProgress: (progress) => dispatch({ type: "progress", progress }),
    });
    dispatch({ type: "finished", outcome });
    await revalidateAllVisits();
  }

  /** Back to review, with the server's visits as they are after the run. */
  async function refresh() {
    if (state.kind !== "finished") {
      return;
    }
    const { signal } = (controller.current = new AbortController());
    try {
      const serverVisits = await loadServerVisits(
        shopsToLoad(state.analysis.groups, shops),
        signal,
      );
      dispatch({ type: "refreshed", serverVisits });
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
    choose: (groupId: number, choice: ShopChoice) =>
      dispatch({ type: "choose", groupId, choice }),
    togglePhoto: (photoIndex: number) =>
      dispatch({ type: "togglePhoto", photoIndex }),
    run,
    refresh,
    /** Aborts reading or the upload in flight. */
    stop: () => controller.current?.abort(),
    reset: () => dispatch({ type: "reset" }),
  };
}
