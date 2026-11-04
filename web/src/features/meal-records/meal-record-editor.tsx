import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import {
  MealRecord,
  useMealRecordMutations,
  useMealRecords,
} from "@/features/meal-records/api/use-meal-records.ts";
import {
  MealRecordForm,
  RecordScope,
} from "@/features/meal-records/meal-record-form.tsx";
import {
  formatMealRecordDate,
  MealRecordList,
  MealRecordsLoadState,
} from "@/features/meal-records/meal-record-list.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { ApiError } from "@/utils/request.ts";
import {
  MEAL_RECORD_ALREADY_DELETED_TITLE,
  MEAL_RECORD_DELETE_FAILED_TITLE,
  toastApiError,
  toastError,
} from "@/utils/toast.ts";
import { Box } from "@chakra-ui/react";
import { ReactNode, useEffect, useState } from "react";

type Editing = { mode: "add" } | { mode: "edit"; mealRecord: MealRecord };

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

// On an edit or delete: the meal record was deleted elsewhere (the list was refetched).
// On an add: a chosen shop is gone.
function isGone(error: ApiError) {
  return error.type === "not_found";
}

/** Busy state shared by the list and the shop's own controls, so one write runs at a time. */
interface BusyControl {
  busy: boolean;
  whileBusy: <T>(task: () => Promise<T>) => Promise<T>;
}

/**
 * The edit modal's 食べた記録 tab: the shop's meal records with add, edit and delete,
 * plus the shop's 代表写真.
 * `onDirtyChange` reports whether an open meal record form has unsaved changes,
 * `onBusyChange` whether a meal record save (images included) or delete is in
 * flight, `onFormOpenChange` whether a form is open, and `onShopGone` that adding
 * failed because the shop was deleted elsewhere.
 */
export function MealRecordEditor({
  shopId,
  onDirtyChange,
  onBusyChange,
  onFormOpenChange,
  onShopGone,
}: {
  shopId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onFormOpenChange?: (open: boolean) => void;
  onShopGone?: () => void;
}) {
  const records = useMealRecords(shopId);
  const { shops, setRepresentativeMealRecord } = useShops();
  const shop = shops?.find((shop) => shop.id === shopId);
  const representativeId = shop?.representativeMealRecordId;

  const handleRepresentative = async (
    { whileBusy }: BusyControl,
    mealRecordId?: string,
  ) => {
    const result = await whileBusy(() =>
      setRepresentativeMealRecord(shopId, mealRecordId),
    );
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: "代表の食べた記録を変更できませんでした",
      });
      return;
    }
    toaster.success({
      description: mealRecordId
        ? "代表の食べた記録を設定しました"
        : "代表写真を自動選択に戻しました",
    });
  };

  return (
    <MealRecordsAdmin
      scope={{ kind: "shop", shopId }}
      mealRecords={records.mealRecords}
      error={records.error}
      isValidating={records.isValidating}
      onRetry={records.retry}
      onDirtyChange={onDirtyChange}
      onBusyChange={onBusyChange}
      onFormOpenChange={onFormOpenChange}
      onAddGone={onShopGone}
      tools={(control) => (
        <Box fontSize="12px" color="nm.inkMuted">
          代表に選んだ記録の1枚目の画像を、店舗詳細と共有時のOGPに使います。未選択の場合や画像がない場合は、画像付きの最新の記録を使います。
          {representativeId && (
            <LoadableButton
              {...smallButtonProps}
              ml="8px"
              disabled={control.busy}
              onClick={() => handleRepresentative(control)}
            >
              自動選択に戻す
            </LoadableButton>
          )}
        </Box>
      )}
      recordActions={(mealRecord, control) =>
        representativeId === mealRecord.id ? (
          <Box as="span" fontSize="11px" color="nm.shu" fontWeight={600}>
            代表に選択中
          </Box>
        ) : (
          <LoadableButton
            {...smallButtonProps}
            disabled={control.busy || !shops}
            onClick={() => handleRepresentative(control, mealRecord.id)}
          >
            代表にする
          </LoadableButton>
        )
      }
    />
  );
}

/**
 * The admin's 食べた記録 of one shop or venue: add, edit (images included) and delete.
 * `tools` renders above the list and `recordActions` before each record's
 * edit and delete, both sharing the busy state. `onAddGone` handles an add
 * the server answered with not_found; without it the form shows the error.
 */
