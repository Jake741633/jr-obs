"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "../ui/Button";
import { InputField } from "../ui/FormField";
import { contactDetailsError, contactFileError, contactMatchSnapshot, initialContactDetails, matchingContacts, parseContactFile, phoneContacts, type ContactCandidate, type ContactDetails } from "../../lib/contactImport";
import { makeId } from "../../lib/storage";
import type { Customer } from "../../lib/models";

type Row = { candidate: ContactCandidate; details: ContactDetails; selected: boolean; consent: string; saved: boolean; id: string; createdAt: string };
type Manager = { getProperties(): Promise<string[]>; select(properties: string[], options: { multiple: boolean }): Promise<unknown> };

export function ContactImportPanel({ customers, ready, scopeKey, createCustomer }: { customers: Customer[]; ready: boolean; scopeKey: string; createCustomer: (customer: Customer, matches: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [busyScope, setBusyScope] = useState<object | null>(null), [limit, setLimit] = useState(8), [query, setQuery] = useState("");
  const [pickerProperties, setPickerProperties] = useState<string[]>([]);
  const scope = useMemo(() => ({ scopeKey, ready }), [scopeKey, ready]);
  const busy = busyScope === scope;
  const latest = useRef({ scope, ready: false, customers, rows, active: false });
  const operation = useRef(0), saving = useRef(false);
  useLayoutEffect(() => {
    latest.current = { scope, ready, customers, rows, active: true };
    return () => { latest.current.active = false; latest.current.ready = false; };
  }, [scope, ready, customers, rows]);
  useLayoutEffect(() => {
    let active = true;
    const manager = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { contacts?: Manager }).contacts;
    if (manager && typeof manager.select === "function" && typeof manager.getProperties === "function") {
      void manager.getProperties().then(properties => { if (active) setPickerProperties(["name", "tel", "email", "address"].filter(key => properties.includes(key))); }).catch(() => {});
    }
    return () => { active = false; };
  }, [scope]);
  const current = () => latest.current.active && latest.current.ready && latest.current.scope === scope;
  function replaceRows(next: Row[]) { latest.current.rows = next; setRows(next); }
  function receive(contacts: ContactCandidate[], ticket: number) {
    if (!current() || ticket !== operation.current) return;
    replaceRows(contacts.map(candidate => ({ candidate, details: initialContactDetails(candidate), selected: false, consent: "", saved: false, id: "", createdAt: "" })));
    setLimit(8); setQuery(""); setError(""); setMessage(contacts.length ? "Choose the customers to add. Nothing has been saved yet." : "No contacts were selected.");
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !current() || latest.current.rows.length || busy) return;
    const problem = contactFileError(file); if (problem) { setError(problem); return; }
    const ticket = ++operation.current; setBusyScope(scope); setError(""); setMessage("");
    try { receive(parseContactFile(await file.text()), ticket); }
    catch (reason) { if (current() && ticket === operation.current) setError(reason instanceof Error ? reason.message : "The contact file could not be read."); }
    finally { if (latest.current.active && ticket === operation.current) setBusyScope(null); }
  }
  async function choosePhone() {
    if (!current() || latest.current.rows.length || busy || !pickerProperties.length) return;
    const manager = (navigator as Navigator & { contacts?: Manager }).contacts; if (!manager) return;
    const ticket = ++operation.current; setBusyScope(scope); setError(""); setMessage("");
    try { receive(phoneContacts(await manager.select(pickerProperties, { multiple: true })), ticket); }
    catch (reason) { if (current() && ticket === operation.current) setError(reason instanceof Error && reason.name === "AbortError" ? "Contact selection cancelled. Nothing was saved." : "Contact access was not available. Try the contact-file import instead."); }
    finally { if (latest.current.active && ticket === operation.current) setBusyScope(null); }
  }
  function changeRow(row: Row, patch: Partial<Row>) {
    if (!current() || row.saved || saving.current || !latest.current.rows.includes(row)) return;
    replaceRows(latest.current.rows.map(item => item === row ? { ...row, ...patch } : item)); setError("");
  }
  function saveSelected() {
    if (!current() || saving.current || latest.current.rows !== rows) return;
    const selected = rows.filter(row => row.selected && !row.saved); if (!selected.length) return;
    saving.current = true; setError(""); setMessage("");
    const known = [...latest.current.customers]; let count = 0;
    try {
      for (const row of selected) {
        if (!current()) throw new Error("The account changed. Review contacts again in the current account.");
        const problem = contactDetailsError(row.details); if (problem) throw new Error(`${row.details.name || "Unnamed contact"}: ${problem}`);
        const matches = matchingContacts(row.details, known), snapshot = contactMatchSnapshot(matches);
        if (matches.length && row.consent !== snapshot) throw new Error(`${row.details.name}: review the matching customer before adding a separate record.`);
        row.id ||= makeId("cus"); row.createdAt ||= new Date().toISOString();
        const customer = { id: row.id, name: row.details.name.trim(), phone: row.details.phone.trim(), email: row.details.email.trim(), address: row.details.address.trim(), notes: "", createdAt: row.createdAt, updatedAt: row.createdAt };
        createCustomer(customer, snapshot);
        row.saved = true; row.selected = false; known.push(customer); count++;
      }
      setMessage(`${count} customer${count === 1 ? "" : "s"} saved on this device. Check sync status before switching devices.`);
    } catch (reason) { setError(`${count ? `${count} saved. ` : ""}${reason instanceof Error ? reason.message : "The save could not be confirmed."} Unsaved contacts remain here for review and retry.`); }
    finally { saving.current = false; replaceRows([...rows]); }
  }
  const words = query.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  const filtered = rows.filter(row => words.every(word => Object.values(row.details).join(" ").toLocaleLowerCase("en-GB").includes(word)));
  const selectedCount = rows.filter(row => row.selected && !row.saved).length;
  return <details className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
    <summary className="min-h-12 cursor-pointer py-3 text-base font-bold">Import phone contacts</summary>
    <div className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Choose customers from your phone or a contact file, check the details, then save the selected records. Imported addresses are contact addresses; confirm the job’s site address separately.</p>
      {!ready ? <p className="text-sm text-amber-200">Close any open customer form and wait for customer records to load before importing.</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        {pickerProperties.length ? <Button type="button" disabled={!ready || busy || rows.length > 0} onClick={() => void choosePhone()}>Choose phone contacts</Button> : <p className="text-sm text-slate-400">Use a .vcf contact file when direct contact selection is unavailable on this phone.</p>}
        <label className="grid gap-2 text-sm font-semibold"><span>Choose contact file (.vcf)</span><input type="file" accept=".vcf,text/vcard,text/x-vcard" disabled={!ready || busy || rows.length > 0} onChange={chooseFile} className="min-h-12 max-w-full rounded-xl border border-slate-700 p-3 text-base disabled:opacity-40" /></label>
      </div>
      <details className="text-sm text-slate-400"><summary className="min-h-12 cursor-pointer py-3 font-semibold text-slate-200">Export contacts from iPhone</summary><p>In Contacts, open Lists, touch and hold the list you want, then choose Export. Include names, phone numbers, emails and addresses, save the .vcf file to Files, then choose it here. Smaller lists without photos work best. Up to 500 contacts and 2 MB per file.</p></details>
      {busy ? <p role="status">Reading selected contacts…</p> : null}
      {message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {rows.length ? <>
        <InputField label="Find imported contacts" type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(8); }} />
        <Button type="button" variant="secondary" disabled={!ready} onClick={() => {
          if (!current() || latest.current.rows !== rows) return;
          replaceRows(rows.map(row => ({ ...row, selected: !row.saved && !contactDetailsError(row.details) && matchingContacts(row.details, [...latest.current.customers, ...rows.filter(other => other !== row).map(other => other.details)]).length === 0 })));
          setMessage("Selected complete contacts without matches across the whole import. Review the selection before saving.");
        }}>Select contacts without matches</Button>
        <p className="text-sm text-slate-400">Showing {Math.min(limit, filtered.length)} of {filtered.length} matching contacts · {selectedCount} selected across all results · {rows.filter(row => row.saved).length} saved</p>
        <div className="space-y-3">{filtered.slice(0, limit).map(row => {
          const index = rows.indexOf(row), matches = matchingContacts(row.details, customers), snapshot = contactMatchSnapshot(matches);
          return <section key={index} aria-label={`Import ${row.details.name || "unnamed contact"}`} className="rounded-xl border border-slate-700 p-4">
            <label className="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" checked={row.selected} disabled={!ready || row.saved} onChange={event => changeRow(row, { selected: event.target.checked })} className="size-5" />{row.details.name || "Name needed"}{row.saved ? " · Saved" : ""}</label>
            <p className="break-words text-sm text-slate-400">{[row.details.phone, row.details.email, row.details.address].filter(Boolean).join(" · ") || "Contact details needed"}</p>
            {!row.saved && matches.length ? <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200"><p>Possible existing customer: {matches.map(item => item.name || "Unnamed customer").join(", ")}. No existing record will be changed.</p><label className="mt-2 flex min-h-12 items-center gap-3"><input type="checkbox" checked={row.consent === snapshot} disabled={!ready} onChange={event => changeRow(row, { consent: event.target.checked ? snapshot : "" })} className="size-5" />I reviewed the match; add as a separate customer</label></div> : null}
            {!row.saved ? <details className="mt-2"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-cyan-200">Review or edit contact details{row.candidate.phones.length > 1 || row.candidate.emails.length > 1 || row.candidate.addresses.length > 1 ? " · multiple details available" : ""}</summary><fieldset disabled={!ready} className="grid gap-3 sm:grid-cols-2">
              <InputField label="Customer name" value={row.details.name} onChange={event => changeRow(row, { details: { ...row.details, name: event.target.value }, consent: "" })} />
              {([['phone', 'Phone', row.candidate.phones], ['email', 'Email', row.candidate.emails], ['address', 'Address', row.candidate.addresses]] as const).map(([key, label, options]) => <div key={key} className="space-y-2">{options.length > 1 ? <label className="grid gap-2 text-sm"><span>Choose {label.toLowerCase()} from contact</span><select aria-label={`Choose ${label.toLowerCase()} from contact`} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" value={options.includes(row.details[key]) ? row.details[key] : ""} onChange={event => { if (event.target.value) changeRow(row, { details: { ...row.details, [key]: event.target.value }, consent: "" }); }}><option value="">Enter below</option>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}<InputField label={label} type={key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'text'} value={row.details[key]} onChange={event => changeRow(row, { details: { ...row.details, [key]: event.target.value }, consent: "" })} /></div>)}
            </fieldset></details> : null}
          </section>;
        })}</div>
        {filtered.length > limit ? <Button type="button" variant="secondary" onClick={() => setLimit(value => value + 8)}>Show more imported contacts</Button> : null}
        <div className="flex flex-col gap-3 sm:flex-row"><Button type="button" disabled={!ready || !selectedCount} onClick={saveSelected}>Save {selectedCount} selected customer{selectedCount === 1 ? "" : "s"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { if (!current() || latest.current.rows !== rows) return; operation.current++; replaceRows([]); setError(""); setMessage("Import review closed. Saved customers remain in your list."); }}>Clear import review</Button></div>
        <p className="text-xs text-slate-400">Keep this page open while reviewing. Leaving discards contacts that have not been saved. Only the chosen name, phone, email and address are saved.</p>
      </> : null}
    </div>
  </details>;
}
