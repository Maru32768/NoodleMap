import { ButtonLink } from "@/components/button-link.tsx";
import { LoadableButton } from "@/components/loadable-button.tsx";
import { Loading } from "@/components/loading.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { useAuth } from "@/features/auth/use-auth.ts";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { AuthSession, useSessions } from "@/features/auth/use-sessions.ts";
import { describeUserAgent } from "@/features/auth/user-agent.ts";
import { SEARCH_PATH } from "@/utils/path.ts";
import { toastApiError } from "@/utils/toast.ts";
import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useNavigate } from "react-router";

function formatTime(iso: string) {
  return dayjs(iso).format("YYYY/MM/DD HH:mm");
}

export default function AccountPage() {
  const currentUser = useCurrentUser();
  const { logout } = useAuth();
  const { sessions, revokeSession, revokeOtherSessions } = useSessions();
  const navigate = useNavigate();

  const handleRevoke = async (session: AuthSession) => {
    // Revoking this device is a logout: go through the auth hook so the app state clears too.
    const result = session.current
      ? await logout()
      : await revokeSession(session.id);
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: "ログアウトできませんでした",
      });
      return;
    }
    toaster.success({ description: "ログアウトしました" });
    if (session.current) {
      navigate(SEARCH_PATH, { replace: true });
    }
  };

  const handleRevokeOthers = async () => {
    const result = await revokeOtherSessions();
    if (!result.ok) {
      toastApiError(result.error, {
        fallbackTitle: "ログアウトできませんでした",
      });
      return;
    }
    toaster.success({ description: "他の端末をログアウトしました" });
  };

  return (
    <Box minH="100vh" bg="nm.bg" px="16px" py="32px">
      <Box
        maxW="640px"
        mx="auto"
        display="flex"
        flexDirection="column"
        gap="24px"
      >
        <Flex alignItems="center" justifyContent="space-between" gap="12px">
          <Heading as="h1" fontFamily="display" fontSize="24px" color="nm.ink">
            マイページ
          </Heading>
          <ButtonLink to={SEARCH_PATH} variant="outline" size="sm">
            地図に戻る
          </ButtonLink>
        </Flex>

        {currentUser.type !== "guest" && (
          <Text color="nm.inkSoft" fontSize="14px">
            {currentUser.email}
          </Text>
        )}

        <Box as="section" display="flex" flexDirection="column" gap="12px">
          <Flex
            alignItems="center"
            justifyContent="space-between"
            gap="12px"
            wrap="wrap"
          >
            <Heading as="h2" fontSize="18px" color="nm.ink">
              ログイン中の端末
            </Heading>
            <LoadableButton
              size="sm"
              variant="outline"
              disabled={!sessions?.some((s) => !s.current)}
              onClick={handleRevokeOthers}
            >
              この端末以外をすべてログアウト
            </LoadableButton>
          </Flex>

          {sessions ? (
            <Box
              as="ul"
              aria-label="ログイン中の端末"
              listStyleType="none"
              display="flex"
              flexDirection="column"
              gap="8px"
            >
              {sessions.map((session) => (
                <Box
                  as="li"
                  key={session.id}
                  bg="nm.paper"
                  border="1px solid"
                  borderColor="nm.line"
                  rounded="nmMd"
                  p="14px"
                  display="flex"
                  alignItems="center"
                  gap="12px"
                >
                  <Box flex="1" minW="0">
                    <Flex alignItems="center" gap="8px">
                      <Text fontWeight={600} color="nm.ink">
                        {describeUserAgent(session.userAgent)}
                      </Text>
                      {session.current && (
                        <Box
                          as="span"
                          fontSize="11px"
                          bg="nm.shu"
                          color="white"
                          px="6px"
                          py="1px"
                          rounded="4px"
                        >
                          この端末
                        </Box>
                      )}
                    </Flex>
                    <Text fontSize="12px" color="nm.inkMuted">
                      ログイン: {formatTime(session.createdAt)}
                    </Text>
                    <Text fontSize="12px" color="nm.inkMuted">
                      最終利用（目安）: {formatTime(session.lastUsedAt)}
                    </Text>
                  </Box>
                  <LoadableButton
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(session)}
                  >
                    ログアウト
                  </LoadableButton>
                </Box>
              ))}
            </Box>
          ) : (
            <Loading size="lg" />
          )}
        </Box>
      </Box>
    </Box>
  );
}
