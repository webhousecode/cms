"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, List } from "lucide-react";

type View = "grid" | "list";

export function AgentsViewToggle({ children }: { children: (view: View) => React.ReactNode }) {
  const [view, setView] = useState<View>("grid");

  useEffect(() => {
    const saved = localStorage.getItem("agents-view");
    if (saved === "list" || saved === "grid") setView(saved);
  }, []);

  function toggle(v: View) {
    setView(v);
    localStorage.setItem("agents-view", v);
  }

  return (
    <>
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
        <button
          type="button"
          onClick={() => toggle("grid")}
          className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          title="Grid view"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggle("list")}
          className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          title="List view"
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
      {children(view)}
    </>
  );
}
