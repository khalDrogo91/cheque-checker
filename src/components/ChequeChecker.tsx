import React, { useReducer } from 'react'

interface FormState {
  chequeDate: string
  presentationDate: string
  dishonourDate: string
  bounceReason: string
  noticeDate: string
  paymentReceived: 'yes' | 'no' | ''
  paymentDate: string
  complaintFilingDate: string
}

interface Result {
  chequeValidity: { valid: boolean; label: string; detail: string }
  noticeValidity: { valid: boolean; label: string; detail: string }
  paymentDeadline: { date: string; label: string; detail: string }
  complaintDeadline: { date: string; label: string; detail: string }
  filedInTime: { valid: boolean; label: string; detail: string }
  verdict: { applicable: boolean; label: string; detail: string }
}

type Action =
  | { type: 'SET_FIELD'; field: keyof FormState; value: string }
  | { type: 'RESET' }

const initialState: FormState = {
  chequeDate: '',
  presentationDate: '',
  dishonourDate: '',
  bounceReason: '',
  noticeDate: '',
  paymentReceived: '',
  paymentDate: '',
  complaintFilingDate: '',
}

function reducer(state: FormState, action: Action): FormState {
  if (action.type === 'RESET') return initialState
  return { ...state, [action.field]: action.value }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function fmt(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function calculate(form: FormState): Result | null {
  const chequeDate = parseDate(form.chequeDate)
  const presentationDate = parseDate(form.presentationDate)
  const dishonourDate = parseDate(form.dishonourDate)
  const noticeDate = parseDate(form.noticeDate)
  const complaintFilingDate = parseDate(form.complaintFilingDate)

  if (!chequeDate || !presentationDate || !dishonourDate || !noticeDate || !complaintFilingDate) {
    return null
  }

  // 1. Cheque validity: 3 months from cheque date
  const chequeExpiryDate = addMonths(chequeDate, 3)
  const chequeValid = presentationDate <= chequeExpiryDate

  // 2. Notice validity: must be within 30 days of dishonour
  const noticeCutoff = addDays(dishonourDate, 30)
  const noticeValid = noticeDate <= noticeCutoff

  // 3. Payment deadline: 15 days after notice date
  const paymentDeadlineDate = addDays(noticeDate, 15)

  // 4. Complaint deadline: 30 days after payment deadline
  const complaintDeadlineDate = addDays(paymentDeadlineDate, 30)

  // 5. Filed in time
  const filedInTime = complaintFilingDate <= complaintDeadlineDate

  // 6. Verdict: all conditions must hold
  const applicable = chequeValid && noticeValid && filedInTime

  return {
    chequeValidity: {
      valid: chequeValid,
      label: 'Cheque Validity',
      detail: chequeValid
        ? `Valid — presented on ${fmt(presentationDate)}, within 3-month validity ending ${fmt(chequeExpiryDate)}`
        : `Invalid — cheque expired on ${fmt(chequeExpiryDate)}, but presented on ${fmt(presentationDate)}`,
    },
    noticeValidity: {
      valid: noticeValid,
      label: 'Legal Notice Validity',
      detail: noticeValid
        ? `Valid — notice sent on ${fmt(noticeDate)}, within 30-day window ending ${fmt(noticeCutoff)}`
        : `Invalid — notice sent on ${fmt(noticeDate)}, but 30-day window expired on ${fmt(noticeCutoff)}`,
    },
    paymentDeadline: {
      date: fmt(paymentDeadlineDate),
      label: 'Payment Deadline',
      detail: `Drawer had until ${fmt(paymentDeadlineDate)} (15 days after notice) to make payment`,
    },
    complaintDeadline: {
      date: fmt(complaintDeadlineDate),
      label: 'Complaint Filing Deadline',
      detail: `Complaint must be filed by ${fmt(complaintDeadlineDate)} (30 days after payment deadline)`,
    },
    filedInTime: {
      valid: filedInTime,
      label: 'Complaint Filed in Time',
      detail: filedInTime
        ? `Yes — complaint filed on ${fmt(complaintFilingDate)}, before deadline of ${fmt(complaintDeadlineDate)}`
        : `No — complaint filed on ${fmt(complaintFilingDate)}, after deadline of ${fmt(complaintDeadlineDate)}`,
    },
    verdict: {
      applicable,
      label: 'Section 138 NI Act',
      detail: applicable
        ? 'Section 138 of the Negotiable Instruments Act, 1881 is APPLICABLE. The complainant has a valid case.'
        : 'Section 138 of the Negotiable Instruments Act, 1881 is NOT APPLICABLE due to one or more failed conditions above.',
    },
  }
}

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1'
const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white'

export default function ChequeChecker() {
  const [form, dispatch] = useReducer(reducer, initialState)
  const [result, setResult] = React.useState<Result | null>(null)
  const [error, setError] = React.useState<string>('')
  const [pendingResult, setPendingResult] = React.useState<Result | null>(null)
  const [showPhoneModal, setShowPhoneModal] = React.useState(false)
  const [phone, setPhone] = React.useState('')
  const [phoneError, setPhoneError] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  function handleCheck() {
    setError('')
    if (
      !form.chequeDate ||
      !form.presentationDate ||
      !form.dishonourDate ||
      !form.noticeDate ||
      !form.complaintFilingDate ||
      !form.paymentReceived
    ) {
      setError('Please fill in all required fields.')
      return
    }
    const res = calculate(form)
    setPendingResult(res)
    setShowPhoneModal(true)
  }

  async function handlePhoneSubmit() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      setPhoneError('Please enter a valid 10-digit phone number.')
      return
    }
    setPhoneError('')
    setSubmitting(true)
    try {
      await fetch('/api/phone-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
    } catch {
      // Silently continue — don't block results for logging failures
    }
    setSubmitting(false)
    setShowPhoneModal(false)
    setResult(pendingResult)
    setPendingResult(null)
    setPhone('')
  }

  function handleReset() {
    dispatch({ type: 'RESET' })
    setResult(null)
    setPendingResult(null)
    setShowPhoneModal(false)
    setPhone('')
    setPhoneError('')
    setError('')
  }

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    dispatch({ type: 'SET_FIELD', field, value: e.target.value })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Cheque Bounce Checker</h1>
          <p className="text-gray-500 mt-1 text-sm">Section 138 — Negotiable Instruments Act, 1881</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5 pb-3 border-b border-gray-100">Case Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Cheque Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={form.chequeDate} onChange={set('chequeDate')} />
            </div>
            <div>
              <label className={labelClass}>Presentation Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={form.presentationDate} onChange={set('presentationDate')} />
            </div>
            <div>
              <label className={labelClass}>Dishonour Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={form.dishonourDate} onChange={set('dishonourDate')} />
            </div>
            <div>
              <label className={labelClass}>Notice Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={form.noticeDate} onChange={set('noticeDate')} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Bounce Reason</label>
              <textarea
                className={inputClass + ' resize-none'}
                rows={2}
                placeholder="e.g. Insufficient funds, account closed…"
                value={form.bounceReason}
                onChange={set('bounceReason')}
              />
            </div>
            <div>
              <label className={labelClass}>Payment Received? <span className="text-red-500">*</span></label>
              <select className={inputClass} value={form.paymentReceived} onChange={set('paymentReceived')}>
                <option value="">— Select —</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {form.paymentReceived === 'yes' && (
              <div>
                <label className={labelClass}>Payment Date</label>
                <input type="date" className={inputClass} value={form.paymentDate} onChange={set('paymentDate')} />
              </div>
            )}
            <div className={form.paymentReceived === 'yes' ? '' : 'sm:col-span-1'}>
              <label className={labelClass}>Complaint Filing Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputClass} value={form.complaintFilingDate} onChange={set('complaintFilingDate')} />
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleCheck}
              className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm shadow-sm"
            >
              Check Eligibility
            </button>
            <button
              onClick={handleReset}
              className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5 pb-3 border-b border-gray-100">Analysis Results</h2>

            <div className="space-y-3">
              <ResultRow valid={result.chequeValidity.valid} label={result.chequeValidity.label} detail={result.chequeValidity.detail} />
              <ResultRow valid={result.noticeValidity.valid} label={result.noticeValidity.label} detail={result.noticeValidity.detail} />
              <InfoRow label={result.paymentDeadline.label} detail={result.paymentDeadline.detail} />
              <InfoRow label={result.complaintDeadline.label} detail={result.complaintDeadline.detail} />
              <ResultRow valid={result.filedInTime.valid} label={result.filedInTime.label} detail={result.filedInTime.detail} />
            </div>

            {/* Verdict */}
            <div className={`mt-6 rounded-xl p-4 border-2 ${result.verdict.applicable ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-lg font-bold ${result.verdict.applicable ? 'text-green-700' : 'text-red-700'}`}>
                  {result.verdict.applicable ? '✓' : '✗'} {result.verdict.label}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${result.verdict.applicable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {result.verdict.applicable ? 'APPLICABLE' : 'NOT APPLICABLE'}
                </span>
              </div>
              <p className={`text-sm ${result.verdict.applicable ? 'text-green-800' : 'text-red-800'}`}>
                {result.verdict.detail}
              </p>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              * This tool is for informational purposes only and does not constitute legal advice. Consult a qualified advocate for legal guidance.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pb-4">
          Need legal assistance?{' '}
          <a
            href="mailto:abhishek11521@gmail.com"
            className="text-blue-600 hover:underline font-medium"
          >
            abhishek11521@gmail.com
          </a>
        </div>
      </div>

      {/* Phone Number Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Enter Your Phone Number</h3>
            <p className="text-sm text-gray-500 mb-4">Please provide your phone number to view the results.</p>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              maxLength={15}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handlePhoneSubmit() }}
            />
            {phoneError && (
              <p className="mt-2 text-sm text-red-600">{phoneError}</p>
            )}
            <button
              onClick={handlePhoneSubmit}
              disabled={submitting}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm shadow-sm"
            >
              {submitting ? 'Submitting…' : 'View Results'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultRow({ valid, label, detail }: { valid: boolean; label: string; detail: string }) {
  return (
    <div className={`flex gap-3 p-3 rounded-lg ${valid ? 'bg-green-50' : 'bg-red-50'}`}>
      <span className={`mt-0.5 flex-shrink-0 text-base ${valid ? 'text-green-500' : 'text-red-500'}`}>
        {valid ? '✓' : '✗'}
      </span>
      <div>
        <p className={`text-sm font-semibold ${valid ? 'text-green-800' : 'text-red-800'}`}>{label}</p>
        <p className={`text-xs mt-0.5 ${valid ? 'text-green-700' : 'text-red-700'}`}>{detail}</p>
      </div>
    </div>
  )
}

function InfoRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-blue-50">
      <span className="mt-0.5 flex-shrink-0 text-base text-blue-500">ℹ</span>
      <div>
        <p className="text-sm font-semibold text-blue-800">{label}</p>
        <p className="text-xs mt-0.5 text-blue-700">{detail}</p>
      </div>
    </div>
  )
}
