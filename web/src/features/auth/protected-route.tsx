import {
  currentUserAtom,
  CurrentUserProvider,
} from "@/features/auth/use-current-user.ts";
import { Navigate } from "react-router";
import { useAtom } from "jotai";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const [currentUser] = useAtom(currentUserAtom);
  if (currentUser === null) {
    return <Navigate to="/" replace />;
  }

  return (
    <CurrentUserProvider value={currentUser}>{children}</CurrentUserProvider>
  );
}
