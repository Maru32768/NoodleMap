import { LoadableButton } from "@/components/loadable-button.tsx";
import { Loading } from "@/components/loading.tsx";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";

// Renders `children` once the shop list has loaded; until then shows a spinner,
// or a retryable error when the fetch failed. Shares the SWR cache with the page.
export function ShopsLoadState({ children }: { children?: ReactNode }) {
  const { shops, isLoading, error, mutate } = useShops();

  if (shops) {
    return children;
  }

  if (error && !isLoading) {
    return (
      <Box
        role="alert"
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap="0.75rem"
        px="1.25rem"
        py="2.5rem"
        textAlign="center"
        color="nm.inkMuted"
        fontSize="0.8125rem"
      >
        店舗一覧を読み込めませんでした
        <LoadableButton size="sm" variant="outline" onClick={() => mutate()}>
          再試行
        </LoadableButton>
      </Box>
    );
  }

  return (
    <Box display="flex" justifyContent="center" py="2.5rem">
      <Loading aria-label="読み込み中" />
    </Box>
  );
}
