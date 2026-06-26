"use client";

import { useState } from "react";
import { Copy, Check, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SchemdrawDiagramProps {
  code: string;
}

/** Elegant inline SVG placeholder representing a generic circuit schematic */
const CircuitSVGPlaceholder = () => (
  <svg
    viewBox="0 0 320 160"
    className="w-full max-w-sm text-foreground"
    aria-label="Circuit schematic placeholder"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Outer loop */}
    <line x1="20" y1="30" x2="140" y2="30" />
    <line x1="20" y1="130" x2="300" y2="130" />
    <line x1="20" y1="30" x2="20" y2="130" />
    <line x1="300" y1="30" x2="300" y2="130" />
    <line x1="190" y1="30" x2="300" y2="30" />

    {/* Resistor symbol (zigzag) at top-left */}
    <polyline points="140,30 148,20 156,40 164,20 172,40 180,20 188,40 196,30" />
    <text x="158" y="60" fontSize="10" textAnchor="middle" stroke="none" fill="currentColor">R</text>

    {/* Capacitor symbol at right */}
    <line x1="300" y1="55" x2="300" y2="75" />
    <line x1="290" y1="75" x2="310" y2="75" />
    <line x1="290" y1="85" x2="310" y2="85" />
    <line x1="300" y1="85" x2="300" y2="105" />
    <text x="318" y="83" fontSize="10" textAnchor="start" stroke="none" fill="currentColor">C</text>

    {/* Battery symbol at left */}
    <line x1="20" y1="55" x2="20" y2="65" />
    <line x1="10" y1="65" x2="30" y2="65" />
    <line x1="14" y1="72" x2="26" y2="72" />
    <line x1="20" y1="72" x2="20" y2="82" />
    <text x="36" y="72" fontSize="10" textAnchor="start" stroke="none" fill="currentColor">V</text>

    {/* Inductor coils at bottom */}
    <path d="M 80,130 A 10,10 0 0,1 100,130 A 10,10 0 0,1 120,130 A 10,10 0 0,1 140,130 A 10,10 0 0,1 160,130" />
    <text x="120" y="150" fontSize="10" textAnchor="middle" stroke="none" fill="currentColor">L</text>

    {/* Node dots */}
    <circle cx="20" cy="30" r="3" fill="currentColor" stroke="none" />
    <circle cx="300" cy="30" r="3" fill="currentColor" stroke="none" />
    <circle cx="20" cy="130" r="3" fill="currentColor" stroke="none" />
    <circle cx="300" cy="130" r="3" fill="currentColor" stroke="none" />
  </svg>
);

export function SchemdrawDiagram({ code }: SchemdrawDiagramProps) {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

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
            Circuit / Schematic Diagram
          </CardTitle>
          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
            Schemdraw
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCode(!showCode)}
            className="h-8 px-2 text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
          >
            {showCode ? "Hide" : "View"} Code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 w-8 p-0 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
            aria-label="Copy Schemdraw code"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {/* Visual circuit placeholder */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <CircuitSVGPlaceholder />
          <p className="text-xs text-center text-amber-700 dark:text-amber-400 max-w-xs">
            Interactive circuit rendering requires a Python environment. Copy the
            Schemdraw code below to run it locally or in a Jupyter notebook.
          </p>
        </div>

        {/* Collapsible code view */}
        {showCode && (
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground leading-relaxed">
            <code>{code}</code>
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
