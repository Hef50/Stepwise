"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import {
  ChevronDown,
  Gauge,
  Pencil,
  Settings2,
  Spline,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { INSTANT_CPS } from "@/lib/chat/textReveal";
import {
  SPEED_CHANNELS,
  SPEED_LABELS,
  SPEED_MAX_SLIDER,
  SPEED_MIN,
  parseChannelCpsInput,
  speedChannelLabel,
  type SpeedChannel,
} from "@/lib/chat/drawSpeeds";
import {
  MIN_LATEX_FONT_SIZE,
  MAX_LATEX_FONT_SIZE,
  LATEX_FONT_SIZE_STEP,
  latexFontSizeLabel,
} from "@/lib/whiteboard/latexFontSize";
import {
  MIN_WB_TEXT_SIZE,
  MAX_WB_TEXT_SIZE,
  WB_TEXT_SIZE_STEP,
  wbTextSizeLabel,
  type WhiteboardTextMode,
} from "@/lib/whiteboard/textStyle";
import type { DiagramStyle } from "@/lib/whiteboard/diagramStyle";

interface WhiteboardSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  speeds: Record<SpeedChannel, number>;
  onSpeedChange: (channel: SpeedChannel, cps: number) => void;
  latexFontSize?: number;
  onLatexFontSizeChange?: (size: number) => void;
  wbTextSize?: number;
  onWbTextSizeChange?: (size: number) => void;
  wbTextColor?: string;
  onWbTextColorChange?: (color: string) => void;
  wbTextMode?: WhiteboardTextMode;
  onWbTextModeChange?: (mode: WhiteboardTextMode) => void;
  wbDiagramStyle?: DiagramStyle;
  onWbDiagramStyleChange?: (style: DiagramStyle) => void;
  wbDiagramColor?: string;
  onWbDiagramColorChange?: (color: string) => void;
}

function ChannelSpeedRow({
  channel,
  value,
  onChange,
}: {
  channel: SpeedChannel;
  value: number;
  onChange: (cps: number) => void;
}) {
  const min = SPEED_MIN[channel];
  const max = SPEED_MAX_SLIDER[channel];
  const isInstant = value <= 0;
  const sliderValue = isInstant ? max : Math.min(max, value);
  const [draft, setDraft] = useState(isInstant ? "" : String(value));

  useEffect(() => {
    setDraft(isInstant ? "" : String(value));
  }, [value, isInstant]);

  const commitDraft = () => {
    onChange(parseChannelCpsInput(channel, draft));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDraft();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1.5">
        <label className="text-[11px] font-medium text-foreground">
          {SPEED_LABELS[channel]}
        </label>
        <span className="text-[9px] text-muted-foreground">
          {speedChannelLabel(value)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={min}
          max={max}
          step={channel === "diagram" ? 0.1 : 0.5}
          value={sliderValue}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= max) onChange(INSTANT_CPS);
            else onChange(Math.max(min, n));
          }}
          aria-label={SPEED_LABELS[channel]}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
        />
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder="∞"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={handleKeyDown}
          aria-label={`${SPEED_LABELS[channel]} value`}
          className="h-7 w-10 rounded border border-border bg-background px-1 text-center text-[10px] tabular-nums"
        />
      </div>
    </div>
  );
}

/**
 * Compact settings dropdown anchored under tldraw's page menu (top-left).
 * Closed: small gear button. Open: panel expands downward.
 */
