# Fault calculator scope and validation

The calculator suite is tracked in [issue #2](https://github.com/Jake741633/jr-obs/issues/2). This increment adds `/electrical-calculators/adiabatic` and hardens `/electrical-calculators/earth-fault-loop`. Other calculator modules and saved job/quote/survey design records remain separate roadmap work.

## Adiabatic CPC sizing

Two methods use the same thermal relation, `S = sqrt(I²t) / k`:

- Current/time: calculate `I²t = I × I × t` from matched RMS current and device clearing time. This app supports 0.1–5 seconds for this simplified method. Below 0.1 seconds it requires the manufacturer energy method. Current-limiting devices also require their manufacturer energy characteristics; the app cannot infer device behavior.
- Manufacturer energy: use entered total let-through I²t in A²s for the actual device, voltage and applicable fault-current range. A verified clearing time greater than zero and no greater than five seconds is still required to keep the calculation within scope.

The result shows required thermal area, proposed conductor withstand `k²S²`, area margin and, only for current/time mode, the thermal current limit at the entered time. It compares unrounded values. It does not select a standard conductor size, protective device, k-factor or disconnection time.

The 0.1-second lower bound is a conservative limit of the app's simple current/time mode, not a statement that the general adiabatic relation is unavailable below that duration. Manufacturer I²t mode supports shorter durations. The five-second upper limit applies to both modes.

All initial design inputs are blank. Missing, malformed, non-positive, non-finite and unsupported-duration inputs leave the assessment unavailable. Overflow/underflow in any required intermediate also prevents an assessment. Changing methods uses only the chosen method's fault input; clearing the form clears both methods. Nothing is saved, queued or sent to a service by these pages. Existing route and account permissions remain in force.

A successful thermal comparison is one design check. Mechanical minimums, conductor temperature limits, automatic disconnection, earth-fault loop, device coordination and actual site conditions still require a qualified designer's verification. One operating point does not assess the worst thermal stress across the full relevant fault-current range.

## Earth-fault loop correction

The previous page converted a blank resistance with `Number("")`, silently substituting zero. Clearing R2 in the example circuit therefore reduced Zs from 0.83 Ω to 0.53 Ω and incorrectly retained the positive status.

The page now passes raw input strings to strict numeric validation. Every resistance must be explicitly entered; individual zero resistances are allowed, while total impedance must be positive. Voltage, selected maximum and percentage must be valid, and percentage must be greater than zero and no more than 100. Invalid percentages are rejected rather than clamped or replaced by a default. The page no longer preloads example resistance/device-limit values.

Unavailable results display an em dash, an explanation and no positive assessment. Simple voltage/Zs current is clearly distinguished from a maximum fault-current or device breaking-capacity assessment. The caller must enter temperature-corrected resistances and a verified device limit appropriate to the design.

## Technical references

Reviewed 27 September 2026; these explain the calculation principles and do not replace the current project-specific BS 7671 and manufacturer documents:

- [Schneider Electric Electrical Installation Guide: protective earthing conductor sizing](https://www.electrical-installation.org/enwiki/Sizing_of_protective_earthing_conductor) — adiabatic relation and the need for other conductor-size constraints.
- [Schneider Electric Electrical Installation Guide: cable short-circuit withstand](https://www.electrical-installation.org/enwiki/Verification_of_the_withstand_capabilities_of_cables_under_short-circuit_conditions) — thermal energy comparison and five-second scope.
- [IET Temporary Power Distribution questions](https://electrical.theiet.org/bs-7671-18th-edition-wiring-regulations/faqs/webinar-questions-and-answers/temporary-power-distribution-webinar/) — adiabatic checks at five seconds or less and separate treatment of longer durations.

## Verification

`tests/adiabatic-calculator-core.test.mjs`, `tests/earth-fault-loop-calculator-core.test.mjs` and `tests/electrical-calculator-numbers.test.mjs` cover known answers, exact boundaries, malformed and missing values, numeric extremes and unrounded comparisons. `tests/fault-calculator-pages.test.mjs` executes the rendered pages' real change/click handlers against the actual calculation modules, covering the missing-R2 regression, method switching and clearing stale results.

These automated tests verify software behavior. They are not installation certification or physical-phone acceptance evidence.
