/**
 * Auth.js (NextAuth v4) configuration.
 *
 * Two sign-in paths, both resulting in a shared-secret HS256 JWT that the
 * FastAPI backend verifies (see services/api/app/api/deps.py):
 *
 *  - Credentials (email/password): calls the backend /auth/login|register which
 *    returns a ready-to-use access token bound to the user's workspace + role.
 *  - Google (optional, enabled when GOOGLE_CLIENT_ID is set): we mint the
 *    shared-secret JWT ourselves and let the backend lazily provision the user
 *    and a personal workspace on first request.
 *
 * The resulting backend token is exposed on the session as `accessToken` and
 * attached as a Bearer header by the API client.
 */
import { SignJWT } from "jose";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import type { Role, TokenResponse, WorkspaceOut } from "@/lib/types";

const API_BASE_URL =
  process.env.API_BASE_URL || "http://localhost:8000/api/v1";
const AUTH_SECRET =
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

async function mintBackendToken(payload: {
  sub: string;
  email: string;
  name?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(AUTH_SECRET);
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/** Resolve workspace + role for a freshly minted token via the backend. */
async function resolveIdentity(token: string): Promise<TokenResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as TokenResponse;
  } catch {
    return null;
  }
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      name: { label: "Name", type: "text" },
      mode: { label: "Mode", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const mode = credentials.mode === "register" ? "register" : "login";
      const body: Record<string, string> =
        mode === "register"
          ? {
              email: credentials.email,
              password: credentials.password,
              name: credentials.name || "",
            }
          : { email: credentials.email, password: credentials.password };

      const res = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as TokenResponse;
      return {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        image: data.user.image_url ?? undefined,
        backendToken: data.access_token,
        workspace: data.workspace,
        role: data.role,
      } as never;
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  secret: AUTH_SECRET,
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, account }) {
      // Credentials path: authorize() already attached backend fields.
      if (user && (user as never as { backendToken?: string }).backendToken) {
        const u = user as never as {
          backendToken: string;
          workspace: WorkspaceOut;
          role: Role;
        };
        token.backendToken = u.backendToken;
        token.workspace = u.workspace;
        token.role = u.role;
      }
      // Google path: mint a shared-secret token, then resolve workspace/role.
      if (account?.provider === "google" && token.email) {
        const minted = await mintBackendToken({
          sub: (token.sub as string) || (token.email as string),
          email: token.email as string,
          name: (token.name as string) || undefined,
        });
        const identity = await resolveIdentity(minted);
        token.backendToken = identity?.access_token ?? minted;
        token.workspace = identity?.workspace;
        token.role = identity?.role ?? "owner";
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.backendToken as string | undefined;
      session.role = token.role as Role | undefined;
      session.workspace = token.workspace as WorkspaceOut | undefined;
      if (session.user) {
        session.user.id = (token.sub as string) || "";
      }
      return session;
    },
  },
};
