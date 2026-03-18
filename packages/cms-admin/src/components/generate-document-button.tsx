"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { GenerateDocumentDialog } from "./generate-document-dialog";

interface Props {
  collection: string;
  collectionLabel: string;
}

export function GenerateDocumentButton({ collection, collectionLabel }: Props) {
  const [open, setOpen] = useState(false);

  /* ── "g" key shortcut → open generate dialog ────────────── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "g" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:border-primary/40 hover:bg-secondary transition-all text-muted-foreground"
      >
        <Sparkles style={{ width: "0.8rem", height: "0.8rem" }} />
        Generate
      </button>
      {open && (
        <GenerateDocumentDialog
          collection={collection}
          collectionLabel={collectionLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
