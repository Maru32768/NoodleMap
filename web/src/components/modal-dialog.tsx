import { OverlayProgress } from "@/components/overlay-progress.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogRoot,
} from "@/components/ui/dialog.tsx";
import { Box, HStack } from "@chakra-ui/react";
import React, {
  ComponentProps,
  createContext,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface Props
  extends Pick<
    ComponentProps<typeof DialogContent>,
    "width" | "height" | "maxWidth" | "maxHeight"
  > {
  children: ReactNode | ((ctx: ModalDialogContextProps) => ReactNode);
  buttons?: ModalFooterButton[];
  bodyProps?: ComponentProps<typeof DialogBody>;
  contentProps?: Omit<ComponentProps<typeof DialogContent>, "children">;
  icon?: ReactNode;
  iconBg?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showCloseButton?: boolean;
  subtitle?: ReactNode;
  title?: ReactNode;
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
  height,
  maxHeight,
  maxWidth,
  width,
  bodyProps,
  contentProps,
  icon,
  iconBg = "nm.shu",
  showCloseButton = true,
  subtitle,
  title,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    return () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    };
  }, []);

  const context = useMemo(() => {
    return {
      contentRef,
    };
  }, []);

  const hasHeader = !!title || !!subtitle || !!icon;

  return (
    <DialogRoot
      placement="center"
      open={open}
      onOpenChange={(x) => {
        onOpenChange(x.open);
      }}
    >
      <DialogBackdrop bg="rgba(26, 22, 20, 0.45)" backdropFilter="blur(4px)" />
      <DialogContent
        ref={contentRef}
        width={width ?? "70vw"}
        maxWidth={maxWidth ?? "calc(100vw - 2rem)"}
        height={height}
        maxHeight={maxHeight ?? "calc(100vh - 2rem)"}
        bg="nm.paper"
        border="1px solid"
        borderColor="nm.lineFaint"
        borderRadius="nmLg"
        boxShadow="nmLg"
        display="flex"
        flexDirection="column"
        overflow="hidden"
        p="0"
        backdrop={false}
        {...contentProps}
      >
        <ModalDialogContext.Provider value={context}>
          {hasHeader ? (
            <Box
              display="flex"
              alignItems="center"
              gap="0.875rem"
              px="1.375rem"
              py="1rem"
              borderBottom="1px solid"
              borderBottomColor="nm.lineFaint"
              flexShrink={0}
            >
              {icon && (
                <Box
                  w="40px"
                  h="40px"
                  rounded="nmMd"
                  bg={iconBg}
                  color="white"
                  display="grid"
                  placeItems="center"
                  flexShrink={0}
                >
                  {icon}
                </Box>
              )}
              <Box flex="1" minW="0">
                {title && (
                  <Box
                    fontFamily="display"
                    fontSize="1rem"
                    fontWeight={700}
                    color="nm.ink"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    {title}
                  </Box>
                )}
                {subtitle && (
                  <Box
                    fontFamily="mono"
                    fontSize="0.625rem"
                    letterSpacing="0.15em"
                    color="nm.inkFaint"
                    mt={title ? "0.125rem" : 0}
                  >
                    {subtitle}
                  </Box>
                )}
              </Box>
              {showCloseButton && (
                <Button
                  variant="plain"
                  w="32px"
                  h="32px"
                  minW="32px"
                  minH="32px"
                  p="0"
                  display="grid"
                  placeItems="center"
                  rounded="full"
                  color="nm.inkMuted"
                  bg="nm.bg"
                  _hover={{ bg: "nm.bgSoft", color: "nm.ink" }}
                  onClick={() => onOpenChange(false)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </Button>
              )}
            </Box>
          ) : (
            showCloseButton && <DialogCloseTrigger boxSize="2.5rem" />
          )}
          <DialogBody
            overflow="auto"
            p="1.25rem"
            flex="1"
            minH="0"
            {...bodyProps}
          >
            {typeof children === "function" ? children(context) : children}
          </DialogBody>
          {buttons && buttons.length > 0 && (
            <DialogFooter
              bg="nm.bg"
              borderTop="1px solid"
              borderTopColor="nm.lineFaint"
              px="1.25rem"
              py="0.875rem"
            >
              <HStack>
                {buttons.map((x, i) => {
                  return (
                    <Button
                      key={i}
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
          )}
          {isLoading && <OverlayProgress />}
        </ModalDialogContext.Provider>
      </DialogContent>
    </DialogRoot>
  );
}
