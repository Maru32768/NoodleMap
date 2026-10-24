import { SegmentedPicker } from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { AddModal } from "@/features/admin/add-modal.tsx";
import type { PhotoGroup } from "@/features/photo-import/grouping.ts";
import type { ShopChoice } from "@/features/photo-import/import-plan.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import type {
  GroupRow,
  RowTab,
} from "@/features/photo-import/use-photo-import.ts";
import { useThumbnail } from "@/features/photo-import/use-thumbnail-url.ts";
import { createQueryMatcher } from "@/features/search/utils.ts";
import type { Shop } from "@/features/shops/api/use-shops.ts";
import { VISIT_IMAGES_MAX } from "@/utils/toast.ts";
import { Box, Image, Input } from "@chakra-ui/react";
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

/** Review rows behind filter tabs, virtualized: an import can hold thousands. */
export function GroupReviewList({
  rows,
  shops,
  readOnly,
  excluded,
  onChoose,
  onTogglePhoto,
  PlaceFinder,
}: {
  rows: readonly GroupRow[];
  shops: readonly Shop[];
  readOnly: boolean;
  excluded: ReadonlySet<number>;
  onChoose: (groupId: number, choice: ShopChoice) => void;
  onTogglePhoto: (photoIndex: number) => void;
  PlaceFinder?: ComponentProps<typeof AddModal>["PlaceFinder"];
}) {
  // Held here, not in the row: Virtuoso unmounts rows scrolled out of view.
  const [addingFor, setAddingFor] = useState<PhotoGroup | null>(null);
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
                onChoose={onChoose}
                onTogglePhoto={onTogglePhoto}
                onAddShop={() => setAddingFor(row.group)}
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
    </Box>
  );
}

function GroupRowView({
  row,
  shopById,
  shops,
  readOnly,
  excluded,
  onChoose,
  onTogglePhoto,
  onAddShop,
}: {
  row: GroupRow;
  shopById: ReadonlyMap<string, Shop>;
  shops: readonly Shop[];
  readOnly: boolean;
  excluded: ReadonlySet<number>;
  onChoose: (groupId: number, choice: ShopChoice) => void;
  onTogglePhoto: (photoIndex: number) => void;
  onAddShop: () => void;
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
            既存の訪問 (画像{row.existingImages}枚)
          </Box>
        )}
        {row.overflow > 0 && (
          <Box fontSize="12px" color="nm.shuDeep">
            上限{VISIT_IMAGES_MAX}枚を超える{row.overflow}枚は取り込まれません
          </Box>
        )}
      </Box>

      <Box display="flex" flexWrap="wrap" gap="6px">
        {group.photos.map((photo, i) => (
          <Thumbnail
            key={photo.index}
            photo={photo}
            label={`写真${i + 1}`}
            excluded={excluded.has(photo.index)}
            disabled={readOnly}
            onToggle={() => onTogglePhoto(photo.index)}
          />
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
