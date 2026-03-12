import { useState } from "react";
import { Plus, Pencil, Shield } from "lucide-react";
import { useUsers, useCreateUser, useUpdateUser, useResetUserPassword } from "@/api/users";
import { useAuthStore } from "@/store/authStore";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { FormField, Input, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import { formatDateTime } from "@/lib/utils";
import type { UserRead } from "@/types";

const ROLES = ["admin", "operator", "read_only"];

interface CreateForm { username: string; email: string; password: string; role: string; }
interface EditForm { email: string; role: string; is_active: boolean; must_change_password: boolean; }

export default function UserManagement() {
  // All hooks must be called before any conditional return (Rules of Hooks)
  const currentUser = useAuthStore((s) => s.user);

  const [page, setPage] = useState(1);
  const { data, isLoading } = useUsers({ page, size: 50 });
  const createMut = useCreateUser();

  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ username: "", email: "", password: "", role: "read_only" });
  const [createError, setCreateError] = useState("");

  const [editModal, setEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRead | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ email: "", role: "read_only", is_active: true, must_change_password: false });
  const updateMut = useUpdateUser(editingUser?.id ?? "");

  const [resetModal, setResetModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRead | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const resetMut = useResetUserPassword(resetTarget?.id ?? "");

  // Guard: only admins can manage users
  if (currentUser?.role !== "admin") {
    return <div className="flex items-center justify-center py-16 text-gray-400">Admin access required.</div>;
  }

  function openEdit(u: UserRead) {
    setEditingUser(u);
    setEditForm({ email: u.email ?? "", role: u.role, is_active: u.is_active, must_change_password: u.must_change_password });
    setEditModal(true);
  }

  function openReset(u: UserRead) { setResetTarget(u); setNewPassword(""); setResetModal(true); }

  async function handleCreate() {
    setCreateError("");
    if (!createForm.username || !createForm.password) { setCreateError("Username and password are required."); return; }
    if (createForm.password.length < 8) { setCreateError("Password must be at least 8 characters."); return; }
    try {
      await createMut.mutateAsync({ username: createForm.username, email: createForm.email || null,
        password: createForm.password, role: createForm.role });
      setCreateModal(false);
      setCreateForm({ username: "", email: "", password: "", role: "read_only" });
    } catch (e: unknown) {
      setCreateError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to create user.");
    }
  }

  async function handleEdit() {
    await updateMut.mutateAsync({ email: editForm.email || null, role: editForm.role,
      is_active: editForm.is_active, must_change_password: editForm.must_change_password });
    setEditModal(false);
  }

  async function handleReset() {
    if (!newPassword || newPassword.length < 8) return;
    await resetMut.mutateAsync(newPassword);
    setResetModal(false);
  }

  const setCreate = (k: keyof CreateForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setCreateForm((f) => ({ ...f, [k]: e.target.value }));
  const setEdit = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button onClick={() => setCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add User
        </button>
      </div>

      <Table<UserRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "username", header: "Username", render: (r) => (
            <span className="font-medium text-gray-900">{r.username}</span>
          )},
          { key: "email", header: "Email", render: (r) => r.email ?? "—" },
          { key: "role", header: "Role", render: (r) => (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              r.role === "admin" ? "bg-purple-100 text-purple-700" :
              r.role === "operator" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
            }`}>
              {r.role === "admin" && <Shield size={10} />} {r.role}
            </span>
          )},
          { key: "is_active", header: "Active", render: (r) => (
            <StatusBadge status={r.is_active ? "active" : "inactive"} />
          )},
          { key: "must_change_pw", header: "Force PW Change", render: (r) => (
            <span className={`text-xs ${r.must_change_password ? "text-yellow-600 font-medium" : "text-gray-400"}`}>
              {r.must_change_password ? "Yes" : "No"}
            </span>
          )},
          { key: "last_login_at", header: "Last Login", render: (r) => formatDateTime(r.last_login_at) },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end">
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit"><Pencil size={14} /></button>
                <button onClick={() => openReset(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-yellow-600 text-xs font-medium" title="Reset password">PW</button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="New User">
        <div className="space-y-3">
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <FormField label="Username" required><Input value={createForm.username} onChange={setCreate("username")} /></FormField>
          <FormField label="Email"><Input type="email" value={createForm.email} onChange={setCreate("email")} /></FormField>
          <FormField label="Password" required><Input type="password" value={createForm.password} onChange={setCreate("password")} autoComplete="new-password" /></FormField>
          <FormField label="Role">
            <Select value={createForm.role} onChange={setCreate("role")}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </Select>
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setCreateModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={createMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Create</button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit ${editingUser?.username ?? "User"}`} size="sm">
        <div className="space-y-3">
          <FormField label="Email"><Input type="email" value={editForm.email} onChange={setEdit("email")} /></FormField>
          <FormField label="Role">
            <Select value={editForm.role} onChange={setEdit("role")}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </Select>
          </FormField>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={editForm.must_change_password} onChange={(e) => setEditForm((f) => ({ ...f, must_change_password: e.target.checked }))} className="rounded" />
              Force password change
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleEdit} disabled={updateMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Save</button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title={`Reset Password — ${resetTarget?.username}`} size="sm">
        <div className="space-y-3">
          <FormField label="New Password (min 8 chars)">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setResetModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleReset} disabled={resetMut.isPending || newPassword.length < 8}
              className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-60">Reset</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
