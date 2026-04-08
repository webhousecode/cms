export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div
      className="inline-block animate-spin rounded-full border-2 border-brand-gold border-t-transparent"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
