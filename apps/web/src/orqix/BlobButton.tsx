import { forwardRef, type ComponentPropsWithoutRef } from "react";

/** Decoration stays outside the accessibility tree and never intercepts clicks. */
export const BlobButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(
  function BlobButton({ children, className = "", ...props }, ref) {
    if (!className.includes("oq-button") || className.includes("ghost")) return <button {...props} ref={ref} className={`oq-plain-button ${className}`}>{children}</button>;
    return (
      <button {...props} ref={ref} className={`blob-btn ${className}`}>
        {children}
        <span className="blob-btn__inner" aria-hidden="true">
          <span className="blob-btn__blobs">
            {[0, 1, 2, 3].map(i => <span className="blob-btn__blob" key={i} />)}
          </span>
        </span>
      </button>
    );
  },
);

export function BlobFilter() {
  return (
    <svg className="oq-blob-filter" aria-hidden="true" width="0" height="0" focusable="false">
      <defs>
        <filter id="orqix-button-goo" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 21 -7" result="goo" />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </defs>
    </svg>
  );
}

