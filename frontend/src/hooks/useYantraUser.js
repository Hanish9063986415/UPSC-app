import { useEffect, useMemo, useState } from "react";
import {
  captureYantraUserFromUrl,
  getYantraUser,
  subscribeYantraUserUpdates
} from "../lib/yantraUser";

function resolveDisplayName(user) {
  if (user.userName) return user.userName;
  if (user.email) return user.email;
  if (user.userId) return `User ${user.userId.slice(0, 8)}`;
  return null;
}

export function useYantraUser() {
  const [user, setUser] = useState(() => captureYantraUserFromUrl());

  useEffect(() => {
    setUser(getYantraUser());
    return subscribeYantraUserUpdates(setUser);
  }, []);

  const displayName = useMemo(() => resolveDisplayName(user), [user]);
  const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : "?";
  const isSignedIn = Boolean(user.userId || user.userName || user.email);

  return {
    user,
    userId: user.userId,
    userName: user.userName,
    email: user.email,
    displayName,
    initial,
    isSignedIn
  };
}
