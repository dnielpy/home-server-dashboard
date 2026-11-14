"use client";

import { useState } from "react";

import { PackagesPanel } from "@/components/sender/packages-panel";
import { UploadPanel } from "@/components/sender/upload-panel";
import { Reveal } from "@/components/ui/reveal";

/** Sender's page: send files on one side, the packages waiting to be opened on the other. */
export function SenderView() {
  // Bumped when a package is sent, so the list shows it without waiting for its next poll
  const [sent, setSent] = useState(0);
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Reveal index={1} className="min-w-0">
        <UploadPanel onSent={() => setSent((n) => n + 1)} />
      </Reveal>
      <Reveal index={2} className="min-w-0">
        <PackagesPanel refreshKey={sent} />
      </Reveal>
    </div>
  );
}
