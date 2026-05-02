import { ModalDialog } from "@/components/modal-dialog.tsx";
import {
  SearchPanel,
  SearchPanelProps,
} from "@/features/search/search-panel.tsx";
import { Box } from "@chakra-ui/react";

interface Props {
  open: boolean;
  onOpenChange: () => void;
  searchPanelProps: SearchPanelProps;
}

export function SearchPanelModal({
  open,
  onOpenChange,
  searchPanelProps,
}: Props) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      width={{ base: "calc(100vw - 24px)", md: "32rem" }}
      bodyProps={{ pt: "48px" }}
    >
      <Box padding={2}>
        <SearchPanel {...searchPanelProps} />
      </Box>
    </ModalDialog>
  );
}
