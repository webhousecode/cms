import { getAdminCms, getAdminConfig } from "@/lib/cms";
import Link from "next/link";
export default async function AdminDashboard() {
  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

  const stats = await Promise.all(
    config.collections.map(async (col) => {
      const { documents } = await cms.content.findMany(col.name, {});
      const published = documents.filter((d) => d.status === "published").length;
      const draft = documents.filter((d) => d.status === "draft").length;
      return { name: col.name, label: col.label ?? col.name, total: documents.length, published, draft };
    })
  );

  return (
    <>
      <div className="p-8 max-w-5xl">
      <div className="mb-10">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Dashboard</p>
        <h1 className="text-3xl font-bold text-foreground">Content Overview</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((col) => (
          <Link
            key={col.name}
            href={`/admin/${col.name}`}
            className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-4">
              <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase">{col.name}</p>
              <span className="text-2xl font-bold text-primary">{col.total}</span>
            </div>
            <p className="font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">{col.label}</p>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {col.published} published
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                {col.draft} draft
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
    </>
  )
}
