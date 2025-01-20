import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog.tsx";
import React, {
  createContext,
  ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { DialogContentProps, HStack } from "@chakra-ui/react";
import { Button } from "@/components/ui/button.tsx";
import { OverlayProgress } from "@/components/overlay-progress.tsx";

interface Props extends Pick<DialogContentProps, "width"> {
  children: ReactNode | ((ctx: ModalDialogContextProps) => ReactNode);
  buttons: ModalFooterButton[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface ModalFooterButton {
  label: ReactNode;
  isDisabled?: boolean;
  onClick: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => void | Promise<unknown>;
}

interface ModalDialogContextProps {
  contentRef: React.RefObject<HTMLDivElement>;
}

export const ModalDialogContext = createContext<ModalDialogContextProps | null>(
  null,
);

export function ModalDialog({
  children,
  buttons,
  open,
  onOpenChange,
  width,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const context = useMemo(() => {
    return {
      contentRef,
    };
  }, []);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(x) => {
        onOpenChange(x.open);
      }}
    >
      <DialogBackdrop />
      <DialogContent ref={contentRef} width={width ?? "70vw"} maxWidth="100vw">
        <ModalDialogContext.Provider value={context}>
          <DialogCloseTrigger boxSize="2.5rem" />
          <DialogHeader />
          <DialogBody overflow="auto">
            {typeof children === "function" ? children(context) : children}
          </DialogBody>
          <DialogFooter>
            <HStack>
              {buttons.map((x, i) => {
                return (
                  <Button
                    key={i}
                    colorPalette="teal"
                    disabled={x.isDisabled}
                    onClick={(e) => {
                      const res = x.onClick(e);
                      if (res) {
                        setIsLoading(true);
                        res.finally(() => {
                          setIsLoading(false);
                        });
                      }
                    }}
                  >
                    {x.label}
                  </Button>
                );
              })}
            </HStack>
          </DialogFooter>
          {isLoading && <OverlayProgress />}
        </ModalDialogContext.Provider>
      </DialogContent>
    </DialogRoot>
  );
}
