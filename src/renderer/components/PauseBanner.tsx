import type { PipelinePause } from '../../shared/pause'

interface Props {
  pause: PipelinePause
  busy?: boolean
  onResume: () => void
  onDismiss: () => void
  onOpenBrowser?: () => void
}

export default function PauseBanner({
  pause,
  busy,
  onResume,
  onDismiss,
  onOpenBrowser
}: Props) {
  if (!pause.active) return null

  const kindLabel =
    pause.kind === 'captcha'
      ? 'Captcha'
      : pause.kind === 'login'
        ? 'Login'
        : pause.kind === 'auth_wall'
          ? 'Auth wall'
          : 'Paused'

  return (
    <aside className="pause-banner" role="status" aria-live="polite">
      <div className="pause-banner-head">
        <span className="pill bad">
          <span className="dot" />
          Automation paused · {kindLabel}
        </span>
        {pause.source ? <span className="pill">{pause.source}</span> : null}
      </div>
      <h3>{pause.title || 'Automation paused'}</h3>
      <p>{pause.message}</p>
      {pause.steps.length ? (
        <ol className="pause-steps">
          {pause.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
      <div className="actions">
        {onOpenBrowser ? (
          <button className="btn" disabled={busy} onClick={onOpenBrowser}>
            Open browser
          </button>
        ) : null}
        <button className="btn primary" disabled={busy} onClick={onResume}>
          Resume — check sessions
        </button>
        <button className="btn" disabled={busy} onClick={onDismiss}>
          Dismiss pause
        </button>
      </div>
    </aside>
  )
}
