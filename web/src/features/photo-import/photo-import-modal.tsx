import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { GroupReviewList } from "@/features/photo-import/group-review-list.tsx";
import type { VisitKey } from "@/features/photo-import/import-plan.ts";
import type {
  ImportState,
  RunProgress,
} from "@/features/photo-import/import-state.ts";
import type { PhotoRejection } from "@/features/photo-import/photos.ts";
import {
  PlanSummary,
  usePhotoImport,
} from "@/features/photo-import/use-photo-import.ts";
import type { Shop } from "@/features/shops/api/use-shops.ts";
import { Box } from "@chakra-ui/react";
import { ComponentProps, ReactNode, useEffect, useRef } from "react";
import { LuImagePlus } from "react-icons/lu";

const REJECTION_LABELS: Record<PhotoRejection["reason"], string> = {
  no_capture_time: "撮影日時なし",
  future: "撮影日時が未来",
  not_jpeg: "JPEG以外",
  unreadable: "読み取れない",
};

const outlineButton = {
  variant: "plain",
  px: "14px",
  py: "8px",
  h: "auto",
  minH: "auto",
  fontSize: "13px",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmMd",
  _hover: { borderColor: "nm.ink" },
} as const;

const primaryButton = {
  variant: "plain",
  px: "16px",
  py: "8px",
  h: "auto",
  minH: "auto",
  fontSize: "13px",
  fontWeight: 600,
  bg: "nm.shu",
  color: "white",
  rounded: "nmMd",
  _hover: { bg: "nm.shuDeep" },
} as const;

/**
 * Turns iPhone photos into 訪問ログ: pick JPEGs, review how they were grouped
 * and matched to shops, then create the visits and upload the photos. Closing
 * is refused while the import runs.
 */
export function PhotoImportModal({
  shops,
  open,
  onClose,
  onShopsChanged,
  PlaceFinder,
}: {
  shops: readonly Shop[];
  open: boolean;
  onClose: () => void;
  /** Called once on close when an import ran: 食べた, visitCount and 代表写真 changed. */
  onShopsChanged: () => void;
  // Replaceable because its WebGL map cannot render in jsdom tests.
  PlaceFinder?: ComponentProps<typeof GroupReviewList>["PlaceFinder"];
}) {
  const imp = usePhotoImport(shops);
  const { state } = imp;
  const running = state.kind === "running";
  const ran = useRef(false);

  useEffect(() => {
    if (!running) {
      return;
    }
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const close = () => {
    if (running) {
      return;
    }
    imp.stop();
    if (ran.current) {
      onShopsChanged();
    }
    onClose();
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && close()}
      width="100%"
      maxWidth="1100px"
      height="90vh"
      title="写真から取り込み"
      subtitle="PHOTO IMPORT"
      icon={<LuImagePlus size={18} />}
      iconBg="nm.ink"
      showCloseButton={!running}
      bodyProps={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      {state.kind === "select" && <PhotoPicker onSelect={imp.selectFiles} />}
      {state.kind === "reading" && (
        <Box color="nm.inkMuted" fontSize="13px" py="24px" textAlign="center">
          {state.done < state.total
            ? `${state.done} / ${state.total} 枚を読み込み中`
            : "訪問ログを確認中"}
        </Box>
      )}
      {(state.kind === "review" ||
        state.kind === "running" ||
        state.kind === "finished") && (
        <>
          <ImportHeader
            state={state}
            summary={imp.summary!}
            shops={shops}
            onRun={() => {
              ran.current = true;
              void imp.run();
            }}
            onStop={imp.stop}
            onRefresh={imp.refresh}
            onReset={imp.reset}
          />
          <GroupReviewList
            rows={imp.rows}
            shops={shops}
            readOnly={state.kind !== "review"}
            excluded={state.review.excluded}
            onChoose={imp.choose}
            onTogglePhoto={imp.togglePhoto}
            PlaceFinder={PlaceFinder}
          />
        </>
      )}
    </ModalDialog>
  );
}

function PhotoPicker({ onSelect }: { onSelect: (files: File[]) => void }) {
  return (
    <Box
      display="grid"
      placeItems="center"
      gap="12px"
      py="48px"
      border="1px dashed"
      borderColor="nm.line"
      rounded="nmLg"
      textAlign="center"
    >
      <Box fontSize="13px" color="nm.inkMuted" lineHeight="1.8">
        iPhoneで撮った写真（JPEG・互換性優先）をまとめて選んでください。
        <br />
        撮影日時と位置から訪問をまとめ、登録済みの店舗に割り当てます。
      </Box>
      <Box as="label" {...primaryButton} cursor="pointer">
        写真を選ぶ
        <input
          type="file"
          multiple
          accept="image/jpeg,.jpg,.jpeg"
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length > 0) {
              onSelect(files);
            }
          }}
        />
      </Box>
    </Box>
  );
}

