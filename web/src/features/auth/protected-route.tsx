import { CurrentUserProvider } from "@/features/auth/use-current-user.ts";
import { Navigate } from "react-router";
import { ReactNode } from "react";
import { User } from "@/features/auth/use-auth.ts";

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
  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (permissionPredicate && !permissionPredicate(currentUser)) {
    return <Navigate to="/" replace />;
  }

  return (
    <CurrentUserProvider value={currentUser}>{children}</CurrentUserProvider>
  );
}
