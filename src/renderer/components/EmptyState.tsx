interface Props {
  title: string
  body: string
  steps?: string[]
}

/** Shared first-run / empty panel guidance. */
export default function EmptyState({ title, body, steps }: Props) {
  return (
    <div className="empty-state" role="status">
      <h3>{title}</h3>
      <p>{body}</p>
      {steps?.length ? (
        <ol>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
