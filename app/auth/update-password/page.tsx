import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Card } from "../../../components/ui/Card";

export default function UpdatePasswordPage() {
  return <div className="mx-auto grid min-h-[65vh] max-w-lg place-items-center">
    <Card className="w-full">
      <LockKeyhole className="size-8 text-cyan-300" />
      <h1 className="mt-4 text-2xl font-bold">Password recovery</h1>
      <p className="mt-2 text-sm text-slate-400">A valid recovery email opens JR OS&apos;s secure password flow automatically. This compatibility page cannot change account credentials.</p>
      <p className="mt-3 text-sm text-slate-400">If your link has expired, use a fresh recovery email. Otherwise return to the account page to sign in.</p>
      <Link href="/cloud" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Return to sign in</Link>
    </Card>
  </div>;
}
