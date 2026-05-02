import { Button } from "@/components/ui/button.tsx";
import { Box, Input, Textarea } from "@chakra-ui/react";
import { useRef, useState } from "react";

export interface AdminImage {
  id: string;
  url: string;
  productName: string;
  shotAt: string;
  note: string;
}

interface ImageUploaderProps {
  images: AdminImage[];
  onChange: (images: AdminImage[]) => void;
}

export function ImageUploader({ images, onChange }: ImageUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) {
      return;
    }
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    arr.forEach((file) => {
      console.log("Mock image upload:", file.name, file.type, file.size);
    });

    Promise.all(
      arr.map(
        (file) =>
          new Promise<AdminImage>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                url: reader.result as string,
                productName: "",
                shotAt: new Date().toISOString().slice(0, 10),
                note: "",
              });
            };
            reader.readAsDataURL(file);
          }),
      ),
    ).then((news) => {
      onChange([...images, ...news]);
    });
  };

  const removeAt = (idx: number) => {
    const next = [...images];
    next.splice(idx, 1);
    onChange(next);
  };

  const setCover = (idx: number) => {
    if (idx === 0) {
      return;
    }
    const next = [...images];
    const [c] = next.splice(idx, 1);
    next.unshift(c);
    onChange(next);
  };

  const updateMeta = (idx: number, patch: Partial<AdminImage>) => {
    const next = [...images];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const editing = editingIdx !== null ? images[editingIdx] : null;

  const fieldLabelCss = {
    display: "block",
    fontFamily: "mono",
    fontSize: "10px",
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "nm.inkMuted",
    mb: "5px",
  };

  const inputCss = {
    w: "100%",
    px: "12px",
    py: "8px",
    h: "auto",
    bg: "nm.bg",
    border: "1px solid",
    borderColor: "nm.line",
    borderRadius: "nmMd",
    fontSize: "13px",
    color: "nm.ink",
    _focus: { borderColor: "nm.shu", bg: "white", boxShadow: "none" },
  };

  return (
    <Box>
      {/* Dropzone */}
      <Box
        border="2px dashed"
        borderColor={dragOver ? "nm.shu" : "nm.line"}
        borderRadius="nmLg"
        bg={dragOver ? "rgba(181,74,60,0.04)" : "nm.bg"}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap="8px"
        py="28px"
        px="24px"
        transition="all 0.15s"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Box color="nm.inkFaint">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </Box>
        <Box fontSize="13px" fontWeight={500} color="nm.ink">
          画像をドラッグ&ドロップ
        </Box>
        <Box fontSize="11px" color="nm.inkMuted">
          または下のボタンから選択（複数可）
        </Box>
        <Box display="flex" gap="8px" mt="4px">
          <Button
            variant="plain"
            px="12px"
            py="7px"
            h="auto"
            minH="auto"
            fontSize="12px"
            fontWeight={600}
            rounded="nmMd"
            bg="nm.shu"
            color="white"
            display="flex"
            alignItems="center"
            gap="6px"
            _hover={{ bg: "nm.shuDeep" }}
            onClick={() => cameraInputRef.current?.click()}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            カメラで撮影
          </Button>
          <Button
            variant="plain"
            px="12px"
            py="7px"
            h="auto"
            minH="auto"
            fontSize="12px"
            fontWeight={600}
            rounded="nmMd"
            bg="nm.ink"
            color="nm.paper"
            display="flex"
            alignItems="center"
            gap="6px"
            _hover={{ bg: "nm.inkSoft" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            ファイルを選択
          </Button>
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </Box>

      {images.length > 0 ? (
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(120px, 1fr))"
          gap="10px"
          mt="14px"
        >
          {images.map((img, idx) => (
            <Box
              key={img.id}
              border="1px solid"
              borderColor="nm.line"
              borderRadius="nmMd"
              overflow="hidden"
              position="relative"
              _hover={{ "& .img-actions": { opacity: 1 } }}
            >
              {idx === 0 && (
                <Box
                  position="absolute"
                  top="6px"
                  left="6px"
                  bg="nm.kincha"
                  color="white"
                  px="5px"
                  py="2px"
                  borderRadius="nmSm"
                  fontSize="9px"
                  fontFamily="mono"
                  letterSpacing="0.1em"
                  zIndex={2}
                >
                  COVER
                </Box>
              )}
              <Box
                h="80px"
                bg={img.url ? undefined : "nm.bgSoft"}
                backgroundImage={img.url ? `url(${img.url})` : undefined}
                backgroundSize="cover"
                backgroundPosition="center"
                cursor="pointer"
                onClick={() => setEditingIdx(idx)}
              />
              <Box
                className="img-actions"
                position="absolute"
                top="0"
                right="0"
                bottom="0"
                left="0"
                bg="rgba(26,22,20,0.55)"
                display="flex"
                alignItems="center"
                justifyContent="center"
                gap="4px"
                opacity={0}
                transition="opacity 0.15s"
              >
                {idx !== 0 && (
                  <Box
                    as="button"
                    w="26px"
                    h="26px"
                    rounded="full"
                    bg="rgba(255,255,255,0.2)"
                    color="white"
                    display="grid"
                    placeItems="center"
                    border="none"
                    cursor="pointer"
                    title="カバーに設定"
                    onClick={() => setCover(idx)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="12"
                      height="12"
                    >
                      <path d="M12 2l2.4 7.4H22l-6.2 4.6L18.2 22 12 17.4 5.8 22l2.4-8L2 9.4h7.6z" />
                    </svg>
                  </Box>
                )}
                <Box
                  as="button"
                  w="26px"
                  h="26px"
                  rounded="full"
                  bg="rgba(255,255,255,0.2)"
                  color="white"
                  display="grid"
                  placeItems="center"
                  border="none"
                  cursor="pointer"
                  title="編集"
                  onClick={() => setEditingIdx(idx)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="12"
                    height="12"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
                  </svg>
                </Box>
                <Box
                  as="button"
                  w="26px"
                  h="26px"
                  rounded="full"
                  bg="rgba(181,74,60,0.7)"
                  color="white"
                  display="grid"
                  placeItems="center"
                  border="none"
                  cursor="pointer"
                  title="削除"
                  onClick={() => {
                    if (confirm("削除しますか?")) {
                      removeAt(idx);
                    }
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="12"
                    height="12"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                  </svg>
                </Box>
              </Box>
              <Box px="8px" py="6px" bg="nm.paper">
                <Box
                  fontSize="11px"
                  fontWeight={500}
                  color={img.productName ? "nm.ink" : "nm.inkFaint"}
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {img.productName || "商品名未入力"}
                </Box>
                <Box
                  fontSize="10px"
                  fontFamily="mono"
                  color="nm.inkFaint"
                  mt="1px"
                >
                  {img.shotAt}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          display="grid"
          placeItems="center"
          h="80px"
          color="nm.inkFaint"
          fontSize="12px"
          mt="12px"
        >
          まだ画像がありません — 上のエリアからアップロードしてください
        </Box>
      )}

      {editingIdx !== null && editing && (
        <Box
          position="fixed"
          inset="0"
          bg="rgba(26,22,20,0.6)"
          backdropFilter="blur(4px)"
          zIndex={900}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p="24px"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingIdx(null);
            }
          }}
        >
          <Box
            bg="nm.paper"
            borderRadius="nmLg"
            boxShadow="nmLg"
            overflow="hidden"
            display={{ base: "flex", md: "grid" }}
            flexDirection="column"
            gridTemplateColumns={{ md: "240px 1fr" }}
            maxW="600px"
            w="100%"
            maxH="80vh"
          >
            <Box
              h={{ base: "180px", md: "100%" }}
              backgroundImage={`url(${editing.url})`}
              backgroundSize="cover"
              backgroundPosition="center"
              bg="nm.bgSoft"
            />
            <Box
              p="20px"
              overflowY="auto"
              display="flex"
              flexDirection="column"
              gap="14px"
            >
              <Box
                fontFamily="display"
                fontSize="15px"
                fontWeight={700}
                color="nm.ink"
              >
                画像情報を編集
              </Box>
              <Box>
                <Box {...fieldLabelCss}>
                  商品名{" "}
                  <Box
                    as="span"
                    fontFamily="body"
                    fontSize="11px"
                    color="nm.inkFaint"
                    textTransform="none"
                    letterSpacing="normal"
                  >
                    例: 味玉らーめん
                  </Box>
                </Box>
                <Input
                  value={editing.productName}
                  onChange={(e) =>
                    updateMeta(editingIdx, { productName: e.target.value })
                  }
                  placeholder="味玉らーめん"
                  {...inputCss}
                />
              </Box>
              <Box>
                <Box {...fieldLabelCss}>撮影日</Box>
                <Input
                  type="date"
                  value={editing.shotAt}
                  onChange={(e) =>
                    updateMeta(editingIdx, { shotAt: e.target.value })
                  }
                  fontFamily="mono"
                  {...inputCss}
                />
              </Box>
              <Box>
                <Box {...fieldLabelCss}>メモ・コメント</Box>
                <Textarea
                  rows={3}
                  value={editing.note}
                  onChange={(e) =>
                    updateMeta(editingIdx, { note: e.target.value })
                  }
                  placeholder="味の感想・盛り付け・季節限定など"
                  {...inputCss}
                  resize="none"
                />
              </Box>
              <Box display="flex" gap="8px" mt="2px">
                <Button
                  variant="plain"
                  flex="1"
                  py="9px"
                  h="auto"
                  minH="auto"
                  fontSize="13px"
                  rounded="nmMd"
                  bg="nm.bg"
                  color="nm.inkMuted"
                  border="1px solid"
                  borderColor="nm.line"
                  _hover={{ borderColor: "nm.ink", color: "nm.ink" }}
                  onClick={() => setEditingIdx(null)}
                >
                  閉じる
                </Button>
                <Button
                  variant="plain"
                  flex="1"
                  py="9px"
                  h="auto"
                  minH="auto"
                  fontSize="13px"
                  fontWeight={600}
                  rounded="nmMd"
                  bg="nm.ink"
                  color="nm.paper"
                  _hover={{ bg: "nm.inkSoft" }}
                  onClick={() => setEditingIdx(null)}
                >
                  保存
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
