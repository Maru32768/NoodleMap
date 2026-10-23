import { Button } from "@/components/ui/button.tsx";
import {
  APP_ERROR_DESCRIPTION,
  APP_ERROR_RELOAD_LABEL,
  APP_ERROR_TITLE,
} from "@/utils/toast.ts";
import { AbsoluteCenter, Box, VStack } from "@chakra-ui/react";
import { Component, ErrorInfo, ReactNode } from "react";

// The e2e suite fails a test on a console error starting with this marker.
const LOG_MARKER = "[AppErrorBoundary]";

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

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(LOG_MARKER, error, info.componentStack);
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
              {APP_ERROR_TITLE}
            </Box>
            <Box fontSize="13px" color="nm.inkMuted">
              {APP_ERROR_DESCRIPTION}
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
              {APP_ERROR_RELOAD_LABEL}
            </Button>
          </VStack>
        </AbsoluteCenter>
      </Box>
    );
  }
}
