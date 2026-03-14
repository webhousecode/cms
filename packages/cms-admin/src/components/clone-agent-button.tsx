"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

export function CloneAgentButton({ id }: { id: string }) {
  const router = useRouter();
  const [cloning, setCloning] = useState(false);

  async function handleClone(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCloning(true);
    try {
      const res = await fetch(`/api/cms/agents/${id}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/admin/agents/${data.id}`);
    } finally {
      setCloning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClone}
      disabled={cloning}
      title="Clone agent"
      style={{
        padding: "0.25rem 0.4rem",
        borderRadius: "5px",
        background: "transparent",
        border: "1px solid transparent",
        cursor: "pointer",
        color: "var(--muted-foreground)",
        display: "flex",
        alignItems: "center",
        gap: "0.2rem",
        fontSize: "0.7rem",
        opacity: cloning ? 0.5 : 1,
        transition: "all 120ms",
      }}
      className="hover:border-border hover:bg-secondary hover:text-foreground"
    >
      <Copy style={{ width: "0.7rem", height: "0.7rem" }} />
      Clone
    </button>
  );
}
