import { LoadableButton } from "@/components/loadable-button.tsx";
import { Loading } from "@/components/loading.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";

// Renders `children` once the shop list has loaded; until then shows a spinner,
// or a retryable error when the fetch failed. Shares the SWR cache with the page.
export function ShopsLoadState({ children }: { children?: ReactNode }) {
  const { shops, error, isValidating, mutate } = useShops();

  if (shops) {
    return children;
  }

  // Error wins over loading so SWR's automatic retries don't flicker the alert.
  if (error) {
    return (
      <Box
        role="alert"
        aria-busy={isValidating}
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="center"
        gap="0.75rem"
        px="1.25rem"
        py="1rem"
        color="nm.inkMuted"
        fontSize="0.8125rem"
      >
        店舗一覧を読み込めませんでした
        <LoadableButton
          size="sm"
          variant="outline"
          loading={isValidating}
          onClick={() => mutate()}
        >
          再試行
        </LoadableButton>
      </Box>
    );
  }

  return (
    <Box display="flex" justifyContent="center" py="1rem">
      <Loading aria-label="読み込み中" />
    </Box>
  );
}
