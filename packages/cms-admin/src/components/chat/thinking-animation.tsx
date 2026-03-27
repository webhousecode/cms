"use client";

/**
 * Claude-inspired thinking animation.
 * Three dots orbit in a smooth circular pattern with a warm glow.
 */
export function ThinkingAnimation({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ position: "relative", width: "28px", height: "28px" }}>
        <style>{`
          @keyframes chat-orbit {
            0%   { transform: rotate(0deg)   translateX(9px) rotate(0deg);   opacity: 1; }
            33%  { opacity: 0.6; }
            66%  { opacity: 1; }
            100% { transform: rotate(360deg) translateX(9px) rotate(-360deg); opacity: 1; }
          }
          @keyframes chat-pulse-ring {
            0%, 100% { transform: scale(0.85); opacity: 0.15; }
            50%      { transform: scale(1.1);  opacity: 0.05; }
          }
        `}</style>
        {/* Pulse ring */}
        <div
          style={{
            position: "absolute",
            inset: "-2px",
            borderRadius: "50%",
            border: "1.5px solid var(--primary)",
            animation: "chat-pulse-ring 2.4s ease-in-out infinite",
          }}
        />
        {/* Orbiting dots */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "5px",
              height: "5px",
              marginTop: "-2.5px",
              marginLeft: "-2.5px",
              borderRadius: "50%",
              backgroundColor: "var(--primary)",
              animation: `chat-orbit 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
              animationDelay: `${i * -0.6}s`,
            }}
          />
        ))}
        {/* Center dot */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "4px",
            height: "4px",
            marginTop: "-2px",
            marginLeft: "-2px",
            borderRadius: "50%",
            backgroundColor: "var(--primary)",
            opacity: 0.4,
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", fontStyle: "italic" }}>
          {label}
        </span>
      )}
    </div>
  );
}
