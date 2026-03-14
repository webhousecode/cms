import { BarChart2 } from "lucide-react";

export default function PerformancePage() {
  return (
    <div className="p-8">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
        Analytics
      </p>
      <h1 className="text-2xl font-bold mb-6">Performance</h1>
      <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
        <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>Analytics coming in Phase D.</p>
        <p className="text-sm mt-2">
          Traffic, conversion rates, and agent leaderboard will appear here.
        </p>
      </div>
    </div>
  );
}
