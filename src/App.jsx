import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import FileUpload from './components/FileUpload'
import ReportPreview from './components/ReportPreview'
import LoadingState from './components/LoadingState'
import { analyzeDamageAndPolicy, generateReport } from './lib/ai'

function App() {
  const [step, setStep] = useState('upload')
  const [stepProgress, setStepProgress] = useState({ upload: 0, analyze: 0, generate: 0 })
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState('dark')

  const handleUpload = async ({ files, getImagesForAI, getPdfText }) => {
    setStep('analyzing')
    setStepProgress(prev => ({ ...prev, upload: 100 }))
    setLoading(true)

    try {
      const images = await getImagesForAI()
      const pdfText = getPdfText()

      if (images.length === 0) {
        alert('Please upload at least one damage image')
        setStep('upload')
        setLoading(false)
        return
      }

      setStepProgress(prev => ({ ...prev, analyze: 0 }))
      
      const analysis = await analyzeDamageAndPolicy(images, pdfText)
      
      setStepProgress(prev => ({ ...prev, analyze: 100 }))
      setReport({ analysis })
      setStep('result')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Something went wrong with AI analysis')
      setStep('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!report?.analysis) return
    setLoading(true)
    try {
      const markdown = await generateReport(report.analysis)
      setReport({ ...report, markdown })
      setStepProgress(prev => ({ ...prev, generate: 100 }))
      setStep('result')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Something went wrong generating the report')
    } finally {
      setLoading(false)
    }
  }

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
    localStorage.setItem('insurance-theme', theme)
  }

  React.useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme')
      document.body.classList.remove('dark-theme')
    } else {
      document.body.classList.add('dark-theme')
      document.body.classList.remove('light-theme')
    }
  }, [theme])

  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] font-inter p-6 md:p-12">
        <header className="mb-8 flex items-center justify-between fade-in">
          <div className="flex items-center gap-3">
            <h1 className="title-xl font-extrabold tracking-tight">
              Insurance Adjuster AI
            </h1>
          </div>
          <button
            onClick={toggleTheme}
            className="btn btn-ghost text-sm px-4 py-1.5 rounded"
            aria-label="Toggle dark/light theme"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </header>

        <section className="text-center mb-12 fade-in" style="animation-delay: 0ms">
          <p className="text-2xl md:text-3xl caption text-[var(--muted)]">
            AI-powered loss assessment for insurance claims
          </p>
        </section>

        <div className="card fade-in" style="animation-delay: 100ms">
          <h2 className="text-2xl font-semibold mb-4">Upload Policy & Damage Photos</h2>
          <FileUpload onUpload={handleUpload} />
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mt-8 fade-in" style="animation-delay: 200ms">
          <div>
            <div className="text-3xl font-bold text-[var(--accent)]">📄</div>
            <div>
              <div className="font-medium">Fast Analysis</div>
              <div className="caption">AI processes in seconds</div>
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--primary)]">📸</div>
            <div>
              <div className="font-medium">Photo Evidence</div>
              <div className="caption">Multiple angles accepted</div>
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-[var(--success)]">💰</div>
            <div>
              <div className="font-medium">Estimated Value</div>
              <div className="caption">AI cost estimation</div>
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold">📋</div>
            <div>
              <div className="font-medium">Professional Report</div>
              <div className="caption">Markdown ready</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'analyzing') {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] font-inter p-6 md:p-12">
        <div className="max-w-3xl mx-auto">
          <LoadingState 
            error={false} 
            message="AI analyzing damage & policy..."
            showProgress={stepProgress}
          />
        </div>
      </div>
    )
  }

  if (step === 'result') {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] font-inter p-6 md:p-12">
        <header className="mb-6 flex items-center justify-between fade-in">
          <button
            onClick={() => setStep('upload')}
            className="btn btn-ghost text-sm px-4 py-1.5 rounded"
            aria-label="Upload new documents"
          >
            ← New Analysis
          </button>
          <h2 className="text-2xl font-semibold">Loss Report</h2>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          {/* Coverage Card */}
          <div className="card">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1L3 5v18l6-6v6L12 1" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--accent)]">Coverage Analysis</p>
                <p className="caption mt-1">{report?.analysis?.coverage || ''}</p>
              </div>
            </div>
          </div>

          {/* Damage Card */}
          <div className="card">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <path d="M17 5H5a2 2 0 00-2 2v3m18 0v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3" />
                  <path d="M17 5h2m-6 9-5-5m5 5-5 5m5-5h2m6-6v2m-2-6h2m6-3a2 2 0 10-4 0 2 2 0 004 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--primary)]">Damage Assessment</p>
                <p className="caption mt-1">{report?.analysis?.damage || ''}</p>
              </div>
            </div>
          </div>

          {/* Value Card */}
          <div className="card">
            <div className="flex items-center justify-between">
              <p className="font-medium text-[var(--success)]">Estimated Value</p>
              <p className="text-2xl font-bold mt-1">${report?.analysis?.estimatedValue || '0'}</p>
            </div>
          </div>

          {/* Next Steps Card */}
          <div className="card">
            <p className="font-medium text-[var(--primary)]">Recommended Next Steps</p>
            <ul className="list-disc pl-5 space-y-1 caption">
              {report?.analysis?.nextSteps?.map((step, i) => (
                <li key={i} className="flex items-start">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ReportPreview report={report} onGenerate={handleGenerate} />

        <div className="mt-8 pt-8 border-t border-[var(--border)] fade-in" style="animation-delay: 300ms">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`btn btn-primary w-full py-3 text-lg font-medium rounded transition-all ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Generating Full Report…' : 'Generate Complete Markdown Report'}
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default App
