export function SplashDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Soft light behind the loader so it reads over the road. */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(60%_100%_at_50%_100%,white_0%,rgb(255_255_255/0.85)_40%,transparent_100%)]" />
      <div className="absolute -bottom-56 -left-40 size-136 rounded-full bg-linear-to-tr from-brand-200/70 to-brand-100/0" />
      <div className="absolute -bottom-72 left-24 size-144 rounded-full bg-brand-100/40" />
      <div className="absolute -top-44 -right-36 hidden size-120 rounded-full bg-linear-to-bl from-brand-300/45 via-brand-200/20 to-transparent split:block" />
      <div className="absolute -top-64 right-40 hidden size-104 rounded-full bg-linear-to-b from-white/25 to-white/0 split:block" />
    </div>
  );
}
