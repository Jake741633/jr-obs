import { Smartphone } from "lucide-react";
import { Card } from "../ui/Card";

export function InstallAppGuide() {
  return (
    <Card className="app-install-guide border-cyan-500/20">
      <details>
        <summary className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg text-sm font-semibold text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400">
          <Smartphone aria-hidden="true" className="size-5 shrink-0" />
          Add JR OS to your home screen
        </summary>
        <div className="mt-3 space-y-4 text-sm text-slate-300">
          <p>Open JR OS from its own app icon, with your workspace filling the screen.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold text-white">iPhone or iPad</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Open your usual JR OS link in Safari.</li>
                <li>Tap Share, then Add to Home Screen.</li>
                <li>Keep Open as Web App enabled if shown, then tap Add.</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-white">Android</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Open your usual JR OS link in Chrome.</li>
                <li>Open the browser menu and choose Install app or Add to Home screen.</li>
                <li>Confirm, then open JR OS from its icon.</li>
              </ol>
            </div>
          </div>
          <p className="text-xs text-slate-400">Sign in with the same account after installing. Keep this browser until your records are synced or backed up: records saved only here may not appear in the installed app. Cloud sign-in and syncing need an internet connection.</p>
        </div>
      </details>
    </Card>
  );
}
