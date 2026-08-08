export { default } from "next-auth/middleware";

/**
 * Protect the authenticated app surface. Unauthenticated users hitting these
 * routes are redirected to /login by NextAuth's middleware.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/datasets/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};
