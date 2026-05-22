import { User } from "@/features/auth/use-auth.ts";
import { createContext, useContext } from "react";

const currentUserContext = createContext<User | undefined>(undefined);

export const CurrentUserProvider = currentUserContext.Provider;

export function useCurrentUser() {
  const currentUser = useContext(currentUserContext);
  if (currentUser === null) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider");
  }
  return currentUser;
}
