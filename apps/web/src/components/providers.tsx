"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { SessionProvider, signOut } from "next-auth/react";
import { useState } from "react";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme-provider";
import { RoleProvider } from "@/components/role-context";
import { TrainingProvider } from "@/components/training-context";
import { PredictionProvider } from "@/components/prediction-context";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof ApiError && error.status === 401) {
              signOut({ callbackUrl: "/login" });
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            if (error instanceof ApiError && error.status === 401) {
              signOut({ callbackUrl: "/login" });
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RoleProvider>
            <TrainingProvider>
              <PredictionProvider>{children}</PredictionProvider>
            </TrainingProvider>
          </RoleProvider>
          <Toaster
            richColors
            position="bottom-right"
            toastOptions={{ className: "font-sans" }}
          />
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
