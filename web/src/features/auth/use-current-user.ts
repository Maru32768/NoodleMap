import { createContext, useContext } from "react";

export interface CurrentUser {
  id: string;
  email: string;
}

const currentUserContext = createContext<CurrentUser | null>(null);

export const CurrentUserProvider = currentUserContext.Provider;

export function useCurrentUser() {
  const currentUser = useContext(currentUserContext);
  if (currentUser === null) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider");
  }
  return currentUser;
}
