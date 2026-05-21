import { User } from "@/features/auth/use-auth.ts";
import { CurrentUserProvider } from "@/features/auth/use-current-user.ts";
import { LOGIN_PATH, SEARCH_PATH } from "@/utils/path.ts";
import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

interface Props {
  children: ReactNode;
  currentUser: User | undefined;
  permissionPredicate?: (user: User) => boolean;
}

export function ProtectedRoute({
  children,
  currentUser,
  permissionPredicate,
}: Props) {
  const location = useLocation();

  if (!currentUser) {
    const redirectTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={`${LOGIN_PATH}?redirectTo=${encodeURIComponent(redirectTo)}`}
        replace
      />
    );
  }

  if (permissionPredicate && !permissionPredicate(currentUser)) {
    return <Navigate to={SEARCH_PATH} replace />;
  }

  return (
    <CurrentUserProvider value={currentUser}>{children}</CurrentUserProvider>
  );
}
