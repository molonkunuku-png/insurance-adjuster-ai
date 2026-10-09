import React, { useState, useRef, useCallback } from 'react'
import {
  FileText, ImagePlus, Plus, X, Loader2, CheckCircle2,
  AlertTriangle, ScanEye, RotateCcw, ArrowRight,
} from 'lucide-react'
import { extractPdfText, renderPdfPages } from '../lib/pdf'

function FileUpload({ onUpload }) {
  const [files, setFiles] = useState({ policyPdf: null, damageImages: [] })
  const [policy, setPolicy] = useState({ status: 'idle', text: '', images: [], numPages: 0, truncated: false, error: '' })
  const [notes, setNotes] = useState('')
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
    if (!file || file.type !== 'application/pdf') return
    setFiles(prev => ({ ...prev, policyPdf: file }))
    setPolicy({ status: 'reading', text: '', images: [], numPages: 0, truncated: false, error: '' })
    try {
      const res = await extractPdfText(file)
      if (res.scanned) {
        // No text layer (scanned policy) — rasterize pages for Vision instead.
        const images = await renderPdfPages(file)
        setPolicy({ status: 'scanned', text: '', images, numPages: res.numPages, truncated: false, error: '' })
      } else {
        setPolicy({ status: 'ready', text: res.text, images: [], numPages: res.numPages, truncated: res.truncated, error: '' })
      }
    } catch (e) {
      console.error('[pdf] extraction failed', e)
      setPolicy({ status: 'error', text: '', images: [], numPages: 0, truncated: false, error: e.message || 'Could not read PDF' })
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

  const reset = () => {
    setFiles({ policyPdf: null, damageImages: [] })
    setPolicy({ status: 'idle', text: '', images: [], numPages: 0, truncated: false, error: '' })
    setNotes('')
  }

  const clearPdf = (e) => {
    e.stopPropagation()
    setFiles(prev => ({ ...prev, policyPdf: null }))
    setPolicy({ status: 'idle', text: '', images: [], numPages: 0, truncated: false, error: '' })
  }

  const getImagesForAI = async () => {
    const damage = files.damageImages.map(f => ({ base64: f.base64.split(',')[1], type: f.type }))
    const scan = policy.images.map(f => ({ base64: f.base64.split(',')[1], type: f.type }))
    return [...damage, ...scan].slice(0, 12)
  }

  const getPdfText = () => {
    if (!files.policyPdf) return ''
    if (policy.status === 'scanned') {
      return '[Scanned policy: no text layer. The policy page images are attached — read the visible terms, coverage and exclusions from them.]'
    }
    return policy.text
  }

  const getNotes = () => notes

  const pdfBusy = policy.status === 'reading'
  const hasAny = (files.policyPdf && (policy.status === 'ready' || policy.status === 'scanned'))
    || files.damageImages.length > 0
    || notes.trim() !== ''

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { e.preventDefault(); setDragging(false) }}
      onDrop={handleDrop}
      className={`surface beam relative overflow-hidden p-5 transition-colors sm:p-6 ${
        dragging ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : ''
      }`}
    >
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        {/* Policy PDF */}
        <button
          type="button"
          onClick={() => !pdfBusy && pdfInput.current?.click()}
          className={`group flex min-h-[190px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
            files.policyPdf
              ? policy.status === 'error'
                ? 'border-[var(--danger)] bg-[var(--danger-soft)]'
                : 'border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--bg-2)]'
          }`}
        >
          <div className={`mb-3 grid h-12 w-12 place-items-center rounded-2xl transition ${
            files.policyPdf
              ? policy.status === 'error' ? 'bg-[var(--danger)] text-white' : 'bg-[var(--accent)] text-[#0b0d17]'
              : 'bg-[var(--bg-2)] text-[var(--muted)] group-hover:text-[var(--accent)]'
          }`}>
            {pdfBusy ? <Loader2 size={22} className="animate-spin" />
              : policy.status === 'error' ? <AlertTriangle size={22} />
              : policy.status === 'scanned' ? <ScanEye size={22} />
              : files.policyPdf ? <CheckCircle2 size={22} />
              : <FileText size={22} />}
          </div>

          {!files.policyPdf && (
            <>
              <div className="text-sm font-semibold">Drop policy PDF</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">or click to browse · .pdf</div>
            </>
          )}
          {pdfBusy && (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">Reading policy…</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">extracting the fine print</div>
            </>
          )}
          {files.policyPdf && policy.status === 'ready' && (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">Policy parsed</div>
              <div className="mt-0.5 max-w-[14rem] truncate text-xs text-[var(--muted)]">{files.policyPdf.name}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">
                {policy.numPages} page{policy.numPages > 1 ? 's' : ''} · {policy.text.length.toLocaleString()} chars{policy.truncated ? ' (first 30)' : ''}
              </div>
            </>
          )}
          {files.policyPdf && policy.status === 'scanned' && (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">Scanned policy</div>
              <div className="mt-0.5 max-w-[14rem] truncate text-xs text-[var(--muted)]">{files.policyPdf.name}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">no text layer · sending {policy.images.length} page image{policy.images.length > 1 ? 's' : ''}</div>
            </>
          )}
          {files.policyPdf && policy.status === 'error' && (
            <>
              <div className="text-sm font-semibold text-[var(--danger)]">Couldn't read PDF</div>
              <div className="mt-0.5 max-w-[14rem] truncate text-xs text-[var(--muted)]">{policy.error}</div>
            </>
          )}

          {files.policyPdf && !pdfBusy && (
            <span
              role="button"
              tabIndex={0}
              onClick={clearPdf}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') clearPdf(e) }}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--danger)]"
            >
              <RotateCcw size={11} /> Replace
            </span>
          )}
        </button>

        {/* Damage images */}
        <div className={`group flex min-h-[190px] flex-col rounded-2xl border-2 border-dashed p-3 transition-colors ${
          files.damageImages.length > 0
            ? 'border-[var(--grape)] bg-[var(--grape-soft)]'
            : 'border-[var(--line)] hover:border-[var(--grape)] hover:bg-[var(--bg-2)]'
        }`}>
          {files.damageImages.length === 0 ? (
            <button
              type="button"
              onClick={() => imgInput.current?.click()}
              className="group flex flex-1 flex-col items-center justify-center text-center"
            >
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bg-2)] text-[var(--muted)] transition group-hover:text-[var(--grape)]">
                <ImagePlus size={22} />
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
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => imgInput.current?.click()}
                className="grid aspect-square place-items-center rounded-xl border border-dashed border-[var(--line)] text-[var(--muted)] transition hover:border-[var(--grape)] hover:text-[var(--grape)]"
              >
                <Plus size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      <input ref={pdfInput} type="file" accept=".pdf" className="hidden" onChange={e => { addPdf(e.target.files[0]); e.target.value = '' }} />
      <input ref={imgInput} type="file" accept="image/*" multiple className="hidden" onChange={e => { addImages(e.target.files); e.target.value = '' }} />

      {/* Damage description */}
      <div className="mt-4">
        <label htmlFor="damage-notes" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
          Describe the damage <span className="text-[var(--muted)]/70">(optional — helps even without photos)</span>
        </label>
        <textarea
          id="damage-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="e.g. Hail took shingles off the back slope; two windows cracked; gutters dented — moderate."
          className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--fg)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
        />
      </div>

      {/* Footer / CTA */}
      <div className="mt-5 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          {files.damageImages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-2)] px-2.5 py-1">
              {files.damageImages.length} photo{files.damageImages.length > 1 ? 's' : ''}
            </span>
          )}
          {(files.policyPdf || files.damageImages.length > 0 || notes.trim()) && (
            <button onClick={reset} className="inline-flex items-center gap-1 underline transition hover:text-[var(--rose)]">
              <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>
        <button
          onClick={() => onUpload({ files, getImagesForAI, getPdfText, getNotes })}
          disabled={!hasAny}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] shadow-lg shadow-[var(--accent)]/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <ArrowRight size={16} strokeWidth={2.2} />
          Analyze claim
        </button>
      </div>
      {!hasAny && (
        <p className="mt-2 text-right text-[11px] text-[var(--muted)]">
          {pdfBusy ? 'Reading your policy PDF…' : 'Add a policy PDF, a damage photo, or a short description to continue.'}
        </p>
      )}
    </div>
  )
}

export default FileUpload
