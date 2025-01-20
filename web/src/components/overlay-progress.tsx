import { Loading } from "@/components/loading.tsx";
import {
  DialogBackdrop,
  DialogContent,
  DialogRoot,
} from "@/components/ui/dialog.tsx";
import { AbsoluteCenter } from "@chakra-ui/react";

export function OverlayProgress() {
  return (
    <DialogRoot open>
      <DialogBackdrop />
      <DialogContent bg="none" boxSize="full" boxShadow="none">
        <AbsoluteCenter>
          <Loading size="xl" />
        </AbsoluteCenter>
      </DialogContent>
    </DialogRoot>
  );
}
