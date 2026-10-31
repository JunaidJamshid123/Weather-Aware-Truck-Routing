import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef } from 'react';

import { ApiError, isAbortError } from '../../api/client';
import { fetchPlan } from '../../api/plan';
import type { Plan, PlanRequest } from '../../api/types';
import { useTimeoutFlag } from '../../hooks/useTimeoutFlag';
import { COLD_START_NOTICE_MS } from '../../lib/constants';
import { useUiStore } from '../../store/uiStore';
import type { PlanContextValue, PlanState } from './planContext';
import { PlanContext } from './planContext';

const UNEXPECTED_ERROR = new ApiError('unexpected', 'Something went wrong. Please try again.');

export function PlanProvider({ children }: { children: ReactNode }) {
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<PlanRequest | null>(null);

  const { mutateAsync, status, data, error, variables } = useMutation<Plan, Error, PlanRequest>({
    mutationKey: ['plan'],
    mutationFn: (request) => {
      // A new submit cancels the one still in flight.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return fetchPlan(request, controller.signal);
    },
    onSuccess: (plan) => {
      useUiStore.getState().resetForPlan(plan.recommended_route_id);
    },
  });
  const isSlow = useTimeoutFlag(status === 'pending', COLD_START_NOTICE_MS);

  const submit = useCallback(
    async (request: PlanRequest) => {
      lastRequestRef.current = request;
      try {
        await mutateAsync(request);
      } catch (caught) {
        if (isAbortError(caught)) return;
        throw caught;
      }
    },
    [mutateAsync],
  );

  const retry = useCallback(() => {
    const request = lastRequestRef.current;
    if (request) submit(request).catch(() => undefined); // The error is rendered from state.
  }, [submit]);

  const state = useMemo((): PlanState => {
    if (status === 'pending') return { status: 'loading', isSlow };
    if (status === 'success') return { status: 'success', plan: data, request: variables };
    if (status === 'error') {
      return { status: 'error', error: error instanceof ApiError ? error : UNEXPECTED_ERROR };
    }
    return { status: 'idle' };
  }, [status, data, error, variables, isSlow]);

  const value = useMemo((): PlanContextValue => ({ state, submit, retry }), [state, submit, retry]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
