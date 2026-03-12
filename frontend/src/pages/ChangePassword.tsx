import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChangePassword } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "@/components/common/Spinner";
import { Lock } from "lucide-react";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { clearAuth, user } = useAuthStore();
  const changePassword = useChangePassword();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("Passwords do not match."); return; }
    if (next.length < 8) { setError("Password must be at least 8 characters."); return; }
    try {
      await changePassword.mutateAsync({ current_password: current, new_password: next });
      navigate("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to change password.";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-yellow-500 flex items-center justify-center mb-3">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Change Password</h1>
          <p className="text-gray-400 text-sm mt-1">
            {user?.must_change_password
              ? "You must change your password before continuing."
              : "Update your account password."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {[
            { label: "Current Password", value: current, set: setCurrent, auto: "current-password" },
            { label: "New Password", value: next, set: setNext, auto: "new-password" },
            { label: "Confirm New Password", value: confirm, set: setConfirm, auto: "new-password" },
          ].map(({ label, value, set, auto }) => (
            <div key={label} className="space-y-1">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <input
                type="password"
                autoComplete={auto}
                required
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={changePassword.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {changePassword.isPending && <Spinner size="sm" className="text-white" />}
            {changePassword.isPending ? "Saving…" : "Change Password"}
          </button>

          <button
            type="button"
            onClick={() => { clearAuth(); navigate("/login"); }}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
          >
            Back to login
          </button>
        </form>
      </div>
    </div>
  );
}
