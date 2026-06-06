import { useAuth } from "@/features/auth/use-auth.ts";
import { SEARCH_PATH } from "@/utils/path.ts";
import { toastApiError } from "@/utils/toast.ts";
import { Box, Flex, VStack } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: "outline" | "filled_blue" | "filled_black";
              size: "large" | "medium" | "small";
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

const googleIdentityScript = "https://accounts.google.com/gsi/client";
let googleIdentityScriptPromise: Promise<void> | undefined;

function loadGoogleIdentityScript() {
  if (window.google?.accounts.id) {
    return Promise.resolve();
  }

  googleIdentityScriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${googleIdentityScript}"]`,
    );
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      (event) => {
        // Remove the failed element so a later retry inserts a fresh one
        // instead of attaching to a script that has already errored.
        script.remove();
        reject(event);
      },
      { once: true },
    );

    if (existing) {
      // The script may have finished loading before our listener attached, in
      // which case the "load" event will never fire again. Resolve directly.
      if (window.google?.accounts.id) {
        resolve();
      }
      return;
    }

    script.src = googleIdentityScript;
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }).catch((err) => {
    // Drop the cached rejected promise so future mounts can retry.
    googleIdentityScriptPromise = undefined;
    throw err;
  });

  return googleIdentityScriptPromise;
}

function getSafeRedirectTo(searchParams: URLSearchParams) {
  const redirectTo = searchParams.get("redirectTo");

  if (
    !redirectTo ||
    !redirectTo.startsWith("/") ||
    redirectTo.startsWith("//")
  ) {
    return SEARCH_PATH;
  }

  return redirectTo;
}

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const buttonRef = useRef<HTMLDivElement>(null);
  const redirectTo = getSafeRedirectTo(searchParams);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      console.error("VITE_GOOGLE_OAUTH_CLIENT_ID is not configured.");
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts.id) {
          return;
        }

        buttonRef.current.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (!response.credential) {
              return;
            }

            loginWithGoogle(response.credential).then((result) => {
              if (result.ok) {
                navigate(redirectTo, { replace: true });
                return;
              }

              toastApiError(result.error, {
                fallbackTitle: "Googleログインに失敗しました",
              });
            });
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
        });
      })
      .catch((err) => {
        console.error("failed to load Google Identity Services", err);
      });

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, navigate, redirectTo]);

  return (
    <Flex boxSize="full" justifyContent="center" paddingTop={10}>
      <VStack
        height="fit-content"
        width="30rem"
        maxWidth="calc(100vw - 2rem)"
        bg="gray.100"
        padding={10}
        borderRadius="md"
      >
        <Box ref={buttonRef} minHeight="44px" />
      </VStack>
    </Flex>
  );
}