export function MealRecordsAdmin({
  scope,
  mealRecords,
  error,
  isValidating,
  onRetry,
  onDirtyChange,
  onBusyChange,
  onFormOpenChange,
  onAddGone,
  tools,
  recordActions,
}: {
  scope: RecordScope;
  mealRecords: readonly MealRecord[] | undefined;
  error: unknown;
  isValidating: boolean;
  onRetry: () => Promise<unknown>;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onFormOpenChange?: (open: boolean) => void;
  onAddGone?: () => void;
  tools?: (control: BusyControl) => ReactNode;
  recordActions?: (mealRecord: MealRecord, control: BusyControl) => ReactNode;
}) {
  const { addMealRecord, updateMealRecord, deleteMealRecord } =
    useMealRecordMutations();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MealRecord | null>(null);
  const [busy, setBusy] = useState(false);
  // Unmounted (the modal's other tab) nothing here is left to wait for or hide.
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const formOpen = editing !== null;
  useEffect(() => {
    onFormOpenChange?.(formOpen);
    return () => onFormOpenChange?.(false);
  }, [formOpen, onFormOpenChange]);
  const whileBusy = async <T,>(task: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await task();
    } finally {
      setBusy(false);
    }
  };
  const control: BusyControl = { busy, whileBusy };

  const handleDelete = async (mealRecord: MealRecord) => {
    const result = await whileBusy(() => deleteMealRecord(mealRecord.id));
    if (!result.ok && isGone(result.error)) {
      setDeleteTarget(null);
      toastError({ title: MEAL_RECORD_ALREADY_DELETED_TITLE });
      return;
    }
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: MEAL_RECORD_DELETE_FAILED_TITLE,
      });
      return;
    }
    setDeleteTarget(null);
    toaster.success({ description: "食べた記録を削除しました" });
  };

  if (editing) {
    const mealRecord = editing.mode === "edit" ? editing.mealRecord : undefined;
    return (
      <Box display="flex" flexDirection="column" gap="10px">
        <Box as="h2" fontSize="14px" fontWeight={600} color="nm.ink">
          {mealRecord ? "食べた記録を編集" : "食べた記録を追加"}
        </Box>
        <MealRecordForm
          scope={scope}
          // A fresh form per target so its draft starts from that mealRecord.
          key={mealRecord?.id ?? "new"}
          mealRecord={mealRecord}
          onCancel={() => setEditing(null)}
          onDirtyChange={onDirtyChange}
          onBusyChange={setBusy}
          onSave={async (input, savedId) => {
            const id = savedId ?? mealRecord?.id;
            const result = await (id
              ? updateMealRecord(id, input)
              : addMealRecord(input));
            if (!result.ok && isGone(result.error) && (id || onAddGone)) {
              setEditing(null);
              if (id) {
                toastError({ title: MEAL_RECORD_ALREADY_DELETED_TITLE });
              } else {
                onAddGone?.();
              }
              return null;
            }
            return result;
          }}
          onSaved={() => {
            setEditing(null);
            toaster.success({ description: "食べた記録を保存しました" });
          }}
        />
      </Box>
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
          disabled={busy}
        >
          食べた記録を追加
        </Button>
      </Box>

      {tools?.(control)}

      <MealRecordsLoadState
        mealRecords={mealRecords}
        error={error}
        isValidating={isValidating}
        onRetry={onRetry}
      >
        {(mealRecords) => (
          <MealRecordList
            mealRecords={mealRecords}
            contextShopId={scope.kind === "shop" ? scope.shopId : undefined}
            navigation={false}
            actions={(mealRecord) => (
              <>
                {recordActions?.(mealRecord, control)}
                <Button
                  {...smallButtonProps}
                  aria-label="食べた記録を編集"
                  onClick={() => setEditing({ mode: "edit", mealRecord })}
                  disabled={busy}
                >
                  編集
                </Button>
                <Button
                  {...smallButtonProps}
                  aria-label="食べた記録を削除"
                  disabled={busy}
                  onClick={() => setDeleteTarget(mealRecord)}
                >
                  削除
                </Button>
              </>
            )}
          />
        )}
      </MealRecordsLoadState>

      <ModalDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        width="100%"
        maxWidth="420px"
        title="食べた記録を削除"
      >
        <Box fontSize="13px" color="nm.ink">
          {deleteTarget && formatMealRecordDate(deleteTarget.eatenOn)}
          の食べた記録を削除しますか？紐づいているすべての店舗からこの記録が削除されます。この操作は取り消せません。
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