export function WhiteboardSettingsPanel({
  open,
  onOpenChange,
  speeds,
  onSpeedChange,
  latexFontSize,
  onLatexFontSizeChange,
  wbTextSize,
  onWbTextSizeChange,
  wbTextColor,
  onWbTextColorChange,
  wbTextMode,
  onWbTextModeChange,
  wbDiagramStyle,
  onWbDiagramStyleChange,
  wbDiagramColor,
  onWbDiagramColorChange,
}: WhiteboardSettingsPanelProps) {
  const [speedsOpen, setSpeedsOpen] = useState(true);
  const [styleOpen, setStyleOpen] = useState(false);

  return (
    <div
      className="pointer-events-none absolute left-2 top-[3.35rem] z-30 flex flex-col items-start gap-1"
      data-whiteboard-settings
    >
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="pointer-events-auto h-9 w-9 rounded-lg border border-border bg-background/95 shadow-md backdrop-blur-sm"
          onClick={() => onOpenChange(true)}
          aria-label="Open settings"
          aria-expanded={false}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      ) : (
        <aside
          className="pointer-events-auto flex max-h-[min(55vh,26rem)] w-[14.5rem] flex-col overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur-sm"
          aria-label="Whiteboard and speed settings"
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-1 border-b border-border px-2 py-1.5">
            <div className="flex items-center gap-1">
              <Settings2
                className="h-3 w-3 text-muted-foreground"
                aria-hidden
              />
              <h2 className="text-[11px] font-semibold">Settings</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onOpenChange(false)}
              aria-label="Close settings"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
            <section className="rounded-md border border-border/80">
              <button
                type="button"
                className="flex h-8 min-h-[32px] w-full items-center justify-between gap-1 px-2 text-left"
                onClick={() => setSpeedsOpen((o) => !o)}
                aria-expanded={speedsOpen}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Gauge
                    className="h-3 w-3 text-muted-foreground"
                    aria-hidden
                  />
                  Speeds
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    speedsOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {speedsOpen && (
                <div className="space-y-2 border-t border-border/80 px-2 pb-2 pt-1.5">
                  {SPEED_CHANNELS.map((ch) => (
                    <ChannelSpeedRow
                      key={ch}
                      channel={ch}
                      value={speeds[ch]}
                      onChange={(cps) => onSpeedChange(ch, cps)}
                    />
                  ))}
                  <p className="text-[9px] leading-snug text-muted-foreground">
                    Top of slider = instant.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-md border border-border/80">
              <button
                type="button"
                className="flex h-8 min-h-[32px] w-full items-center justify-between gap-1 px-2 text-left"
                onClick={() => setStyleOpen((o) => !o)}
                aria-expanded={styleOpen}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Pencil
                    className="h-3 w-3 text-muted-foreground"
                    aria-hidden
                  />
                  Board style
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    styleOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
              {styleOpen && (
                <div className="space-y-2 border-t border-border/80 px-2 pb-2 pt-1.5">
                  {latexFontSize !== undefined && onLatexFontSizeChange && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium">
                          Equation size
                        </span>
                        <span className="text-[9px] text-muted-foreground tabular-nums">
                          {latexFontSize}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_LATEX_FONT_SIZE}
                        max={MAX_LATEX_FONT_SIZE}
                        step={LATEX_FONT_SIZE_STEP}
                        value={latexFontSize}
                        onChange={(e) =>
                          onLatexFontSizeChange(Number(e.target.value))
                        }
                        aria-label="LaTeX equation size"
                        aria-valuetext={`${latexFontSizeLabel(latexFontSize)} (${latexFontSize}px)`}
                        className="h-1 w-full cursor-pointer accent-primary"
                      />
                    </div>
                  )}

                  {wbTextSize !== undefined &&
                    onWbTextSizeChange &&
                    wbTextColor !== undefined &&
                    onWbTextColorChange &&
                    wbTextMode !== undefined &&
                    onWbTextModeChange && (
                      <>
                        <Separator />
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium">
                              Label size
                            </span>
                            <span className="text-[9px] text-muted-foreground tabular-nums">
                              {wbTextSizeLabel(wbTextSize)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={MIN_WB_TEXT_SIZE}
                            max={MAX_WB_TEXT_SIZE}
                            step={WB_TEXT_SIZE_STEP}
                            value={wbTextSize}
                            onChange={(e) =>
                              onWbTextSizeChange(Number(e.target.value))
                            }
                            aria-label="Whiteboard text size"
                            className="h-1 w-full cursor-pointer accent-primary"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium">
                            Label color
                          </span>
                          <label className="relative flex h-8 w-8 min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-border shadow-sm"
                              style={{ backgroundColor: wbTextColor }}
                              aria-hidden
                            />
                            <input
                              type="color"
                              value={wbTextColor}
                              onChange={(e) =>
                                onWbTextColorChange(e.target.value)
                              }
                              aria-label="Whiteboard text color"
                              className="absolute inset-0 cursor-pointer opacity-0"
                            />
                          </label>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium">
                            Label style
                          </span>
                          <div
                            className="flex h-8 min-h-[32px] items-center rounded-md border border-border p-0.5"
                            role="group"
                            aria-label="Handwriting style"
                          >
                            <button
                              type="button"
                              onClick={() => onWbTextModeChange("stroke")}
                              aria-pressed={wbTextMode === "stroke"}
                              aria-label="Pen stroke mode"
                              className={cn(
                                "flex h-6 min-h-[24px] min-w-[24px] items-center justify-center rounded px-1 transition-colors",
                                wbTextMode === "stroke"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => onWbTextModeChange("outline")}
                              aria-pressed={wbTextMode === "outline"}
                              aria-label="Outline handwriting mode"
                              className={cn(
                                "flex h-6 min-h-[24px] min-w-[24px] items-center justify-center rounded px-1 transition-colors",
                                wbTextMode === "outline"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Type className="h-3 w-3" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                  {wbDiagramStyle !== undefined &&
                    onWbDiagramStyleChange &&
                    wbDiagramColor !== undefined &&
                    onWbDiagramColorChange && (
                      <>
                        <Separator />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium">
                            Diagram color
                          </span>
                          <label className="relative flex h-8 w-8 min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-border shadow-sm"
                              style={{ backgroundColor: wbDiagramColor }}
                              aria-hidden
                            />
                            <input
                              type="color"
                              value={wbDiagramColor}
                              onChange={(e) =>
                                onWbDiagramColorChange(e.target.value)
                              }
                              aria-label="Diagram stroke color"
                              className="absolute inset-0 cursor-pointer opacity-0"
                            />
                          </label>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium">
                            Diagram style
                          </span>
                          <div
                            className="flex h-8 min-h-[32px] items-center rounded-md border border-border p-0.5"
                            role="group"
                            aria-label="Diagram draw style"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                onWbDiagramStyleChange("sketchy")
                              }
                              aria-pressed={wbDiagramStyle === "sketchy"}
                              aria-label="Sketchy hand-drawn style"
                              className={cn(
                                "flex h-6 min-h-[24px] min-w-[24px] items-center justify-center rounded px-1 transition-colors",
                                wbDiagramStyle === "sketchy"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => onWbDiagramStyleChange("clean")}
                              aria-pressed={wbDiagramStyle === "clean"}
                              aria-label="Clean geometric style"
                              className={cn(
                                "flex h-6 min-h-[24px] min-w-[24px] items-center justify-center rounded px-1 transition-colors",
                                wbDiagramStyle === "clean"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Spline className="h-3 w-3" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                </div>
              )}
            </section>
          </div>
        </aside>
      )}
    </div>
  );
}
