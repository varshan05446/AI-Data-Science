import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

/**
 * Server-side session accessor for Server Components / route handlers.
 * Redirects to /login when there is no authenticated session.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    redirect("/login");
  }
  return session;
}

export async function getSessionOptional() {
  return getServerSession(authOptions);
}
