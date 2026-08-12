import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { FOLDER_CATEGORIES, FOLDER_CATEGORY_LABELS } from "@/lib/enums";
import { PageHeader, Card, Badge, Field, Table } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { updateRetentionPolicy, runRetentionScan } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const canSettings = can(user.role, "settings.manage");
  const canRetention = can(user.role, "retention.manage");
  if (!canSettings && !canRetention) redirect("/403");

  const policies = await prisma.retentionPolicy.findMany();
  const byCat = new Map(policies.map((p) => [p.category, p]));

  return (
    <div>
      <PageHeader title="Settings" description="Company profile, integrations and records retention." />

      <div className="space-y-6">
        <Card>
          <h2 className="section-title mb-3">Company profile</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Company name" value={env.company.name} />
            <Detail label="Listing status" value={env.company.isListed ? <Badge tone="amber">Listed (SEBI LODR applies)</Badge> : <Badge tone="green">Unlisted</Badge>} />
            <Detail label="Storage driver" value={env.storageDriver} />
            <Detail label="Email driver" value={env.notifyDriver} />
            <Detail label="Azure AD SSO" value={env.azureAd.enabled ? <Badge tone="green">Configured</Badge> : <Badge tone="gray">Not configured</Badge>} />
            <Detail label="Assistant (Claude)" value={env.anthropic.enabled ? <Badge tone="green">{env.anthropic.model}</Badge> : <Badge tone="gray">Search-only</Badge>} />
          </dl>
          <p className="mt-3 text-xs text-slate-400">These are configured via environment variables (.env). See the README for SSO, SMTP, S3 and Claude setup.</p>
        </Card>

        {canRetention ? (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Records retention policies</h2>
              <ActionForm action={runRetentionScan} submitLabel="Run retention scan" submitVariant="secondary" className="!space-y-0" />
            </div>
            <p className="mb-4 text-sm text-slate-500">Minutes and resolutions are permanent records and are never auto-deleted, regardless of policy.</p>
            <Table
              head={
                <>
                  <th className="th">Category</th>
                  <th className="th">Retention</th>
                  <th className="th">Action</th>
                  <th className="th">Update</th>
                </>
              }
            >
              {FOLDER_CATEGORIES.map((cat) => {
                const p = byCat.get(cat);
                return (
                  <tr key={cat}>
                    <td className="td font-medium text-slate-800">{FOLDER_CATEGORY_LABELS[cat]}</td>
                    <td className="td">{p?.permanent ? <Badge tone="green">Permanent</Badge> : `${p?.retainYears ?? "—"} years`}</td>
                    <td className="td">{p?.action ?? "Flag"}</td>
                    <td className="td">
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-brand-600">Edit</summary>
                        <ActionForm action={updateRetentionPolicy} submitLabel="Save" submitVariant="secondary" className="mt-2">
                          <input type="hidden" name="category" value={cat} />
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox" name="permanent" defaultChecked={p?.permanent ?? false} className="rounded border-slate-300" /> Permanent
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Retain (years)"><input type="number" name="retainYears" className="input" defaultValue={p?.retainYears ?? ""} min={1} /></Field>
                            <Field label="Action">
                              <select name="action" className="input" defaultValue={p?.action ?? "Flag"}>
                                <option value="Flag">Flag</option>
                                <option value="Archive">Archive</option>
                              </select>
                            </Field>
                          </div>
                        </ActionForm>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value}</dd>
    </div>
  );
}
