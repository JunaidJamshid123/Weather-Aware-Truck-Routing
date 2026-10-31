import { createContext, useContext } from 'react';

import type { ApiError } from '../../api/client';
import type { Location, Plan, PlanRequest } from '../../api/types';

export type PlanState =
  | { status: 'idle' }
  | { status: 'loading'; isSlow: boolean }
  | { status: 'success'; plan: Plan; request?: PlanRequest }
  | { status: 'error'; error: ApiError };

export type PlanContextValue = {
  state: PlanState;
  /** Resolves when the plan arrives; rejects with ApiError so the form can map field errors. */
  submit: (request: PlanRequest) => Promise<void>;
  retry: () => void;
};

export const PlanContext = createContext<PlanContextValue | null>(null);

export function usePlan(): PlanContextValue {
  const value = useContext(PlanContext);
  if (value === null) throw new Error('usePlan must be used inside <PlanProvider>.');
  return value;
}

/** The endpoints as the user picked them. */
export function useCurrentEndpoints(): { origin: Location; destination: Location } | null {
  const { state } = usePlan();
  return state.status === 'success' && state.request
    ? { origin: state.request.origin, destination: state.request.destination }
    : null;
}

export function useCurrentPlan(): Plan | null {
  const { state } = usePlan();
  return state.status === 'success' ? state.plan : null;
}
