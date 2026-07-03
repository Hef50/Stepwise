"use client";

import { useState } from "react";
import { Copy, Check, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SchemdrawDiagramProps {
  code: string;
}

export function SchemdrawDiagram({ code }: SchemdrawDiagramProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="my-2 overflow-hidden border-amber-200 dark:border-amber-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-amber-50 dark:bg-amber-950/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Circuit / Schematic
          </CardTitle>
          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
            Schemdraw
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 w-8 p-0 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
          aria-label="Copy Schemdraw code"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="p-4">
        {/* Actual generated Schemdraw code (Python-only, cannot render in-browser) */}
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground leading-relaxed">
          <code>{code}</code>
        </pre>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Schemdraw is Python-only — run this code locally or in a Jupyter
          notebook to render the circuit.
        </p>
      </CardContent>
    </Card>
  );
}
