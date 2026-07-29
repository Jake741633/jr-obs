import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function InputField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="grid gap-2 text-sm font-medium text-slate-300"><span>{label}</span><input className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400" {...props} /></label>;
}

export function TextareaField({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <label className="grid gap-2 text-sm font-medium text-slate-300"><span>{label}</span><textarea className="min-h-28 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400" {...props} /></label>;
}
