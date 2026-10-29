import { ModalDialog } from "@/components/modal-dialog.tsx";
import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import {
  MealRecordCard,
  mealRecordTitle,
} from "@/features/meal-records/meal-record-card.tsx";
import { MealRecordList } from "@/features/meal-records/meal-record-list.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { Box } from "@chakra-ui/react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { GridComponents, VirtuosoGrid } from "react-virtuoso";

const gridComponents: GridComponents = {
  List: forwardRef(function GridList({ children, style, ...props }, ref) {
    return (
      <Box
        ref={ref}
        {...props}
        style={style}
        role="list"
        aria-label="食べた記録"
        display="grid"
        gridTemplateColumns="repeat(auto-fill, minmax(220px, 1fr))"
        gap="1rem"
      >
        {children}
      </Box>
    );
  }),
  Item: forwardRef(function GridItem({ children, ...props }, ref) {
    return (
      <div ref={ref} role="listitem" {...props}>
        {children}
      </div>
    );
  }),
};

/**
 * 食べた記録 as a virtualized grid of cards scrolling inside `scrollParent`;
 * a card opens the record's details in a modal. Renders nothing until
 * `scrollParent` is mounted.
 */
export function MealRecordGrid({
  mealRecords,
  scrollParent,
  showVenue = true,
}: {
  mealRecords: readonly MealRecord[];
  scrollParent: HTMLElement | null;
  // Off on a venue's own page, where every record has that venue.
  showVenue?: boolean;
}) {
  const { shops } = useShops();
  const [opened, setOpened] = useState<MealRecord>();
  const categoryOf = useMemo(
    () => shops && new Map(shops.map((shop) => [shop.id, shop.category])),
    [shops],
  );
  const open = useCallback((record: MealRecord) => setOpened(record), []);

  return (
    <>
      {scrollParent && (
        <VirtuosoGrid
          customScrollParent={scrollParent}
          data={mealRecords}
          components={gridComponents}
          computeItemKey={(_, record) => record.id}
          itemContent={(_, record) => (
            <MealRecordCard
              mealRecord={record}
              category={categoryOf?.get(record.shops[0]?.id)}
              showVenue={showVenue}
              onOpen={open}
            />
          )}
        />
      )}
      <ModalDialog
        open={!!opened}
        onOpenChange={(isOpen) => !isOpen && setOpened(undefined)}
        width="640px"
        title={opened && mealRecordTitle(opened)}
      >
        {opened && <MealRecordList mealRecords={[opened]} />}
      </ModalDialog>
    </>
  );
}
