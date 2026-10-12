// Shown when data could not load (usually a weak connection), so empty lists aren't mistaken for missing data
export default function LoadError({ onRetry, compact }) {
  return (
    <div className={'flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 text-center text-sm text-amber-900 ' +
      (compact ? 'p-4' : 'p-8')}>
      <div>
        <div className="font-semibold">Could not load this</div>
        <div className="mt-0.5 text-amber-800">Check your internet connection and try again.</div>
      </div>
      {onRetry && <button onClick={onRetry} className="btn">Try again</button>}
    </div>
  )
}
