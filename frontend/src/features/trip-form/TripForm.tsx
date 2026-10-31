import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ApiError } from '../../api/client';
import { TruckIcon } from '../../components/icons';
import {
  MAX_LOAD_LB,
  MIN_LOAD_LB,
  NO_TRAVEL_WIND_LOAD_LB,
  SEVERE_WIND_LOAD_LB,
} from '../../lib/constants';
import { usePlan } from '../plan/planContext';
import { FieldMessage } from './FieldMessage';
import { IntervalPicker } from './IntervalPicker';
import { LocationCombobox } from './LocationCombobox';
import type { TripFormInput, TripFormValues } from './tripFormSchema';
import {
  buildTripFormSchema,
  defaultTripFormValues,
  departureInputBounds,
  serverFieldErrors,
  toPlanRequest,
} from './tripFormSchema';

const LOAD_RULES_HELP =
  `Wind rules depend on weight: over ${NO_TRAVEL_WIND_LOAD_LB.toLocaleString('en-US')} lb, ` +
  `45–54 mph is No Travel; over ${SEVERE_WIND_LOAD_LB.toLocaleString('en-US')} lb, 35–44 mph is Severe.`;

export function TripForm() {
  const { state, submit } = usePlan();
  const schema = useMemo(() => buildTripFormSchema(), []);
  const [defaultValues] = useState(() => defaultTripFormValues(new Date()));
  const departureBounds = departureInputBounds(new Date());
  const isLoading = state.status === 'loading';

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TripFormInput, unknown, TripFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await submit(toPlanRequest(values));
    } catch (error) {
      if (!(error instanceof ApiError)) return;
      for (const [field, message] of serverFieldErrors(error.details)) {
        setError(field, { type: 'server', message });
      }
    }
  });

  return (
    <form
      noValidate
      aria-label="Plan a trip"
      className="space-y-4"
      onSubmit={(event) => void onSubmit(event)}
    >
      <Controller
        control={control}
        name="origin"
        render={({ field }) => (
          <LocationCombobox
            id="origin"
            label="Origin"
            marker="origin"
            placeholder="City or address, e.g. Dallas, TX"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            error={errors.origin?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="destination"
        render={({ field }) => (
          <LocationCombobox
            id="destination"
            label="Destination"
            marker="destination"
            placeholder="City or address, e.g. Denver, CO"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            error={errors.destination?.message}
          />
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="departure" className="field-label">
            Departure (local time)
          </label>
          <input
            id="departure"
            type="datetime-local"
            className="field-input"
            min={departureBounds.min}
            max={departureBounds.max}
            aria-invalid={errors.departure ? true : undefined}
            aria-describedby="departure-error"
            {...register('departure')}
          />
          <FieldMessage id="departure-error" message={errors.departure?.message} />
        </div>
        <div>
          <label htmlFor="load-weight" className="field-label">
            Load weight (lb)
          </label>
          <input
            id="load-weight"
            type="number"
            inputMode="numeric"
            min={MIN_LOAD_LB}
            max={MAX_LOAD_LB}
            step={1}
            className="field-input"
            aria-invalid={errors.loadWeightLb ? true : undefined}
            aria-describedby="load-weight-help load-weight-error"
            {...register('loadWeightLb', { valueAsNumber: true })}
          />
          <FieldMessage id="load-weight-error" message={errors.loadWeightLb?.message} />
        </div>
      </div>
      <p
        id="load-weight-help"
        className="-mt-1 flex gap-2 rounded-xl bg-brand-50/70 px-3 py-2.5 text-xs leading-relaxed text-ink-soft"
      >
        <TruckIcon className="mt-px size-4 shrink-0 text-brand-600" />
        <span>{LOAD_RULES_HELP}</span>
      </p>

      <Controller
        control={control}
        name="intervalMi"
        render={({ field }) => <IntervalPicker value={field.value} onChange={field.onChange} />}
      />

      <button type="submit" className="btn-primary mt-1 w-full" disabled={isLoading}>
        {isLoading && <span className="spinner" aria-hidden />}
        {isLoading ? 'Planning routes…' : 'Plan routes'}
      </button>
    </form>
  );
}
