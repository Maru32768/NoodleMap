import {
  AuthenticatedUser,
  useCurrentUser,
} from "@/features/auth/use-current-user.ts";
import { LOGIN_PATH, SEARCH_PATH } from "@/utils/path.ts";
import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

interface Props {
  children: ReactNode;
  permissionPredicate?: (user: AuthenticatedUser) => boolean;
}

export function ProtectedRoute({ children, permissionPredicate }: Props) {
  const currentUser = useCurrentUser();
  const location = useLocation();
  if (currentUser.type === "guest") {
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

  return <>{children}</>;
}
