import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Mail,
  MapPinned,
  MessageSquareText,
  Phone,
  ReceiptText,
  Star,
} from "lucide-react";
import type { Customer, Job } from "../../lib/models";

interface QuickActionProps {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function QuickAction({ label, icon, href, onClick, disabled }: QuickActionProps) {
  const className = "flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-semibold text-slate-300 transition active:scale-[.98] active:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-16 lg:min-w-0 lg:border lg:border-slate-800 lg:bg-slate-950 lg:text-xs lg:hover:border-cyan-400/40";
  if (href && !disabled) {
    const external = href.startsWith("tel:") || href.startsWith("sms:") || href.startsWith("mailto:") || href.startsWith("https:");
    return external
      ? <a href={href} target={href.startsWith("https:") ? "_blank" : undefined} rel={href.startsWith("https:") ? "noreferrer" : undefined} className={className}>{icon}<span>{label}</span></a>
      : <Link href={href} className={className}>{icon}<span>{label}</span></Link>;
  }
  return <button type="button" disabled={disabled} onClick={onClick} className={className}>{icon}<span>{label}</span></button>;
}

export function CustomerQuickActions({
  customer,
  activeJob,
  onMarkComplete,
  onRequestReview,
}: {
  customer: Customer;
  activeJob?: Job;
  onMarkComplete: () => void;
  onRequestReview: () => void;
}) {
  const query = `customerId=${encodeURIComponent(customer.id)}&action=create`;
  const mapAddress = encodeURIComponent(customer.address);

  return <section aria-label="Customer quick actions" className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-2 lg:static lg:px-0">
    <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-2 shadow-2xl shadow-black/40 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:max-w-none lg:grid-cols-5 lg:gap-2 lg:border-slate-800 lg:bg-slate-900/80 lg:shadow-none">
      <QuickAction label="Call" icon={<Phone className="size-5 text-cyan-300" />} href={customer.phone ? `tel:${customer.phone}` : undefined} disabled={!customer.phone} />
      <QuickAction label="Text" icon={<MessageSquareText className="size-5 text-cyan-300" />} href={customer.phone ? `sms:${customer.phone}` : undefined} disabled={!customer.phone} />
      <QuickAction label="Email" icon={<Mail className="size-5 text-cyan-300" />} href={customer.email ? `mailto:${customer.email}` : undefined} disabled={!customer.email} />
      <QuickAction label="Navigate" icon={<MapPinned className="size-5 text-cyan-300" />} href={customer.address ? `https://www.google.com/maps/search/?api=1&query=${mapAddress}` : undefined} disabled={!customer.address} />
      <QuickAction label="Invoice" icon={<ReceiptText className="size-5 text-emerald-300" />} href={`/invoices?${query}`} />
      <QuickAction label="Quote" icon={<FilePlus2 className="size-5 text-violet-300" />} href={`/quotes?${query}`} />
      <QuickAction label="Book survey" icon={<ClipboardCheck className="size-5 text-amber-300" />} href={`/planner?${query}&type=Survey`} />
      <QuickAction label="Book work" icon={<CalendarPlus className="size-5 text-amber-300" />} href={`/planner?${query}&type=Job${activeJob ? `&jobId=${encodeURIComponent(activeJob.id)}` : ""}`} />
      <QuickAction label="Complete" icon={<CheckCircle2 className="size-5 text-emerald-300" />} onClick={onMarkComplete} disabled={!activeJob} />
      <QuickAction label="Review" icon={<Star className="size-5 text-yellow-300" />} onClick={onRequestReview} disabled={!customer.phone && !customer.email} />
    </div>
  </section>;
}
