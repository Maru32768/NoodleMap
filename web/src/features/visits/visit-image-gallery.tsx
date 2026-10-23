import { Button } from "@/components/ui/button.tsx";
import {
  DialogCloseTrigger,
  DialogContent,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { VisitImage } from "@/features/visits/api/use-visit-images.ts";
import { Box, chakra, Image } from "@chakra-ui/react";
import { useEffect, useEffectEvent, useState } from "react";

const THUMB_PX = 72;

function imageLabel(image: VisitImage, index: number, count: number) {
  return image.caption
    ? `画像 ${index + 1} / ${count}: ${image.caption}`
    : `画像 ${index + 1} / ${count}`;
}

/** A 訪問画像 thumbnail: cropped to a square, lazily loaded, its size reserved. */
export function VisitImageThumb({
  image,
  alt,
  size = THUMB_PX,
}: {
  image: VisitImage;
  alt: string;
  size?: number;
}) {
  return (
    <Image
      src={image.url}
      alt={alt}
      loading="lazy"
      decoding="async"
      // The intrinsic ratio before the image loads; CSS sets the shown size.
      htmlWidth={image.width}
      htmlHeight={image.height}
      w={`${size}px`}
      h={`${size}px`}
      objectFit="cover"
      display="block"
      bg="nm.bgSoft"
      borderRadius="nmSm"
    />
  );
}

/** One visit's 訪問画像 as thumbnails; each opens a lightbox. */
export function VisitImageGallery({
  images,
}: {
  images: readonly VisitImage[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) {
    return null;
  }
  return (
    <>
      <Box
        as="ul"
        aria-label="訪問画像"
        listStyleType="none"
        display="flex"
        flexWrap="wrap"
        gap="0.375rem"
        p="0"
        m="0"
        mt="0.5rem"
      >
        {images.map((image, index) => (
          <Box as="li" key={image.id}>
            <chakra.button
              type="button"
              display="block"
              p="0"
              border="none"
              bg="transparent"
              cursor="zoom-in"
              borderRadius="nmSm"
              aria-label={`${imageLabel(image, index, images.length)}を拡大`}
              _focusVisible={{ outline: "2px solid", outlineColor: "nm.shu" }}
              onClick={() => setOpenIndex(index)}
            >
              <VisitImageThumb image={image} alt="" />
            </chakra.button>
          </Box>
        ))}
      </Box>
      <VisitImageLightbox
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
      />
    </>
  );
}

const navButtonProps = {
  variant: "plain",
  minW: "auto",
  h: "auto",
  px: "12px",
  py: "8px",
  fontSize: "13px",
  rounded: "nmMd",
  bg: "nm.bg",
  color: "nm.ink",
  border: "1px solid",
  borderColor: "nm.line",
  _hover: { borderColor: "nm.ink" },
  _disabled: { opacity: 0.4, cursor: "default" },
} as const;

/** The image at `index` (null: closed) with its caption, prev/next and arrow keys; Esc closes. */
export function VisitImageLightbox({
  images,
  index,
  onIndexChange,
}: {
  images: readonly VisitImage[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const current = index === null ? undefined : images[index];
  const hasPrev = index !== null && index > 0;
  const hasNext = index !== null && index < images.length - 1;
  const go = (delta: number) => {
    if (index !== null) {
      onIndexChange(Math.min(images.length - 1, Math.max(0, index + delta)));
    }
  };
  const onArrowKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      go(-1);
    } else if (event.key === "ArrowRight") {
      go(1);
    }
  });
  const open = !!current;
  // On the document: stepping to the last image disables the focused 次へ.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => onArrowKey(event);
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <DialogRoot
      placement="center"
      open={open}
      onOpenChange={(e) => !e.open && onIndexChange(null)}
    >
      <DialogContent
        width="auto"
        maxW="calc(100vw - 2rem)"
        bg="nm.paper"
        borderRadius="nmLg"
        p="12px"
      >
        {current && index !== null && (
          <>
            <DialogTitle
              fontSize="12px"
              fontFamily="mono"
              color="nm.inkMuted"
              pr="40px"
              mb="8px"
            >
              {index + 1} / {images.length}
            </DialogTitle>
            <DialogCloseTrigger aria-label="閉じる" />
            <Image
              src={current.url}
              alt={current.caption ?? imageLabel(current, index, images.length)}
              htmlWidth={current.width}
              htmlHeight={current.height}
              display="block"
              maxW="100%"
              maxH="calc(100vh - 12rem)"
              w="auto"
              h="auto"
              mx="auto"
              objectFit="contain"
              borderRadius="nmSm"
            />
            {current.caption && (
              <Box
                mt="8px"
                fontSize="13px"
                color="nm.ink"
                overflowWrap="anywhere"
              >
                {current.caption}
              </Box>
            )}
            {images.length > 1 && (
              <Box display="flex" justifyContent="space-between" mt="10px">
                <Button
                  {...navButtonProps}
                  aria-label="前の画像"
                  disabled={!hasPrev}
                  onClick={() => go(-1)}
                >
                  ← 前へ
                </Button>
                <Button
                  {...navButtonProps}
                  aria-label="次の画像"
                  disabled={!hasNext}
                  onClick={() => go(1)}
                >
                  次へ →
                </Button>
              </Box>
            )}
          </>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
