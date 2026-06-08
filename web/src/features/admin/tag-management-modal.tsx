import { LoadableButton } from "@/components/loadable-button.tsx";
import { ModalDialog } from "@/components/modal-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  CATEGORY_OPTIONS,
  CategorySlug,
} from "@/features/categories/categories.ts";
import {
  SaveTagsErrorBody,
  Tag,
  TagInput,
  useTags,
} from "@/features/shops/api/use-shops.ts";
import { TagChips } from "@/features/shops/tag-chips.tsx";
import { toastApiError } from "@/utils/toast.ts";
import { useIsPc } from "@/utils/use-is-pc.ts";
import { Box, Input } from "@chakra-ui/react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { LuGripVertical, LuTags } from "react-icons/lu";

type TagDraft = {
  id?: string;
  category?: CategorySlug;
  label: string;
  slug: string;
  color: string;
  sortOrder: number;
};

const EMPTY_DRAFT: TagDraft = {
  label: "",
  slug: "",
  color: "#2563eb",
  sortOrder: 100,
};

const TEMP_ID_PREFIX = "temp-tag-";

function isDuplicateSlugError(body: SaveTagsErrorBody | undefined): boolean {
  if (body?.type === "invalid_request") {
    const fieldErrors = body.fieldErrors;
    return (
      fieldErrors?.some(
        (fieldError) =>
          fieldError.field === "slug" && fieldError.type === "duplicate",
      ) ?? false
    );
  }
  return false;
}

function toDraft(tag: Tag): TagDraft {
  return {
    id: tag.id,
    category: tag.category,
    label: tag.label,
    slug: tag.slug,
    color: tag.color,
    sortOrder: tag.sortOrder,
  };
}

function toCommand(draft: TagDraft): Omit<TagInput, "id"> {
  return {
    category: draft.category,
    label: draft.label.trim(),
    slug: draft.slug.trim(),
    color: draft.color.trim(),
    sortOrder: draft.sortOrder,
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="label"
      display="block"
      fontFamily="mono"
      fontSize="10px"
      letterSpacing="0.15em"
      textTransform="uppercase"
      color="nm.inkMuted"
      mb="5px"
    >
      {children}
    </Box>
  );
}

function FormInput({
  value,
  onChange,
  type,
}: {
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <Input
      value={value}
      type={type}
      onChange={(event) => onChange(event.target.value)}
      w="100%"
      px="12px"
      py="8px"
      h="auto"
      bg="nm.bg"
      border="1px solid"
      borderColor="nm.line"
      borderRadius="nmMd"
      fontSize="13px"
      color="nm.ink"
      _focus={{ borderColor: "nm.shu", bg: "white", boxShadow: "none" }}
    />
  );
}

function SortableTagRow({
  tag,
  selected,
  onEdit,
  onDelete,
}: {
  tag: Tag;
  selected: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id });

  return (
    <Box
      ref={setNodeRef}
      display="grid"
      gridTemplateColumns="28px minmax(0, 1fr) auto"
      gap="10px"
      alignItems="center"
      px="10px"
      py="10px"
      border="1px solid"
      borderColor={selected ? "nm.ink" : "nm.line"}
      borderRadius="nmMd"
      bg={selected ? "nm.bg" : "nm.paper"}
      opacity={isDragging ? 0.68 : 1}
      boxShadow={isDragging ? "nmMd" : undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Button
        variant="plain"
        w="28px"
        h="28px"
        minW="28px"
        minH="28px"
        p="0"
        color="nm.inkMuted"
        rounded="4px"
        cursor="grab"
        _hover={{ bg: "nm.bgSoft", color: "nm.ink" }}
        _active={{ cursor: "grabbing" }}
        {...attributes}
        {...listeners}
        aria-label={`${tag.label}を並び替え`}
      >
        <LuGripVertical />
      </Button>
      <Box minW="0">
        <TagChips tags={[tag]} />
        <Box mt="6px" fontFamily="mono" fontSize="11px" color="nm.inkMuted">
          {tag.slug} · {tag.category ?? "共通"} · {tag.sortOrder}
        </Box>
      </Box>
      <Box display="flex" gap="6px">
        <Button
          variant="plain"
          px="10px"
          py="6px"
          h="auto"
          minH="auto"
          fontSize="12px"
          border="1px solid"
          borderColor="nm.line"
          rounded="nmMd"
          _hover={{ borderColor: "nm.ink" }}
          onClick={onEdit}
        >
          編集
        </Button>
        <Button
          variant="plain"
          px="10px"
          py="6px"
          h="auto"
          minH="auto"
          fontSize="12px"
          color="nm.shu"
          border="1px solid"
          borderColor="nm.shu"
          rounded="nmMd"
          _hover={{ bg: "nm.shu", color: "white" }}
          onClick={onDelete}
        >
          削除
        </Button>
      </Box>
    </Box>
  );
}

type TagsApi = ReturnType<typeof useTags>;

