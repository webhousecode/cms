import { BarChart2 } from "lucide-react";

export default function PerformancePage() {
  return (
    <div className="p-8">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
        Analytics
      </p>
      <h1 className="text-3xl font-bold mb-6">Performance</h1>
      <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
        <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>Analytics kommer i Phase D.</p>
        <p className="text-sm mt-2">
          Her vil du se trafik, konvertering og agent-leaderboard.
        </p>
      </div>
    </div>
  );
}
