"use client";

import { Users, Plus, Trash2, Loader2, Mail, Shield, ShieldCheck, Eye, BarChart3 } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useMembers, useInviteMember, useRemoveMember } from "@/lib/hooks";
import { useSession } from "next-auth/react";
import type { Role } from "@/lib/types";

const ROLE_CONFIG: Record<Role, { label: string; icon: React.ReactNode; variant: string }> = {
  owner: { label: "Owner", icon: <ShieldCheck className="h-3 w-3" />, variant: "default" },
  data_scientist: { label: "Data Scientist", icon: <Shield className="h-3 w-3" />, variant: "info" },
  analyst: { label: "Analyst", icon: <BarChart3 className="h-3 w-3" />, variant: "secondary" },
  executive: { label: "Executive", icon: <Eye className="h-3 w-3" />, variant: "warning" },
  business: { label: "Business", icon: <Users className="h-3 w-3" />, variant: "outline" },
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "analyst", label: "Analyst" },
  { value: "data_scientist", label: "Data Scientist" },
  { value: "executive", label: "Executive" },
  { value: "business", label: "Business" },
];

export default function TeamPage() {
  const { data: session } = useSession();
  const { data: members, isLoading } = useMembers();
  const inviteMember = useInviteMember();
  const removeMember = useRemoveMember();

  const [showInviteDialog, setShowInviteDialog] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("analyst");
  const [inviteSuccess, setInviteSuccess] = React.useState<string | null>(null);

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    inviteMember.mutate(
      { email: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: (data) => {
          setInviteSuccess(data.message);
          setInviteEmail("");
          setInviteRole("analyst");
          setTimeout(() => setInviteSuccess(null), 3000);
        },
      },
    );
  }

  function handleRemove(userId: string, name: string) {
    if (confirm(`Are you sure you want to remove ${name} from the workspace?`)) {
      removeMember.mutate(userId);
    }
  }

  function closeDialog() {
    setShowInviteDialog(false);
    setInviteEmail("");
    setInviteRole("analyst");
    setInviteSuccess(null);
  }

  const currentUserId = (session?.user as { id?: string })?.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Manage workspace members, roles, and permissions."
        actions={
          <Button onClick={() => setShowInviteDialog(true)}>
            <Users className="h-4 w-4" /> Invite member
          </Button>
        }
      />

      {inviteSuccess && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
          {inviteSuccess}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : members && members.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Workspace members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((m) => {
                const roleConfig = ROLE_CONFIG[m.role] || ROLE_CONFIG.analyst;
                const isCurrentUser = m.user.id === currentUserId;
                return (
                  <li key={m.user.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {m.user.name?.[0]?.toUpperCase() || m.user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {m.user.name || m.user.email}
                          </p>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {m.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={roleConfig.variant as "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline"}>
                        <span className="mr-1 flex items-center gap-1">
                          {roleConfig.icon}
                          {roleConfig.label}
                        </span>
                      </Badge>
                      {!isCurrentUser && m.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemove(m.user.id, m.user.name || m.user.email)}
                          disabled={removeMember.isPending}
                          aria-label="Remove member"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium">Team management</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Members of your workspace will appear here.
          </p>
          <Button className="mt-4" onClick={() => setShowInviteDialog(true)}>
            <Plus className="h-4 w-4" /> Invite your first member
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Roles &amp; permissions</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <Badge variant="default" className="shrink-0"><ShieldCheck className="mr-1 h-3 w-3" />Owner</Badge>
            <span>Full access. Can manage members and billing.</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="info" className="shrink-0"><Shield className="mr-1 h-3 w-3" />Data Scientist</Badge>
            <span>Can create projects, upload datasets, and train models.</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="secondary" className="shrink-0"><BarChart3 className="mr-1 h-3 w-3" />Analyst</Badge>
            <span>Can view datasets, run EDA, and create reports.</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showInviteDialog} onOpenChange={closeDialog} title="Invite team member">
        <div className="space-y-4">
          {inviteSuccess ? (
            <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
              {inviteSuccess}
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium">Email address</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              {inviteSuccess ? "Close" : "Cancel"}
            </Button>
            {!inviteSuccess && (
              <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviteMember.isPending}>
                {inviteMember.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Send invite
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