export function TagManagementModal({
  open,
  onClose,
  onShopsChanged,
}: {
  open: boolean;
  onClose: () => void;
  onShopsChanged: () => void;
}) {
  const { tags, saveTags } = useTags();

  if (!tags) {
    return (
      <ModalDialog
        open={open}
        onOpenChange={(isOpen) => !isOpen && onClose()}
        width="100%"
        maxWidth="920px"
        height="78vh"
        title="タグ管理"
        subtitle="TAG SETTINGS"
        icon={<LuTags size={18} />}
        iconBg="nm.ink"
        bodyProps={{ p: 0, display: "grid", placeItems: "center" }}
      >
        <Box fontSize="13px" color="nm.inkMuted">
          読み込み中...
        </Box>
      </ModalDialog>
    );
  }

  return (
    <TagManagementEditor
      open={open}
      initialTags={tags}
      saveTags={saveTags}
      onClose={onClose}
      onShopsChanged={onShopsChanged}
    />
  );
}

function TagManagementEditor({
  open,
  initialTags,
  saveTags,
  onClose,
  onShopsChanged,
}: {
  open: boolean;
  initialTags: Tag[];
  saveTags: TagsApi["saveTags"];
  onClose: () => void;
  onShopsChanged: () => void;
}) {
  const isPc = useIsPc();
  const [localTags, setLocalTags] = useState<Tag[]>(() => initialTags);
  const [draft, setDraft] = useState<TagDraft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const workingTags = localTags;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const set = <K extends keyof TagDraft>(key: K, value: TagDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    const command = toCommand(draft);
    if (!command.label || !command.slug || !command.color) {
      return;
    }

    const nextTag: Tag = {
      id: draft.id ?? `${TEMP_ID_PREFIX}${crypto.randomUUID()}`,
      category: command.category,
      label: command.label,
      slug: command.slug,
      color: command.color,
      sortOrder: command.sortOrder,
    };

    setLocalTags((current) => {
      if (draft.id) {
        return current.map((tag) => (tag.id === draft.id ? nextTag : tag));
      }
      return [...current, nextTag].toSorted(
        (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
      );
    });

    setDraft(EMPTY_DRAFT);
    setDirty(true);
  };

  const handleDelete = (tag: Tag) => {
    if (!confirm(`「${tag.label}」を削除します。よろしいですか?`)) {
      return;
    }

    setLocalTags((current) => current.filter((item) => item.id !== tag.id));
    if (draft.id === tag.id) {
      setDraft(EMPTY_DRAFT);
    }
    setDirty(true);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (workingTags.length === 0) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = workingTags.findIndex((tag) => tag.id === active.id);
    const newIndex = workingTags.findIndex((tag) => tag.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reordered = arrayMove(workingTags, oldIndex, newIndex).map(
      (tag, index) => ({
        ...tag,
        sortOrder: (index + 1) * 10,
      }),
    );
    setLocalTags(reordered);

    if (draft.id) {
      const updatedIndex = reordered.findIndex((tag) => tag.id === draft.id);
      if (updatedIndex !== -1) {
        set("sortOrder", (updatedIndex + 1) * 10);
      }
    }
    setDirty(true);
  };

  const handleSaveAll = async () => {
    if (!dirty) {
      return;
    }

    // Send the full desired tag set; the server applies the add/edit/delete
    // diff atomically, so a failure leaves both DB and UI unchanged.
    const payload: TagInput[] = workingTags.map((tag) => ({
      id: tag.id.startsWith(TEMP_ID_PREFIX) ? undefined : tag.id,
      category: tag.category,
      label: tag.label,
      slug: tag.slug,
      color: tag.color,
      sortOrder: tag.sortOrder,
    }));

    const result = await saveTags(payload);
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: isDuplicateSlugError(result.error.body)
          ? "Slug が重複しています"
          : "タグを保存できませんでした",
      });
      return;
    }

    setLocalTags(result.data);
    setDirty(false);
    setDraft(EMPTY_DRAFT);
    onShopsChanged();
  };

  const canSave =
    draft.label.trim() !== "" &&
    draft.slug.trim() !== "" &&
    draft.color.trim() !== "";

  return (
    <ModalDialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      width="100%"
      maxWidth="920px"
      height={isPc ? "78vh" : "95vh"}
      title="タグ管理"
      subtitle="TAG SETTINGS"
      icon={<LuTags size={18} />}
      iconBg="nm.ink"
      bodyProps={{
        p: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "1fr auto",
      }}
    >
      <>
        <Box
          display={{ base: "flex", md: "grid" }}
          flexDirection="column"
          gridTemplateColumns={{ md: "1fr 330px" }}
          minH="0"
          overflow="hidden"
        >
          <Box overflowY="auto" px="18px" py="16px">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <SortableContext
                items={workingTags.map((tag) => tag.id)}
                strategy={verticalListSortingStrategy}
              >
                <Box display="flex" flexDirection="column" gap="8px">
                  {workingTags.map((tag) => (
                    <SortableTagRow
                      key={tag.id}
                      tag={tag}
                      selected={draft.id === tag.id}
                      onEdit={() => setDraft(toDraft(tag))}
                      onDelete={() => handleDelete(tag)}
                    />
                  ))}
                </Box>
              </SortableContext>
            </DndContext>
          </Box>

          <Box
            px="18px"
            py="16px"
            borderLeft={{ md: "1px solid" }}
            borderLeftColor={{ md: "nm.lineFaint" }}
            borderTop={{ base: "1px solid", md: "0" }}
            borderTopColor={{ base: "nm.lineFaint", md: undefined }}
            bg="nm.bg"
            minHeight="300px"
            overflowY="auto"
          >
            <Box display="grid" gap="12px">
              <Box>
                <FieldLabel>プレビュー</FieldLabel>
                <TagChips
                  tags={[
                    {
                      id: draft.id ?? "preview",
                      category: draft.category,
                      label: draft.label || "タグ名",
                      slug: draft.slug || "tag-slug",
                      color: draft.color || "#2563eb",
                      sortOrder: draft.sortOrder,
                    },
                  ]}
                />
              </Box>

              <Box>
                <FieldLabel>カテゴリ</FieldLabel>
                <Box display="flex" flexWrap="wrap" gap="6px">
                  <Button
                    variant="plain"
                    px="10px"
                    py="5px"
                    h="auto"
                    minH="auto"
                    fontSize="12px"
                    bg={!draft.category ? "nm.ink" : "nm.paper"}
                    color={!draft.category ? "nm.paper" : "nm.inkMuted"}
                    border="1px solid"
                    borderColor={!draft.category ? "nm.ink" : "nm.line"}
                    rounded="nmMd"
                    onClick={() => set("category", undefined)}
                  >
                    共通
                  </Button>
                  {CATEGORY_OPTIONS.map((category) => (
                    <Button
                      key={category.id}
                      variant="plain"
                      px="10px"
                      py="5px"
                      h="auto"
                      minH="auto"
                      fontSize="12px"
                      bg={
                        draft.category === category.id ? "nm.ink" : "nm.paper"
                      }
                      color={
                        draft.category === category.id
                          ? "nm.paper"
                          : "nm.inkMuted"
                      }
                      border="1px solid"
                      borderColor={
                        draft.category === category.id ? "nm.ink" : "nm.line"
                      }
                      rounded="nmMd"
                      onClick={() => set("category", category.id)}
                    >
                      {category.label}
                    </Button>
                  ))}
                </Box>
              </Box>

              <Box>
                <FieldLabel>タグ名</FieldLabel>
                <FormInput
                  value={draft.label}
                  onChange={(value) => set("label", value)}
                />
              </Box>

              <Box>
                <FieldLabel>Slug</FieldLabel>
                <FormInput
                  value={draft.slug}
                  onChange={(value) => set("slug", value)}
                />
              </Box>

              <Box display="grid" gridTemplateColumns="48px 1fr" gap="8px">
                <Box>
                  <FieldLabel>色</FieldLabel>
                  <Input
                    type="color"
                    value={draft.color}
                    onChange={(event) => set("color", event.target.value)}
                    w="48px"
                    h="38px"
                    p="3px"
                    bg="nm.paper"
                    border="1px solid"
                    borderColor="nm.line"
                    rounded="nmMd"
                  />
                </Box>
                <Box>
                  <FieldLabel>Hex</FieldLabel>
                  <FormInput
                    value={draft.color}
                    onChange={(value) => set("color", value)}
                  />
                </Box>
              </Box>

              <Box>
                <FieldLabel>並び順</FieldLabel>
                <FormInput
                  type="number"
                  value={draft.sortOrder}
                  onChange={(value) => set("sortOrder", Number(value))}
                />
              </Box>
            </Box>
          </Box>
        </Box>

        <Box
          display="flex"
          alignItems="center"
          gap="8px"
          px="18px"
          py="12px"
          borderTop="1px solid"
          borderTopColor="nm.lineFaint"
          bg="nm.paper"
        >
          <Button
            variant="plain"
            px="12px"
            py="8px"
            h="auto"
            minH="auto"
            fontSize="13px"
            border="1px solid"
            borderColor="nm.line"
            rounded="nmMd"
            onClick={() => setDraft(EMPTY_DRAFT)}
          >
            新規
          </Button>
          <Box flex="1" />
          <Button
            variant="plain"
            px="14px"
            py="8px"
            h="auto"
            minH="auto"
            fontSize="13px"
            border="1px solid"
            borderColor="nm.line"
            rounded="nmMd"
            onClick={onClose}
          >
            閉じる
          </Button>
          <LoadableButton
            variant="plain"
            px="16px"
            py="8px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={600}
            bg="nm.ink"
            color="nm.paper"
            rounded="nmMd"
            disabled={!canSave}
            _hover={{ bg: "nm.inkSoft" }}
            onClick={handleSave}
          >
            {draft.id ? "リストに反映" : "リストに追加"}
          </LoadableButton>
          <LoadableButton
            variant="plain"
            px="16px"
            py="8px"
            h="auto"
            minH="auto"
            fontSize="13px"
            fontWeight={600}
            bg="nm.shu"
            color="white"
            rounded="nmMd"
            disabled={!dirty}
            _hover={{ bg: "nm.shuDeep" }}
            onClick={handleSaveAll}
          >
            変更を保存
          </LoadableButton>
        </Box>
      </>
    </ModalDialog>
  );
}
