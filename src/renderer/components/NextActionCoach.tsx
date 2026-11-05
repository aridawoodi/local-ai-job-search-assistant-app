import type { NextAction } from '../coach/nextAction'

interface Props {
  action: NextAction
  busy?: boolean
  onCta: () => void
}

/** Persistent primary CTA + short “what’s next” copy driven by app state. */
export default function NextActionCoach({ action, busy, onCta }: Props) {
  return (
    <aside className="next-action-coach" role="status" aria-live="polite">
      <div className="next-action-coach-copy">
        <span className="next-action-eyebrow">{action.eyebrow}</span>
        <h3>What’s next: {action.title}</h3>
        <p>{action.detail}</p>
      </div>
      {action.kind !== 'none' ? (
        <button
          type="button"
          className="btn primary next-action-cta"
          disabled={busy}
          onClick={onCta}
        >
          {action.ctaLabel}
        </button>
      ) : null}
    </aside>
  )
}
