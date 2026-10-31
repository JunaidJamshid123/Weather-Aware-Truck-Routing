export function FieldMessage({ id, message }: { id: string; message?: string | undefined }) {
  return (
    <p
      id={id}
      className="mt-1.5 text-xs font-semibold text-coral-600 empty:mt-0"
      aria-live="polite"
    >
      {message}
    </p>
  );
}
