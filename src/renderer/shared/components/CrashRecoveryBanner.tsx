import { useEffect, useState } from 'react'

export default function CrashRecoveryBanner() {
  const [hasCrash, setHasCrash] = useState(false)

  useEffect(() => {
    void window.app.getCrashLog().then(report => {
      if (report) setHasCrash(true)
    })
  }, [])

  if (!hasCrash) return null

  const handleReport = async () => {
    const url = await window.app.getCrashReportUrl()
    if (url) await window.shell.openExternal(url)
    await window.app.dismissCrashLog()
    setHasCrash(false)
  }

  const handleDismiss = async () => {
    await window.app.dismissCrashLog()
    setHasCrash(false)
  }

  return (
    <div className="bg-red-900/30 border-b border-red-500/30 px-4 py-2 text-xs text-red-300 flex items-center gap-2">
      <span className="font-medium">OctoAgent crashed unexpectedly during your last session.</span>
      <button
        onClick={() => void handleReport()}
        className="text-accent hover:underline ml-1"
      >
        Report Issue
      </button>
      <button
        onClick={() => void handleDismiss()}
        className="text-red-400 hover:text-red-300 ml-1"
      >
        Dismiss
      </button>
    </div>
  )
}
