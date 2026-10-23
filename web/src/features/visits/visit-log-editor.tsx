import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import {
  useVisitMutations,
  useVisits,
  VisitLog,
} from "@/features/visits/api/use-visits.ts";
import {
  purgeFailedUploads,
  useUploadingVisitIds,
} from "@/features/visits/api/visit-uploads.ts";
import { VisitImageManager } from "@/features/visits/visit-image-manager.tsx";
import { VisitLogForm } from "@/features/visits/visit-log-form.tsx";
import {
  formatVisitDate,
  VisitLogList,
  VisitsLoadState,
} from "@/features/visits/visit-log-list.tsx";
import { ApiError } from "@/utils/request.ts";
import {
  toastApiError,
  toastError,
  VISIT_ALREADY_DELETED_TITLE,
  VISIT_DELETE_FAILED_TITLE,
} from "@/utils/toast.ts";
import { Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";

type Editing = { mode: "add" } | { mode: "edit"; visit: VisitLog };

const smallButtonProps = {
  variant: "plain",
  px: "8px",
  py: "4px",
  h: "auto",
  minH: "auto",
  minW: "auto",
  fontSize: "11px",
  color: "nm.inkMuted",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmMd",
  bg: "nm.paper",
  _hover: { borderColor: "nm.ink", color: "nm.ink" },
} as const;

// On an edit or delete: the visit was deleted elsewhere (the list was refetched).
// On an add: the shop itself is gone.
function isGone(error: ApiError) {
  return error.type === "not_found";
}

/**
 * The edit modal's 訪問ログ tab: the shop's visits with add, edit and delete.
 * `onDirtyChange` reports whether an open visit form has unsaved changes,
 * `onBusyChange` whether a visit save or delete is in flight (image uploads
 * are read from their store by the modal), and `onShopGone` that adding
 * failed because the shop was deleted elsewhere.
 */
export function VisitLogEditor({
  shopId,
  onDirtyChange,
  onBusyChange,
  onShopGone,
}: {
  shopId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onShopGone?: () => void;
}) {
  const { visits, error, isValidating, retry } = useVisits(shopId);
  const { addVisit, updateVisit, deleteVisit } = useVisitMutations(shopId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VisitLog | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  // A visit with uploads queued or running cannot be deleted under them.
  const uploadingVisitIds = useUploadingVisitIds(shopId);
  // Failed files of visits deleted (here or elsewhere) have nothing to retry.
  useEffect(() => {
    if (visits) {
      purgeFailedUploads(
        shopId,
        visits.map((visit) => visit.id),
      );
    }
  }, [shopId, visits]);

  const whileBusy = async <T,>(task: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await task();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (visit: VisitLog) => {
    const result = await whileBusy(() => deleteVisit(visit.id));
    if (!result.ok && isGone(result.error)) {
      setDeleteTarget(null);
      toastError({ title: VISIT_ALREADY_DELETED_TITLE });
      return;
    }
    if (!result.ok) {
      toastApiError(result.error, { fallbackTitle: VISIT_DELETE_FAILED_TITLE });
      return;
    }
    setDeleteTarget(null);
    toaster.success({ description: "訪問ログを削除しました" });
  };

  if (editing) {
    const visit = editing.mode === "edit" ? editing.visit : undefined;
    return (
      <VisitLogForm
        // A fresh form per target so its draft starts from that visit.
        key={visit?.id ?? "new"}
        visit={visit}
        onCancel={() => setEditing(null)}
        onDirtyChange={onDirtyChange}
        onSave={async (input) => {
          const result = await whileBusy(() =>
            visit ? updateVisit(visit.id, input) : addVisit(input),
          );
          if (!result.ok && isGone(result.error)) {
            setEditing(null);
            if (visit) {
              toastError({ title: VISIT_ALREADY_DELETED_TITLE });
            } else {
              onShopGone?.();
            }
            return null;
          }
          if (result.ok) {
            setEditing(null);
            toaster.success({ description: "訪問ログを保存しました" });
          }
          return result;
        }}
      />
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap="14px">
      <Box>
        <Button
          variant="plain"
          px="16px"
          py="9px"
          h="auto"
          minH="auto"
          fontSize="13px"
          fontWeight={600}
          rounded="nmMd"
          bg="nm.shu"
          color="white"
          _hover={{ bg: "nm.shuDeep" }}
          onClick={() => setEditing({ mode: "add" })}
        >
          訪問を記録
        </Button>
      </Box>

      <VisitsLoadState
        visits={visits}
        error={error}
        isValidating={isValidating}
        onRetry={retry}
      >
        {(visits) => (
          <VisitLogList
            visits={visits}
            images={(visit) => (
              <VisitImageManager shopId={shopId} visit={visit} />
            )}
            actions={(visit) => (
              <>
                <Button
                  {...smallButtonProps}
                  aria-label="訪問ログを編集"
                  onClick={() => setEditing({ mode: "edit", visit })}
                >
                  編集
                </Button>
                <Button
                  {...smallButtonProps}
                  aria-label="訪問ログを削除"
                  disabled={uploadingVisitIds.has(visit.id)}
                  onClick={() => setDeleteTarget(visit)}
                >
                  削除
                </Button>
              </>
            )}
          />
        )}
      </VisitsLoadState>

      <ModalDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        width="100%"
        maxWidth="420px"
        title="訪問ログを削除"
      >
        <Box fontSize="13px" color="nm.ink">
          {deleteTarget && formatVisitDate(deleteTarget.visitedOn)}
          の訪問ログを削除しますか？この操作は取り消せません。
        </Box>
        <Box display="flex" justifyContent="flex-end" gap="8px" mt="20px">
          <Button
            variant="plain"
            px="14px"
            py="9px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={500}
            rounded="nmMd"
            bg="nm.paper"
            color="nm.inkMuted"
            border="1px solid"
            borderColor="nm.line"
            _hover={{ borderColor: "nm.ink", color: "nm.ink" }}
            onClick={() => setDeleteTarget(null)}
          >
            キャンセル
          </Button>
          <LoadableButton
            variant="plain"
            px="18px"
            py="9px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={600}
            rounded="nmMd"
            bg="nm.shu"
            color="white"
            _hover={{ opacity: 0.9 }}
            onClick={() =>
              deleteTarget ? handleDelete(deleteTarget) : undefined
            }
          >
            削除
          </LoadableButton>
        </Box>
      </ModalDialog>
    </Box>
  );
}
