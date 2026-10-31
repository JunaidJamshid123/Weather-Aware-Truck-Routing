import type { CheckpointIntervalMi } from '../../lib/constants';
import { CHECKPOINT_INTERVALS_MI } from '../../lib/constants';

type IntervalPickerProps = {
  value: CheckpointIntervalMi;
  onChange: (interval: CheckpointIntervalMi) => void;
};

/** Native radios underneath, so arrow keys and screen readers work for free. */
export function IntervalPicker({ value, onChange }: IntervalPickerProps) {
  return (
    <fieldset>
      <legend className="field-label">Checkpoint every</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {CHECKPOINT_INTERVALS_MI.map((interval) => (
          <label
            key={interval}
            className="flex h-9 cursor-pointer items-center justify-center rounded-lg text-sm font-semibold text-slate-500 transition-all duration-150 hover:text-ink has-checked:bg-surface has-checked:text-brand-700 has-checked:shadow-[0_1px_3px_rgb(15_30_46/0.12)] has-focus-visible:ring-2 has-focus-visible:ring-brand-600"
          >
            <input
              type="radio"
              name="checkpoint-interval"
              value={interval}
              checked={value === interval}
              onChange={() => {
                onChange(interval);
              }}
              className="sr-only"
            />
            {interval} mi
          </label>
        ))}
      </div>
    </fieldset>
  );
}
