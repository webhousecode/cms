// Minimal layout for login/setup — no sidebar, no prefetching of admin routes
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "hsl(0 0% 6%)" }}>
      {children}
    </div>
  );
}
