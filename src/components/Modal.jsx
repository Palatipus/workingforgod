export default function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={'max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6 ' + (wide ? 'max-w-3xl' : 'max-w-md')}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
