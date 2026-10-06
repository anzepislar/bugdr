"use client";

import { useState } from "react";

// ponytail: kept in component state; slice O1 saves it with PUT /problems/:slug/rating.
export function RateProblem({ initial }: { initial: number | null }) {
  const [rating, setRating] = useState(initial);
  const [hover, setHover] = useState(0);
  const shown = hover || rating || 0;

  return (
    <section aria-labelledby="rate-heading">
      <h3 id="rate-heading" className="font-semibold text-text">
        Rate this problem
      </h3>
      <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} of 5`}
            aria-pressed={rating === n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            className="px-1 text-2xl leading-none text-medium"
          >
            {n <= shown ? "★" : "☆"}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted">
        {rating ? `Thanks, you rated this ${rating} of 5.` : ""}
      </p>
    </section>
  );
}
