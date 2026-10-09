import React, { useState, useRef, useCallback } from 'react'

function FileUpload({ onUpload }) {
  const [files, setFiles] = useState({ policyPdf: null, damageImages: [] })
  const [dragging, setDragging] = useState(false)
  const pdfInput = useRef(null)
  const imgInput = useRef(null)

  const readAsBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const addImages = useCallback(async (fileList) => {
    const incoming = []
    for (const file of Array.from(fileList)) {
      if (file.type?.startsWith('image/')) {
        const base64 = await readAsBase64(file)
        incoming.push({ file, base64, type: file.type })
      }
    }
    setFiles(prev => ({
      ...prev,
      damageImages: [...prev.damageImages, ...incoming].filter(
        (f, i, arr) => arr.findIndex(x => x.base64 === f.base64) === i
      ),
    }))
  }, [])

  const addPdf = useCallback(async (file) => {
    if (file && file.type === 'application/pdf') {
      const base64 = await readAsBase64(file)
      setFiles(prev => ({ ...prev, policyPdf: file, policyPdfBase64: base64 }))
    }
  }, [])

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type === 'application/pdf') await addPdf(file)
      else if (file.type?.startsWith('image/')) await addImages([file])
    }
  }

  const removeImage = idx =>
    setFiles(prev => ({ ...prev, damageImages: prev.damageImages.filter((_, i) => i !== idx) }))

  const reset = () => setFiles({ policyPdf: null, damageImages: [] })

  const getImagesForAI = async () =>
    files.damageImages.map(f => ({ base64: f.base64.split(',')[1], type: f.type }))

  const getPdfText = () =>
    files.policyPdf
      ? '[Policy PDF attached - AI extracts visible terms, coverage and exclusions]'
      : ''

  const ready = !!files.policyPdf && files.damageImages.length > 0

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { e.preventDefault(); setDragging(false) }}
      onDrop={handleDrop}
      className={`surface relative overflow-hidden p-5 transition-colors sm:p-6 ${
        dragging ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : ''
      }`}
    >
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        {/* Policy PDF */}
        <button
          type="button"
          onClick={() => pdfInput.current?.click()}
          className={`group flex min-h-[190px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
            files.policyPdf
              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--bg-2)]'
          }`}
        >
          <div className={`mb-3 grid h-12 w-12 place-items-center rounded-2xl transition ${files.policyPdf ? 'bg-[var(--accent)] text-[#0b0d17]' : 'bg-[var(--bg-2)] text-[var(--muted)] group-hover:text-[var(--accent)]'}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </div>
          {files.policyPdf ? (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">Policy attached</div>
              <div className="mt-0.5 max-w-[14rem] truncate text-xs text-[var(--muted)]">{files.policyPdf.name}</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">Drop policy PDF</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">or click to browse · .pdf</div>
            </>
          )}
        </button>

        {/* Damage images */}
        <div className="flex min-h-[190px] flex-col rounded-2xl border-2 border-dashed border-[var(--line)] p-3">
          {files.damageImages.length === 0 ? (
            <button
              type="button"
              onClick={() => imgInput.current?.click()}
              className="group flex flex-1 flex-col items-center justify-center text-center"
            >
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bg-2)] text-[var(--muted)] transition group-hover:text-[var(--grape)]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
              <div className="text-sm font-semibold">Add damage photos</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">multiple images · jpg/png</div>
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {files.damageImages.map((f, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--line)]">
                  <img src={f.base64} alt={f.file.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => imgInput.current?.click()}
                className="grid aspect-square place-items-center rounded-xl border border-dashed border-[var(--line)] text-[var(--muted)] transition hover:border-[var(--grape)] hover:text-[var(--grape)]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <input ref={pdfInput} type="file" accept=".pdf" className="hidden" onChange={e => { addPdf(e.target.files[0]); e.target.value = '' }} />
      <input ref={imgInput} type="file" accept="image/*" multiple className="hidden" onChange={e => { addImages(e.target.files); e.target.value = '' }} />

      {/* Footer / CTA */}
      <div className="mt-5 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          {files.damageImages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-2)] px-2.5 py-1">
              {files.damageImages.length} photo{files.damageImages.length > 1 ? 's' : ''}
            </span>
          )}
          {(files.policyPdf || files.damageImages.length > 0) && (
            <button onClick={reset} className="underline transition hover:text-[var(--rose)]">Reset</button>
          )}
        </div>
        <button
          onClick={() => onUpload({ files, getImagesForAI, getPdfText })}
          disabled={!ready}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] shadow-lg shadow-[var(--accent)]/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Analyze claim
        </button>
      </div>
      {!ready && (
        <p className="mt-2 text-right text-[11px] text-[var(--muted)]">
          Add a policy PDF and at least one damage photo to continue.
        </p>
      )}
    </div>
  )
}

export default FileUpload
