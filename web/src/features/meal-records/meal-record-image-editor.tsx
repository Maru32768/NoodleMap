import { FieldError, FormField } from "@/components/form-field.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useRefuseFileDrop } from "@/components/use-refuse-file-drop.ts";
import type { ImageDraft } from "@/features/meal-records/meal-record-image-draft.ts";
import { MealRecordImageThumb } from "@/features/meal-records/meal-record-image-gallery.tsx";
import { formatShopDate } from "@/features/shops/status.ts";
import {
  MEAL_RECORD_IMAGE_CAPTION_MAX_LENGTH,
  MEAL_RECORD_IMAGE_NOT_IMAGE_MESSAGE,
  MEAL_RECORD_IMAGES_MAX,
  toastError,
} from "@/utils/toast.ts";
import { Box, Input, useMediaQuery } from "@chakra-ui/react";
import {
  DragEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";

const THUMB_SIZE = 118;

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

// HEIC and others are converted to JPEG in the browser when it can decode
// them. HEIC may come without a MIME type, hence the extensions.
const IMAGE_ACCEPT = ["image/*", ".heic", ".heif"];

/** Whether the file input would offer `file`; drops and pastes take the same. */
function isImageFile(file: File) {
  const name = file.name.toLowerCase();
  return IMAGE_ACCEPT.some((accept) =>
    accept.startsWith(".")
      ? name.endsWith(accept)
      : file.type.startsWith(accept.slice(0, -1)),
  );
}

// Marks a drag that started in the page (a thumbnail): it is never an upload.
const INTERNAL_DRAG_TYPE = "application/x-noodlemap-internal";

/**
 * Whether a drag over the area may carry images: files from outside the page
 * and, when the browser tells the types, not only non-images. HEIC may come
 * without a type.
 */
function mayDropImages(event: DragEvent) {
  const { types, items } = event.dataTransfer;
  if (!types.includes("Files") || types.includes(INTERNAL_DRAG_TYPE)) {
    return false;
  }
  const fileTypes = Array.from(items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.type);
  return (
    fileTypes.length === 0 ||
    fileTypes.some((type) => type === "" || type.startsWith("image/"))
  );
}

const isTextInput = (element: Element | null) =>
  element instanceof HTMLElement &&
  (element.isContentEditable || element.matches("input, textarea"));

/**
 * The 記録の画像 of a 食べた記録 form: add (from the file input, a drop or a paste
 * while focus is in the area), reorder, caption and remove, all in the form's
 * draft. The first image represents the record. `disabled` refuses drops and
 * pastes while the form saves; the form disables the controls itself.
 */
export function MealRecordImageEditor({
  draft,
  eatenOn,
  disabled,
}: {
  draft: ImageDraft;
  eatenOn: string | undefined;
  disabled: boolean;
}) {
  const { items, add, remove, move, setCaption } = draft;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  // dragenter/dragleave fire for every child crossed; Safari gives no
  // relatedTarget, so the highlight counts the levels entered.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  // Touch screens can neither drag a file in nor paste one here.
  const [finePointer] = useMediaQuery(["(pointer: fine)"]);
  useRefuseFileDrop();

  const remaining = MEAL_RECORD_IMAGES_MAX - items.length;
  const canAdd = remaining > 0;
  const canDrop = canAdd && !disabled;

  /** Adds the image files; others are refused with a message. */
  const addDroppedFiles = (files: File[]) => {
    if (disabled) {
      return;
    }
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length < files.length) {
      toastError({ title: MEAL_RECORD_IMAGE_NOT_IMAGE_MESSAGE });
    }
    if (imageFiles.length > 0) {
      add(imageFiles);
    }
  };

  const endDrag = useCallback(() => {
    dragDepth.current = 0;
    setDragging(false);
  }, []);

  // A drag cancelled or dropped elsewhere may never leave the area.
  useEffect(() => {
    window.addEventListener("dragend", endDrag);
    window.addEventListener("drop", endDrag);
    return () => {
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("drop", endDrag);
    };
  }, [endDrag]);

  const handleDragEnter = (event: DragEvent) => {
    if (!mayDropImages(event)) {
      return;
    }
    event.preventDefault();
    dragDepth.current++;
    setDragging(canDrop);
  };

  const handleDragOver = (event: DragEvent) => {
    if (!mayDropImages(event)) {
      return;
    }
    // Without this the browser opens a file dropped here.
    event.preventDefault();
    event.dataTransfer.dropEffect = canDrop ? "copy" : "none";
  };

  const handleDragLeave = (event: DragEvent) => {
    if (!mayDropImages(event)) {
      return;
    }
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  };

  const handleDrop = (event: DragEvent) => {
    if (!mayDropImages(event)) {
      return;
    }
    event.preventDefault();
    endDrag();
    addDroppedFiles(Array.from(event.dataTransfer.files));
  };

  // On the document: Safari may not send a paste to a focused element that
  // is not editable. Only a paste while focus is in this area counts, and a
  // caption keeps its own paste.
  const handlePaste = useEffectEvent((event: ClipboardEvent) => {
    const focused = document.activeElement;
    if (
      !focused ||
      !areaRef.current?.contains(focused) ||
      isTextInput(focused)
    ) {
      return;
    }
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      addDroppedFiles(files);
    }
  });
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <Box
      ref={areaRef}
      role="group"
      aria-label={`画像（${formatShopDate(eatenOn) ?? "日付不明"}）`}
      aria-describedby={canAdd && finePointer ? hintId : undefined}
      // Focusable so a paste can be meant for it.
      tabIndex={0}
      outline={dragging ? "2px dashed" : undefined}
      outlineColor="nm.shu"
      outlineOffset="2px"
      bg={dragging ? "nm.bg" : undefined}
      data-dragging={dragging || undefined}
      _focusVisible={{ outline: "2px solid", outlineColor: "nm.ink" }}
      onDragStartCapture={(event) =>
        event.dataTransfer.setData(INTERNAL_DRAG_TYPE, "1")
      }
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {items.length > 0 && (
        <Box
          as="ul"
          aria-label="記録の画像"
          listStyleType="none"
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(132px, 1fr))"
          gap="0.5rem"
          p="0"
          m="0"
          mb="0.5rem"
        >
          {items.map((item, index) => (
            <Box
              as="li"
              key={item.key}
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
              <Box position="relative" w={`${THUMB_SIZE}px`}>
                {item.kind === "new" && item.status === "preparing" ? (
                  <Box
                    role="status"
                    w={`${THUMB_SIZE}px`}
                    h={`${THUMB_SIZE}px`}
                    display="grid"
                    placeItems="center"
                    bg="nm.bgSoft"
                    borderRadius="nmSm"
                    fontSize="11px"
                    color="nm.inkMuted"
                  >
                    準備中…
                  </Box>
                ) : (
                  <MealRecordImageThumb
                    image={
                      item.kind === "saved"
                        ? item.image
                        : { url: item.previewUrl }
                    }
                    draggable={false}
                    alt={`画像 ${index + 1}`}
                    size={THUMB_SIZE}
                  />
                )}
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
                {item.kind === "new" && item.status === "uploading" && (
                  <Box
                    role="status"
                    position="absolute"
                    insetX="0"
                    bottom="0"
                    bg="nm.paper"
                    opacity={0.9}
                    textAlign="center"
                    fontSize="10px"
                    color="nm.inkMuted"
                  >
                    アップロード中…
                  </Box>
                )}
              </Box>
              {item.kind === "new" && (
                <Box
                  fontSize="10px"
                  color="nm.inkMuted"
                  overflowWrap="anywhere"
                >
                  {item.name}
                </Box>
              )}
              <FormField error={item.kind === "saved" ? item.error : undefined}>
                <Input
                  aria-label={`画像 ${index + 1} のキャプション`}
                  size="xs"
                  fontSize="12px"
                  bg="white"
                  placeholder="キャプション"
                  maxLength={MEAL_RECORD_IMAGE_CAPTION_MAX_LENGTH}
                  value={item.caption}
                  onChange={(e) => setCaption(item.key, e.target.value)}
                />
              </FormField>
              {item.kind === "new" && <FieldError error={item.error} />}
              <Box display="flex" flexWrap="wrap" gap="0.25rem">
                <Button
                  {...smallButtonProps}
                  aria-label={`画像 ${index + 1} を前に移動`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ←
                </Button>
                <Button
                  {...smallButtonProps}
                  aria-label={`画像 ${index + 1} を後ろに移動`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  →
                </Button>
                <Button
                  {...smallButtonProps}
                  aria-label={`画像 ${index + 1} を削除`}
                  onClick={() => remove(item.key)}
                >
                  削除
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box display="flex" alignItems="center" gap="0.5rem" flexWrap="wrap">
        <Button
          {...smallButtonProps}
          px="10px"
          py="5px"
          disabled={!canAdd}
          onClick={() => fileInputRef.current?.click()}
        >
          画像を追加
        </Button>
        <Box as="span" fontSize="11px" color="nm.inkMuted">
          {canAdd
            ? `あと${remaining}枚・1枚目が代表`
            : `画像は${MEAL_RECORD_IMAGES_MAX}枚までです`}
        </Box>
        {canAdd && finePointer && (
          <Box as="span" id={hintId} fontSize="11px" color="nm.inkFaint">
            この欄にドラッグ＆ドロップ・貼り付けでも追加できます
          </Box>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT.join(",")}
          multiple
          hidden
          aria-label="追加する画像ファイル"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            // Lets the same file be chosen again.
            e.target.value = "";
            if (files.length > 0) {
              add(files);
            }
          }}
        />
      </Box>
    </Box>
  );
}
