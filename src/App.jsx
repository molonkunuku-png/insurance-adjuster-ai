import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import FileUpload from './components/FileUpload'
import ReportPreview from './components/ReportPreview'
import LoadingState from './components/LoadingState'
import { analyzeDamageAndPolicy, generateReport } from './lib/ai'

function App() {
  const [step, setStep] = useState('upload')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleUpload = async ({ files, getImagesForAI, getPdfText }) => {
    setStep('analyzing')
    setLoading(true)

    try {
      // Get base64 images from the uploader
      const images = await getImagesForAI()
      const pdfText = getPdfText()

      if (images.length === 0) {
        alert('Please upload at least one damage image')
        setStep('upload')
        setLoading(false)
        return
      }

      const analysis = await analyzeDamageAndPolicy(images, pdfText)
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
    } catch (e) {
      console.error(e)
      alert(e.message || 'Something went wrong generating the report')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-bg text-fg p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Insurance Adjuster AI</h1>
          <p className="text-muted mb-8">Upload policy document + damage photos</p>
          <FileUpload onUpload={handleUpload} />
        </div>
      </div>
    )
  }

  if (step === 'analyzing') {
    return (
      <LoadingState error={false} message="AI analyzing damage & policy..." />
    )
  }

  if (step === 'result') {
    return (
      <div className="min-h-screen bg-bg text-fg p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-4">Loss Report</h2>
          
          {report?.analysis?.coverage && (
            <div className="card mb-4 p-4">
              <h3 className="font-semibold mb-2">Coverage Analysis</h3>
              <p className="text-sm">{report.analysis.coverage}</p>
            </div>
          )}

          {report?.analysis?.damage && (
            <div className="card mb-4 p-4">
              <h3 className="font-semibold mb-2">Damage Assessment</h3>
              <p className="text-sm">{report.analysis.damage}</p>
            </div>
          )}

          {report?.analysis?.estimatedValue && (
            <div className="card mb-4 p-4">
              <h3 className="font-semibold mb-2">Estimated Value</h3>
              <p className="text-sm">${report.analysis.estimatedValue}</p>
            </div>
          )}

          {report?.analysis?.nextSteps && (
            <div className="card mb-4 p-4">
              <h3 className="font-semibold mb-2">Recommended Next Steps</h3>
              <ul className="text-sm text-muted/80 space-y-1">
                {report.analysis.nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="mt-1 flex-shrink-0 text-error"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ReportPreview report={report} onGenerate={handleGenerate} />

          <div className="mt-6">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={`btn ${loading ? 'opacity-50' : ''} inline-flex items-center gap-2 px-4 py-2 bg-accent text-bg font-medium rounded hover:bg-accent/90 transition-colors`}
            >
              {loading ? 'Generating…' : 'Generate Full Report'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default App
