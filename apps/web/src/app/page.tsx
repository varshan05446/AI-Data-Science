import { redirect } from "next/navigation";

import { getSessionOptional } from "@/lib/session";

export default async function RootPage() {
  const session = await getSessionOptional();
  redirect(session?.accessToken ? "/dashboard" : "/login");
}
