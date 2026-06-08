import { User } from "@/features/auth/use-auth.ts";
import { createContext, useContext } from "react";

export type UserType = "guest" | "admin" | "normal";

type UserProfile = Omit<User, "isAdmin">;

export type GuestUser = { type: "guest" };
export type AuthenticatedUser = UserProfile & { type: "admin" | "normal" };
export type CurrentUser = GuestUser | AuthenticatedUser;

export const GUEST_USER: GuestUser = { type: "guest" };

export function toCurrentUser(user: User | undefined): CurrentUser {
  if (!user) {
    return GUEST_USER;
  }

  const { isAdmin, ...profile } = user;
  return { ...profile, type: isAdmin ? "admin" : "normal" };
}

const currentUserContext = createContext<CurrentUser>(GUEST_USER);

export const CurrentUserProvider = currentUserContext.Provider;

export function useCurrentUser(): CurrentUser {
  return useContext(currentUserContext);
}
