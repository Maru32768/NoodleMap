import { ModalDialog } from "@/components/modal-dialog.tsx";
import { SegmentedPicker } from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { AddModal } from "@/features/admin/add-modal.tsx";
import { MealRecordForm } from "@/features/meal-records/meal-record-form.tsx";
import type { PhotoGroup } from "@/features/photo-import/grouping.ts";
import type {
  MealRecordDetails,
  MealRecordKey,
  ShopChoice,
} from "@/features/photo-import/import-plan.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import type {
  GroupRow,
  RowTab,
} from "@/features/photo-import/use-photo-import.ts";
import { useThumbnail } from "@/features/photo-import/use-thumbnail-url.ts";
import { createQueryMatcher } from "@/features/search/utils.ts";
import type { Shop } from "@/features/shops/api/use-shops.ts";
import { MEAL_RECORD_IMAGES_MAX } from "@/utils/toast.ts";
import { Box, Image, Input } from "@chakra-ui/react";
import { omit } from "es-toolkit";
import { ComponentProps, useState } from "react";
import { Virtuoso } from "react-virtuoso";

type Filter = RowTab | "all";

const TAB_LABELS: Record<Filter, string> = {
  undecided: "要確認",
  ready: "取り込み予定",
  imported: "取り込み済み",
  skip: "スキップ",
  all: "すべて",
};

const SEARCH_RESULTS_MAX = 8;

const JST_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

const smallButton = {
  variant: "plain",
  px: "10px",
  py: "5px",
  h: "auto",
  minH: "auto",
  fontSize: "12px",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmMd",
  _hover: { borderColor: "nm.ink" },
} as const;

const moveButton = {
  variant: "plain",
  p: "0",
  w: "30px",
  h: "22px",
  minW: "30px",
  minH: "auto",
  fontSize: "12px",
  color: "nm.inkMuted",
  rounded: "nmSm",
  _hover: { bg: "nm.bgSoft", color: "nm.ink" },
} as const;

/** Review rows behind filter tabs, virtualized: an import can hold thousands. */
export function GroupReviewList({
  rows,
  shops,
  readOnly,
  excluded,
  details,
  onChoose,
  onTogglePhoto,
  onMovePhoto,
  onSetDetails,
  PlaceFinder,
}: {
  rows: readonly GroupRow[];
  shops: readonly Shop[];
  readOnly: boolean;
  excluded: ReadonlySet<number>;
  details: ReadonlyMap<MealRecordKey, MealRecordDetails>;
  onChoose: (groupId: number, choice: ShopChoice) => void;
  onTogglePhoto: (photoIndex: number) => void;
  onMovePhoto: (row: GroupRow, photoIndex: number, delta: -1 | 1) => void;
  onSetDetails: (key: MealRecordKey, details: MealRecordDetails) => void;
  PlaceFinder?: ComponentProps<typeof AddModal>["PlaceFinder"];
}) {
  // Held here, not in the row: Virtuoso unmounts rows scrolled out of view.
  const [addingFor, setAddingFor] = useState<PhotoGroup | null>(null);
  const [editingKey, setEditingKey] = useState<MealRecordKey | null>(null);
  const [filter, setFilter] = useState<Filter>(() =>
    rows.some((r) => r.tab === "undecided") ? "undecided" : "all",
  );
  const count = (tab: Filter) =>
    tab === "all" ? rows.length : rows.filter((r) => r.tab === tab).length;
  const visible =
    filter === "all" ? rows : rows.filter((r) => r.tab === filter);
  const shopById = new Map(shops.map((s) => [s.id, s]));

  return (
    <Box display="flex" flexDirection="column" minH="0" flex="1" gap="10px">
      <SegmentedPicker
        variant="segment"
        label="表示する行"
        value={filter}
        onChange={setFilter}
        options={(Object.keys(TAB_LABELS) as Filter[]).map((id) => ({
          id,
          label: `${TAB_LABELS[id]} (${count(id)})`,
        }))}
      />
      {visible.length === 0 ? (
        <Box color="nm.inkFaint" fontSize="13px" py="24px" textAlign="center">
          該当する写真はありません
        </Box>
      ) : (
        <Box flex="1" minH="0">
          <Virtuoso
            style={{ height: "100%" }}
            data={visible}
            computeItemKey={(_, row) => row.group.id}
            itemContent={(_, row) => (
              <GroupRowView
                row={row}
                shopById={shopById}
                shops={shops}
                readOnly={readOnly}
                excluded={excluded}
                details={
                  row.detailsKey ? details.get(row.detailsKey) : undefined
                }
                onChoose={onChoose}
                onTogglePhoto={onTogglePhoto}
                onMovePhoto={(photoIndex, delta) =>
                  onMovePhoto(row, photoIndex, delta)
                }
                onAddShop={() => setAddingFor(row.group)}
                onEditDetails={() => setEditingKey(row.detailsKey)}
              />
            )}
          />
        </Box>
      )}
      {addingFor && (
        <AddModal
          open
          onClose={() => setAddingFor(null)}
          // The new shop is also in `shops` now, so other groups taken there re-match to it.
          onAdded={(shop) =>
            onChoose(addingFor.id, {
              kind: "shop",
              shopId: shop.id,
              source: "admin",
            })
          }
          initialLatLng={addingFor.center ?? undefined}
          PlaceFinder={PlaceFinder}
        />
      )}
      {editingKey && (
        <DetailsModal
          recordKey={editingKey}
          shopName={shopById.get(editingKey.split("|")[0])?.name}
          details={details.get(editingKey)}
          onSave={(next) => onSetDetails(editingKey, next)}
          onClose={() => setEditingKey(null)}
        />
      )}
    </Box>
  );
}

