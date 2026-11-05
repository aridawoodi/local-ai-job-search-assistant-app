import { useEffect, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { OllamaStatus } from '../../shared/ollama'

interface Props {
  onDone: (prefs: AppPreferences) => void
}

type Step = 'welcome' | 'import' | 'ollama' | 'ready'

const STEPS: Step[] = ['welcome', 'import', 'ollama', 'ready']

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [imported, setImported] = useState(false)

  useEffect(() => {
    if (step === 'ollama') {
      void (async () => setOllama(await window.desktopApi.checkOllama()))()
    }
  }, [step])

  async function importFile() {
    setBusy(true)
    try {
      const result = await window.desktopApi.importExtensionProfile()
      if (result.cancelled) {
        setMessage('Import cancelled — pick a file, load the sample, or continue.')
        return
      }
      setMessage(result.message)
      if (result.ok) {
        setImported(true)
        setStep('ollama')
      }
    } finally {
      setBusy(false)
    }
  }

  async function importSample() {
    setBusy(true)
    try {
      const result = await window.desktopApi.importSampleProfile()
      setMessage(result.message)
      if (result.ok) {
        setImported(true)
        setStep('ollama')
      }
    } finally {
      setBusy(false)
    }
  }

  async function skipImport() {
    setBusy(true)
    try {
      await window.desktopApi.skipExtensionImport()
      setMessage('Skipped import — you can import anytime under Settings.')
      setStep('ollama')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    try {
      const next = await window.desktopApi.completeOnboarding()
      onDone(next)
    } finally {
      setBusy(false)
    }
  }

  async function openPractice() {
    setBusy(true)
    try {
      const r = await window.desktopApi.openPracticeTour()
      setMessage(r.message)
    } finally {
      setBusy(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="mark" aria-hidden />
        <div className="onboarding-pills" role="list" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <span
              key={s}
              role="listitem"
              className={`ob-pill ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
            >
              {s === 'welcome' ? 'Welcome' : s === 'import' ? 'Import' : s === 'ollama' ? 'Local AI' : 'Ready'}
            </span>
          ))}
        </div>

        {step === 'welcome' ? (
          <>
            <h2>Fill job applications in minutes, privately</h2>
            <p className="lede">
              Same assistant as the Chrome extension — plus desktop search → match → notify → apply in a
              real Chrome/Edge window. Defaults stay safe: confirm-before-apply, no auto-submit.
            </p>
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button className="btn primary" disabled={busy} onClick={() => setStep('import')}>
                Continue
              </button>
            </div>
          </>
        ) : null}

        {step === 'import' ? (
          <>
            <h2>Import your profile</h2>
            <p className="lede">
              Bring an extension export, load the sample walkthrough profile, or skip and fill Profile later.
            </p>
            <div className="choice-stack">
              <button className="btn primary choice" disabled={busy} onClick={() => void importFile()}>
                <span className="choice-title">Import extension profile</span>
                <span className="choice-hint">
                  Open <code>job-apply-profile.json</code> or a full backup.
                </span>
              </button>
              <button className="btn choice" disabled={busy} onClick={() => void importSample()}>
                <span className="choice-title">Load sample profile</span>
                <span className="choice-hint">Jordan Rivera sample for a safe walkthrough.</span>
              </button>
              <button className="btn choice" disabled={busy} onClick={() => void skipImport()}>
                <span className="choice-title">Skip for now</span>
                <span className="choice-hint">Continue empty — import under Settings anytime.</span>
              </button>
            </div>
          </>
        ) : null}

        {step === 'ollama' ? (
          <>
            <h2>Local AI (Ollama)</h2>
            <p className="lede">
              Tailor, cover letters, and refine use Ollama on this machine. Optional — rules-only fill still
              works without it.
            </p>
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void (async () => setOllama(await window.desktopApi.checkOllama()))()
                }
              >
                Check Ollama
              </button>
              {ollama ? (
                <span className={`pill ${ollama.reachable ? 'ok' : 'bad'}`}>
                  <span className="dot" />
                  {ollama.message}
                </span>
              ) : null}
            </div>
            <p className="hint" style={{ marginTop: '0.75rem' }}>
              Default URL <code>http://127.0.0.1:11434</code> — change later under Settings → Local AI.
            </p>
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button className="btn" disabled={busy} onClick={() => setStep('import')}>
                Back
              </button>
              <button className="btn primary" disabled={busy} onClick={() => setStep('ready')}>
                Continue
              </button>
            </div>
          </>
        ) : null}

        {step === 'ready' ? (
          <>
            <h2>You&apos;re ready</h2>
            <p className="lede">
              {imported
                ? 'Profile imported. Open the automation browser, then use Pipeline or Apply → Fill.'
                : 'Next: import a resume under Profile, open the automation browser, then Fill applications.'}
            </p>
            <ol className="onboarding-steps">
              <li>
                <strong>Open the automation browser</strong> — log into LinkedIn/etc. once in that window.
              </li>
              <li>
                <strong>Pipeline or Matches</strong> — search → score → notify best fits.
              </li>
              <li>
                <strong>Apply → Fill</strong> — confirm mode never presses Submit for you.
              </li>
            </ol>
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button className="btn" disabled={busy} onClick={() => void openPractice()}>
                Take the practice tour
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void finish()}>
                Enter the app
              </button>
            </div>
          </>
        ) : null}

        {message ? <pre className="status">{message}</pre> : null}
      </div>
    </div>
  )
}
