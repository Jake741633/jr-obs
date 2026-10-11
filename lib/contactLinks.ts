/** Contact links open the user's phone/mail app without supplying message content. */
export function contactPhoneHref(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const value = phone.trim();
  if (!/^\+?[\d\s().-]+$/.test(value) || /^\+.*\(0\)/.test(value)) return null;
  const number = value.replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(number) ? `tel:${number}` : null;
}

export function contactEmailHref(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim();
  const parts = value.split("@");
  if (parts.length !== 2 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0]) || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(parts[1])) return null;
  return `mailto:${encodeURIComponent(parts[0])}@${parts[1]}`;
}
