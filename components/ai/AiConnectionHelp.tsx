const links = {
  billing: { href: "https://platform.openai.com/settings/organization/billing", label: "Open API billing" },
  limits: { href: "https://platform.openai.com/settings/organization/limits", label: "Review API limits" },
  usage: { href: "https://platform.openai.com/usage", label: "View API usage" },
} as const;

const recovery = {
  billing_required: {
    text: "Add API credit to the OpenAI organisation used by JR OS, allow a few minutes for the balance to update, then try the request again when ready.",
    links: ["billing", "usage"],
  },
  spend_limit_reached: {
    text: "A monthly organisation or project spending limit was reached. Review the limit and usage, then wait for its reset or change it if intended. Adding credit alone does not remove a spending limit.",
    links: ["limits", "usage"],
  },
  usage_limit_reached: {
    text: "OpenAI's approved organisation usage limit was reached. Review your usage tier and limits in OpenAI. Extra credit may not remove this limit.",
    links: ["limits", "usage"],
  },
  quota_required: {
    text: "OpenAI reported a credit or account-limit issue. Check the balance, organisation and project limits before trying again; this response does not identify an empty balance by itself.",
    links: ["billing", "limits"],
  },
  not_configured: {
    text: "This JR OS site still needs its private AI connection activated. Funding the OpenAI account alone does not activate this site. Ask the person managing JR OS to complete setup, then check the connection again.",
    links: [],
  },
  connection_failed: {
    text: "The person managing JR OS needs to check its private AI key and model access. Adding credit alone may not fix this connection problem.",
    links: [],
  },
} as const;

export type AiRecoveryCode = keyof typeof recovery;
export function aiRecoveryCode(value: unknown): AiRecoveryCode | undefined {
  return typeof value === "string" && Object.hasOwn(recovery, value) ? value as AiRecoveryCode : undefined;
}

function AccountLinks({ names }: { names: readonly (keyof typeof links)[] }) {
  return <div className="flex flex-wrap gap-3">{names.map(name => <a key={name} href={links[name].href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-slate-800">{links[name].label}</a>)}</div>;
}

export function AiRecoveryNotice({ code, canManage }: { code: AiRecoveryCode; canManage: boolean }) {
  const checked = aiRecoveryCode(code);
  if (!checked) return null;
  const item = recovery[checked];
  return <aside aria-label="AI recovery help" className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
    <p className="text-sm text-amber-100">{item.text}</p>
    {canManage ? <AccountLinks names={item.links} /> : <p className="text-sm text-slate-300">Ask your business owner to review the OpenAI account or JR OS connection. Keep your job notes here while they check.</p>}
    <p className="text-xs text-slate-400">This request will not retry automatically. Your typed job notes are unchanged.</p>
  </aside>;
}

export function AiConnectionHelp({ canManage }: { canManage: boolean }) {
  return <details className="rounded-xl border border-slate-700 p-4">
    <summary className="min-h-12 cursor-pointer py-3 font-semibold">AI setup, credit and costs</summary>
    <div className="mt-3 space-y-4 text-sm text-slate-300">
      <p>Connected notes, photo and recording reviews use the OpenAI API. API usage is billed separately from your ChatGPT subscription.</p>
      {canManage ? <>
        <ol className="list-decimal space-y-3 pl-5">
          <li>Open API billing and choose the OpenAI organisation used for the JR OS key. Add a payment method if needed, then choose Add to balance or Buy credits. Start with a small amount while testing.</li>
          <li>Review automatic recharge and spending limits in OpenAI. Leave automatic recharge off if you want to top up manually. A spend alert only notifies you; an enforced limit stops requests, with a possible short delay.</li>
          <li>Have the private AI connection activated for the JR OS site you are using. Funding and site activation are separate steps.</li>
        </ol>
        <AccountLinks names={["billing", "limits", "usage"]} />
        <p className="text-xs text-slate-400">OpenAI billing permissions are managed in OpenAI. JR OS does not receive your card details or display your remaining balance. Purchased credits can expire; review the purchase terms before paying.</p>
      </> : <p>Your business owner manages API credit and site activation. Ask them to check the OpenAI account if connected AI is unavailable.</p>}
      <p><strong className="text-white">Check connection</strong> checks this site&apos;s setup without requesting a paid AI review. It does not verify your credit balance or model access. A successful review or transcription confirms that particular request worked.</p>
      <p>You can keep writing job notes and use <strong className="text-white">Create priced draft from notes</strong> without connected AI. Review the saved material and labour allowances before saving a quote.</p>
      <p className="text-xs text-slate-400">Billing links open in another tab. Keep the quote page open; reloading or leaving it can lose an unsaved review.</p>
    </div>
  </details>;
}
