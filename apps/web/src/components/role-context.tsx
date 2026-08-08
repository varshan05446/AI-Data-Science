"use client";

import { useSession } from "next-auth/react";
import { createContext, useContext, useMemo } from "react";

import type { Role } from "@/lib/types";

interface RoleContextValue {
  role: Role;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const value = useMemo<RoleContextValue>(
    () => ({ role: (session?.role as Role) ?? "owner" }),
    [session?.role],
  );
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
