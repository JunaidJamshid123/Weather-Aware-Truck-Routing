export function MapFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-mist p-6">
      <p role="alert" className="card max-w-sm p-5 text-center text-sm text-ink-soft">
        {message}
      </p>
    </div>
  );
}
