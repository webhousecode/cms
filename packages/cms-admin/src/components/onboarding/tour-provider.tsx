"use client";

import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { WELCOME_TOUR, getTour } from "@/lib/onboarding/tours";
import type { Tour } from "@/lib/onboarding/tours";
import type { OnboardingState } from "@/lib/user-state";
import { TourTooltip } from "./tour-tooltip";
import { SpotlightOverlay } from "./spotlight-overlay";

interface TourContextValue {
  startTour: (tourId: string) => void;
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
  initialOnboarding: OnboardingState;
  locale: string;
  forceOnboarding?: boolean;
}

export function TourProvider({ children, initialOnboarding, locale, forceOnboarding }: TourProviderProps) {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const onboardingRef = useRef<OnboardingState>(initialOnboarding);

  // On mount: start welcome tour if needed
  useEffect(() => {
    const timer = setTimeout(() => {
      if (forceOnboarding || !onboardingRef.current.tourCompleted && !onboardingRef.current.firstLoginAt) {
        setActiveTour(WELCOME_TOUR);
        setStepIndex(0);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Find target element when step changes
  useEffect(() => {
    if (!activeTour) {
      setTargetEl(null);
      return;
    }
    const step = activeTour.steps[stepIndex];
    if (!step) return;

    setTargetEl(null);
    let cancelled = false;
    let attempts = 0;

    const interval = setInterval(() => {
      if (cancelled) return;
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el) {
        clearInterval(interval);
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => {
          if (!cancelled) setTargetEl(el);
        }, 80);
      } else if (++attempts > 20) {
        clearInterval(interval);
        // Skip to next visible step
        if (stepIndex + 1 < activeTour.steps.length) {
          setStepIndex((i) => i + 1);
        } else {
          endTour();
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTour, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistOnboarding(patch: Partial<OnboardingState>) {
    onboardingRef.current = { ...onboardingRef.current, ...patch };
    // Fire-and-forget — don't block UI
    fetch("/api/admin/user-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding: onboardingRef.current }),
    }).catch(() => {});
  }

  function endTour() {
    setActiveTour(null);
    setTargetEl(null);
    if (!forceOnboarding) {
      persistOnboarding({ activeTour: null, tourCompleted: true });
    }
  }

  function handleNext() {
    if (!activeTour) return;

    if (stepIndex + 1 >= activeTour.steps.length) {
      endTour();
    } else {
      setTargetEl(null);
      setStepIndex((i) => i + 1);
      if (!forceOnboarding) {
        persistOnboarding({
          completedSteps: [...onboardingRef.current.completedSteps, activeTour.steps[stepIndex].id],
          activeTour: activeTour.id,
          firstLoginAt: onboardingRef.current.firstLoginAt || new Date().toISOString(),
        });
      }
    }
  }

  function handleSkip() {
    endTour();
  }

  const startTour = useCallback((tourId: string) => {
    const tour = getTour(tourId);
    if (!tour) return;
    setActiveTour(tour);
    setStepIndex(0);
  }, []);

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
