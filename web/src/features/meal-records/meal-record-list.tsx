import { LoadableButton } from "@/components/loadable-button.tsx";
import type {
  MealRecord,
  MenuItem,
} from "@/features/meal-records/api/use-meal-records.ts";
import { MealRecordImageGallery } from "@/features/meal-records/meal-record-image-gallery.tsx";
import {
  RecordShopLink,
  RecordVenueLink,
} from "@/features/meal-records/record-navigation.tsx";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import { formatShopDate } from "@/features/shops/status.ts";
import {
  MEAL_RECORDS_LOAD_FAILED_MESSAGE,
  MEAL_RECORDS_REFRESH_FAILED_MESSAGE,
} from "@/utils/toast.ts";
import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";

export function formatMealRecordDate(eatenOn: string | undefined): string {
  return formatShopDate(eatenOn) ?? "日付不明";
}

export function formatPrice(price: number): string {
  return `¥${price.toLocaleString("ja-JP")}`;
}

function NoteBlock({
  label,
  text,
  muted,
}: {
  label: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <Box
      mt="0.375rem"
      px="0.625rem"
      py="0.375rem"
      bg={muted ? "nm.bgSoft" : "nm.paper"}
      borderRadius="nmSm"
    >
      <Box fontSize="0.625rem" color="nm.inkMuted" mb="0.125rem">
        {label}
      </Box>
      <Box
        fontSize="0.75rem"
        color="nm.ink"
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
      >
        {text}
      </Box>
    </Box>
  );
}

const priceProps = {
  as: "span",
  ml: "auto",
  flexShrink: 0,
  fontFamily: "mono",
  fontSize: "0.75rem",
} as const;

