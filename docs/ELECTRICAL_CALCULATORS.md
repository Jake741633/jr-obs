# Electrical calculator scope and validation

The calculator suite is tracked in [issue #2](https://github.com/Jake741633/jr-obs/issues/2). It covers load/current, voltage drop, cable current capacity, earth-fault loop, adiabatic CPC sizing, protective-device checks and maximum demand. Complete calculations can be saved as job records or standalone design notes. Direct quote/survey links and full manufacturer device selection remain separate roadmap work.

## Adiabatic CPC sizing

Two methods use the same thermal relation, `S = sqrt(I²t) / k`:

- Current/time: calculate `I²t = I × I × t` from matched RMS current and device clearing time. This app supports 0.1–5 seconds for this simplified method. Below 0.1 seconds it requires the manufacturer energy method. Current-limiting devices also require their manufacturer energy characteristics; the app cannot infer device behavior.
- Manufacturer energy: use entered total let-through I²t in A²s for the actual device, voltage and applicable fault-current range. A verified clearing time greater than zero and no greater than five seconds is still required to keep the calculation within scope.

The result shows required thermal area, proposed conductor withstand `k²S²`, area margin and, only for current/time mode, the thermal current limit at the entered time. It compares unrounded values. It does not select a standard conductor size, protective device, k-factor or disconnection time.

The 0.1-second lower bound is a conservative limit of the app's simple current/time mode, not a statement that the general adiabatic relation is unavailable below that duration. Manufacturer I²t mode supports shorter durations. The five-second upper limit applies to both modes.

All initial design inputs are blank. Missing, malformed, non-positive, non-finite and unsupported-duration inputs leave the assessment unavailable. Overflow/underflow in any required intermediate also prevents an assessment. Changing methods uses only the chosen method's fault input; clearing the form clears both methods. Calculation inputs remain in the form until the operator explicitly saves a record. Existing route and account permissions remain in force.

A successful thermal comparison is one design check. Mechanical minimums, conductor temperature limits, automatic disconnection, earth-fault loop, device coordination and actual site conditions still require a qualified designer's verification. One operating point does not assess the worst thermal stress across the full relevant fault-current range.

## Earth-fault loop correction

The previous page converted a blank resistance with `Number("")`, silently substituting zero. Clearing R2 in the example circuit therefore reduced Zs from 0.83 Ω to 0.53 Ω and incorrectly retained the positive status.

The page now passes raw input strings to strict numeric validation. Every resistance must be explicitly entered; individual zero resistances are allowed, while total impedance must be positive. Voltage, selected maximum and percentage must be valid, and percentage must be greater than zero and no more than 100. Invalid percentages are rejected rather than clamped or replaced by a default. The page no longer preloads example resistance/device-limit values.

Unavailable results display an em dash, an explanation and no positive assessment. Simple voltage/Zs current is clearly distinguished from a maximum fault-current or device breaking-capacity assessment. The caller must enter temperature-corrected resistances and a verified device limit appropriate to the design.

## Connected load, voltage drop and cable sizing

Load/current, voltage-drop and cable-sizing modules now use the same strict decimal parser. Every required input must be explicit, finite and positive. Power factor and efficiency must be at most 1; the selected voltage-drop percentage must be at most 100. These design checks require a nonzero load and route. Unsupported phases, missing factors, invalid cable options and numeric overflow/underflow make the affected assessment unavailable. Comparisons use unrounded values. No invalid input becomes zero, a standard voltage or a unity factor.

The load page interprets entered power as motor output when efficiency is below 1. For known electrical input power the operator must use efficiency 1. Input active power is `P / efficiency`; apparent input power is `P / (efficiency × power factor)`. Current uses that same input apparent power with supply voltage (and √3 for balanced three-phase loads). This corrects the previous inconsistent apparent-power display.

Voltage drop uses the verified circuit-specific mV/A/m value, current and route length divided by 1000. The entered mV/A/m must already match the phase arrangement. The calculator adds no extra phase multiplier. Blank upstream current suppresses all dependent results.

Cable sizing checks design-current capacity only. All four correction factors are entered explicitly, including insulation and other factors on the dedicated page. Verified factors above unity are allowed, such as a manufacturer-supported ambient adjustment; the application does not select or derive them. Default factor 1 means the operator must verify that no correction applies. Prefilled circuit load, length, size, tabulated rating and device examples have been removed. Reset returns to an unassessed form.

Recent cable calculations retain the existing full-account storage key and five-record limit. Incomplete designs cannot be saved. A complete calculation that fails a comparison can still be retained for review; saving is not approval. Missing evidence in older records loads as blank and must be supplied again. Malformed records are filtered from the view. Storage write/delete failures retain the current history and show an error. No organisation-portable backup, cloud schema, sync queue or route permission is changed.

The dedicated page's basic device check covers only `Ib ≤ In ≤ Iz`. It does not establish conventional overload operation, breaking capacity, disconnection time or selectivity.

## Protective device checks

`/electrical-calculators/protective-device` adds four explicit comparisons: load against rating/setting, rating/setting against corrected cable capacity, conventional overload operating current against `1.45 × Iz`, and stand-alone breaking capacity against maximum prospective fault current. Device identification and evidence references are required alongside all six numeric inputs. The page starts blank and clearing resets everything.

The designer supplies verified operating data and checks its applicability to the installation and device standard. There is no device catalogue, automatic trip-curve multiplier, inferred fuse factor, upstream backup credit or selectivity claim. This tool takes corrected Iz, not tabulated capacity, and overload setting rather than breaker frame rating where applicable. I2 at or below the normal rating/setting is outside the supported overload-input scope and must be corrected. Maximum PFC must come from appropriate circuit evidence, not the simple earth-loop estimate.

Each comparison and its unrounded margin is visible. Missing/malformed inputs, absent references or numeric overflow suppress every assessment. A failed comparison is reported individually, while the overall result requires all four. Saving retains all four comparisons and the evidence references; it does not approve the design.

## Maximum demand and diversity

The previous page treated an empty diversity field as 0%. Clearing the example three-phase row reduced maximum demand from 28.8 A to 12.8 A. It also rounded fractional quantities down and substituted a phase for invalid data.

Each load now requires a positive finite per-item current, an explicit whole-number quantity, a supported phase and an explicit demand factor from 0% to 100%. A deliberately entered 0% is retained as an exclusion requiring designer justification. Missing or malformed data makes the row and aggregate assessment unavailable; it never removes the load from a partial total. Empty schedules are unassessed. Example loads and diversity factors have been removed, and new rows start with blank current and demand factor.

The page retains visible results for complete individual rows while withholding schedule totals until every row is valid. It rejects intermediate or aggregate overflow and nonzero values that underflow to zero. Three-phase entries represent balanced line current, applied to each phase. Schedule sums count each load once and are labelled separately from per-phase supply demand; they are not supply current.

## Saved calculation records

The save controls on each calculator create versioned snapshots with labelled inputs and units, unrounded numeric results, the assessment, assumptions, timestamp, title, evidence source/revision and an optional design note. Inputs must be complete and metadata valid. Failed comparisons can be recorded for review. Inactive adiabatic method fields are omitted. Cable capacity and voltage drop are saved separately; the evidence reference should identify the installation method, conductor specification and source tables. Existing five-item personal cable history is unchanged.

`/electrical-calculators/records` provides searchable, read-only historical records. Linked calculations also appear on the job detail page. Later form edits or calculator releases do not recalculate stored results. Unsupported record formats are retained and visibly reported instead of being overwritten. Saved records are design aids, not certification or final approval.

The registered `jr-os-electrical-calculations` collection uses existing account-scoped storage, durable record creation, offline sync/conflict handling and account backup rules. Saving requires a signed-in account with access to the calculator route (currently owner/admin). It waits for job/record collections and checks the active organisation, user, role and customer scope again in the handler. Changing accounts remounts the draft. A selected job must still be available; customer/job bindings are copied from that record. Existing database triggers enforce tenant-local references and matching payload/envelope bindings.

The UI confirms device persistence and queueing rather than claiming a completed cloud upload. Operators check Cloud status for pending uploads and conflicts. The existing database office-data policy remains in force, including office service access; the feature does not expand route permissions or add field/customer projections. No schema migration or production DDL is needed.

Quote and survey linking remain the next integration increment. Production recovery evidence and physical-phone acceptance remain separate release gates.

## Technical references

Reviewed 27 September 2026; these explain the calculation principles and do not replace the current project-specific BS 7671 and manufacturer documents:

- [Schneider Electric Electrical Installation Guide: protective earthing conductor sizing](https://www.electrical-installation.org/enwiki/Sizing_of_protective_earthing_conductor) — adiabatic relation and the need for other conductor-size constraints.
- [Schneider Electric Electrical Installation Guide: cable short-circuit withstand](https://www.electrical-installation.org/enwiki/Verification_of_the_withstand_capabilities_of_cables_under_short-circuit_conditions) — thermal energy comparison and five-second scope.
- [IET Temporary Power Distribution questions](https://electrical.theiet.org/bs-7671-18th-edition-wiring-regulations/faqs/webinar-questions-and-answers/temporary-power-distribution-webinar/) — adiabatic checks at five seconds or less and separate treatment of longer durations.

- [Schneider Electric Electrical Installation Guide: induction motors](https://www.electrical-installation.org/enwiki/Induction_motors) — consistent output-power, efficiency and apparent-input-power relationship.
- [Schneider Electric Electrical Installation Guide: general cable sizing](https://www.electrical-installation.org/enwiki/General_method_for_cable_sizing) — installation correction factors, including ambient adjustments above unity.

- [Schneider Electric Electrical Installation Guide: practical protective schemes](https://www.electrical-installation.org/enwiki/Practical_values_for_a_protective_scheme) — load, overload and breaking-capacity principles; manufacturer evidence for backup coordination.
- [IET Wiring Matters, Autumn 2012](https://electrical.theiet.org/media/1057/2012_44_autumn_wiring_matters__complete_adverts.pdf) — explanation of conventional overload operation. This historical explanation is not the current project standard.

## Verification

`tests/adiabatic-calculator-core.test.mjs`, `tests/earth-fault-loop-calculator-core.test.mjs` and `tests/electrical-calculator-numbers.test.mjs` cover known answers, exact boundaries, malformed and missing values, numeric extremes and unrounded comparisons. `tests/fault-calculator-pages.test.mjs` executes the rendered pages' real change/click handlers against the actual calculation modules, covering the missing-R2 regression, method switching and clearing stale results.

These automated tests verify software behavior. They are not installation certification or physical-phone acceptance evidence.

`tests/connected-calculator-validation.test.mjs` covers every required field, invalid factors, numeric extremes and exact comparison boundaries. `tests/connected-calculator-pages.test.mjs` executes page input and save/load handlers, including propagation of missing load data, storage failures and legacy records. Existing tenant-boundary tests remain in the full gate.

`tests/protective-device-calculator.test.mjs` checks known answers, each independent failed criterion, exact boundaries, malformed data, absent evidence and numeric extremes. Rendered-page tests exercise filling, correcting, clearing and removing evidence through the actual handlers.

Maximum-demand core and page-handler tests cover mixed-phase known answers, every required field, explicit zero diversity, fractional quantities, unknown phases, empty schedules, adding/removing rows, and row/aggregate numeric extremes. The shared decimal parser also rejects nonzero decimal strings that underflow to zero.

Saved-record tests execute snapshot creation and real UI handlers, covering all seven calculation types, unit conversion, incomplete inputs, historical independence, failed comparisons, account changes, unavailable jobs, storage failures, search and job filters. The SQL and full Supabase upgrade rehearsals both exercise real database reads/writes for owner/admin/office, field/customer, other-tenant, revoked/inactive and anonymous identities, as well as job-binding rejection and projection isolation. All rehearsal records and audit entries are rolled back.
