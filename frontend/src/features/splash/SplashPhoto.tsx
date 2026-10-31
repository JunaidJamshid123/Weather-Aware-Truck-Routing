import { useState } from 'react';

/** In portrait the photo only fills the space above the copy, so text never sits on it. */
export function SplashPhoto() {
  const [hasLoaded, setHasLoaded] = useState(false);
  return (
    <div
      aria-hidden
      className="relative min-h-[16%] flex-1 overflow-hidden split:absolute split:inset-0"
    >
      <picture>
        <source
          type="image/webp"
          srcSet="/truck-1100.webp 1100w, /truck-1769.webp 1769w"
          sizes="100vw"
        />
        <img
          src="/truck.jpg"
          alt=""
          decoding="async"
          onLoad={() => {
            setHasLoaded(true);
          }}
          className={`absolute inset-0 h-full w-full animate-settle object-cover object-[66%_62%] transition-opacity duration-700 split:object-[right_center] ${
            hasLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </picture>
      {/* Portrait fades into the white below; split gets a veil from the left. */}
      <div className="absolute inset-0 bg-linear-to-t from-white via-white/40 via-18% to-transparent to-45% split:hidden" />
      <div className="absolute inset-0 hidden bg-linear-to-r from-white from-22% via-white/80 via-42% to-transparent to-66% split:block" />
    </div>
  );
}
