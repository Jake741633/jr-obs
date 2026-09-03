import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, FilePlus2, Mail, MapPinned, MessageSquareText, Phone } from "lucide-react";
import type { Builder } from "../../lib/models";

function Action({ label, icon, href, disabled }: { label: string; icon: ReactNode; href: string; disabled?: boolean }) {
  const className = `flex min-h-14 min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition active:scale-[.98] ${disabled ? "pointer-events-none text-slate-700" : "text-slate-300 active:bg-slate-800"} lg:min-h-16 lg:min-w-0 lg:border lg:border-slate-800 lg:bg-slate-950 lg:text-xs`;
  const external = /^(tel:|sms:|mailto:|https:)/.test(href);
  return external
    ? <a href={disabled ? undefined : href} target={href.startsWith("https:") ? "_blank" : undefined} rel={href.startsWith("https:") ? "noreferrer" : undefined} className={className}>{icon}<span>{label}</span></a>
    : <Link href={href} aria-disabled={disabled} className={className}>{icon}<span>{label}</span></Link>;
}

export function BuilderQuickActions({ builder }: { builder: Builder }) {
  const builderId = encodeURIComponent(builder.id);
  const mapAddress = encodeURIComponent(builder.address);
  return <section aria-label="Builder quick actions" className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-2 lg:static lg:px-0">
    <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-950/95 p-2 shadow-2xl shadow-black/40 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:max-w-none lg:grid-cols-6 lg:gap-2 lg:border-slate-800 lg:bg-slate-900/80 lg:shadow-none">
      <Action label="Call" icon={<Phone className="size-5 text-cyan-300" />} href={`tel:${builder.phone}`} disabled={!builder.phone} />
      <Action label="Text" icon={<MessageSquareText className="size-5 text-cyan-300" />} href={`sms:${builder.phone}`} disabled={!builder.phone} />
      <Action label="Email" icon={<Mail className="size-5 text-cyan-300" />} href={`mailto:${builder.email}`} disabled={!builder.email} />
      <Action label="Navigate" icon={<MapPinned className="size-5 text-cyan-300" />} href={`https://www.google.com/maps/search/?api=1&query=${mapAddress}`} disabled={!builder.address} />
      <Action label="Quote" icon={<FilePlus2 className="size-5 text-violet-300" />} href={`/quotes?action=create&builderId=${builderId}`} />
      <Action label="Opportunity" icon={<Building2 className="size-5 text-fuchsia-300" />} href={`/leads?action=create&builderId=${builderId}&source=Builder`} />
    </div>
  </section>;
}
