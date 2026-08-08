import { CommandPalette } from "@/components/command-palette";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireSession } from "@/lib/session";

/**
 * Authenticated app shell. Guards the route group server-side (redirects to
 * /login when unauthenticated) and renders the three-column layout:
 * Sidebar | Workspace | AI Copilot.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    <CopilotProvider>
      <div className="flex h-screen overflow-hidden">
        <CommandPalette />
        <Sidebar className="hidden lg:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="w-full px-6 py-6">{children}</div>
          </main>
        </div>
        <CopilotPanel className="hidden lg:flex" />
      </div>
    </CopilotProvider>
  );
}
