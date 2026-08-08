"use client";

/**
 * Right-side AI panel — the AI Copilot assistant:
 *   • Product guide / onboarding / navigation expert
 *   • Calls POST /copilot/chat — ZERO dataset access
 *   • Friendly, short, structured answers
 *   • Detects data questions and offers a handoff to the dataset Chat tab
 */
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useCopilot } from "@/components/copilot/copilot-context";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Turn {
  role: "user" | "assistant";
  content: string;
  handoff?: boolean;
}

// ---------------------------------------------------------------------------
// Copilot quick-start suggestions
// ---------------------------------------------------------------------------

const COPILOT_SUGGESTIONS = [
  "How do I upload a dataset?",
  "Explain the complete workflow",
  "How do I train a model?",
  "Where is the Notebook?",
  "How do I clean missing values?",
  "What does the Profile tab show?",
];

// ---------------------------------------------------------------------------
// Copilot chat (product guide — no data access)
// ---------------------------------------------------------------------------

function CopilotChat({
  token,
  activeDatasetId,
}: {
  token: string;
  activeDatasetId: string | null;
}) {
  const router = useRouter();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, pending]);

  // Actionable handoff: drop the user straight into the dataset Chat tab with
  // their question preloaded. If no dataset is active, send them to pick one.
  function handoff(prompt: string) {
    if (activeDatasetId) {
      router.push(
        `/datasets/${activeDatasetId}?tab=chat&q=${encodeURIComponent(prompt)}`,
      );
    } else {
      router.push("/datasets");
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setInput("");
    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setPending(true);
    try {
      const history = next.slice(-6).map((t) => ({ role: t.role, content: t.content }));
      const res = await api.copilot.chat(token, message, history);
      setTurns([...next, { role: "assistant", content: res.reply, handoff: res.handoff }]);
    } catch {
      setTurns([...next, { role: "assistant", content: "Sorry, couldn't reach the server. Try again." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-3">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-xs leading-relaxed">
                Hi! I&apos;m your <strong>AI Copilot</strong> — I know every page,
                button and workflow in this platform. Ask me anything about how
                to use it. 👋
              </div>
            </div>
            <div className="space-y-1.5">
              {COPILOT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                  <span>{s}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div
              key={i}
              className={cn("flex gap-2", t.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              {t.role === "assistant" ? (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BookOpen className="h-3.5 w-3.5" />
                </div>
              ) : (
                <Avatar name="You" className="h-7 w-7 text-[10px]" />
              )}
              <div
                className={cn(
                  "min-w-0 rounded-2xl px-3 py-2 text-xs",
                  t.role === "user"
                    ? "max-w-[80%] rounded-tr-sm bg-primary text-primary-foreground"
                    : "max-w-[90%] rounded-tl-sm bg-muted",
                )}
              >
                {t.role === "assistant" ? (
                  <>
                    <div className="prose prose-xs max-w-none dark:prose-invert prose-p:my-0.5 prose-li:my-0 prose-headings:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
                    </div>
                    {t.handoff && (
                      <button
                        type="button"
                        onClick={() => handoff(turns[i - 1]?.content ?? "")}
                        className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                      >
                        <FlaskConical className="h-3 w-3 shrink-0" />
                        Ask the <strong>Data Scientist AI</strong> instead
                        <ArrowRight className="ml-auto h-3 w-3 shrink-0" />
                      </button>
                    )}
                  </>
                ) : (
                  t.content
                )}
              </div>
            </div>
          ))
        )}
        {pending && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="h-3.5 w-3.5 animate-pulse" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-end gap-2 border-t bg-background p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(input); } }}
          placeholder="Ask how to use the platform…"
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function CopilotPanel({ className }: { className?: string }) {
  const { activeDatasetId, open, toggle } = useCopilot();
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";

  if (!open) return null;

  return (
    <aside
      className={cn(
        "flex h-full w-80 flex-col border-l bg-card/95 backdrop-blur-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">AI Copilot</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Description */}
      <div className="border-b bg-muted/30 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          Product guide · Navigation · Workflows · No data access
        </p>
      </div>

      <CopilotChat token={token} activeDatasetId={activeDatasetId} />
    </aside>
  );
}
