import type { CategorySlug } from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import { formatMealRecordDate } from "@/features/meal-records/meal-record-list.tsx";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import { Box, chakra, Image } from "@chakra-ui/react";
import { useState } from "react";

const PLACEHOLDER_BG: Record<CategorySlug | "unknown", string> = {
  ramen: "linear-gradient(135deg, #e8d5b7, #c9a06a)",
  udon: "linear-gradient(135deg, #ede5cf, #b8a87a)",
  unknown: "#e4ddd0",
};

/** The shops' names, or the venue's for a record served by no registered shop. */
export function mealRecordTitle(mealRecord: MealRecord): string {
  return (
    mealRecord.shops.map((shop) => shop.name).join(" × ") ||
    (mealRecord.venue?.name ?? "")
  );
}

// The first 食べたメニュー, then how many more there are.
function menuSummary(mealRecord: MealRecord): string | undefined {
  const [first, ...rest] = mealRecord.menuItems;
  if (!first) {
    return;
  }
  return rest.length > 0 ? `${first.name} ほか${rest.length}品` : first.name;
}

const oneLine = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

/**
 * One 食べた記録 in the grid, opening its details on click. Every card has the
 * same size (a 3:4 photo frame and fixed text lines), as the virtualized grid needs.
 */
export function MealRecordCard({
  mealRecord,
  category,
  showVenue,
  onOpen,
}: {
  mealRecord: MealRecord;
  // The first shop's category, for the placeholder of a record without photos.
  category: CategorySlug | undefined;
  showVenue: boolean;
  onOpen: (mealRecord: MealRecord) => void;
}) {
  const title = mealRecordTitle(mealRecord);
  const photo = mealRecord.images?.[0];
  const [failedUrl, setFailedUrl] = useState<string>();
  const menu = menuSummary(mealRecord);
  const showPhoto = photo && photo.url !== failedUrl;
  return (
    <chakra.button
      type="button"
      onClick={() => onOpen(mealRecord)}
      display="flex"
      flexDirection="column"
      w="full"
      textAlign="left"
      bg="nm.paper"
      border="1px solid"
      borderColor="nm.lineFaint"
      borderRadius="nmMd"
      overflow="hidden"
      cursor="pointer"
      transition="box-shadow 0.15s, transform 0.15s"
      _hover={{ boxShadow: "nmMd", transform: "translateY(-2px)" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "nm.shu" }}
    >
      <Box
        aspectRatio="3 / 4"
        w="full"
        // Without it a photo taller than the frame stretches the frame.
        overflow="hidden"
        background={
          showPhoto ? "nm.bgSoft" : PLACEHOLDER_BG[category ?? "unknown"]
        }
        display="grid"
        placeItems="center"
      >
        {showPhoto ? (
          <Image
            src={photo.url}
            alt={`${title}の写真`}
            loading="lazy"
            decoding="async"
            w="full"
            h="full"
            // The whole photo, with bands above and below a landscape one.
            objectFit="contain"
            onError={() => setFailedUrl(photo.url)}
          />
        ) : (
          category && (
            <CategoryIcon
              category={category}
              size={48}
              color="var(--chakra-colors-nm-paper)"
            />
          )
        )}
      </Box>
      <Box px="0.75rem" py="0.625rem" w="full" minW="0">
        <Box display="flex" alignItems="center" gap="0.5rem" h="1.125rem">
          <Box as="span" fontFamily="mono" fontSize="0.75rem" color="nm.ink">
            {formatMealRecordDate(mealRecord.eatenOn)}
          </Box>
          {mealRecord.rate !== undefined && (
            <Box as="span" ml="auto">
              <MiniHearts rate={mealRecord.rate} />
            </Box>
          )}
        </Box>
        <Box
          mt="0.25rem"
          h="1.375rem"
          fontSize="0.875rem"
          fontWeight={600}
          color="nm.ink"
          {...oneLine}
          // The whole name when it is cut off.
          title={title}
        >
          {title}
        </Box>
        <Box h="1.125rem" fontSize="0.75rem" color="nm.inkMuted" {...oneLine}>
          {menu}
        </Box>
        {showVenue && (
          <Box h="1rem" fontSize="0.6875rem" color="nm.inkFaint" {...oneLine}>
            {mealRecord.venue?.name}
          </Box>
        )}
      </Box>
    </chakra.button>
  );
}
