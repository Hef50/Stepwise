"use client";

import { useEffect, useRef, useState, useId } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { sanitizeMermaid } from "@/lib/markdown/sanitizeMermaid";

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const id = useId();
  const containerId = `mermaid-${id.replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setStatus("loading");
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          fontFamily: "inherit",
        });

        const { svg } = await mermaid.render(containerId, sanitizeMermaid(code));

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setStatus("success");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code, containerId]);

  return (
    <Card className="my-2 overflow-hidden">
      <CardContent className="p-4">
        {status === "loading" && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Diagram rendering failed</p>
              <p className="text-xs text-muted-foreground">{errorMessage}</p>
              <pre className="mt-2 rounded bg-muted p-2 text-xs text-foreground overflow-auto max-h-32">
                {code}
              </pre>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className={`flex justify-center overflow-x-auto ${status !== "success" ? "hidden" : ""}`}
        />
      </CardContent>
    </Card>
  );
}
