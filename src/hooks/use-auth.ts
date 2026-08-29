import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const activeStore = useQuery(api.stores.activeStore);
  const myStores = useQuery(api.stores.myStores);
  const ensureStore = useMutation(api.stores.ensureStore);
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    activeStore,
    myStores,
    ensureStore,
    signIn,
    signOut,
  };
}