"use client";

import { motion } from "framer-motion";
import { FlaskConical, Send, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { ChatArtifacts } from "@/components/dataset/chat-artifacts";
import { LoadingLines } from "@/components/shared/loading";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatMessages, useSendMessage } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const PERSONAS = [
  "Senior Data Scientist",
  "ML Engineer",
  "Statistician",
  "Business Consultant",
  "Python & SQL Expert",
];

const SUGGESTIONS = [
  { label: "Show top products by revenue", hint: "ranking" },
  { label: "What are the key takeaways?", hint: "summary" },
  { label: "Which columns have missing values?", hint: "quality" },
  { label: "Show correlations between metrics", hint: "stats" },
  { label: "What should I predict, and why?", hint: "modelling" },
  { label: "Generate SQL to summarise by category", hint: "sql" },
];

export function ChatTab({ datasetId }: { datasetId: string }) {
  const { data: messages, isLoading } = useChatMessages(datasetId);
  const send = useSendMessage(datasetId);
  const [input, setInput] = React.useState("");
  const sessionIdRef = React.useRef<string | undefined>(undefined);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const hasContext = (messages?.length ?? 0) > 0;

  const router = useRouter();
  const searchParams = useSearchParams();
  const handoffConsumedRef = React.useRef(false);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  async function submit(text: string) {
    const message = text.trim();
    if (!message || send.isPending) return;
    setInput("");
    try {
      const res = await send.mutateAsync({
        message,
        sessionId: sessionIdRef.current,
      });
      sessionIdRef.current = res.session_id;
    } catch {
      toast.error("Could not send message.");
    }
  }

  // Seamless handoff: when the AI Copilot transfers a data question it lands
  // here with `?q=…`. Auto-ask it once, then strip it from the URL so a refresh
  // doesn't re-send the same question.
  React.useEffect(() => {
    if (isLoading || handoffConsumedRef.current) return;
    const q = searchParams.get("q");
    if (!q) return;
    handoffConsumedRef.current = true;
    void submit(q);
    router.replace(`/datasets/${datasetId}?tab=chat`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, searchParams]);

  const isEmpty = !isLoading && (!messages || messages.length === 0);

  return (
    <div className="flex h-[72vh] flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            Data Scientist AI
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {PERSONAS.map((p) => (
              <span
                key={p}
                className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          title="This AI only accesses this dataset. No data from other projects is ever shared."
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Dataset isolated
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin p-4">
        {isLoading ? (
          <LoadingLines count={4} />
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FlaskConical className="h-7 w-7" />
            </div>
            <div>
              <p className="text-base font-semibold">
                Ask anything about your data
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                I&apos;m the <strong>Data Scientist AI</strong> — scoped exclusively
                to this dataset. I understand natural language, compute real
                answers, and explain what they mean — with charts, tables and
                code when they help.
              </p>
            </div>
            <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => submit(s.label)}
                  className="group flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <span>{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {s.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages!.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "flex gap-3",
                m.role === "user" ? "flex-row-reverse" : "flex-row",
              )}
            >
              {m.role === "assistant" ? (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <FlaskConical className="h-4 w-4" />
                </div>
              ) : (
                <Avatar name="You" className="h-8 w-8" />
              )}
              <div
                className={cn(
                  "min-w-0 rounded-2xl px-3.5 py-2.5 text-sm",
                  m.role === "user"
                    ? "max-w-[80%] bg-primary text-primary-foreground"
                    : "w-full max-w-[88%] bg-muted",
                )}
              >
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-1 prose-pre:my-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
                {m.role === "assistant" && <ChatArtifacts payload={m.payload} />}
              </div>
            </motion.div>
          ))
        )}
        {send.isPending && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FlaskConical className="h-4 w-4 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
              <span className="ml-1">Analysing your data…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t bg-background p-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="Ask about trends, rankings, correlations, models… (typos are fine)"
          rows={1}
          className="min-h-[42px] resize-none"
        />
        <Button type="submit" size="icon" disabled={send.isPending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
