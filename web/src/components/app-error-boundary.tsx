import { Button } from "@/components/ui/button.tsx";
import { AbsoluteCenter, Box, VStack } from "@chakra-ui/react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Shows a reload prompt instead of a blank page when rendering throws. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <Box position="relative" height="100vh" width="100vw" bg="nm.bg">
        <AbsoluteCenter>
          <VStack gap="16px" px="16px" textAlign="center" role="alert">
            <Box fontFamily="display" fontSize="18px" color="nm.ink">
              エラーが発生しました
            </Box>
            <Box fontSize="13px" color="nm.inkMuted">
              ページを再読み込みしてください。
            </Box>
            <Button
              variant="plain"
              px="18px"
              py="9px"
              h="auto"
              minH="auto"
              fontSize="13px"
              fontWeight={600}
              rounded="nmMd"
              bg="nm.ink"
              color="nm.paper"
              _hover={{ bg: "nm.inkSoft" }}
              onClick={() => window.location.reload()}
            >
              再読み込み
            </Button>
          </VStack>
        </AbsoluteCenter>
      </Box>
    );
  }
}
