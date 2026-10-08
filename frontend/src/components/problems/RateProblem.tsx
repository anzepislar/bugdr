"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

// O1: saved with PUT /problems/:slug/rating; a failed save puts the previous rating back.
export function RateProblem({ slug, initial }: { slug: string; initial: number | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(initial);
  const [hover, setHover] = useState(0);
  const [error, setError] = useState(false);
  const shown = hover || rating || 0;

  async function rate(n: number) {
    const previous = rating;
    setRating(n);
    setError(false);
    try {
      await api(`/problems/${encodeURIComponent(slug)}/rating`, { method: "PUT", body: JSON.stringify({ rating: n }) });
      router.refresh(); // the average in the page header
    } catch {
      setRating(previous);
      setError(true);
    }
  }

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
            onClick={() => rate(n)}
            onMouseEnter={() => setHover(n)}
            className="px-1 text-2xl leading-none text-medium"
          >
            {n <= shown ? "★" : "☆"}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted">
        {error ? "Your rating could not be saved. Try again." : rating ? `Thanks, you rated this ${rating} of 5.` : ""}
      </p>
    </section>
  );
}
