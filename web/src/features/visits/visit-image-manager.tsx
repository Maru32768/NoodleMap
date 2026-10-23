import { FormField } from "@/components/form-field.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import {
  enqueueUpload,
  useVisitImageMutations,
  VisitImage,
} from "@/features/visits/api/use-visit-images.ts";
import type { VisitLog } from "@/features/visits/api/use-visits.ts";
import {
  needsConversion,
  prepareImageForUpload,
} from "@/features/visits/prepare-image.ts";
import { VisitImageThumb } from "@/features/visits/visit-image-gallery.tsx";
import { invalidRequestFieldErrors } from "@/utils/request.ts";
import {
  toastApiError,
  toastError,
  VISIT_IMAGE_ALREADY_DELETED_TITLE,
  VISIT_IMAGE_CAPTION_FAILED_TITLE,
  VISIT_IMAGE_CAPTION_MAX_LENGTH,
  VISIT_IMAGE_DELETE_FAILED_TITLE,
  VISIT_IMAGE_LIMIT_MESSAGE,
  VISIT_IMAGE_REORDER_FAILED_TITLE,
  VISIT_IMAGE_UNDECODABLE_MESSAGE,
  VISIT_IMAGES_MAX,
  visitImageCaptionErrorMessage,
  visitImageUploadErrorMessage,
} from "@/utils/toast.ts";
import { Box, Input } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

// A selected file until it is uploaded (then it shows as an image) or failed.
interface PendingFile {
  key: number;
  name: string;
  status: "waiting" | "converting" | "uploading" | "failed";
  message?: string;
}

const PENDING_LABEL: Record<
  Exclude<PendingFile["status"], "failed">,
  string
> = {
  waiting: "待機中",
  converting: "変換中…",
  uploading: "アップロード中…",
};

let nextPendingKey = 0;

const smallButtonProps = {
  variant: "plain",
  px: "6px",
  py: "3px",
  h: "auto",
  minH: "auto",
  minW: "auto",
  fontSize: "11px",
  color: "nm.inkMuted",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmSm",
  bg: "nm.paper",
  _hover: { borderColor: "nm.ink", color: "nm.ink" },
  _disabled: { opacity: 0.4, cursor: "default" },
} as const;

/**
 * The 訪問画像 of one saved 訪問ログ for the admin: add (one upload at a time),
 * reorder, caption and delete. The first image represents the visit.
 * `onBusyChange` reports whether uploads are pending.
 */
