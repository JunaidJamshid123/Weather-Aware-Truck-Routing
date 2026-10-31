import type { ApiError } from '../../api/client';
import { AlertIcon, RetryIcon } from '../../components/icons';

type ErrorAlertProps = { error: ApiError; onRetry: () => void };

export function ErrorAlert({ error, onRetry }: ErrorAlertProps) {
  // Validation errors need a form change; retrying unchanged is pointless.
  const canRetry = error.code !== 'validation_error';
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border border-coral-100 bg-coral-50 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-coral-600 ring-1 ring-coral-100">
        <AlertIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-bold text-ink">{"Couldn't plan this trip"}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{error.message}</p>
        {canRetry && (
          <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
            <RetryIcon className="size-4" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
