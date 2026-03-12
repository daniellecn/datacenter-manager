// Settings — Phase 11
// App-wide configuration: SMTP relay, default sync intervals,
// power reading retention, app version/health info.

export default function Settings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Application Info</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-500">Version</dt><dd className="text-gray-900 font-medium">1.0.0</dd>
          <dt className="text-gray-500">Environment</dt><dd className="text-gray-900 font-medium">{import.meta.env.MODE}</dd>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">SMTP Configuration</h2>
        <p className="text-sm text-gray-500 mb-4">Email relay for future alert notifications. Configured via environment variables on the backend.</p>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>SMTP_HOST — relay host</p>
          <p>SMTP_PORT — relay port (default 587)</p>
          <p>SMTP_USERNAME / SMTP_PASSWORD</p>
          <p>SMTP_FROM_ADDRESS</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Retention Policy</h2>
        <p className="text-sm text-gray-500 mb-4">Configured via environment variables. Requires backend restart to take effect.</p>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>POWER_READINGS_RETENTION_DAYS — default 90</p>
          <p>Token revocations are purged automatically on expiry.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Health Endpoints</h2>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>GET /api/v1/health — liveness</p>
          <p>GET /api/v1/readiness — readiness (db connectivity)</p>
          <p>GET /api/v1/metrics — Prometheus metrics</p>
        </div>
      </div>
    </div>
  );
}
