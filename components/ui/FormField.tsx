import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function InputField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-300"><span>{label}</span><input className="min-h-12 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 sm:min-h-11 sm:text-sm" {...props} /></label>;
}

export function TextareaField({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-300"><span>{label}</span><textarea className="min-h-32 w-full min-w-0 resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 sm:min-h-28 sm:text-sm" {...props} /></label>;
}
