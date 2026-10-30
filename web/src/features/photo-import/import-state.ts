import type { PhotoGroup } from "@/features/photo-import/grouping.ts";
import type {
  ImportPlan,
  MealRecordDetails,
  MealRecordKey,
  ReviewState,
  ServerMealRecords,
  ShopChoice,
} from "@/features/photo-import/import-plan.ts";
import type { Photo, PhotoRejection } from "@/features/photo-import/photos.ts";

export interface Analysis {
  readonly photos: readonly Photo[];
  readonly rejected: readonly PhotoRejection[];
  readonly groups: readonly PhotoGroup[];
  /** MealRecords of every candidate shop with mealRecordCount > 0 and of every chosen venue. */
  readonly serverMealRecords: ServerMealRecords;
}

export interface RunFailure {
  readonly key: MealRecordKey;
  /** Japanese, from utils/toast.ts; never a backend message. */
  readonly message: string;
  /** The server may have saved it (status 0). The next run settles it by counting. */
  readonly unconfirmed: boolean;
}

export interface RunProgress {
  readonly total: number;
  /** created + claimed + resumed + alreadyDone + failures */
  readonly finished: number;
  readonly created: number;
  readonly claimed: number;
  readonly resumed: number;
  readonly alreadyDone: number;
  readonly uploadedImages: number;
  readonly failures: readonly RunFailure[];
  readonly current: {
    readonly key: MealRecordKey;
    readonly uploaded: number;
    readonly total: number;
  } | null;
}

export type RunOutcome =
  | { readonly kind: "finished"; readonly progress: RunProgress }
  | { readonly kind: "stopped"; readonly progress: RunProgress }
  | { readonly kind: "unauthorized"; readonly progress: RunProgress };

export const runProgressOf = (plan: ImportPlan): RunProgress => ({
  total: plan.entries.length,
  finished: 0,
  created: 0,
  claimed: 0,
  resumed: 0,
  alreadyDone: 0,
  uploadedImages: 0,
  failures: [],
  current: null,
});

const EMPTY_REVIEW: ReviewState = {
  choices: new Map(),
  excluded: new Set(),
  order: new Map(),
  details: new Map(),
};

export type ImportState =
  | { readonly kind: "select" }
  | { readonly kind: "reading"; readonly done: number; readonly total: number }
  | {
      readonly kind: "review";
      readonly analysis: Analysis;
      readonly review: ReviewState;
    }
  | {
      readonly kind: "running";
      readonly analysis: Analysis;
      readonly review: ReviewState;
      readonly plan: ImportPlan;
      readonly progress: RunProgress;
    }
  | {
      readonly kind: "finished";
      readonly analysis: Analysis;
      readonly review: ReviewState;
      readonly plan: ImportPlan;
      readonly outcome: RunOutcome;
    };

export type ImportAction =
  | { readonly type: "read"; readonly total: number }
  | { readonly type: "readProgress"; readonly done: number }
  | { readonly type: "analyzed"; readonly analysis: Analysis }
  | { readonly type: "readFailed" }
  | {
      readonly type: "choose";
      readonly groupId: number;
      readonly choice: ShopChoice;
    }
  | { readonly type: "togglePhoto"; readonly photoIndex: number }
  | {
      readonly type: "setOrder";
      readonly key: MealRecordKey;
      readonly order: readonly number[];
    }
  | {
      readonly type: "setDetails";
      readonly key: MealRecordKey;
      readonly details: MealRecordDetails;
    }
  | { readonly type: "start"; readonly plan: ImportPlan }
  | { readonly type: "progress"; readonly progress: RunProgress }
  | { readonly type: "finished"; readonly outcome: RunOutcome }
  /** Back to review after a run, against the server's mealRecords as they are now. */
  | {
      readonly type: "refreshed";
      readonly serverMealRecords: ServerMealRecords;
    }
  /** MealRecords read during review, such as a venue's the admin just chose. */
  | {
      readonly type: "loaded";
      readonly serverMealRecords: ServerMealRecords;
    }
  /** More photos joined the selection; the admin's decisions stay. */
  | { readonly type: "appended"; readonly analysis: Analysis }
  | { readonly type: "reset" };

export const INITIAL_IMPORT_STATE: ImportState = { kind: "select" };

/** Pure state machine; an action the current state does not accept returns it unchanged. */
export function importReducer(
  state: ImportState,
  action: ImportAction,
): ImportState {
  switch (action.type) {
    case "read":
      return state.kind === "select"
        ? { kind: "reading", done: 0, total: action.total }
        : state;
    case "readProgress":
      return state.kind === "reading" ? { ...state, done: action.done } : state;
    case "analyzed":
      return state.kind === "reading"
        ? { kind: "review", analysis: action.analysis, review: EMPTY_REVIEW }
        : state;
    case "readFailed":
      return state.kind === "reading" ? INITIAL_IMPORT_STATE : state;
    case "choose": {
      if (state.kind !== "review") {
        return state;
      }
      const choices = new Map(state.review.choices);
      choices.set(action.groupId, action.choice);
      return { ...state, review: { ...state.review, choices } };
    }
    case "togglePhoto": {
      if (state.kind !== "review") {
        return state;
      }
      const excluded = new Set(state.review.excluded);
      if (!excluded.delete(action.photoIndex)) {
        excluded.add(action.photoIndex);
      }
      return { ...state, review: { ...state.review, excluded } };
    }
    case "setOrder": {
      if (state.kind !== "review") {
        return state;
      }
      const order = new Map(state.review.order);
      order.set(action.key, action.order);
      return { ...state, review: { ...state.review, order } };
    }
    case "setDetails": {
      if (state.kind !== "review") {
        return state;
      }
      const details = new Map(state.review.details);
      details.set(action.key, action.details);
      return { ...state, review: { ...state.review, details } };
    }
    case "start":
      return state.kind === "review"
        ? {
            kind: "running",
            analysis: state.analysis,
            review: state.review,
            plan: action.plan,
            progress: runProgressOf(action.plan),
          }
        : state;
    case "progress":
      return state.kind === "running"
        ? { ...state, progress: action.progress }
        : state;
    case "finished":
      return state.kind === "running"
        ? {
            kind: "finished",
            analysis: state.analysis,
            review: state.review,
            plan: state.plan,
            outcome: action.outcome,
          }
        : state;
    case "refreshed":
      return state.kind === "finished"
        ? {
            kind: "review",
            analysis: {
              ...state.analysis,
              serverMealRecords: action.serverMealRecords,
            },
            review: state.review,
          }
        : state;
    case "loaded":
      return state.kind === "review"
        ? {
            ...state,
            analysis: {
              ...state.analysis,
              serverMealRecords: new Map([
                ...state.analysis.serverMealRecords,
                ...action.serverMealRecords,
              ]),
            },
          }
        : state;
    case "appended":
      return state.kind === "review" || state.kind === "finished"
        ? { kind: "review", analysis: action.analysis, review: state.review }
        : state;
    case "reset":
      return state.kind === "running" ? state : INITIAL_IMPORT_STATE;
  }
}
