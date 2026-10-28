import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import {
  purgeFailedUploads,
  useUploadingMealRecordIds,
} from "@/features/meal-records/api/meal-record-uploads.ts";
import {
  MealRecord,
  useMealRecordMutations,
  useMealRecords,
} from "@/features/meal-records/api/use-meal-records.ts";
import { MealRecordForm } from "@/features/meal-records/meal-record-form.tsx";
import { MealRecordImageManager } from "@/features/meal-records/meal-record-image-manager.tsx";
import { mealRecordInputProps } from "@/features/meal-records/meal-record-input-props.ts";
import {
  formatMealRecordDate,
  MealRecordList,
  MealRecordsLoadState,
} from "@/features/meal-records/meal-record-list.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import { ApiError } from "@/utils/request.ts";
import {
  MEAL_RECORD_ALREADY_DELETED_TITLE,
  MEAL_RECORD_DELETE_FAILED_TITLE,
  toastApiError,
  toastError,
} from "@/utils/toast.ts";
import { Box, Input } from "@chakra-ui/react";
import { useEffect, useState } from "react";

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

/** The shop's own お気に入り度, kept apart from its meal records' rates; blank clears it. */
function ShopRateEditor({
  rate,
  disabled,
  onSave,
}: {
  rate: number | undefined;
  disabled: boolean;
  onSave: (rate: number | undefined) => Promise<void>;
}) {
  const [draft, setDraft] = useState(rate?.toString() ?? "");
  const value = draft.trim() === "" ? undefined : Number(draft);
  const valid =
    value === undefined ||
    (Number.isFinite(value) && value >= 0 && value <= 100);
  return (
    <Box display="flex" alignItems="center" gap="8px" fontSize="12px">
      <Box color="nm.inkMuted">店舗のお気に入り度（0〜100、空欄で未設定）</Box>
      <Input
        {...mealRecordInputProps}
        aria-label="店舗のお気に入り度"
        type="number"
        min={0}
        max={100}
        step={1}
        w="88px"
        fontFamily="mono"
        placeholder="未設定"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {value !== undefined && valid && <MiniHearts rate={value} />}
      <LoadableButton
        {...smallButtonProps}
        aria-label="店舗のお気に入り度を保存"
        disabled={disabled || !valid || value === rate}
        onClick={() => onSave(value)}
      >
        保存
      </LoadableButton>
    </Box>
  );
}

// On an edit or delete: the meal record was deleted elsewhere (the list was refetched).
// On an add: the shop itself is gone.
function isGone(error: ApiError) {
  return error.type === "not_found";
}

/**
 * The edit modal's 食べた記録 tab: the shop's meal records with add, edit and delete.
 * `onDirtyChange` reports whether an open meal record form has unsaved changes,
 * `onBusyChange` whether a meal record save or delete is in flight (image uploads
 * are read from their store by the modal), and `onShopGone` that adding
 * failed because the shop was deleted elsewhere.
 */
export function MealRecordEditor({
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
  const { mealRecords, error, isValidating, retry } = useMealRecords(shopId);
  const { shops, setRepresentativeMealRecord, setShopRate } = useShops();
  const shop = shops?.find((shop) => shop.id === shopId);
  const representativeId = shop?.representativeMealRecordId;
  const { addMealRecord, updateMealRecord, deleteMealRecord } =
    useMealRecordMutations();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MealRecord | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  // A meal record with uploads queued or running cannot be deleted under them.
  const uploadingMealRecordIds = useUploadingMealRecordIds();
  // Failed files of meal records deleted (here or elsewhere) have nothing to retry.
  useEffect(() => {
    if (mealRecords) {
      purgeFailedUploads(
        shopId,
        mealRecords.map((mealRecord) => mealRecord.id),
      );
    }
  }, [shopId, mealRecords]);

  const whileBusy = async <T,>(task: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await task();
    } finally {
      setBusy(false);
    }
  };

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

  const handleRepresentative = async (mealRecordId?: string) => {
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

  if (editing) {
    const mealRecord = editing.mode === "edit" ? editing.mealRecord : undefined;
    return (
      <MealRecordForm
        shopId={shopId}
        // A fresh form per target so its draft starts from that mealRecord.
        key={mealRecord?.id ?? "new"}
        mealRecord={mealRecord}
        onCancel={() => setEditing(null)}
        onDirtyChange={onDirtyChange}
        onSave={async (input) => {
          const result = await whileBusy(() =>
            mealRecord
              ? updateMealRecord(mealRecord.id, input)
              : addMealRecord(input),
          );
          if (!result.ok && isGone(result.error)) {
            setEditing(null);
            if (mealRecord) {
              toastError({ title: MEAL_RECORD_ALREADY_DELETED_TITLE });
            } else {
              onShopGone?.();
            }
            return null;
          }
          if (result.ok) {
            setEditing(null);
            toaster.success({ description: "食べた記録を保存しました" });
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
          disabled={busy}
        >
          食べた記録を追加
        </Button>
      </Box>

      {shop && (
        <ShopRateEditor
          // Restarts the draft when the saved rate changes.
          key={shop.rate ?? "unset"}
          rate={shop.rate}
          disabled={busy}
          onSave={async (rate) => {
            const result = await whileBusy(() => setShopRate(shopId, rate));
            if (!result.ok) {
              toastApiError(result.error, {
                fallbackTitle: "店舗のお気に入り度を保存できませんでした",
              });
              return;
            }
            toaster.success({
              description: "店舗のお気に入り度を保存しました",
            });
          }}
        />
      )}

      <Box fontSize="12px" color="nm.inkMuted">
        代表に選んだ記録の1枚目の画像を、店舗詳細と共有時のOGPに使います。未選択の場合や画像がない場合は、画像付きの最新の記録を使います。
        {representativeId && (
          <LoadableButton
            {...smallButtonProps}
            ml="8px"
            disabled={busy}
            onClick={() => handleRepresentative()}
          >
            自動選択に戻す
          </LoadableButton>
        )}
      </Box>

      <MealRecordsLoadState
        mealRecords={mealRecords}
        error={error}
        isValidating={isValidating}
        onRetry={retry}
      >
        {(mealRecords) => (
          <MealRecordList
            mealRecords={mealRecords}
            contextShopId={shopId}
            navigation={false}
            images={(mealRecord) => (
              <MealRecordImageManager shopId={shopId} mealRecord={mealRecord} />
            )}
            actions={(mealRecord) => (
              <>
                {representativeId === mealRecord.id ? (
                  <Box
                    as="span"
                    fontSize="11px"
                    color="nm.shu"
                    fontWeight={600}
                  >
                    代表に選択中
                  </Box>
                ) : (
                  <LoadableButton
                    {...smallButtonProps}
                    disabled={busy || !shops}
                    onClick={() => handleRepresentative(mealRecord.id)}
                  >
                    代表にする
                  </LoadableButton>
                )}
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
                  disabled={busy || uploadingMealRecordIds.has(mealRecord.id)}
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
