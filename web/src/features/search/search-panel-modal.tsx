import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogRoot,
} from "@/components/ui/dialog.tsx";
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
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop />
      <DialogContent>
        <DialogCloseTrigger boxSize="2.5rem" />
        <DialogBody>
          <Box padding={2}>
            <SearchPanel {...searchPanelProps} />
          </Box>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
