import type { CategorySlug } from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import {
  mealRecordTitle,
  PLACEHOLDER_BG,
} from "@/features/meal-records/meal-record-card.tsx";
import { Box, chakra, Image } from "@chakra-ui/react";
import { useState } from "react";
import { LuCopy } from "react-icons/lu";

/**
 * One 食べた記録 as a square album tile on phones: its first photo, or the
 * category and first menu name when it has none. Opens the details on tap.
 */
export function MealRecordTile({
  mealRecord,
  category,
  onOpen,
}: {
  mealRecord: MealRecord;
  category: CategorySlug | undefined;
  onOpen: (mealRecord: MealRecord) => void;
}) {
  const title = mealRecordTitle(mealRecord);
  const images = mealRecord.images ?? [];
  const photo = images[0];
  const [failedUrl, setFailedUrl] = useState<string>();
  const showPhoto = photo && photo.url !== failedUrl;
  return (
    <chakra.button
      type="button"
      onClick={() => onOpen(mealRecord)}
      aria-label={title}
      position="relative"
      display="grid"
      placeItems="center"
      w="full"
      aspectRatio="1"
      overflow="hidden"
      cursor="pointer"
      background={
        showPhoto ? "nm.bgSoft" : PLACEHOLDER_BG[category ?? "unknown"]
      }
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "nm.shu",
        outlineOffset: "-2px",
      }}
    >
      {showPhoto ? (
        <Image
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          w="full"
          h="full"
          objectFit="cover"
          onError={() => setFailedUrl(photo.url)}
        />
      ) : (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap="4px"
          px="6px"
          minW="0"
          w="full"
          color="nm.paper"
        >
          {category && (
            <CategoryIcon
              category={category}
              size={28}
              color="var(--chakra-colors-nm-paper)"
            />
          )}
          <Box
            fontSize="10px"
            fontWeight={600}
            lineClamp={2}
            textAlign="center"
            color="nm.ink"
          >
            {mealRecord.menuItems[0]?.name ?? title}
          </Box>
        </Box>
      )}
      {showPhoto && images.length > 1 && (
        <Box
          position="absolute"
          top="4px"
          right="4px"
          color="white"
          filter="drop-shadow(0 0 2px rgba(0,0,0,0.6))"
        >
          <LuCopy size={14} aria-hidden="true" />
        </Box>
      )}
    </chakra.button>
  );
}
