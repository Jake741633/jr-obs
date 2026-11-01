import type { Customer } from "./models";

export const MAX_CONTACT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_CONTACTS = 500;
export type ContactCandidate = { name: string; phones: string[]; emails: string[]; addresses: string[] };
export type ContactDetails = { name: string; phone: string; email: string; address: string };
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : "";
const strings = (value: unknown) => Array.isArray(value) ? [...new Set(value.map(clean).filter(Boolean))] : [];
const unescape = (value: string) => value.replace(/\\([nN,;\\])/g, (_, letter: string) => /n/i.test(letter) ? "\n" : letter);
function parts(value: string) {
  const fields: string[] = []; let field = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) { field += value[i] + value[++i]; continue; }
    if (value[i] === ";") { fields.push(unescape(field)); field = ""; } else field += value[i];
  }
  fields.push(unescape(field)); return fields;
}

function bounded(contact: ContactCandidate): ContactCandidate {
  if (contact.name.length > 256 || [...contact.phones, ...contact.emails].some(value => value.length > 512) || contact.addresses.some(value => value.length > 2000)) throw new Error("A contact has unusually long details. Shorten it in Contacts and export again.");
  return contact;
}

export function contactFileError(file: { name: string; size: number }) {
  if (!/\.vcf$/i.test(file.name)) return "Choose a contact file ending in .vcf.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "The contact file is empty.";
  if (file.size > MAX_CONTACT_FILE_BYTES) return "Choose a contact file under 2 MB. Export names, phone numbers, emails and addresses without contact photos.";
  return null;
}

/** Read only the requested contact fields; embedded images, notes and URLs are ignored. */
export function parseContactFile(input: string): ContactCandidate[] {
  if (new TextEncoder().encode(input).byteLength > MAX_CONTACT_FILE_BYTES) throw new Error("The contact file is larger than 2 MB.");
  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const result: ContactCandidate[] = [];
  let contact: ContactCandidate | null = null, version = "", structuredName = "", organisation = "";
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      if (contact) throw new Error("This contact file contains an unfinished contact.");
      contact = { name: "", phones: [], emails: [], addresses: [] }; version = ""; structuredName = ""; organisation = ""; continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (!contact) throw new Error("This contact file has an unexpected ending.");
      if (!["3.0", "4.0"].includes(version)) throw new Error("Use a vCard 3.0 or 4.0 contact file. Export it again from your phone's Contacts app.");
      contact.name ||= structuredName || organisation;
      contact.phones = strings(contact.phones); contact.emails = strings(contact.emails); contact.addresses = strings(contact.addresses);
      result.push(bounded(contact)); contact = null;
      if (result.length > MAX_IMPORT_CONTACTS) throw new Error("Import up to 500 contacts at a time. Export a smaller Contacts list.");
      continue;
    }
    if (!contact) throw new Error("This is not a complete vCard contact file.");
    // Parameters may contain colons inside quotes, for example TYPE="work:voice".
    let quoted = false, separator = -1;
    for (let i = 0; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; if (line[i] === ":" && !quoted) { separator = i; break; } }
    if (separator < 0) throw new Error("A contact line could not be read. Export the contact file again.");
    const header = line.slice(0, separator), key = header.split(";")[0].split(".").at(-1)?.toUpperCase();
    if (!["VERSION", "FN", "N", "ORG", "TEL", "EMAIL", "ADR"].includes(key ?? "")) continue;
    if (/;ENCODING=/i.test(header) || /;CHARSET=(?!UTF-8(?:;|$))/i.test(header)) throw new Error("This contact file uses an older text encoding. Export it again as a UTF-8 vCard.");
    const raw = line.slice(separator + 1), value = clean(unescape(raw));
    if (key === "VERSION") version = value;
    if (key === "FN") contact.name ||= value;
    if (key === "N") { const name = parts(raw); structuredName = [name[3], name[1], name[2], name[0], name[4]].map(clean).filter(Boolean).join(" "); }
    if (key === "ORG") organisation = parts(raw).map(clean).filter(Boolean).join(" · ");
    if (key === "TEL" || key === "EMAIL") {
      let detail = value.replace(key === "TEL" ? /^tel:/i : /^mailto:/i, "");
      if (/^(?:tel|mailto):/i.test(value)) { try { detail = decodeURIComponent(detail); } catch { throw new Error("A contact has an unreadable phone or email link."); } }
      if (detail) (key === "TEL" ? contact.phones : contact.emails).push(detail);
    }
    if (key === "ADR") { const address = parts(raw).map(clean).filter(Boolean).join(", "); if (address) contact.addresses.push(address); }
  }
  if (contact) throw new Error("This contact file ended before the last contact was complete.");
  if (!result.length) throw new Error("No contacts were found in this file.");
  return result;
}

export function phoneContacts(input: unknown): ContactCandidate[] {
  if (!Array.isArray(input) || input.length > MAX_IMPORT_CONTACTS) throw new Error("Choose up to 500 contacts at a time.");
  return input.map(value => {
    if (!value || typeof value !== "object") throw new Error("The phone returned an unreadable contact.");
    const entry = value as Record<string, unknown>;
    const addresses = Array.isArray(entry.address) ? entry.address.flatMap(address => {
      if (!address || typeof address !== "object") return [];
      const fields = address as Record<string, unknown>;
      const lines = [...strings(fields.addressLine), ...[fields.city, fields.region, fields.postalCode, fields.country].map(clean)].filter(Boolean);
      return lines.length ? [lines.join(", ")] : [];
    }) : [];
    return bounded({ name: strings(entry.name)[0] ?? "", phones: strings(entry.tel), emails: strings(entry.email), addresses: strings(addresses) });
  });
}

export function initialContactDetails(contact: ContactCandidate): ContactDetails {
  return { name: contact.name, phone: contact.phones[0] ?? "", email: contact.emails[0] ?? "", address: contact.addresses[0] ?? "" };
}
export function contactDetailsError(contact: ContactDetails) {
  if (!contact.name.trim()) return "Add a customer name.";
  if (!contact.phone.trim() && !contact.email.trim()) return "Add a phone number or email address.";
  if (contact.name.length > 256 || contact.phone.length > 512 || contact.email.length > 512 || contact.address.length > 2000) return "Shorten the contact details before saving.";
  return null;
}
function phoneKey(value: unknown) {
  const raw = clean(value).replace(/[\s().-]/g, "");
  if (!/^(?:\+|00)?\d{7,15}$/.test(raw)) return "";
  const international = raw.replace(/^00/, "+");
  return international.startsWith("+44") ? `0${international.slice(3)}` : international;
}
export function contactMatchSnapshot(matches: Pick<Customer, "id" | "name" | "phone" | "email">[]) { return JSON.stringify(matches.map(item => [item.id, item.name, item.phone, item.email]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))); }
export function matchingContacts<T extends Pick<Customer, "name" | "phone" | "email">>(contact: ContactDetails, customers: T[]): T[] {
  const phone = phoneKey(contact.phone), email = clean(contact.email).toLocaleLowerCase("en-GB"), name = clean(contact.name).replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
  return customers.filter(saved => (phone && phone === phoneKey(saved.phone)) || (email && email === clean(saved.email).toLocaleLowerCase("en-GB")) || (name && name === clean(saved.name).replace(/\s+/g, " ").toLocaleLowerCase("en-GB")));
}