/** The meal record's fields beyond the shop and day, in the same form as a hand-written record. */
function DetailsModal({
  recordKey,
  shopName,
  details,
  onSave,
  onClose,
}: {
  recordKey: MealRecordKey;
  shopName: string | undefined;
  details: MealRecordDetails | undefined;
  onSave: (details: MealRecordDetails) => void;
  onClose: () => void;
}) {
  const [shopId, day] = recordKey.split("|");
  return (
    <ModalDialog
      open
      onOpenChange={(o) => !o && onClose()}
      width="100%"
      maxWidth="720px"
      title="食べた記録の内容"
      subtitle={`${shopName ?? ""} ${day}`}
    >
      <MealRecordForm
        shopId={shopId}
        importDraft={{ shopIds: [shopId], ...details, eatenOn: day }}
        onCancel={onClose}
        onSave={async (input) => {
          onSave(omit(input, ["eatenOn"]));
          onClose();
          return null;
        }}
      />
    </ModalDialog>
  );
}

/** What the admin wrote, in one line; empty when nothing. */
function detailsSummary(
  details: MealRecordDetails | undefined,
  shopById: ReadonlyMap<string, Shop>,
) {
  if (!details) {
    return "";
  }
  const collaborators = details.shopIds
    .slice(1)
    .map((id) => shopById.get(id)?.name ?? "削除された店舗");
  return [
    collaborators.length > 0 && `共同: ${collaborators.join("・")}`,
    details.menuItems?.map((m) => m.name).join("・"),
    details.rate !== undefined && `お気に入り度 ${details.rate}`,
    details.venueName,
    (details.publicNote || details.privateNote) && "メモあり",
  ]
    .filter(Boolean)
    .join(" / ");
}

