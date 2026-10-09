import React, { useState } from 'react'

function FileUpload({ onUpload }) {
  const [files, setFiles] = useState({ policyPdf: null, damageImages: [] })
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)

  const readAsBase64 = file => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const items = e.dataTransfer.items
    let newPdf = null
    const newImages = []
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile()
        if (file?.type === 'application/pdf') {
          newPdf = file
        } else if (file?.type?.startsWith('image/')) {
          const base64 = await readAsBase64(file)
          newImages.push({ file, base64, type: file.type })
        }
      }
    }
    
    setFiles(prev => ({
      ...prev,
      policyPdf: newPdf !== null ? newPdf : prev.policyPdf,
      damageImages: [...prev.damageImages, ...newImages].filter(
        (f, i, arr) => arr.findIndex(x => x.base64 === f.base64) === i
      ),
    }))
  }

  const handleChange = async (e) => {
    const { name } = e.target
    const file = e.target.files ? e.target.files[0] : null
    
    if (!file) return
    
    const read = () => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    
    const base64 = await read()
    
    if (name === 'policyPdf') {
      setFiles(prev => ({
        ...prev,
        policyPdf: file,
      }))
    } else if (name === 'damageImages') {
      setFiles(prev => ({
        ...prev,
        damageImages: [...prev.damageImages, { file, base64, type: file.type }],
      }))
    }
  }

  const removeImage = idx => {
    setFiles(prev => ({
      ...prev,
      damageImages: prev.damageImages.filter((_, i) => i !== idx),
    }))
  }

  const getImagesForAI = async () => {
    return files.damageImages.map(f => ({
      base64: f.base64.split(',')[1],
      type: f.type,
    }))
  }

  const getPdfText = () => {
    if (!files.policyPdf) return ''
    return '[Policy PDF received - AI will extract relevant terms from visible text/headers]'
  }

  return (
    <div className="border rounded-2xl p-6 md:p-8 mb-8 bg-[var(--card)] border-border cursor-default min-h-[300px]">
      <div className="flex flex-col items-center gap-4 min-h-[220px]">
        {/* Policy PDF drop zone */}
        <div
          onDrop={e => { e.preventDefault(); setDragging(false); handleDrop(e) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragEnter={e => setDragging(true)}
          onDragLeave={e => setDragging(false)}
          className={`flex flex-col items-center justify-center h-[220px] rounded-2xl ${
            dragging || hover ? 'border-accent bg-[var(--accent-dim)]' : 'border-border hover:border-accent transition-colors cursor-pointer'
          }`}
        >
          <p className="text-[var(--muted)] text-sm mb-1">Drop policy PDF here</p>
          <p className="text-xs">PDF (.pdf)</p>
          <input
            type="file"
            accept=".pdf"
            onChange={e => handleChange(e)}
            style={{ display: 'none' }}
          />
        </div>

        {/* Damage images drop zone */}
        <div className="grid grid-cols-3 gap-2">
          {files.damageImages.map((f, i) => (
            <div
              key={i}
              className="relative group border rounded w-full p-2 bg-[var(--bg-subtle)]"
            >
              <img
                src={f.base64}
                alt={f.file.name}
                className="w-full h-24 object-cover rounded transition-opacity group-hover:opacity-90"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 text-xs text-error hover:text-error/80"
              >
                ✕
              </button>
            </div>
          ))}

          {!files.damageImages.length && (
            <div
              onClick={() => document.querySelector('input[name="damageImages"]')?.click()}
              className="relative cursor-pointer select-none h-24 w-full border-2 border-border rounded flex items-center justify-center text-[var(--muted)]"
              onMouseOver={() => setHover(true)}
              onMouseOut={() => setHover(false)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="m-1"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <path d="M17 5H5a2 2 0 00-2 2v3m18 0v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3" />
                <path d="M17 5h2m-6 9-5-5m5 5-5 5m5-5h2m6-6v2m-2-6h2m6-3a2 2 0 10-4 0 2 2 0 004 0z" />
              </svg>
              <input
                type="file"
                name="damageImages"
                multiple
                accept="image/*"
                onChange={e => handleChange(e)}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>
      </div>

      {files.damageImages.length > 0 && (
        <div className="mt-3 text-sm">
          <span className="text-[var(--muted)]">+ {files.damageImages.length} images</span>
        </div>
      )}

      {files.policyPdf && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-[var(--muted)]">{files.policyPdf.name}</span>
          <button
            type="button"
            onClick={() => setFiles({ ...files, policyPdf: null, damageImages: [] })}
            className="text-error hover:text-error/80"
          >
            Reset
          </button>
        </div>
      )}

      <button
        onClick={() => onUpload({ files, getImagesForAI, getPdfText }) }
        disabled={!files.policyPdf}
        className={`w-full py-3 rounded text-bg font-medium rounded hover:bg-bg/90 transition-colors disabled:opacity-50 cursor-not-allowed mb-2`}
      >
        {files.policyPdf ? 'Submit for AI Analysis' : 'Upload policy PDF (required)'}
      </button>
    </div>
  )
}

export default FileUpload