// 食べたメニュー in order, each with its 限定 badge and price, then the meal record's 合計.
function MenuItemList({
  items,
  totalPrice,
}: {
  items: readonly MenuItem[];
  totalPrice?: number;
}) {
  return (
    <Box mt="0.25rem" fontSize="0.8125rem" color="nm.ink">
      {/* Not a nested list: each mealRecord stays a single list item. */}
      <Box>
        {items.map((item, i) => (
          <Box key={i} display="flex" alignItems="baseline" gap="0.375rem">
            <Box as="span" overflowWrap="anywhere">
              {item.name}
            </Box>
            {item.isLimited && (
              <Box
                as="span"
                flexShrink={0}
                px="0.375rem"
                py="0.0625rem"
                bg="nm.shu"
                color="white"
                borderRadius="nmSm"
                fontSize="0.625rem"
                fontWeight={600}
              >
                限定
              </Box>
            )}
            {item.price !== undefined && (
              <Box {...priceProps}>{formatPrice(item.price)}</Box>
            )}
          </Box>
        ))}
      </Box>
      {totalPrice !== undefined && (
        <Box
          display="flex"
          alignItems="baseline"
          mt="0.125rem"
          pt="0.125rem"
          borderTop="1px dashed"
          borderColor="nm.line"
          fontSize="0.75rem"
          color="nm.inkMuted"
        >
          合計
          <Box {...priceProps} color="nm.ink">
            {formatPrice(totalPrice)}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function MealRecordEntry({
  mealRecord,
  actions,
  images,
  navigation,
  contextShopId,
}: {
  mealRecord: MealRecord;
  actions?: ReactNode;
  images: ReactNode;
  navigation: boolean;
  contextShopId?: string;
}) {
  // Hidden when the only shop is the one whose list this is, or there is none.
  const showProviders = mealRecord.shops.some(
    (shop) => shop.id !== contextShopId,
  );
  return (
    <Box as="li" bg="nm.bg" borderRadius="nmMd" px="0.875rem" py="0.625rem">
      <Box display="flex" alignItems="center" gap="0.5rem" flexWrap="wrap">
        <Box
          as="span"
          fontFamily="mono"
          fontSize="0.75rem"
          color="nm.ink"
          fontWeight={500}
        >
          {formatMealRecordDate(mealRecord.eatenOn)}
        </Box>
        {mealRecord.rate !== undefined ? (
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            gap="0.25rem"
          >
            <MiniHearts rate={mealRecord.rate} />
            <Box as="span" fontFamily="mono" fontSize="0.6875rem">
              {mealRecord.rate}
            </Box>
          </Box>
        ) : (
          <Box as="span" fontSize="0.6875rem" color="nm.inkFaint">
            お気に入り度 未設定
          </Box>
        )}
        {actions && (
          <Box ml="auto" display="flex" gap="0.25rem">
            {actions}
          </Box>
        )}
      </Box>
      {showProviders && (
        <Box
          mt="0.25rem"
          fontSize="0.75rem"
          display="flex"
          flexWrap="wrap"
          gap="0.375rem"
        >
          {mealRecord.shops.map((shop) =>
            navigation ? (
              <RecordShopLink key={shop.id} shopId={shop.id}>
                {shop.name}
              </RecordShopLink>
            ) : (
              <span key={shop.id}>{shop.name}</span>
            ),
          )}
        </Box>
      )}
      {mealRecord.menuItems.length > 0 && (
        <MenuItemList
          items={mealRecord.menuItems}
          totalPrice={mealRecord.totalPrice}
        />
      )}
      {mealRecord.venue && (
        <Box mt="0.25rem" fontSize="0.6875rem" color="nm.inkMuted">
          催事・出店先:{" "}
          {navigation ? (
            <RecordVenueLink venueId={mealRecord.venue.id}>
              {mealRecord.venue.name}
            </RecordVenueLink>
          ) : (
            mealRecord.venue.name
          )}
        </Box>
      )}
      {mealRecord.publicNote && (
        <NoteBlock label="メモ（公開）" text={mealRecord.publicNote} />
      )}
      {mealRecord.privateNote && (
        <NoteBlock label="メモ（自分用）" text={mealRecord.privateNote} muted />
      )}
      {images}
    </Box>
  );
}

/**
 * 食べた記録 in server order (newest first); `actions` adds per-entry controls and
 * `images` replaces the default 記録の画像 thumbnails.
 */
export function MealRecordList({
  mealRecords,
  actions,
  navigation = true,
  contextShopId,
  // `images` is absent while an older server is still deployed.
  images = (mealRecord) => (
    <MealRecordImageGallery images={mealRecord.images ?? []} />
  ),
}: {
  mealRecords: readonly MealRecord[];
  actions?: (mealRecord: MealRecord) => ReactNode;
  navigation?: boolean;
  contextShopId?: string;
  images?: (mealRecord: MealRecord) => ReactNode;
}) {
  return (
    <Box
      as="ul"
      aria-label="食べた記録"
      listStyleType="none"
      display="flex"
      flexDirection="column"
      gap="0.5rem"
      p="0"
      m="0"
    >
      {mealRecords.map((mealRecord) => (
        <MealRecordEntry
          key={mealRecord.id}
          mealRecord={mealRecord}
          navigation={navigation}
          contextShopId={contextShopId}
          actions={actions?.(mealRecord)}
          images={images(mealRecord)}
        />
      ))}
    </Box>
  );
}

// Same semantics as ShopsLoadState's failure: an alert, busy while retrying.
function RetryNotice({
  message,
  isValidating,
  onRetry,
}: {
  message: string;
  isValidating: boolean;
  onRetry: () => Promise<unknown>;
}) {
  return (
    <Box
      role="alert"
      aria-busy={isValidating}
      display="flex"
      flexWrap="wrap"
      alignItems="center"
      gap="0.5rem"
      fontSize="0.75rem"
      color="nm.inkMuted"
    >
      <Box as="span">{message}</Box>
      <LoadableButton
        size="xs"
        variant="outline"
        loading={isValidating}
        onClick={onRetry}
      >
        再試行
      </LoadableButton>
    </Box>
  );
}

/**
 * Loading, failure and emptiness around a shop's mealRecords. A failed refetch
 * keeps showing the cached meal records with a notice; the full error shows only
 * without data. `children` renders a non-empty list.
 */
export function MealRecordsLoadState({
  mealRecords,
  error,
  isValidating,
  onRetry,
  children,
}: {
  mealRecords: readonly MealRecord[] | undefined;
  error: unknown;
  isValidating: boolean;
  onRetry: () => Promise<unknown>;
  children: (mealRecords: readonly MealRecord[]) => ReactNode;
}) {
  if (!mealRecords) {
    return error ? (
      <RetryNotice
        message={MEAL_RECORDS_LOAD_FAILED_MESSAGE}
        isValidating={isValidating}
        onRetry={onRetry}
      />
    ) : (
      <Box fontSize="0.75rem" color="nm.inkMuted">
        読み込み中…
      </Box>
    );
  }
  return (
    <>
      {!!error && (
        <Box mb="0.5rem">
          <RetryNotice
            message={MEAL_RECORDS_REFRESH_FAILED_MESSAGE}
            isValidating={isValidating}
            onRetry={onRetry}
          />
        </Box>
      )}
      {mealRecords.length === 0 ? (
        <Box fontSize="0.8125rem" color="nm.inkMuted">
          まだ食べた記録がありません
        </Box>
      ) : (
        children(mealRecords)
      )}
    </>
  );
}