function GroupRowView({
  row,
  shopById,
  shops,
  readOnly,
  excluded,
  details,
  onChoose,
  onTogglePhoto,
  onMovePhoto,
  onAddShop,
  onEditDetails,
}: {
  row: GroupRow;
  shopById: ReadonlyMap<string, Shop>;
  shops: readonly Shop[];
  readOnly: boolean;
  excluded: ReadonlySet<number>;
  details: MealRecordDetails | undefined;
  onChoose: (groupId: number, choice: ShopChoice) => void;
  onTogglePhoto: (photoIndex: number) => void;
  onMovePhoto: (photoIndex: number, delta: -1 | 1) => void;
  onAddShop: () => void;
  onEditDetails: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const { group, choice } = row;
  const first = group.photos[0].capturedAt;
  const last = group.photos[group.photos.length - 1].capturedAt;
  const filenameDate = group.photos[0].dateSource === "filename";
  const chosen = choice.kind === "shop" ? shopById.get(choice.shopId) : null;
  const choose = (next: ShopChoice) => {
    onChoose(group.id, next);
    setSearching(false);
  };

  return (
    <Box
      role="group"
      aria-label={
        filenameDate
          ? `${group.day} ${group.photos[0].file.name}の写真`
          : `${group.day} ${JST_TIME.format(first)}の写真`
      }
      borderBottom="1px solid"
      borderBottomColor="nm.lineFaint"
      py="12px"
      display="grid"
      gap="8px"
    >
      <Box display="flex" flexWrap="wrap" alignItems="baseline" gap="10px">
        <Box fontFamily="mono" fontSize="12px" color="nm.ink">
          {group.day} {!filenameDate && JST_TIME.format(first)}
          {!filenameDate && last > first && `–${JST_TIME.format(last)}`}
        </Box>
        {filenameDate && (
          <Box fontSize="12px" color="nm.inkMuted">
            ファイル名から補完 · {group.photos[0].file.name}
          </Box>
        )}
        <Box fontSize="12px" color="nm.inkMuted">
          {group.photos.length}枚
        </Box>
        <Box fontSize="13px" fontWeight={600} color="nm.ink">
          {chosen
            ? chosen.name
            : choice.kind === "skip"
              ? "スキップ"
              : choice.kind === "undecided"
                ? "要確認"
                : "選んだ店舗が見つかりません"}
        </Box>
        {row.tab === "imported" && (
          <Box fontSize="12px" color="nm.inkMuted">
            取り込み済み
          </Box>
        )}
        {row.tab !== "imported" && row.existingImages !== null && (
          <Box fontSize="12px" color="nm.shuDeep">
            既存の記録 (画像{row.existingImages}枚)
          </Box>
        )}
        {row.overflow > 0 && (
          <Box fontSize="12px" color="nm.shuDeep">
            上限{MEAL_RECORD_IMAGES_MAX}枚を超える{row.overflow}
            枚は取り込まれません
          </Box>
        )}
      </Box>

      <Box display="flex" flexWrap="wrap" gap="6px">
        {row.photos.map((photo, i) => (
          <Box key={photo.index} display="grid" gap="2px">
            <Thumbnail
              photo={photo}
              label={`写真${i + 1}`}
              excluded={excluded.has(photo.index)}
              disabled={readOnly}
              onToggle={() => onTogglePhoto(photo.index)}
            />
            {/* Only before the meal record has images: resuming counts along this order. */}
            {row.detailsKey && !readOnly && row.photos.length > 1 && (
              <Box display="flex" justifyContent="space-between">
                <Button
                  {...moveButton}
                  aria-label={`写真${i + 1}を前に移動`}
                  disabled={i === 0}
                  onClick={() => onMovePhoto(photo.index, -1)}
                >
                  ←
                </Button>
                <Button
                  {...moveButton}
                  aria-label={`写真${i + 1}を後ろに移動`}
                  disabled={i === row.photos.length - 1}
                  onClick={() => onMovePhoto(photo.index, 1)}
                >
                  →
                </Button>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box display="flex" flexWrap="wrap" alignItems="center" gap="8px">
        {row.candidates.length > 0 && (
          <SegmentedPicker
            variant="outline"
            label="店舗の候補"
            disabled={readOnly}
            value={choice.kind === "shop" ? choice.shopId : undefined}
            options={row.candidates.map((c) => ({
              id: c.shop.id,
              label: `${c.shop.name} ${Math.round(c.distanceM)}m`,
            }))}
            onChange={(shopId) =>
              choose({ kind: "shop", shopId, source: "admin" })
            }
          />
        )}
        <Button
          {...smallButton}
          disabled={readOnly}
          onClick={() => setSearching((v) => !v)}
        >
          店舗を検索
        </Button>
        <Button {...smallButton} disabled={readOnly} onClick={onAddShop}>
          {group.center ? "この場所の店を追加" : "店舗を追加"}
        </Button>
        <Button
          {...smallButton}
          disabled={readOnly || choice.kind === "skip"}
          onClick={() => choose({ kind: "skip" })}
        >
          スキップ
        </Button>
        {row.detailsKey && (
          <Button {...smallButton} disabled={readOnly} onClick={onEditDetails}>
            記録の内容
          </Button>
        )}
        {row.detailsKey && (
          <Box fontSize="12px" color="nm.inkMuted">
            {detailsSummary(details, shopById)}
          </Box>
        )}
      </Box>

      {searching && !readOnly && (
        <ShopSearch
          shops={shops}
          onPick={(shopId) => choose({ kind: "shop", shopId, source: "admin" })}
        />
      )}
    </Box>
  );
}

function Thumbnail({
  photo,
  label,
  excluded,
  disabled,
  onToggle,
}: {
  photo: Photo;
  label: string;
  excluded: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const thumbnail = useThumbnail(photo.file);
  return (
    <Button
      variant="plain"
      p="0"
      w="64px"
      h="64px"
      minW="64px"
      rounded="nmMd"
      overflow="hidden"
      bg="nm.bgSoft"
      position="relative"
      aria-label={`${label}を取り込む`}
      aria-pressed={!excluded}
      disabled={disabled}
      _disabled={{ cursor: "default", opacity: 1 }}
      onClick={onToggle}
    >
      {thumbnail && (
        <Image
          src={thumbnail.url}
          alt=""
          w="100%"
          h="100%"
          objectFit="cover"
          transform={thumbnail.transform}
          opacity={excluded ? 0.3 : 1}
        />
      )}
      {excluded && (
        <Box
          position="absolute"
          inset="0"
          display="grid"
          placeItems="center"
          fontSize="11px"
          fontWeight={700}
          color="nm.ink"
        >
          除外
        </Box>
      )}
    </Button>
  );
}

function ShopSearch({
  shops,
  onPick,
}: {
  shops: readonly Shop[];
  onPick: (shopId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = query.trim()
    ? shops.filter(createQueryMatcher(query)).slice(0, SEARCH_RESULTS_MAX)
    : [];
  return (
    <Box display="grid" gap="6px" maxW="420px">
      <Input
        autoFocus
        aria-label="店舗を検索"
        placeholder="店名・読み・住所で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        size="sm"
        bg="nm.bg"
        borderColor="nm.line"
        rounded="nmMd"
        fontSize="13px"
      />
      {matches.map((shop) => (
        <Button
          key={shop.id}
          {...smallButton}
          justifyContent="flex-start"
          onClick={() => onPick(shop.id)}
        >
          {shop.name}
          <Box as="span" color="nm.inkFaint" ml="8px" fontSize="11px">
            {shop.address}
          </Box>
        </Button>
      ))}
    </Box>
  );
}
