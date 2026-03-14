import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("cms-session")?.value;
    if (!token) return false;
    const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export default async function Root() {
  // Authenticated users go straight to admin
  if (await isAuthenticated()) {
    redirect("/admin");
  }

  // Unauthenticated users see the landing page
  return <LandingPage />;
}

function LandingPage() {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div
          dangerouslySetInnerHTML={{
            __html: LANDING_HTML,
          }}
        />
        <LandingScript />
      </body>
    </html>
  );
}

function LandingScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          // Scroll reveal
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) entry.target.classList.add('visible');
            });
          }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
          document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
          // Nav scroll
          const nav = document.getElementById('nav');
          window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 60);
          });
          // Smooth anchor scroll
          document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
              e.preventDefault();
              const target = document.querySelector(a.getAttribute('href'));
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          });
        `,
      }}
    />
  );
}

// ─── Inline landing page HTML (styles + markup) ──────────────────
// All sizes scaled up ~25% from original design
const LANDING_HTML = `
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --gold: #F7BB2E;
  --gold-deep: #D9A11A;
  --gold-glow: rgba(247, 187, 46, 0.15);
  --gold-glow-strong: rgba(247, 187, 46, 0.35);
  --dark: #0d0d0d;
  --dark-card: #111119;
  --dark-surface: #16161f;
  --dark-border: #1e1e2e;
  --dark-lobe: #2a2a3e;
  --dark-lobe-outer: #212135;
  --white: #ffffff;
  --grey-100: #f5f5f7;
  --grey-400: #888899;
  --grey-600: #55556a;
  --grey-800: #2a2a3a;
}

html { scroll-behavior: smooth; }

body {
  font-family: 'Outfit', sans-serif;
  background: var(--dark);
  color: var(--white);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px;
}

/* SCROLL REVEAL */
.reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.visible { opacity: 1; transform: translateY(0); }
.reveal-delay-1 { transition-delay: 0.1s; }
.reveal-delay-2 { transition-delay: 0.2s; }
.reveal-delay-3 { transition-delay: 0.3s; }
.reveal-delay-4 { transition-delay: 0.4s; }

/* NAV */
nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 1000;
  padding: 25px 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  background: rgba(13,13,13,0.7);
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: all 0.3s;
}
nav.scrolled { padding: 18px 60px; background: rgba(13,13,13,0.92); }
.nav-logo { display: flex; align-items: center; gap: 12px; text-decoration: none; }
.nav-logo .nav-icon { width: 47px; height: 47px; }
.nav-logo .nav-wordmark { height: 42px; width: auto; }
.nav-links { display: flex; gap: 40px; align-items: center; }
.nav-links a {
  color: var(--grey-400);
  text-decoration: none;
  font-size: 17px;
  font-weight: 400;
  letter-spacing: 0.02em;
  transition: color 0.2s;
}
.nav-links a:hover { color: var(--white); }
.nav-cta {
  background: var(--gold) !important;
  color: var(--dark) !important;
  padding: 10px 25px;
  border-radius: 10px;
  font-weight: 600 !important;
  font-size: 16px !important;
  transition: all 0.2s !important;
}
.nav-cta:hover { background: var(--gold-deep) !important; transform: translateY(-1px); }

/* HERO */
.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 175px 30px 100px;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  top: 10%; left: 50%;
  transform: translateX(-50%);
  width: 1000px; height: 1000px;
  background: radial-gradient(ellipse at center, var(--gold-glow) 0%, transparent 70%);
  pointer-events: none;
  animation: pulse-glow 4s ease-in-out infinite;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
  50% { opacity: 1; transform: translateX(-50%) scale(1.1); }
}
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 75px 75px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

.hero-icon {
  width: 250px; height: 250px;
  margin-bottom: 50px;
  position: relative; z-index: 2;
  animation: float 6s ease-in-out infinite;
  filter: drop-shadow(0 0 50px var(--gold-glow-strong));
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15px); }
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  border-radius: 100px;
  border: 1px solid var(--dark-border);
  background: var(--dark-surface);
  font-size: 16px;
  color: var(--grey-400);
  margin-bottom: 40px;
  position: relative; z-index: 2;
}
.hero-badge .dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--gold);
  animation: blink 2s ease-in-out infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.hero-wordmark {
  width: min(850px, 90vw);
  height: auto;
  position: relative; z-index: 2;
  margin-bottom: 15px;
  filter: drop-shadow(0 4px 24px rgba(0,0,0,0.4));
}

