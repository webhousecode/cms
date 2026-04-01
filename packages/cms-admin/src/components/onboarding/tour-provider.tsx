"use client";

import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { WELCOME_TOUR, FIRST_DOCUMENT_TOUR, getTour } from "@/lib/onboarding/tours";
import type { Tour, TourStep } from "@/lib/onboarding/tours";
import type { OnboardingState } from "@/lib/user-state";
import { TourTooltip } from "./tour-tooltip";
import { SpotlightOverlay } from "./spotlight-overlay";

interface TourContextValue {
  /** Start a specific tour by ID */
  startTour: (tourId: string) => void;
  /** Is any tour currently running? */
  isActive: boolean;
}

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  isActive: false,
});

export function useTour() {
  return useContext(TourContext);
}

interface TourProviderProps {
  children: React.ReactNode;
  /** Initial onboarding state from server */
  initialOnboarding: OnboardingState;
  /** Site locale for tour text */
  locale: string;
  /** Force tour to show regardless of state (dev mode) */
  forceOnboarding?: boolean;
}

/**
 * Expand collapsed sidebar sections so tour targets become visible.
 * Clicks the "Content" and "Tools" collapsible buttons if they're collapsed.
 */
function ensureSidebarExpanded() {
  // Content section
  const contentBtn = document.querySelector('[data-testid="nav-link-content"]') as HTMLElement | null;
  if (contentBtn) {
    // If the next sibling collection links are NOT visible, the section is collapsed
    const chevron = contentBtn.closest("[data-slot='sidebar-menu-button']")?.querySelector(".lucide-chevron-right");
    if (chevron) contentBtn.click();
  }

  // Tools section
  const toolsBtn = document.querySelector('[data-testid="nav-link-tools"]') as HTMLElement | null;
  if (toolsBtn) {
    const chevron = toolsBtn.closest("[data-slot='sidebar-menu-button']")?.querySelector(".lucide-chevron-right");
    if (chevron) toolsBtn.click();
  }
}

/**
 * Tour orchestrator — manages active tour, step navigation, and state persistence.
 * Renders the spotlight overlay + tooltip when a tour is active.
 */
export function TourProvider({ children, initialOnboarding, locale, forceOnboarding }: TourProviderProps) {
  const [onboarding, setOnboarding] = useState<OnboardingState>(initialOnboarding);
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const skipCountRef = useRef(0);

  // On mount: check if we should start the welcome tour
  useEffect(() => {
    // ONBOARDING=true → always start fresh
    if (forceOnboarding) {
      const timer = setTimeout(() => {
        ensureSidebarExpanded();
        setActiveTour(WELCOME_TOUR);
        setStepIndex(0);
      }, 800);
      return () => clearTimeout(timer);
    }

    if (onboarding.tourCompleted) return;
    if (onboarding.activeTour) {
      const tour = getTour(onboarding.activeTour);
      if (tour) {
        ensureSidebarExpanded();
        setActiveTour(tour);
        const idx = tour.steps.findIndex((s) => !onboarding.completedSteps.includes(s.id));
        setStepIndex(idx >= 0 ? idx : 0);
        return;
      }
    }
    if (!onboarding.firstLoginAt) {
      const timer = setTimeout(() => {
        ensureSidebarExpanded();
        doStartTour(WELCOME_TOUR.id);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve target element when step changes
  useEffect(() => {
    if (!activeTour) {
      setTargetEl(null);
      return;
    }
    const step = activeTour.steps[stepIndex];
    if (!step) return;

    // Reset target for new step
    setTargetEl(null);
    skipCountRef.current = 0;

    let attempts = 0;
    const interval = setInterval(() => {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        clearInterval(interval);
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        // Small delay after scroll for layout to settle
        setTimeout(() => setTargetEl(el), 50);
      } else if (++attempts > 30) {
        // Element not found after 3s — advance to next step via state
        clearInterval(interval);
        skipCountRef.current++;
        // Safety: if we've skipped 3+ consecutive steps, stop the tour
        if (skipCountRef.current >= 3) {
          setActiveTour(null);
          setTargetEl(null);
          return;
        }
        // Move to next step
        if (stepIndex + 1 < activeTour.steps.length) {
          setStepIndex(stepIndex + 1);
        } else {
          setActiveTour(null);
          setTargetEl(null);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeTour, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistState = useCallback(async (patch: Partial<OnboardingState>) => {
    const updated = { ...onboarding, ...patch };
    setOnboarding(updated);
    try {
      await fetch("/api/admin/user-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding: updated }),
      });
    } catch {
      // Silent fail
    }
  }, [onboarding]);

  function doStartTour(tourId: string) {
    const tour = getTour(tourId);
    if (!tour) return;
    setActiveTour(tour);
    setStepIndex(0);
    persistState({
      activeTour: tourId,
      firstLoginAt: onboarding.firstLoginAt || new Date().toISOString(),
    });
  }

  function handleNext() {
    if (!activeTour) return;
    skipCountRef.current = 0; // Reset skip counter on manual advance

    const currentStep = activeTour.steps[stepIndex];
    const newCompleted = currentStep
      ? [...onboarding.completedSteps, currentStep.id]
      : onboarding.completedSteps;

    if (stepIndex + 1 >= activeTour.steps.length) {
      setActiveTour(null);
      setTargetEl(null);
      const isWelcome = activeTour.id === "welcome";
      persistState({
        completedSteps: newCompleted,
        activeTour: null,
        tourCompleted: isWelcome ? true : onboarding.tourCompleted,
      });
    } else {
      setTargetEl(null);
      setStepIndex(stepIndex + 1);
      persistState({
        completedSteps: newCompleted,
        activeTour: activeTour.id,
      });
    }
  }

  function handleSkip() {
    if (!activeTour) return;
    setActiveTour(null);
    setTargetEl(null);
    if (!forceOnboarding) {
      persistState({
        activeTour: null,
        tourCompleted: true,
      });
    }
  }

  const startTour = useCallback((tourId: string) => {
    ensureSidebarExpanded();
    doStartTour(tourId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = activeTour?.steps[stepIndex] ?? null;

  return (
    <TourContext.Provider value={{ startTour, isActive: !!activeTour }}>
      {children}

      {activeTour && currentStep && (
        <>
          <SpotlightOverlay targetEl={targetEl} onClick={handleSkip} />
          {targetEl && (
            <TourTooltip
              step={currentStep}
              locale={locale}
              currentStep={stepIndex}
              totalSteps={activeTour.steps.length}
              onNext={handleNext}
              onSkip={handleSkip}
            />
          )}
        </>
      )}
    </TourContext.Provider>
  );
}
