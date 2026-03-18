"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewDocumentButton({ collection, titleField = "title", defaultLocale }: { collection: string; titleField?: string; defaultLocale?: string }) {
  const [open, setOpen] = useState(false);

  /* ── "n" key shortcut → open new item form ──────────────── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function create() {
    if (!title.trim()) return;
    setSaving(true);
    const slug = slugify(title);
    const res = await fetch(`/api/cms/${collection}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, data: { [titleField]: title }, locale: defaultLocale }),
    });
    if (res.ok) {
      router.push(`/admin/${collection}/${slug}`);
      router.refresh();
    }
    setSaving(false);
  }

  if (!open) {
    return (
      <Button
        variant="default"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Plus className="w-4 h-4" />
        New item
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") create();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Item title…"
        className="w-56"
      />
      <Button
        variant="default"
        onClick={create}
        disabled={saving || !title.trim()}
      >
        {saving ? "Creating…" : "Create"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