.hero-tagline {
  font-family: 'Courier Prime', monospace;
  font-size: clamp(17px, 2.5vw, 22px);
  color: var(--grey-400);
  text-align: center;
  letter-spacing: 0.1em;
  margin-bottom: 60px;
  position: relative; z-index: 2;
}

.hero-actions {
  display: flex;
  gap: 20px;
  position: relative; z-index: 2;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-primary {
  background: var(--gold);
  color: var(--dark);
  padding: 17px 40px;
  border-radius: 14px;
  font-weight: 700;
  font-size: 19px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border: none;
  cursor: pointer;
}
.btn-primary:hover {
  background: var(--gold-deep);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(247, 187, 46, 0.25);
}

.btn-secondary {
  background: transparent;
  color: var(--white);
  padding: 17px 40px;
  border-radius: 14px;
  font-weight: 500;
  font-size: 19px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--dark-border);
  transition: all 0.25s;
  cursor: pointer;
}
.btn-secondary:hover { border-color: var(--grey-600); background: var(--dark-surface); }

.hero-terminal {
  margin-top: 80px;
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  border-radius: 20px;
  padding: 25px 35px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px;
  position: relative; z-index: 2;
  max-width: 650px;
  width: 100%;
}
.hero-terminal .dots { display: flex; gap: 8px; margin-bottom: 18px; }
.hero-terminal .dots span { width: 12px; height: 12px; border-radius: 50%; }
.hero-terminal .dots span:nth-child(1) { background: #ff5f57; }
.hero-terminal .dots span:nth-child(2) { background: #ffbd2e; }
.hero-terminal .dots span:nth-child(3) { background: #28c840; }
.hero-terminal .line { display: flex; gap: 10px; margin-bottom: 5px; }
.hero-terminal .prompt { color: var(--gold); }
.hero-terminal .cmd { color: var(--white); }
.hero-terminal .output { color: var(--grey-600); }
.hero-terminal .success { color: #28c840; }

/* SECTIONS */
.section { padding: 150px 30px; max-width: 1600px; margin: 0 auto; }
.section-label {
  font-family: 'Courier Prime', monospace;
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin-bottom: 20px;
}
.section-title {
  font-size: clamp(40px, 5vw, 70px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 25px;
}
.section-desc {
  font-size: 22px;
  color: var(--grey-400);
  max-width: 750px;
  line-height: 1.6;
  margin-bottom: 80px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 25px;
}

.feature-card {
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  border-radius: 24px;
  padding: 45px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}
.feature-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold-glow-strong), transparent);
  opacity: 0;
  transition: opacity 0.3s;
}
.feature-card:hover {
  border-color: rgba(247,187,46,0.15);
  transform: translateY(-4px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.feature-card:hover::before { opacity: 1; }

.feature-icon {
  width: 60px; height: 60px;
  border-radius: 15px;
  background: var(--dark-surface);
  border: 1px solid var(--dark-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 25px;
  font-size: 28px;
}
.feature-card h3 { font-size: 25px; font-weight: 700; margin-bottom: 12px; letter-spacing: -0.01em; }
.feature-card p { font-size: 19px; color: var(--grey-400); line-height: 1.6; }
.feature-tag {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: var(--gold);
  background: rgba(247,187,46,0.08);
  padding: 5px 12px;
  border-radius: 8px;
  margin-top: 20px;
}

/* ARCHITECTURE */
.arch-section {
  padding: 150px 30px;
  background: var(--dark-card);
  border-top: 1px solid var(--dark-border);
  border-bottom: 1px solid var(--dark-border);
}
.arch-inner { max-width: 1600px; margin: 0 auto; }
.arch-diagram {
  background: var(--dark);
  border: 1px solid var(--dark-border);
  border-radius: 24px;
  padding: 30px;
  overflow: hidden;
}
.arch-diagram img {
  width: 100%;
  height: auto;
  display: block;
}

/* MCP */
.mcp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  margin-top: 60px;
}
@media (max-width: 768px) { .mcp-grid { grid-template-columns: 1fr; } }

.mcp-card {
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  border-radius: 24px;
  padding: 45px;
  position: relative;
}
.mcp-card.public { border-color: rgba(40,200,64,0.2); }
.mcp-card.auth { border-color: rgba(247,187,46,0.2); }
.mcp-card .card-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  letter-spacing: 0.1em;
  padding: 5px 12px;
  border-radius: 8px;
  display: inline-block;
  margin-bottom: 20px;
}
.mcp-card.public .card-label { color: #28c840; background: rgba(40,200,64,0.08); }
.mcp-card.auth .card-label { color: var(--gold); background: rgba(247,187,46,0.08); }
.mcp-card h3 { font-size: 25px; font-weight: 700; margin-bottom: 8px; }

/* STATS */
.stats {
  display: flex;
  justify-content: center;
  gap: 100px;
  padding: 100px 30px;
  flex-wrap: wrap;
}
.stat { text-align: center; }
.stat-value {
  font-size: 60px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--gold);
  line-height: 1;
  margin-bottom: 10px;
}
.stat-label {
  font-family: 'Courier Prime', monospace;
  font-size: 16px;
  color: var(--grey-400);
  letter-spacing: 0.05em;
}

/* CTA */
.cta-section {
  padding: 150px 30px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.cta-section::before {
  content: '';
  position: absolute;
  bottom: 0; left: 50%;
  transform: translateX(-50%);
  width: 750px; height: 500px;
  background: radial-gradient(ellipse at center, var(--gold-glow) 0%, transparent 70%);
  pointer-events: none;
}
.cta-title {
  font-size: clamp(45px, 6vw, 80px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 30px;
  position: relative; z-index: 1;
}
.cta-subtitle {
  font-family: 'Courier Prime', monospace;
  font-size: 20px;
  color: var(--grey-400);
  margin-bottom: 50px;
  position: relative; z-index: 1;
}

/* FOOTER */
footer {
  border-top: 1px solid var(--dark-border);
  padding: 50px 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 25px;
}
footer .footer-left { display: flex; align-items: center; gap: 15px; }
footer .footer-left svg { width: 30px; height: 30px; }
footer .footer-left span { font-size: 17px; color: var(--grey-600); }
footer .footer-links { display: flex; gap: 30px; }
footer .footer-links a {
  color: var(--grey-600);
  text-decoration: none;
  font-size: 16px;
  transition: color 0.2s;
}
footer .footer-links a:hover { color: var(--gold); }

/* RESPONSIVE */
@media (max-width: 768px) {
  nav { padding: 20px 25px; }
  .nav-links { display: none; }
  .hero { padding: 150px 25px 75px; }
  .hero-icon { width: 175px; height: 175px; }
  .hero-wordmark { width: min(600px, 85vw); }
  .section { padding: 100px 25px; }
  .features-grid { grid-template-columns: 1fr; }
  .stats { gap: 50px; }
  footer { padding: 38px 25px; }
}

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--dark); }
::-webkit-scrollbar-thumb { background: var(--grey-800); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--grey-600); }
</style>

<!-- NAV -->
<nav id="nav">
  <a href="/" class="nav-logo">
    <svg class="nav-icon" viewBox="0 0 335.2 338.48">
      <path fill="#2a2a3e" d="M167.6,0C87.6,0,7.6,48,7.6,144s48,169.6,112,192c32,9.6,48-9.6,48-41.6"/>
      <path fill="#212135" d="M7.6,144c-16,48-6.4,118.4,25.6,156.8,25.6,25.6,64,38.4,86.4,35.2"/>
      <path fill="#f7bb2e" d="M167.6,0c80,0,160,48,160,144s-48,169.6-112,192c-32,9.6-48-9.6-48-41.6"/>
      <path fill="#d9a11a" d="M327.6,144c16,48,6.4,118.4-25.6,156.8-25.6,25.6-64,38.4-86.4,35.2"/>
      <path fill="#fff" d="M52.4,160c38.4-59.73,76.8-89.6,115.2-89.6s76.8,29.87,115.2,89.6c-38.4,59.73-76.8,89.6-115.2,89.6s-76.8-29.87-115.2-89.6Z"/>
      <circle fill="#f7bb2e" cx="167.6" cy="160" r="48"/>
      <circle fill="#0d0d0d" cx="167.6" cy="160" r="20.8"/>
      <circle fill="#fff" opacity=".9" cx="180.4" cy="147.2" r="8.96"/>
      <circle fill="#fff" opacity=".3" cx="158" cy="171.2" r="4.16"/>
    </svg>
    <svg class="nav-wordmark" viewBox="0 0 1122.69 255.2">
      <path fill="#0d0d0d" d="M1054.41,255.2H68.28C30.54,255.2,0,232.3,0,204.1V51.2C0,23,30.54,0,68.28,0h986.14c37.74,0,68.28,22.9,68.28,51.2v152.8c0,28.3-30.54,51.2-68.28,51.2Z"/>
      <g fill="#fff"><path d="M283.1,138.9h-50.4c1.9,8.3,8.9,13.4,19.1,13.4,7.1,0,12.1-2.1,16.7-6.4l10.3,11.1c-6.2,7.1-15.5,10.8-27.5,10.8-23,0-38-14.5-38-34.3s15.2-34.3,35.5-34.3,34.7,13.1,34.7,34.5c-.1,1.5-.3,3.6-.4,5.2ZM232.4,127.6h32.8c-1.4-8.4-7.7-13.9-16.3-13.9s-15.1,5.4-16.5,13.9Z"/><path d="M366.8,133.4c0,20.9-14.5,34.3-33.2,34.3-8.9,0-16.1-2.8-20.9-8.7v7.7h-18.4v-91.9h19.3v32.3c5-5.4,11.8-8,20.1-8,18.6,0,33.1,13.4,33.1,34.3ZM347.2,133.4c0-11.5-7.3-18.4-17-18.4s-17,6.9-17,18.4,7.3,18.4,17,18.4c9.7.1,17-6.9,17-18.4Z"/><path d="M445.7,128.6v38.1h-19.3v-35.1c0-10.8-5-15.7-13.5-15.7-9.3,0-16,5.7-16,18v32.9h-19.3v-91.9h19.3v32.2c5.2-5.2,12.6-7.9,21.2-7.9,15.7-.1,27.6,9.1,27.6,29.4Z"/><path d="M454.8,133.4c0-20.1,15.5-34.3,36.6-34.3s36.5,14.2,36.5,34.3-15.4,34.3-36.5,34.3c-21.1,0-36.6-14.2-36.6-34.3ZM508.4,133.4c0-11.5-7.3-18.4-17-18.4s-17.1,6.9-17.1,18.4,7.4,18.4,17.1,18.4c9.7.1,17-6.9,17-18.4Z"/><path d="M603.9,100.1v66.6h-18.3v-7.9c-5.1,5.8-12.5,8.9-20.7,8.9-16.7,0-28.5-9.4-28.5-30v-37.6h19.3v34.8c0,11.1,5,16.1,13.5,16.1s15.4-5.7,15.4-18v-32.9h19.3Z"/><path d="M615.4,160.5l6.4-13.9c5.9,3.8,15,6.4,23.2,6.4,8.9,0,12.3-2.4,12.3-6.1,0-10.9-40.2.2-40.2-26.4,0-12.6,11.4-21.5,30.8-21.5,9.2,0,19.3,2.1,25.6,5.8l-6.4,13.7c-6.6-3.7-13.1-5-19.2-5-8.7,0-12.4,2.7-12.4,6.2,0,11.4,40.2.4,40.2,26.6,0,12.4-11.5,21.2-31.4,21.2-11.3.2-22.7-2.9-28.9-7Z"/><path d="M752.4,138.9h-50.4c1.9,8.3,8.9,13.4,19.1,13.4,7.1,0,12.1-2.1,16.7-6.4l10.3,11.1c-6.2,7.1-15.5,10.8-27.5,10.8-23,0-38-14.5-38-34.3s15.2-34.3,35.5-34.3,34.7,13.1,34.7,34.5c0,1.5-.2,3.6-.4,5.2ZM701.8,127.6h32.8c-1.4-8.4-7.7-13.9-16.3-13.9s-15.1,5.4-16.5,13.9Z"/><path d="M203.6,94.5v39.8c0,21.2-11.9,33.4-33.5,33.4-9.9,0-18.1-2.7-23.7-10.2-5.5,7.2-13.4,10.2-23.9,10.2-21.7,0-33.4-12.2-33.4-33.4v-39.8h20.9v38.2c0,11.9,3.9,17.4,12.7,17.4s13.1-5.5,13.1-17.4v-38.2h20.9v38.2c0,11.9,4.3,17.4,13.1,17.4s12.7-5.5,12.7-17.4v-38.2h21.1Z"/></g>
      <g fill="#f5ba2b"><path d="M764.05,157.3c0-7.25,5.38-12,12.12-12s12.12,4.75,12.12,12-5.38,12.25-12.12,12.25-12.12-5.12-12.12-12.25Z"/><path d="M868.93,101.3v67.25h-18.62v-7.75c-4.88,5.88-12,8.75-21,8.75-19,0-33.62-13.5-33.62-34.62s14.62-34.63,33.62-34.63c8.25,0,15.25,2.62,20.12,8.12v-7.12h19.5ZM849.8,134.92c0-11.63-7.5-18.63-17.12-18.63s-17.25,7-17.25,18.63,7.5,18.62,17.25,18.62,17.12-7,17.12-18.62Z"/><path d="M956.42,134.92c0,21.12-14.62,34.62-33.5,34.62-8.38,0-15.25-2.62-20.25-8.12v31.38h-19.5v-91.5h18.62v7.75c4.88-5.88,12.12-8.75,21.12-8.75,18.88,0,33.5,13.5,33.5,34.63ZM936.67,134.92c0-11.63-7.38-18.63-17.12-18.63s-17.12,7-17.12,18.63,7.38,18.62,17.12,18.62,17.12-7,17.12-18.62Z"/><path d="M1038.92,134.92c0,21.12-14.62,34.62-33.5,34.62-8.38,0-15.25-2.62-20.25-8.12v31.38h-19.5v-91.5h18.62v7.75c4.88-5.88,12.12-8.75,21.12-8.75,18.88,0,33.5,13.5,33.5,34.63ZM1019.17,134.92c0-11.63-7.38-18.63-17.12-18.63s-17.12,7-17.12,18.63,7.38,18.62,17.12,18.62,17.12-7,17.12-18.62Z"/></g>
    </svg>
  </a>
  <div class="nav-links">
    <a href="#features">Features</a>
    <a href="#architecture">Architecture</a>
    <a href="#mcp">MCP</a>
    <a href="https://github.com/webhousecode/cms" target="_blank">GitHub</a>
    <a href="/login">Log In</a>
    <a href="/signup" class="nav-cta">Sign Up</a>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <svg class="hero-icon" viewBox="0 0 335.2 338.48">
    <path fill="#2a2a3e" d="M167.6,0C87.6,0,7.6,48,7.6,144s48,169.6,112,192c32,9.6,48-9.6,48-41.6"/>
    <path fill="#212135" d="M7.6,144c-16,48-6.4,118.4,25.6,156.8,25.6,25.6,64,38.4,86.4,35.2"/>
    <path fill="#f7bb2e" d="M167.6,0c80,0,160,48,160,144s-48,169.6-112,192c-32,9.6-48-9.6-48-41.6"/>
    <path fill="#d9a11a" d="M327.6,144c16,48,6.4,118.4-25.6,156.8-25.6,25.6-64,38.4-86.4,35.2"/>
    <path fill="#fff" d="M52.4,160c38.4-59.73,76.8-89.6,115.2-89.6s76.8,29.87,115.2,89.6c-38.4,59.73-76.8,89.6-115.2,89.6s-76.8-29.87-115.2-89.6Z"/>
    <circle fill="#f7bb2e" cx="167.6" cy="160" r="48"/>
    <circle fill="#0d0d0d" cx="167.6" cy="160" r="20.8"/>
    <circle fill="#fff" opacity=".9" cx="180.4" cy="147.2" r="8.96"/>
    <circle fill="#fff" opacity=".3" cx="158" cy="171.2" r="4.16"/>
  </svg>

  <div class="hero-badge reveal">
    <span class="dot"></span>
    Now in active development
  </div>

  <svg class="hero-wordmark reveal reveal-delay-1" viewBox="0 0 1122.69 255.2">
    <path fill="#0d0d0d" d="M1054.41,255.2H68.28C30.54,255.2,0,232.3,0,204.1V51.2C0,23,30.54,0,68.28,0h986.14c37.74,0,68.28,22.9,68.28,51.2v152.8c0,28.3-30.54,51.2-68.28,51.2Z"/>
    <g fill="#fff"><path d="M283.1,138.9h-50.4c1.9,8.3,8.9,13.4,19.1,13.4,7.1,0,12.1-2.1,16.7-6.4l10.3,11.1c-6.2,7.1-15.5,10.8-27.5,10.8-23,0-38-14.5-38-34.3s15.2-34.3,35.5-34.3,34.7,13.1,34.7,34.5c-.1,1.5-.3,3.6-.4,5.2ZM232.4,127.6h32.8c-1.4-8.4-7.7-13.9-16.3-13.9s-15.1,5.4-16.5,13.9Z"/><path d="M366.8,133.4c0,20.9-14.5,34.3-33.2,34.3-8.9,0-16.1-2.8-20.9-8.7v7.7h-18.4v-91.9h19.3v32.3c5-5.4,11.8-8,20.1-8,18.6,0,33.1,13.4,33.1,34.3ZM347.2,133.4c0-11.5-7.3-18.4-17-18.4s-17,6.9-17,18.4,7.3,18.4,17,18.4c9.7.1,17-6.9,17-18.4Z"/><path d="M445.7,128.6v38.1h-19.3v-35.1c0-10.8-5-15.7-13.5-15.7-9.3,0-16,5.7-16,18v32.9h-19.3v-91.9h19.3v32.2c5.2-5.2,12.6-7.9,21.2-7.9,15.7-.1,27.6,9.1,27.6,29.4Z"/><path d="M454.8,133.4c0-20.1,15.5-34.3,36.6-34.3s36.5,14.2,36.5,34.3-15.4,34.3-36.5,34.3c-21.1,0-36.6-14.2-36.6-34.3ZM508.4,133.4c0-11.5-7.3-18.4-17-18.4s-17.1,6.9-17.1,18.4,7.4,18.4,17.1,18.4c9.7.1,17-6.9,17-18.4Z"/><path d="M603.9,100.1v66.6h-18.3v-7.9c-5.1,5.8-12.5,8.9-20.7,8.9-16.7,0-28.5-9.4-28.5-30v-37.6h19.3v34.8c0,11.1,5,16.1,13.5,16.1s15.4-5.7,15.4-18v-32.9h19.3Z"/><path d="M615.4,160.5l6.4-13.9c5.9,3.8,15,6.4,23.2,6.4,8.9,0,12.3-2.4,12.3-6.1,0-10.9-40.2.2-40.2-26.4,0-12.6,11.4-21.5,30.8-21.5,9.2,0,19.3,2.1,25.6,5.8l-6.4,13.7c-6.6-3.7-13.1-5-19.2-5-8.7,0-12.4,2.7-12.4,6.2,0,11.4,40.2.4,40.2,26.6,0,12.4-11.5,21.2-31.4,21.2-11.3.2-22.7-2.9-28.9-7Z"/><path d="M752.4,138.9h-50.4c1.9,8.3,8.9,13.4,19.1,13.4,7.1,0,12.1-2.1,16.7-6.4l10.3,11.1c-6.2,7.1-15.5,10.8-27.5,10.8-23,0-38-14.5-38-34.3s15.2-34.3,35.5-34.3,34.7,13.1,34.7,34.5c0,1.5-.2,3.6-.4,5.2ZM701.8,127.6h32.8c-1.4-8.4-7.7-13.9-16.3-13.9s-15.1,5.4-16.5,13.9Z"/><path d="M203.6,94.5v39.8c0,21.2-11.9,33.4-33.5,33.4-9.9,0-18.1-2.7-23.7-10.2-5.5,7.2-13.4,10.2-23.9,10.2-21.7,0-33.4-12.2-33.4-33.4v-39.8h20.9v38.2c0,11.9,3.9,17.4,12.7,17.4s13.1-5.5,13.1-17.4v-38.2h20.9v38.2c0,11.9,4.3,17.4,13.1,17.4s12.7-5.5,12.7-17.4v-38.2h21.1Z"/></g>
    <g fill="#f5ba2b"><path d="M764.05,157.3c0-7.25,5.38-12,12.12-12s12.12,4.75,12.12,12-5.38,12.25-12.12,12.25-12.12-5.12-12.12-12.25Z"/><path d="M868.93,101.3v67.25h-18.62v-7.75c-4.88,5.88-12,8.75-21,8.75-19,0-33.62-13.5-33.62-34.62s14.62-34.63,33.62-34.63c8.25,0,15.25,2.62,20.12,8.12v-7.12h19.5ZM849.8,134.92c0-11.63-7.5-18.63-17.12-18.63s-17.25,7-17.25,18.63,7.5,18.62,17.25,18.62,17.12-7,17.12-18.62Z"/><path d="M956.42,134.92c0,21.12-14.62,34.62-33.5,34.62-8.38,0-15.25-2.62-20.25-8.12v31.38h-19.5v-91.5h18.62v7.75c4.88-5.88,12.12-8.75,21.12-8.75,18.88,0,33.5,13.5,33.5,34.63ZM936.67,134.92c0-11.63-7.38-18.63-17.12-18.63s-17.12,7-17.12,18.63,7.38,18.62,17.12,18.62,17.12-7,17.12-18.62Z"/><path d="M1038.92,134.92c0,21.12-14.62,34.62-33.5,34.62-8.38,0-15.25-2.62-20.25-8.12v31.38h-19.5v-91.5h18.62v7.75c4.88-5.88,12.12-8.75,21.12-8.75,18.88,0,33.5,13.5,33.5,34.63ZM1019.17,134.92c0-11.63-7.38-18.63-17.12-18.63s-17.12,7-17.12,18.63,7.38,18.62,17.12,18.62,17.12-7,17.12-18.62Z"/></g>
  </svg>
  <p class="hero-tagline reveal reveal-delay-2">AI-native content engine</p>

  <div class="hero-actions reveal reveal-delay-3">
    <a href="/signup" class="btn-primary">
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Get Started Free
    </a>
    <a href="/login" class="btn-secondary">Log In &#8594;</a>
  </div>

  <div class="hero-terminal reveal reveal-delay-4">
    <div class="dots"><span></span><span></span><span></span></div>
    <div class="line"><span class="prompt">$</span><span class="cmd">npx @webhouse/cms init --framework next</span></div>
    <div class="line"><span class="success">&#10003;</span><span class="output"> Created cms.config.ts</span></div>
    <div class="line"><span class="success">&#10003;</span><span class="output"> Schema definitions ready</span></div>
    <div class="line"><span class="success">&#10003;</span><span class="output"> AI agents configured</span></div>
    <div class="line"><span class="success">&#10003;</span><span class="output"> Admin dashboard at localhost:3000/admin</span></div>
    <div class="line" style="margin-top:10px"><span class="prompt">&#8594;</span><span class="cmd"> Ready in 847ms</span></div>
  </div>
</section>

<!-- STATS -->
<div class="stats">
  <div class="stat reveal"><div class="stat-value">&lt;3min</div><div class="stat-label">AI scaffold time</div></div>
  <div class="stat reveal reveal-delay-1"><div class="stat-value">&lt;50</div><div class="stat-label">Lines of CMS code needed</div></div>
  <div class="stat reveal reveal-delay-2"><div class="stat-value">95+</div><div class="stat-label">Lighthouse score</div></div>
  <div class="stat reveal reveal-delay-3"><div class="stat-value">0</div><div class="stat-label">Runtime JS in output</div></div>
</div>

<!-- FEATURES -->
<section class="section" id="features">
  <div class="section-label reveal">Features</div>
  <h2 class="section-title reveal reveal-delay-1">Everything the AI<br>shouldn't reinvent.</h2>
  <p class="section-desc reveal reveal-delay-2">Content modeling, persistence, media pipelines, AI orchestration, and static output &#8212; all in one embeddable TypeScript library.</p>

  <div class="features-grid">
    <div class="feature-card reveal">
      <div class="feature-icon">&#129504;</div>
      <h3>AI Agent Orchestration</h3>
      <p>Provider-agnostic agents for content generation, rewriting, translation, SEO optimization, and design token generation. Swap between Anthropic, OpenAI, or local models.</p>
      <span class="feature-tag">@webhouse/cms-ai</span>
    </div>
    <div class="feature-card reveal reveal-delay-1">
      <div class="feature-icon">&#128208;</div>
      <h3>Schema-Driven Content</h3>
      <p>JSON Schema powered collections and blocks. Every piece of content is typed, validated, and introspectable &#8212; so AI agents can reason about structure.</p>
      <span class="feature-tag">cms.config.ts</span>
    </div>
    <div class="feature-card reveal reveal-delay-2">
      <div class="feature-icon">&#9889;</div>
      <h3>Static-First Output</h3>
      <p>The production artifact is always pre-rendered HTML + CSS + minimal JS. No runtime framework unless you opt in. Incremental builds with dependency tracking.</p>
      <span class="feature-tag">npx cms build</span>
    </div>
    <div class="feature-card reveal reveal-delay-3">
      <div class="feature-icon">&#128268;</div>
      <h3>Framework Adapters</h3>
      <p>First-class integration with Next.js (App Router, Server Components, ISR), Astro (island architecture), and generic Node.js/Express.</p>
      <span class="feature-tag">@webhouse/cms-adapter-next</span>
    </div>
    <div class="feature-card reveal">
      <div class="feature-icon">&#128444;&#65039;</div>
      <h3>Media Pipeline</h3>
      <p>Sharp-based image processing with AI generation (Flux, DALL-E), responsive variants, WebP/AVIF conversion, blur hashes, and auto alt-text generation.</p>
      <span class="feature-tag">@webhouse/cms-media</span>
    </div>
    <div class="feature-card reveal reveal-delay-1">
      <div class="feature-icon">&#128274;</div>
      <h3>AI Lock System</h3>
      <p>Field-level protection enforced at the engine level. AI agents can never unlock fields &#8212; only humans can. WriteContext actor threading through all CRUD operations.</p>
      <span class="feature-tag">PATCH-AI-LOCK</span>
    </div>
  </div>
</section>

<!-- ARCHITECTURE -->
<section class="arch-section" id="architecture">
  <div class="arch-inner">
    <div class="section-label reveal">Architecture</div>
    <h2 class="section-title reveal reveal-delay-1">Composable by design.</h2>
    <p class="section-desc reveal reveal-delay-2">A pipeline of discrete stages. Each can be extended, replaced, or bypassed.</p>

    <div class="arch-diagram reveal reveal-delay-3">
      <img src="/architecture-diagram.svg" alt="@webhouse/cms architecture diagram" />
    </div>
  </div>
</section>

<!-- MCP -->
<section class="section" id="mcp">
  <div class="section-label reveal">Model Context Protocol</div>
  <h2 class="section-title reveal reveal-delay-1">Every site speaks<br>to every AI.</h2>
  <p class="section-desc reveal reveal-delay-2">Two MCP servers. One public and read-only &#8212; bundled with every built site. One authenticated &#8212; for content production from Claude, Cursor, or any MCP client.</p>

  <div class="mcp-grid">
    <div class="mcp-card public reveal">
      <span class="card-label">PUBLIC &#183; READ-ONLY</span>
      <h3>cms-mcp-client</h3>
      <p style="color: var(--grey-400); margin: 15px 0 25px; line-height: 1.6; font-size: 19px;">Bundled with every site. Any AI agent can discover and query published content &#8212; no API keys, no documentation needed.</p>
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 15px; color: var(--grey-600); line-height: 2;">
        get_site_summary<br>
        list_collection<br>
        search_content<br>
        get_page<br>
        get_schema<br>
        export_all
      </div>
    </div>
    <div class="mcp-card auth reveal reveal-delay-1">
      <span class="card-label">AUTHENTICATED &#183; READ+WRITE</span>
      <h3>cms-mcp-server</h3>
      <p style="color: var(--grey-400); margin: 15px 0 25px; line-height: 1.6; font-size: 19px;">Full content production from Claude iOS, Claude.ai, Cursor, or Claude Code. Create, edit, publish, generate with AI &#8212; all via MCP.</p>
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 15px; color: var(--grey-600); line-height: 2;">
        create_document &#183; update_document<br>
        publish &#183; unpublish<br>
        generate_with_ai &#183; rewrite_field<br>
        upload_media &#183; generate_image<br>
        trigger_build &#183; get_build_status
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section" id="cta">
  <div class="section-label reveal">Get Started</div>
  <h2 class="cta-title reveal reveal-delay-1">Describe what you want.<br>Get a <span style="color: var(--gold);">production-ready</span> site.</h2>
  <p class="cta-subtitle reveal reveal-delay-2">Then keep iterating with AI or by hand.</p>
  <div class="hero-actions reveal reveal-delay-3" style="justify-content: center;">
    <a href="/signup" class="btn-primary">
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Create Free Account
    </a>
    <a href="https://github.com/webhousecode/cms" class="btn-secondary" target="_blank">
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
      View on GitHub &#8594;
    </a>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="footer-left">
    <svg viewBox="0 0 335.2 338.48" width="30" height="30">
      <path fill="#2a2a3e" d="M167.6,0C87.6,0,7.6,48,7.6,144s48,169.6,112,192c32,9.6,48-9.6,48-41.6"/>
      <path fill="#212135" d="M7.6,144c-16,48-6.4,118.4,25.6,156.8,25.6,25.6,64,38.4,86.4,35.2"/>
      <path fill="#f7bb2e" d="M167.6,0c80,0,160,48,160,144s-48,169.6-112,192c-32,9.6-48-9.6-48-41.6"/>
      <path fill="#d9a11a" d="M327.6,144c16,48,6.4,118.4-25.6,156.8-25.6,25.6-64,38.4-86.4,35.2"/>
      <path fill="#fff" d="M52.4,160c38.4-59.73,76.8-89.6,115.2-89.6s76.8,29.87,115.2,89.6c-38.4,59.73-76.8,89.6-115.2,89.6s-76.8-29.87-115.2-89.6Z"/>
      <circle fill="#f7bb2e" cx="167.6" cy="160" r="48"/>
      <circle fill="#0d0d0d" cx="167.6" cy="160" r="20.8"/>
      <circle fill="#fff" opacity=".9" cx="180.4" cy="147.2" r="8.96"/>
      <circle fill="#fff" opacity=".3" cx="158" cy="171.2" r="4.16"/>
    </svg>
    <span>&#169; 2026 WebHouse &#183; webhouse.app</span>
  </div>
  <div class="footer-links">
    <a href="https://github.com/webhousecode" target="_blank">GitHub</a>
    <a href="https://www.npmjs.com/package/@webhouse/cms" target="_blank">npm</a>
    <a href="https://www.linkedin.com/company/webhouse" target="_blank">LinkedIn</a>
    <a href="mailto:info@webhouse.net">Contact</a>
  </div>
</footer>
`;
