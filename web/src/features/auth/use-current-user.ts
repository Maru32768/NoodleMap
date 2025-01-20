import { atom } from "jotai";
import { createContext, useContext } from "react";

export interface CurrentUser {
  id: string;
  email: string;
}

export const currentUserAtom = atom<CurrentUser | null>({
  id: "test",
  email: "test@marulab.jp",
});

const currentUserContext = createContext<CurrentUser | null>(null);

export const CurrentUserProvider = currentUserContext.Provider;

export function useCurrentUser() {
  const currentUser = useContext(currentUserContext);
  if (currentUser === null) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider");
  }
  return currentUser;
}
