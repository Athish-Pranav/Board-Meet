import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { ROLES, ROLE_LABELS, USER_STATUS, type Role } from "@/lib/enums";
import { PageHeader, Card, Table, StatusBadge, Badge, Field } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { createUser, updateUser, resetPassword, deleteUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePermission("users.manage");
  const users = await prisma.user.findMany({ where: { deletedAt: null }, orderBy: [{ status: "asc" }, { name: "asc" }] });

  return (
    <div>
      <PageHeader title="Users & Roles" description="Manage who can access the system and what they can do." />

      <Table
        head={
          <>
            <th className="th">Name</th>
            <th className="th">Role</th>
            <th className="th">Director</th>
            <th className="th">Status</th>
            <th className="th">Manage</th>
          </>
        }
      >
        {users.map((u) => (
          <tr key={u.id} className="hover:bg-slate-50 align-top">
            <td className="td">
              <p className="font-medium text-slate-800">{u.name}</p>
              <p className="text-xs text-slate-400">{u.email}{u.designation ? ` · ${u.designation}` : ""}</p>
              <p className="text-xs text-slate-300">Joined {fmtDate(u.createdAt)}</p>
            </td>
            <td className="td">{ROLE_LABELS[u.role as Role] ?? u.role}</td>
            <td className="td">{u.isDirector ? <Badge tone="blue">Director</Badge> : <span className="text-slate-300">—</span>}</td>
            <td className="td"><StatusBadge status={u.status} /></td>
            <td className="td">
              <details>
                <summary className="cursor-pointer text-xs font-medium text-brand-600">Edit</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <ActionForm action={updateUser} submitLabel="Save" submitVariant="secondary">
                    <input type="hidden" name="id" value={u.id} />
                    <Field label="Name"><input name="name" className="input" defaultValue={u.name} /></Field>
                    <Field label="Email"><input name="email" type="email" className="input" defaultValue={u.email} /></Field>
                    <Field label="Designation"><input name="designation" className="input" defaultValue={u.designation ?? ""} /></Field>
                    <Field label="Role">
                      <select name="role" className="input" defaultValue={u.role}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select name="status" className="input" defaultValue={u.status}>
                        {USER_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="isDirector" defaultChecked={u.isDirector} className="rounded border-slate-300" /> Counts toward quorum (director)
                    </label>
                  </ActionForm>
                  <ActionForm action={resetPassword} submitLabel="Reset password" submitVariant="danger">
                    <input type="hidden" name="id" value={u.id} />
                    <Field label="New password" hint="Revokes existing sessions."><input type="password" name="password" className="input" minLength={8} /></Field>
                  </ActionForm>
                </div>
                <div className="mt-3 rounded-lg border border-red-100 p-3">
                  <p className="mb-1 text-sm font-medium text-red-700">Remove user</p>
                  <p className="mb-2 text-xs text-slate-500">Soft-deletes the account and revokes active sessions; the record is retained for audit.</p>
                  <ActionForm action={deleteUser} successToast="User removed">
                    <input type="hidden" name="id" value={u.id} />
                    <ConfirmSubmit confirmLabel="Yes, remove user">Remove user</ConfirmSubmit>
                  </ActionForm>
                </div>
              </details>
            </td>
          </tr>
        ))}
      </Table>

      <Card className="mt-6 max-w-2xl">
        <h2 className="section-title mb-3">Add user</h2>
        <ActionForm action={createUser} submitLabel="Create user">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required><input name="name" className="input" required /></Field>
            <Field label="Email" required><input name="email" type="email" className="input" required /></Field>
            <Field label="Designation"><input name="designation" className="input" /></Field>
            <Field label="Role" required>
              <select name="role" className="input" defaultValue="BoardMember">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Temporary password" required><input name="password" type="text" className="input" minLength={8} required /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="isDirector" className="rounded border-slate-300" /> This user is a director (counts toward quorum)
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
