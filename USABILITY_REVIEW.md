# App usability review - 2026-09-19

Scope: source-code review of Calculator, Critical, Directives, Tools, Peds and Settings/offline behavior, with automated phone-size browser checks. This is not a clinical certification or a test on the user's physical phone. Existing source-review warnings remain in place.

## Changes delivered

- Critical's Cardiac category contains Brady, Tachy, Cardiogenic shock and ACPE. ACPE has one category owner, so switching it cannot unexpectedly change categories.
- Cardiogenic shock uses the existing fluid and DOPamine calculations. Its Critical and focused Calculator views require a known adult age and prominently show the STEMI-positive/hypotensive cardiogenic-shock conditions. Contact BHP if bradycardic is visible, not hidden in reminders. Mapping checked against ALS PCS 5.4 printed pp.126-128 (PDF pp.138-140).
- Every Critical pathway includes shared ETT size, insertion depth, suction catheter and blade references. Existing half-unit rounding and source distinctions remain. Missing age gets explicit placeholders; missing infant weight does not yield an insertion-depth estimate.
- Pediatric tachydysrhythmia electrical therapy has a separate heading and shortcut; airway equipment is not labelled as electrical therapy. The mandatory patch warning remains explicit.
- Sticky, touch-sized shortcuts reach treatment, airway, electrical therapy, ROSC checklist and sources where relevant. Measured header offsets prevent destination headings hiding under the patient summary. Arrest remains airway-first.
- General pathway reminders are expandable, while targets, conditions, contraindications, patient-validation alerts and patch warnings remain outside the disclosure. Category selections are remembered for the current encounter and cleared by New patient.
- Patient-dependent DOPamine and TBSA tools are invalidated after patient inputs change. A visible notice asks the user to reopen the tool for current results, preventing stale values beneath an updated patient summary. Unrelated drip inputs are preserved.
- Fixed the selected TBSA age indicator on reopening and the below-one-whole-drop drip display. Corrected the GCS caption to match its combined adult/pediatric descriptors.
- Offline scope now explicitly excludes externally linked PDFs unless saved separately.

## Review findings retained / possible next improvements

- Calculator already expands scenario/search results, labels global search, preserves encounter navigation and flags estimated weights. These behaviors are retained.
- Directives search finds matching documents, but a matching directive can remain collapsed. A future search-specific open state plus clear button could save another tap without changing normal browsing state.
- Peds remains a long, fully expanded reference. Drug search or section shortcuts could reduce scrolling, provided chart-band identity, actual-vs-estimated weight and source discrepancy warnings remain visible.
- PDF page fragments are not honored by every phone PDF viewer. The displayed PDF page number remains the fallback; source URLs cannot guarantee viewer behavior.
- Three older clinical summaries already carry reference-review warnings. Resolving those requires a separate clinical-source review, not a silent change during a layout update. See REFERENCE_AUDIT.md.

## Verification

- Critical/Cardiac tests cover every pathway, adult/pediatric/unknown age, adult unknown weight, newborn uncuffed fallback, pediatric chart limits, category memory/reset and separate electrical/airway content.
- Phone-size and dosage layout checks cover Chrome and WebKit, normal/Large text, dark/daylight modes, section-jump targets and existing scenario/reference behavior.
- Shared clinical calculation/directive data is compared with the previous deployed build; no medication or equipment formula changes are intended.
- Tools checks cover actual patient edits, reopening/recalculation, preservation of independent inputs, TBSA mode, New patient and low-rate drip handling.