function ImportHeader({
  state,
  summary,
  shops,
  onRun,
  onStop,
  onRefresh,
  onReset,
}: {
  state: Extract<ImportState, { kind: "review" | "running" | "finished" }>;
  summary: PlanSummary;
  shops: readonly Shop[];
  onRun: () => void;
  onStop: () => void;
  onRefresh: () => Promise<void>;
  onReset: () => void;
}) {
  const shopName = (key: VisitKey) => {
    const [shopId, day] = key.split("|");
    return `${shops.find((s) => s.id === shopId)?.name ?? "削除された店舗"} ${day}`;
  };
  const rejectedBy = new Map<PhotoRejection["reason"], number>();
  for (const { reason } of state.analysis.rejected) {
    rejectedBy.set(reason, (rejectedBy.get(reason) ?? 0) + 1);
  }
  const rejected = [...rejectedBy].map(
    ([reason, n]) => `${REJECTION_LABELS[reason]} ${n}枚`,
  );
  const work = summary.create + summary.claim + summary.resume;

  let body: ReactNode;
  if (state.kind === "review") {
    body = (
      <>
        <Line>
          {summary.create} 件の訪問を作成 / {summary.claim}{" "}
          件の日付不明ログに日付を付ける / {summary.resume} 件に画像を追加 /{" "}
          {summary.done} 件は取り込み済み / 要確認 {summary.undecided}{" "}
          件は取り込まれません
        </Line>
        {rejected.length > 0 && (
          <Line muted>取り込めない写真: {rejected.join("、")}</Line>
        )}
        <Actions>
          <Button {...outlineButton} onClick={onReset}>
            写真を選び直す
          </Button>
          <Button {...primaryButton} disabled={work === 0} onClick={onRun}>
            取り込む
          </Button>
        </Actions>
      </>
    );
  } else if (state.kind === "running") {
    const { current } = state.progress;
    body = (
      <>
        <ProgressLine progress={state.progress} />
        {current && (
          <Line muted>
            {shopName(current.key)}（画像 {current.uploaded} / {current.total}）
          </Line>
        )}
        <Failures progress={state.progress} shopName={shopName} />
        <Actions>
          <Button {...outlineButton} onClick={onStop}>
            停止
          </Button>
        </Actions>
      </>
    );
  } else {
    const { outcome } = state;
    body = (
      <>
        <Line>
          {outcome.kind === "finished"
            ? "取り込みが完了しました"
            : outcome.kind === "stopped"
              ? "取り込みを停止しました"
              : "ログインが切れたため停止しました。ログインし直してから、もう一度取り込んでください"}
        </Line>
        <ProgressLine progress={outcome.progress} />
        <Failures progress={outcome.progress} shopName={shopName} />
        <Actions>
          <Button {...outlineButton} onClick={onReset}>
            写真を選び直す
          </Button>
          <Button {...outlineButton} onClick={() => void onRefresh()}>
            確認に戻る
          </Button>
        </Actions>
      </>
    );
  }

  return (
    <Box
      display="grid"
      gap="6px"
      p="12px"
      bg="nm.bg"
      border="1px solid"
      borderColor="nm.lineFaint"
      rounded="nmMd"
      flexShrink={0}
    >
      {body}
    </Box>
  );
}

function ProgressLine({ progress }: { progress: RunProgress }) {
  return (
    <Line>
      訪問 {progress.finished} / {progress.total} · 作成 {progress.created} ·
      日付を付与 {progress.claimed} · 画像を追加 {progress.resumed} ·
      取り込み済み {progress.alreadyDone} · 画像 {progress.uploadedImages} 枚 ·
      失敗 {progress.failures.length}
    </Line>
  );
}

function Failures({
  progress,
  shopName,
}: {
  progress: RunProgress;
  shopName: (key: VisitKey) => string;
}) {
  if (progress.failures.length === 0) {
    return null;
  }
  return (
    <Box
      as="ul"
      aria-label="取り込めなかった訪問"
      maxH="120px"
      overflowY="auto"
      fontSize="12px"
      color="nm.shuDeep"
      pl="16px"
    >
      {progress.failures.map((f) => (
        <li key={f.key}>
          {shopName(f.key)}: {f.message}
        </li>
      ))}
    </Box>
  );
}

function Line({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Box fontSize="13px" color={muted ? "nm.inkMuted" : "nm.ink"}>
      {children}
    </Box>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <Box display="flex" justifyContent="flex-end" gap="8px">
      {children}
    </Box>
  );
}
