"use client";

import SettingsPanel from "@/components/common/SettingsPanel";

export default function SettingsPage() {
  return (
    <div className="min-h-screen flex items-start justify-center p-6">
      <div className="w-full max-w-2xl">
        <SettingsPanel />
      </div>
    </div>
  );
}
