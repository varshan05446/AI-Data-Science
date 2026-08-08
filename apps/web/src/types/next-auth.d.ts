import type { Role, WorkspaceOut } from "@/lib/types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    role?: Role;
    workspace?: WorkspaceOut;
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    role?: Role;
    workspace?: WorkspaceOut;
  }
}
