import { requireUser } from "@/lib/rbac";
import { getWhatsNew } from "@/lib/whatsnew";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/ui";
import { WhatsNewFeed } from "@/components/WhatsNewFeed";
import { ActionForm } from "@/components/ActionForm";
import { markSeen } from "./actions";

export const dynamic = "force-dynamic";

export default async function WhatsNewPage() {
  const user = await requireUser();
  const data = await getWhatsNew(user.id);

  return (
    <div>
      <PageHeader
        title="What's New"
        description={`Updates since ${fmtDateTime(data.since)}.`}
        actions={
          data.total > 0 ? (
            <ActionForm action={markSeen} submitLabel="Mark all as seen" submitVariant="secondary" className="!space-y-0" />
          ) : null
        }
      />
      <Card>
        <WhatsNewFeed data={data} />
      </Card>
    </div>
  );
}
