import { useEffect, useRef } from 'react'

// Open dialogs, newest last, so Esc only closes the one on top.
const stack = []

export default function Modal({ title, onClose, children, wide }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const entry = {}
    stack.push(entry)
    function onKey(e) {
      if (e.key === 'Escape' && stack[stack.length - 1] === entry) closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(entry), 1)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={'max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6 ' + (wide ? 'max-w-3xl' : 'max-w-md')}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
