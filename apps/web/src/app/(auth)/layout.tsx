import { Sparkles } from "lucide-react";

/**
 * Split auth layout: product narrative on the left, form on the right.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-foreground/15">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">DataMind AI</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            The AI operating system for data science.
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Upload a dataset and get an explainable, business-ready analysis —
            what we found, why it happens, and what to do next. No black boxes.
          </p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li>• Automated profiling &amp; data quality scoring</li>
            <li>• EDA with plain-language explanations</li>
            <li>• Chat with your data, grounded in the profile</li>
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Your data is never used to train models.
        </p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
