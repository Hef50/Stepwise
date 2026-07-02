"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LocalStorageChatStore } from "@/lib/persistence/chatStore";
import { loadSettings, saveSettings, resetSettings, DEFAULT_SETTINGS } from "@/lib/settings";

export function SettingsPanel({ onClose, renderAsDialog = true }: { onClose?: () => void; renderAsDialog?: boolean }) {
  const [talkingSpeed, setTalkingSpeed] = useState<number>(1);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [autosave, setAutosave] = useState<boolean>(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const s = loadSettings();
    setTalkingSpeed(s.talkingSpeed ?? DEFAULT_SETTINGS.talkingSpeed);
    setTtsEnabled(s.ttsEnabled ?? DEFAULT_SETTINGS.ttsEnabled);
    setAutosave(s.autosaveWhiteboard ?? DEFAULT_SETTINGS.autosaveWhiteboard);
  }, []);

  const handleSave = useCallback(() => {
    saveSettings({ talkingSpeed, ttsEnabled, autosaveWhiteboard: autosave });
    onClose?.();
  }, [talkingSpeed, ttsEnabled, autosave, onClose]);

  const handleReset = useCallback(() => {
    resetSettings();
    const s = loadSettings();
    setTalkingSpeed(s.talkingSpeed);
    setTtsEnabled(s.ttsEnabled);
    setAutosave(s.autosaveWhiteboard);
  }, []);

  const handleExport = useCallback(() => {
    const store = new LocalStorageChatStore();
    const sessions = store.listSessions();
    const payload = sessions.map((id) => store.load(id));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stepwise_archives_${new Date().toISOString()}.json`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportClick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Array<any>;
        const store = new LocalStorageChatStore();
        parsed.forEach((session) => {
          if (session?.id) store.save(session);
        });
        alert("Imported archives");
      } catch (err) {
        console.error(err);
        alert("Failed to import archives: invalid file");
      }
    };
    reader.readAsText(f);
  }, []);

  const handleClearAll = useCallback(() => {
    if (!confirm("Clear all saved chat sessions? This cannot be undone.")) return;
    const store = new LocalStorageChatStore();
    const sessions = store.listSessions();
    sessions.forEach((id) => store.clear(id));
    window.dispatchEvent(new CustomEvent("stepwise:clear-voice-data"));
    alert("Cleared all chat sessions and voice transcripts");
  }, []);

  const header = renderAsDialog ? (
    <DialogHeader>
      <DialogTitle>Settings</DialogTitle>
    </DialogHeader>
  ) : (
    <div className="mb-4">
      <h2 className="text-lg font-semibold">Settings</h2>
    </div>
  );

  const footer = (
    <DialogFooter className="mt-4">
      <div className="flex gap-2 w-full justify-between">
        <div>
          <Button variant="ghost" onClick={handleReset}>Reset defaults</Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </DialogFooter>
  );

  const body = (
    <>
      {header}

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Talking speed</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={talkingSpeed}
              onChange={(e) => setTalkingSpeed(Number(e.target.value))}
              className="w-48"
            />
            <div className="text-sm text-muted-foreground">{talkingSpeed.toFixed(1)}x</div>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
            />
            <span className="text-sm">Enable text-to-speech</span>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autosave}
              onChange={(e) => setAutosave(e.target.checked)}
            />
            <span className="text-sm">Auto-save whiteboard snapshots</span>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline">Export archives</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
            <Button onClick={handleImportClick} variant="outline">Import archives</Button>
            <Button onClick={handleClearAll} variant="destructive">Clear all chat data</Button>
          </div>
        </div>
      </div>

      {footer}
    </>
  );

  if (renderAsDialog) {
    return <DialogContent>{body}</DialogContent>;
  }

  return <div className="p-6 bg-background rounded">{body}</div>;
}

export default SettingsPanel;