export function VisitImageManager({
  shopId,
  visit,
  onBusyChange,
}: {
  shopId: string;
  visit: VisitLog;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { uploadImage, updateCaption, reorderImages, deleteImage } =
    useVisitImageMutations(shopId);
  const images = visit.images;
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VisitImage | null>(null);
  // One reorder at a time: each sends the whole order it was computed from.
  const [reordering, setReordering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inFlight = pending.filter((p) => p.status !== "failed").length;
  const remaining = VISIT_IMAGES_MAX - images.length - inFlight;
  const busy = inFlight > 0;
  useEffect(() => {
    if (!busy) {
      return;
    }
    onBusyChange?.(true);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const updatePending = (key: number, patch: Partial<PendingFile>) =>
    setPending((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePending = (key: number) =>
    setPending((ps) => ps.filter((p) => p.key !== key));

  const upload = async (file: File, key: number) => {
    if (needsConversion(file)) {
      updatePending(key, { status: "converting" });
    }
    // A canvas failure (out of memory, ...) must not leave the file pending.
    const prepared = await prepareImageForUpload(file).catch(() => null);
    if (!prepared?.ok) {
      updatePending(key, {
        status: "failed",
        message: VISIT_IMAGE_UNDECODABLE_MESSAGE,
      });
      return;
    }
    updatePending(key, { status: "uploading" });
    const result = await uploadImage(visit.id, prepared.data);
    if (result.ok) {
      removePending(key);
    } else {
      updatePending(key, {
        status: "failed",
        message: visitImageUploadErrorMessage(result.error),
      });
    }
  };

  const addFiles = (files: File[]) => {
    const entries = files.map((file, i) => ({
      file,
      entry: {
        key: nextPendingKey++,
        name: file.name,
        ...(i < remaining
          ? { status: "waiting" as const }
          : { status: "failed" as const, message: VISIT_IMAGE_LIMIT_MESSAGE }),
      } satisfies PendingFile,
    }));
    setPending((ps) => [...ps, ...entries.map((e) => e.entry)]);
    for (const { file, entry } of entries) {
      if (entry.status === "waiting") {
        void enqueueUpload(() => upload(file, entry.key));
      }
    }
  };

  const move = async (index: number, delta: number) => {
    const ids = images.map((image) => image.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    setReordering(true);
    try {
      const result = await reorderImages(visit.id, ids);
      if (!result.ok) {
        toastApiError(result.error, {
          fallbackTitle: VISIT_IMAGE_REORDER_FAILED_TITLE,
        });
      }
    } finally {
      setReordering(false);
    }
  };

  const handleDelete = async (image: VisitImage) => {
    const result = await deleteImage(image.id);
    if (!result.ok && result.error.type === "not_found") {
      setDeleteTarget(null);
      toastError({ title: VISIT_IMAGE_ALREADY_DELETED_TITLE });
      return;
    }
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: VISIT_IMAGE_DELETE_FAILED_TITLE,
      });
      return;
    }
    setDeleteTarget(null);
    toaster.success({ description: "画像を削除しました" });
  };

  return (
    <Box
      mt="0.625rem"
      pt="0.625rem"
      borderTop="1px dashed"
      borderTopColor="nm.lineFaint"
    >
      {images.length > 0 && (
        <Box
          as="ul"
          aria-label="訪問画像"
          listStyleType="none"
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(132px, 1fr))"
          gap="0.5rem"
          p="0"
          m="0"
          mb="0.5rem"
        >
          {images.map((image, index) => (
            <Box
              as="li"
              key={image.id}
              aria-label={`画像 ${index + 1}`}
              bg="nm.paper"
              border="1px solid"
              borderColor="nm.lineFaint"
              borderRadius="nmMd"
              p="0.375rem"
              display="flex"
              flexDirection="column"
              gap="0.375rem"
            >
              <Box position="relative">
                <VisitImageThumb
                  image={image}
                  alt={image.caption ?? `画像 ${index + 1}`}
                  size={118}
                />
                {index === 0 && (
                  <Box
                    position="absolute"
                    top="4px"
                    left="4px"
                    bg="nm.kincha"
                    color="white"
                    px="5px"
                    py="1px"
                    borderRadius="nmSm"
                    fontSize="10px"
                    fontWeight={600}
                  >
                    代表
                  </Box>
                )}
              </Box>
              {editingCaptionId === image.id ? (
                <CaptionEditor
                  image={image}
                  onSave={updateCaption}
                  onClose={() => setEditingCaptionId(null)}
                />
              ) : (
                <Box
                  fontSize="11px"
                  color={image.caption ? "nm.ink" : "nm.inkFaint"}
                  overflowWrap="anywhere"
                >
                  {image.caption ?? "キャプションなし"}
                </Box>
              )}
              <Box display="flex" flexWrap="wrap" gap="0.25rem">
                <LoadableButton
                  {...smallButtonProps}
                  aria-label={`画像 ${index + 1} を前に移動`}
                  disabled={index === 0 || reordering}
                  onClick={() => move(index, -1)}
                >
                  ←
                </LoadableButton>
                <LoadableButton
                  {...smallButtonProps}
                  aria-label={`画像 ${index + 1} を後ろに移動`}
                  disabled={index === images.length - 1 || reordering}
                  onClick={() => move(index, 1)}
                >
                  →
                </LoadableButton>
                {editingCaptionId !== image.id && (
                  <Button
                    {...smallButtonProps}
                    aria-label={`画像 ${index + 1} のキャプションを編集`}
                    onClick={() => setEditingCaptionId(image.id)}
                  >
                    キャプション
                  </Button>
                )}
                <Button
                  {...smallButtonProps}
                  aria-label={`画像 ${index + 1} を削除`}
                  onClick={() => setDeleteTarget(image)}
                >
                  削除
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {pending.length > 0 && (
        <Box
          as="ul"
          aria-label="追加中の画像"
          listStyleType="none"
          display="flex"
          flexDirection="column"
          gap="0.25rem"
          p="0"
          m="0"
          mb="0.5rem"
        >
          {pending.map((p) => (
            <Box
              as="li"
              key={p.key}
              display="flex"
              alignItems="center"
              gap="0.5rem"
              fontSize="11px"
              px="0.5rem"
              py="0.25rem"
              bg="nm.paper"
              borderRadius="nmSm"
            >
              <Box as="span" flex="1" minW="0" overflowWrap="anywhere">
                {p.name}
              </Box>
              {p.status === "failed" ? (
                <>
                  <Box as="span" role="alert" color="fg.error">
                    {p.message}
                  </Box>
                  <Button
                    {...smallButtonProps}
                    aria-label={`${p.name} の表示を消す`}
                    onClick={() => removePending(p.key)}
                  >
                    ×
                  </Button>
                </>
              ) : (
                <Box as="span" role="status" color="nm.inkMuted">
                  {PENDING_LABEL[p.status]}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Box display="flex" alignItems="center" gap="0.5rem" flexWrap="wrap">
        <Button
          {...smallButtonProps}
          px="10px"
          py="5px"
          disabled={remaining <= 0}
          onClick={() => fileInputRef.current?.click()}
        >
          画像を追加
        </Button>
        <Box as="span" fontSize="11px" color="nm.inkMuted">
          {remaining <= 0
            ? `画像は${VISIT_IMAGES_MAX}枚までです`
            : `あと${remaining}枚・1枚目が代表`}
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          // HEIC and others are converted to JPEG in the browser when it can decode them.
          accept="image/*,.heic,.heif"
          multiple
          hidden
          aria-label="追加する画像ファイル"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            // Lets the same file be chosen again.
            e.target.value = "";
            if (files.length > 0) {
              addFiles(files);
            }
          }}
        />
      </Box>

      <ModalDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        width="100%"
        maxWidth="420px"
        title="画像を削除"
      >
        <Box fontSize="13px" color="nm.ink">
          この画像を削除しますか？この操作は取り消せません。
        </Box>
        <Box display="flex" justifyContent="flex-end" gap="8px" mt="20px">
          <Button
            variant="plain"
            px="14px"
            py="9px"
            h="auto"
            minH="auto"
            fontSize="13px"
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

function CaptionEditor({
  image,
  onSave,
  onClose,
}: {
  image: VisitImage;
  onSave: ReturnType<typeof useVisitImageMutations>["updateCaption"];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(image.caption ?? "");
  const [error, setError] = useState<string>();

  const save = async () => {
    const result = await onSave(image.id, draft);
    if (result.ok) {
      onClose();
      return;
    }
    const captionError = invalidRequestFieldErrors(result.error.body)?.find(
      (e) => e.field === "caption",
    );
    if (captionError) {
      setError(visitImageCaptionErrorMessage(captionError.type));
      return;
    }
    if (result.error.type === "not_found") {
      onClose();
      toastError({ title: VISIT_IMAGE_ALREADY_DELETED_TITLE });
      return;
    }
    toastApiError(result.error, {
      fallbackTitle: VISIT_IMAGE_CAPTION_FAILED_TITLE,
    });
  };

  return (
    <Box display="flex" flexDirection="column" gap="0.25rem">
      <FormField error={error}>
        <Input
          aria-label="キャプション"
          size="xs"
          fontSize="12px"
          bg="white"
          maxLength={VISIT_IMAGE_CAPTION_MAX_LENGTH}
          value={draft}
          autoFocus
          onChange={(e) => {
            setDraft(e.target.value);
            setError(undefined);
          }}
        />
      </FormField>
      <Box display="flex" gap="0.25rem">
        <LoadableButton {...smallButtonProps} onClick={save}>
          保存
        </LoadableButton>
        <Button {...smallButtonProps} onClick={onClose}>
          キャンセル
        </Button>
      </Box>
    </Box>
  );
}
