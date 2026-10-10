import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  FileText, ImagePlus, Plus, X, Loader2, CheckCircle2,
  AlertTriangle, ScanEye, RotateCcw, ArrowRight,
} from 'lucide-react'
import { extractPdfText, renderPdfPages } from '../lib/pdf'
import { devLog } from '../lib/api'
import { sniffKind, isImageKind, containsEicar, MAX_IMAGE_BYTES, MAX_PDF_BYTES } from '../lib/files'
import { useI18n, useFormat } from '../i18n'

function FileUpload({ onUpload, initial = null, onSnapshot = null, onPolicyEvent = null }) {
  const { t } = useI18n()
  const { num } = useFormat()
  const [files, setFiles] = useState(() => ({
    policyPdf: initial?.policy?.fileName ? { name: initial.policy.fileName } : null,
    damageImages: (initial?.damageImages || []).map(d => ({ file: null, name: d.name || 'damage photo', base64: d.base64, type: d.type, severity: d.severity || '' })),
  }))
  const [policy, setPolicy] = useState(() => ({
    status: initial?.policy?.status || 'idle',
    text: initial?.policy?.text || '',
    images: initial?.policy?.images || [],
    numPages: initial?.policy?.numPages || 0,
    truncated: initial?.policy?.truncated || false,
    error: '',
  }))
  const [notes, setNotes] = useState(initial?.notes || '')
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null) // 0..1 while the PDF bytes are read
  const [notice, setNotice] = useState('')
  const pdfInput = useRef(null)
  const imgInput = useRef(null)

  const toSnap = () => ({
    notes,
    policy: { ...policy, error: '', fileName: files.policyPdf?.name || null },
      damageImages: files.damageImages.map(f => ({ base64: f.base64, type: f.type, name: f.file?.name || f.name || t('upload.altPhoto', 'damage photo'), severity: f.severity || '' })),
  })
  // Debounced snapshot (400ms) so keystrokes don't re-serialize megabytes of
  // image bytes; flushed synchronously on unmount (analyze click) so cancel
  // always restores the latest inputs.
  const snapTimer = useRef(null)
  const snapRef = useRef(null)
  const toSnapRef = useRef(null)
  useEffect(() => {
    snapRef.current = onSnapshot
    toSnapRef.current = toSnap
    clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => snapRef.current?.(toSnapRef.current()), 400)
    return () => {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, policy, files, onSnapshot])
  useEffect(() => () => {
    clearTimeout(snapTimer.current)
    snapRef.current?.(toSnapRef.current?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const readAsBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const addImages = useCallback(async (fileList) => {
    const files_arr = Array.from(fileList)
    // Parallel intake (order preserved); each file sniffed independently.
    const results = await Promise.all(files_arr.map(async (file) => {
      const kind = await sniffKind(file)
      if (!isImageKind(kind)) return { rejected: 'type' }
      if (file.size > MAX_IMAGE_BYTES) return { rejected: 'size' }
      if (await containsEicar(file)) return { rejected: 'malware' }
      const base64 = await readAsBase64(file)
      const type = kind === 'jpg' ? 'image/jpeg' : kind === 'png' ? 'image/png' : kind === 'gif' ? 'image/gif' : 'image/webp'
      return { file, name: file.name, base64, type, severity: '' }
    }))
    const incoming = results.filter(r => !r.rejected)
    const rejectedType = results.filter(r => r.rejected === 'type').length
    const rejectedSize = results.filter(r => r.rejected === 'size').length
    const rejectedMalware = results.filter(r => r.rejected === 'malware').length
    if (rejectedType + rejectedSize + rejectedMalware > 0) {
      setNotice(
        [rejectedType > 0 ? t('upload.rejectedType', 'Some files were skipped: JPEG, PNG, GIF, or WebP images only.') : null,
         rejectedSize > 0 ? t('upload.tooLarge', 'Some images exceed the 10 MB limit and were skipped.') : null,
         rejectedMalware > 0 ? t('upload.eicar', 'A file was blocked by the malware screen.') : null]
          .filter(Boolean).join(' ')
      )
    } else {
      setNotice('')
    }
    if (incoming.length === 0) return
    setFiles(prev => ({
      ...prev,
      damageImages: [...prev.damageImages, ...incoming].filter(
        (f, i, arr) => arr.findIndex(x => x.base64 === f.base64) === i
      ),
    }))
  }, [t])

  // Monotonic request id: rapid re-selections can't let a stale read win.
  const pdfReq = useRef(0)
  const addPdf = useCallback(async (file) => {
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')
    if (!isPdf) return
    // Fail fast before pdf.js even loads: size cap + magic bytes.
    if (file.size > MAX_PDF_BYTES) {
      setFiles(prev => ({ ...prev, policyPdf: file }))
      setPolicy({ status: 'error', text: '', images: [], numPages: 0, truncated: false, error: t('upload.pdfTooLarge', 'That PDF exceeds the 15 MB limit. Try a smaller file.') })
      onPolicyEvent?.('policyError')
      return
    }
    if ((await sniffKind(file)) !== 'pdf') {
      setFiles(prev => ({ ...prev, policyPdf: file }))
      setPolicy({ status: 'error', text: '', images: [], numPages: 0, truncated: false, error: t('upload.pdfBadMagic', 'That file is not a readable PDF. Try a different file.') })
      onPolicyEvent?.('policyError')
      return
    }
    if (await containsEicar(file)) {
      setFiles(prev => ({ ...prev, policyPdf: file }))
      setPolicy({ status: 'error', text: '', images: [], numPages: 0, truncated: false, error: t('upload.eicar', 'A file was blocked by the malware screen.') })
      onPolicyEvent?.('policyError')
      return
    }
    const myReq = ++pdfReq.current
    const stale = () => myReq !== pdfReq.current
    setFiles(prev => ({ ...prev, policyPdf: file }))
    setNotice('')
    setProgress(0)
    setPolicy({ status: 'reading', text: '', images: [], numPages: 0, truncated: false, error: '' })
    try {
      const res = await extractPdfText(file, { onProgress: (f) => { if (!stale()) setProgress(f) } })
      if (stale()) return
      setProgress(null)
      onPolicyEvent?.('policyParsed')
      if (res.scanned) {
        // No text layer (scanned policy) — rasterize pages for Vision instead.
        const images = await renderPdfPages(file)
        if (stale()) return
        setPolicy({ status: 'scanned', text: '', images, numPages: res.numPages, truncated: false, error: '' })
      } else {
        setPolicy({ status: 'ready', text: res.text, images: [], numPages: res.numPages, truncated: res.truncated, error: '' })
      }
    } catch (e) {
      if (stale()) return
      devLog('[pdf] extraction failed', e)
      setProgress(null)
      onPolicyEvent?.('policyError')
      setPolicy({ status: 'error', text: '', images: [], numPages: 0, truncated: false, error: t('error.pdf.fallback', 'Failed to read PDF. Try again or use a text-based PDF.') })
    }
  }, [t, onPolicyEvent])

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    const pdfs = []
    const imgs = []
    for (const file of dropped) {
      const name = file.name?.toLowerCase() || ''
      const pdfish = file.type === 'application/pdf' || name.endsWith('.pdf')
      const imgish = file.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/.test(name)
      if (pdfish) pdfs.push(file)
      else if (imgish) imgs.push(file)
    }
    // First PDF wins; extras are reported, never silently swallowed.
    if (pdfs.length > 1) {
      setNotice(t('upload.pdfFirstOnly', 'Only the first PDF is attached; extra PDFs were skipped.'))
    }
    if (pdfs.length > 0) await addPdf(pdfs[0])
    if (imgs.length > 0) await addImages(imgs)
  }

  const removeImage = idx =>
    setFiles(prev => ({ ...prev, damageImages: prev.damageImages.filter((_, i) => i !== idx) }))

  const setSeverity = (idx, severity) =>
    setFiles(prev => ({
      ...prev,
      damageImages: prev.damageImages.map((f, i) => (i === idx ? { ...f, severity } : f)),
    }))

  const [armReset, setArmReset] = useState(false)
  const armTimer = useRef(null)
  useEffect(() => () => clearTimeout(armTimer.current), [])
  const reset = () => {
    setFiles({ policyPdf: null, damageImages: [] })
    setPolicy({ status: 'idle', text: '', images: [], numPages: 0, truncated: false, error: '' })
    setNotes('')
    setNotice('')
    setProgress(null)
    setArmReset(false)
  }
  const askReset = () => {
    if (armReset) { reset(); return }
    setArmReset(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmReset(false), 3000)
  }

  const clearPdf = (e) => {
    e.stopPropagation()
    setFiles(prev => ({ ...prev, policyPdf: null }))
    setPolicy({ status: 'idle', text: '', images: [], numPages: 0, truncated: false, error: '' })
    setProgress(null)
  }

  const submitClaim = () => {
    const total = files.damageImages.length + policy.images.length
    if (total > 12) {
      setNotice(t('upload.showing12', 'Showing first 12 of {n} images.').replace('{n}', num(total)))
    }
    onUpload({ files, getImagesForAI, getPdfText, getNotes })
  }

  const getImagesForAI = async () => {
    const damage = files.damageImages.map(f => ({ base64: f.base64.split(',')[1], type: f.type }))
    const scan = policy.images.map(f => ({ base64: f.base64.split(',')[1], type: f.type }))
    return [...damage, ...scan].slice(0, 12)
  }

  const getPdfText = () => {
    if (!files.policyPdf) return ''
    if (policy.status === 'scanned') {
      return t('upload.scannedNote', '[Scanned policy: no text layer. The policy page images are attached — read the visible terms, coverage and exclusions from them.]')
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
        {/* Policy PDF — a div acting as a button (a nested <button> for
            Replace inside a <button> would be invalid HTML). */}
        <div
          role="button"
          tabIndex={0}
          aria-label={t('upload.dropPdf', 'Drop policy PDF')}
          onClick={() => !pdfBusy && pdfInput.current?.click()}
          onKeyDown={e => { if (!pdfBusy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pdfInput.current?.click() } }}
          className={`group flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
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
              <div className="text-sm font-semibold">{t('upload.dropPdf', 'Drop policy PDF')}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{t('upload.browsePdf', 'or click to browse · .pdf')}</div>
            </>
          )}
          {pdfBusy && (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">{t('upload.policy.reading', 'Reading policy…')}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{t('upload.finePrint', 'extracting the fine print')}</div>
              {progress != null && (
                <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-[var(--line)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                  <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
            </>
          )}
          {files.policyPdf && policy.status === 'ready' && (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">{t('upload.policy.ready', 'Policy parsed')}</div>
              <div className="mt-0.5 max-w-full break-all text-xs text-[var(--muted)] line-clamp-2">{files.policyPdf.name}</div>
              <div className="tnum mt-1 text-[11px] text-[var(--muted)]">
                {num(policy.numPages)} {policy.numPages > 1 ? t('upload.pages', 'pages') : t('upload.page', 'page')} · {num(policy.text.length)} {t('upload.chars', 'chars')}{policy.truncated ? ` ${t('upload.truncatedNote', '(first 30 pages)')}` : ''}
              </div>
            </>
          )}
          {files.policyPdf && policy.status === 'scanned' && (
            <>
              <div className="text-sm font-semibold text-[var(--accent)]">{t('upload.policy.scanned', 'Scanned policy')}</div>
              <div className="mt-0.5 max-w-full break-all text-xs text-[var(--muted)] line-clamp-2">{files.policyPdf.name}</div>
              <div className="tnum mt-1 text-[11px] text-[var(--muted)]">{t('upload.scannedNoText', 'no text layer')} · {t('upload.sending', 'sending')} {policy.images.length} {policy.images.length > 1 ? t('upload.pageImages', 'page images') : t('upload.pageImage', 'page image')}</div>
            </>
          )}
          {files.policyPdf && policy.status === 'error' && (
            <>
              <div className="text-sm font-semibold text-[var(--danger)]">{t('error.pdf.readFailed', "Couldn't read PDF")}</div>
              <div className="mt-0.5 max-w-[14rem] truncate text-xs text-[var(--muted)]">{policy.error}</div>
            </>
          )}

          {files.policyPdf && !pdfBusy && (
            <button
              type="button"
              onClick={clearPdf}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--danger)]"
            >
              <RotateCcw size={11} /> {t('upload.replace', 'Replace')}
            </button>
          )}
        </div>

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
              <div className="text-sm font-semibold">{t('upload.addPhotos', 'Add damage photos')}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{t('upload.photosHint', 'multiple images · jpg/png')}</div>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
              {files.damageImages.map((f, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--line)]">
                  <img src={f.base64} alt={f.file?.name || f.name || t('upload.altPhoto', 'damage photo')} loading="lazy" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label={t('upload.removePhoto', 'Remove photo')}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
                  >
                    <X size={11} />
                  </button>
                  <select
                    value={f.severity || ''}
                    onChange={e => setSeverity(i, e.target.value)}
                    aria-label={t('upload.severity', 'Severity')}
                    onClick={e => e.stopPropagation()}
                    className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] rounded-md bg-black/70 px-1 py-0.5 text-[10px] text-white outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="">{t('upload.severity', 'Severity')}</option>
                    <option value="minor">{t('upload.sevMinor', 'Minor')}</option>
                    <option value="moderate">{t('upload.sevModerate', 'Moderate')}</option>
                    <option value="severe">{t('upload.sevSevere', 'Severe')}</option>
                  </select>
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
      {notice && (
        <div role="status" className="mt-4 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] px-4 py-2.5 text-xs text-[var(--warn)]">
          {notice}
        </div>
      )}
      <div className="mt-4">
        <label htmlFor="damage-notes" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
          {t('upload.notesLabel', 'Describe the damage')} <span className="text-[var(--muted)]/70">{t('upload.notesOptional', '(optional — helps even without photos)')}</span>
        </label>
        <textarea
          id="damage-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t('upload.notesPh', 'e.g. Hail took shingles off the back slope; two windows cracked; gutters dented — moderate.')}
          className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--fg)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]"
        />
        <div className="tnum mt-1 text-right text-[10px] text-[var(--muted)]">{num(notes.length)}/2000</div>
      </div>

      {/* Footer / CTA */}
      <div className="mt-5 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          {files.damageImages.length > 0 && (
            <span className="tnum inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-2)] px-2.5 py-1">
              {num(files.damageImages.length)} {files.damageImages.length > 1 ? t('upload.photos', 'photos') : t('upload.photo', 'photo')}
            </span>
          )}
          {(files.policyPdf || files.damageImages.length > 0 || notes.trim()) && (
            <button onClick={askReset} className="inline-flex items-center gap-1 underline transition hover:text-[var(--rose)]">
              <RotateCcw size={11} /> {armReset ? t('common.confirmTap', 'Tap again to confirm') : t('upload.reset', 'Reset')}
            </button>
          )}
        </div>
        <button
          onClick={submitClaim}
          disabled={!hasAny}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--grape)] px-5 py-2.5 text-sm font-semibold text-[#0b0d17] shadow-lg shadow-[var(--accent)]/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <ArrowRight size={16} strokeWidth={2.2} />
          {t('upload.analyze', 'Analyze claim')}
        </button>
      </div>
      {!hasAny && (
        <p className="mt-2 text-right text-[11px] text-[var(--muted)]">
          {pdfBusy ? t('upload.readingYours', 'Reading your policy PDF…') : t('upload.hintIdle', 'Add a policy PDF, a damage photo, or a short description to continue.')}
        </p>
      )}
    </div>
  )
}

export default FileUpload
