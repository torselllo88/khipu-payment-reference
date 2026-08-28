import { dictionaries, type Lang } from "@/lib/i18n/dictionary";
import type { OrderStatus } from "@/lib/store";

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-slate-700 text-slate-200",
  processing: "bg-amber-500/20 text-amber-300",
  success: "bg-emerald-500/20 text-emerald-300",
  declined: "bg-red-500/20 text-red-300",
  expired: "bg-orange-500/20 text-orange-300",
  failed: "bg-yellow-500/20 text-yellow-300",
  refund_required: "bg-purple-500/20 text-purple-300",
};

export function StatusBadge({ status, lang }: { status: OrderStatus; lang: Lang }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STYLES[status]}`}>
      {dictionaries[lang].status[status]}
    </span>
  );
}
