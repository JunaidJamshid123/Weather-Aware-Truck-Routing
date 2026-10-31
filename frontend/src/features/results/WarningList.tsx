import { AlertIcon } from '../../components/icons';
import { ALL_BLOCKED_MESSAGE } from '../../lib/constants';

export function WarningList({ warnings }: { warnings: readonly string[] }) {
  // The all-blocked case already has its own banner.
  const notices = warnings.filter((warning) => warning !== ALL_BLOCKED_MESSAGE);
  if (notices.length === 0) return null;
  return (
    <div
      className="flex gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50 px-3.5 py-3 text-sm text-amber-900"
      role="status"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <ul className="space-y-1">
        {notices.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
