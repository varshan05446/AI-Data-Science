"use client";

import { Copy, Key, Plus, Trash2, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/lib/hooks";
import type { ApiKeyCreateResponse } from "@/lib/types";

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [createdKey, setCreatedKey] = React.useState<ApiKeyCreateResponse | null>(null);
  const [copiedKey, setCopiedKey] = React.useState(false);

  function handleCreate() {
    if (!newKeyName.trim()) return;
    createKey.mutate(
      { name: newKeyName.trim() },
      {
        onSuccess: (data) => {
          setCreatedKey(data);
          setNewKeyName("");
        },
        onError: () => {
          setShowCreateDialog(false);
        },
      },
    );
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  function handleRevoke(id: string) {
    if (confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      revokeKey.mutate(id);
    }
  }

  function closeDialog() {
    setShowCreateDialog(false);
    setCreatedKey(null);
    setNewKeyName("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage access tokens for programmatic access to your workspace."
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> Create key
          </Button>
        }
      />

      {/* Created key display */}
      {createdKey && (
        <Card className="border-success/30 bg-success/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <CardTitle className="text-sm">API Key Created</CardTitle>
            </div>
            <CardDescription>
              Copy your API key now. It will not be shown again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
              <code className="flex-1 break-all font-mono text-xs text-foreground">
                {createdKey.key}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(createdKey.key)}
                aria-label="Copy key"
              >
                {copiedKey ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button variant="outline" className="mt-3" onClick={closeDialog}>
              I&apos;ve saved this key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API Keys list */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : keys && keys.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active keys</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                      <Key className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {k.prefix}&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Active</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRevoke(k.id)}
                      disabled={revokeKey.isPending}
                      aria-label="Revoke key"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Key className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium">No API keys</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Create an API key to access your workspace programmatically.
          </p>
          <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> Create your first key
          </Button>
        </div>
      )}

      {/* API docs card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">API capabilities</CardTitle>
          <CardDescription>Access all workspace features via REST API.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <span>&bull;</span>
            <span>Upload and manage datasets</span>
          </div>
          <div className="flex items-start gap-2">
            <span>&bull;</span>
            <span>Trigger profiling and model training</span>
          </div>
          <div className="flex items-start gap-2">
            <span>&bull;</span>
            <span>Query AI insights programmatically</span>
          </div>
          <div className="flex items-start gap-2">
            <span>&bull;</span>
            <span>Export results in any supported format</span>
          </div>
          <div className="mt-3 flex items-center gap-1 text-primary">
            <ExternalLink className="h-3 w-3" />
            <span>View API documentation</span>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={closeDialog} title="Create API Key">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Key name</label>
            <Input
              placeholder="e.g., Production, CI/CD Pipeline, Local Dev"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newKeyName.trim() || createKey.isPending}>
              {createKey.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create key
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
