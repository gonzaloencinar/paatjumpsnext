import { Badge } from "@/components/ui/badge";
import {
  CAMPAIGN_STATUS,
  CONTACT_STATUS,
  EMAIL_SEND_STATUS,
} from "@/lib/crm/format";
import { cn } from "@/lib/utils";

export function ContactStatusBadge({ status }: { status: string }) {
  const meta = CONTACT_STATUS[status] ?? {
    label: status,
    dot: "bg-foreground/40",
    badge: "secondary" as const,
  };
  return (
    <Badge variant={meta.badge} className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function CampaignStatusBadge({ status }: { status: string }) {
  const meta = CAMPAIGN_STATUS[status] ?? {
    label: status,
    badge: "secondary" as const,
  };
  return <Badge variant={meta.badge}>{meta.label}</Badge>;
}

export function EmailSendStatusBadge({ status }: { status: string }) {
  const meta = EMAIL_SEND_STATUS[status] ?? {
    label: status,
    badge: "secondary" as const,
  };
  return <Badge variant={meta.badge}>{meta.label}</Badge>;
}
