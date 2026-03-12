@cms: AI-Orkestreret Content Management

Projektplan & Teknisk Blueprint

Dette dokument beskriver visionen, funktionerne og opbygningen af det AI-kontrollerede @cms system, designet til at skalere indholdsproduktion gennem intelligent orkestrering.

1. Visionen: Fra "Editor" til "Orkestrator"

Det traditionelle CMS kræver manuel indtastning, billedredigering og SEO-optimering.
@cms vender bøtten: AI'en gør 90% af arbejdet. Site-ejeren (dig) fungerer som en Orkestrator, der sætter de overordnede mål, designer agenter og godkender det endelige output gennem et high-fidelity command center.

2. Arkitektur og Moduler

A. AI Command Center (Dashboard 2)

Dette er systemets nervesystem. Her styres de globale parametre for alle aktive AI-agenter.

Kreativitet (Temperature): Justerer hvor konservativt eller eksperimenterende AI'en skal skrive.

SEO Vægtning: Bestemmer hvor meget artiklerne skal skrives efter søgemaskine-algoritmer kontra menneskelig læsbarhed.

Model Engine Selection: Mulighed for at skifte mellem forskellige sprogmodeller (f.eks. GPT-4.5 Ultra eller Claude 3.5) alt efter opgavens natur.

B. AI Agent Engine & Deployment

Agenter er specialiserede digitale medarbejdere. Gennem Ny Agent Formularen kan Orkestratoren skræddersy nye agenter med specifikke egenskaber:

Agent Profil & Rolle: Tildel specifikke roller som f.eks. "SEO Strateg", "Copy-Wizard" eller "Social Media Pilot".

System Prompt: Agentens kerne-instruks. Kan defineres manuelt for fuld kontrol eller auto-genereres af systemet for hurtig opsætning.

Adfærd & Tone-of-Voice: Finjustering via skydere for kreativitet, faglighed vs. underholdningsværdi, og tekstlængde (verbosity).

Værktøjer & Integrationer: Agenter kan tildeles "sanser" i form af adgang til Live Web Search, interne databaser eller eksterne billed-generator API'er.

Autonomi-niveau:

Kladde & Godkendelse: Alt output sendes til Kurerings-køen for menneskelig validering (Standard).

Fuld Autonomi: Agenten har rettigheder til at publicere direkte live på systemet (Til "trusted" agenter).

C. Curation Logic (Kurerings-køen)

Alt genereret indhold (fra agenter uden fuld autonomi) lander i en kø. Det er her, Orkestratoren træder ind:

Status "Ready": Indholdet er klar og godkendt af agenterne til din gennemgang.

One-click Publish: Send direkte live med ét klik.

Feedback Loop: Hvis du retter i en tekst i review-processen, lærer systemet og agenten af dine rettelser til næste gang.

3. Tekniske Komponenter

Komponent

Teknologi

Funktion

Frontend

React + Tailwind

Hurtig, mørk og luksuriøs UI med guld-accenter.

AI Backend

LLM API Integration

Motoren bag tekstgenerering og logik (GPT/Claude).

Asset Pipeline

Billed-AI Integration

Automatisk generering af unikke illustrationer.

Data & SEO

Real-time Search APIs

Giver agenterne adgang til live data og trends.

4. Brugerrejsen

Konfiguration: Du definerer dit sites brand-persona og overordnede mål i indstillingerne.

Agent Deployment: Du bygger og træner dine digitale medarbejdere i "Ny Agent"-modulet og udstyrer dem med de rette værktøjer.

Orkestrering: Via AI Command Dashboardet overvåger du systemets OPS (Operations Per Second) og justerer "farten" på produktionen.

Godkendelse: Du tjekker din indbakke/kø dagligt, kurerer det bedste indhold, afviser det svage, og trykker "Publicer".

Vækst: Du overvåger din Performance-fane for at se, hvordan systemet automatisk forbedrer din trafik og SEO-dominans.

@cms er bygget til dem, der vil eje indholdet og sætte retningen, men ikke skrive det hver dag.