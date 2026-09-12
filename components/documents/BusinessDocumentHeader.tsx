import Image from "next/image";
import type { BusinessProfile, DocumentBrandingSettings, VatSettings } from "../../lib/models";

interface BusinessDocumentHeaderProps {
  documentLabel: string;
  number: string;
  profile: BusinessProfile;
  vat: VatSettings;
  branding: DocumentBrandingSettings;
}

export function BusinessDocumentHeader({ documentLabel, number, profile, vat, branding }: BusinessDocumentHeaderProps) {
  const contact = [profile.phone, profile.email, profile.website].filter(Boolean).join(" · ");
  const centred = branding.logoPosition === "Centre";
  const reversed = branding.logoPosition === "Right";

  return <div className="border-b-4 px-6 py-7 sm:px-9" style={{ borderColor: branding.primaryColour }}>
    <div className={`flex gap-6 ${centred ? "flex-col items-center text-center" : reversed ? "flex-row-reverse items-start" : "items-start justify-between"}`}>
      <div className={`flex min-w-0 flex-1 gap-4 ${centred ? "flex-col items-center" : reversed ? "flex-row-reverse text-right" : "items-start"}`}>
        {branding.showLogo && profile.logoDataUrl ? <Image unoptimized src={profile.logoDataUrl} alt={`${profile.companyName} logo`} width={150} height={80} className="max-h-20 w-auto shrink-0 object-contain" /> : null}
        <div className="min-w-0">
          <p className="text-2xl font-black tracking-tight">{profile.companyName || "Company name"}</p>
          {branding.showCompanyAddress && profile.address ? <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{profile.address}</p> : null}
          {branding.showContactDetails && contact ? <p className="mt-1 text-xs text-slate-500">{contact}</p> : null}
          {branding.showVatNumber && vat.showVatNumberOnDocuments && vat.registrationStatus === "VAT registered" && vat.registrationNumber ? <p className="mt-1 text-xs text-slate-500">VAT registration: {vat.registrationNumber}</p> : null}
        </div>
      </div>
      <div className={centred ? "text-center" : reversed ? "text-left" : "text-right"}>
        <p className="text-3xl font-light uppercase" style={{ color: branding.primaryColour }}>{documentLabel}</p>
        <p className="mt-1 font-semibold">{number}</p>
      </div>
    </div>
  </div>;
}

export function BusinessDocumentFooter({ text, accentColour }: { text: string; accentColour: string }) {
  if (!text) return null;
  return <div className="px-6 py-4 text-center text-xs text-slate-600 sm:px-9" style={{ backgroundColor: `${accentColour}18` }}>{text}</div>;
}
