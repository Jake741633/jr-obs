// A missing input is different from an explicitly entered zero. Reject
// booleans, arrays, objects and hexadecimal strings as engineering values.
export function finiteCalculatorNumber(value) {
  if (typeof value === "string") {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  } else if (typeof value !== "number") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function positiveCalculatorNumber(value) {
  const number = finiteCalculatorNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function nonNegativeCalculatorNumber(value) {
  const number = finiteCalculatorNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export function formatCalculatorNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e9)) return value.toExponential(3);
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(value);
}
