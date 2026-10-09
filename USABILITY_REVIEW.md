# App usability review - 2026-10-03

Scope: source-code review of Calculator, Critical, Directives, Tools, Peds and Settings/offline behavior, with automated phone-size browser checks. This is not a clinical certification or a test on the user's physical phone. Existing source-review warnings remain in place.

## Critical simplification — 2026-10-08, build 2026.10.08.2

Removed the encounter-only BHP read-back panel at the user's request to reduce high-acuity workload and visual clutter. This also removes its temporary notes and treatment-reference selector; patch requirements remain on the existing treatment cards and pediatric consultation notices. Removed the duplicate Procedural Sedation button from Airway / Respiratory, keeping it in Pain / Sedation. Dose formulas, source data, airway equipment and other encounter improvements are unchanged.

## Encounter follow-up — 2026-10-08, build 2026.10.08.1

Implemented the six recommendations from the follow-up review: consistent Critical age displays, retained tool inputs with Reset/New patient and weight-dependent invalidation, focused Peds-to-Calculator medication/route handoff, a related-first compact directive chooser retaining scroll, a collapsed encounter-only BHP read-back panel, and explicit version/update controls without automatic encounter reloads. Existing direct subcategory buttons remain; no Airway/Treatment/Sources shortcut row was restored.

The read-back selector uses only current pathway rows and never substitutes chart weight for patient weight. It does not populate findings, authorize administration, or record BHP orders. Patient edits clear selected treatment references; New patient/reload clears notes. Pediatric chart-reference basis and mandatory patch requirements remain visible. APGAR pauses outside Tools or when hidden; no background alarm guarantee is implied.

New regressions cover 494 age/path/weight combinations per browser, exact 24-hour boundaries, complete tool memory/resets, Peds handoff, related/all-category selection, scroll retention, read-back route/sequence selection, source/age distinctions, and phone/landscape layouts in Chromium and WebKit. Existing Critical, source navigation, dose layout, ETT and dexamethasone tests were rerun. Actual service-worker lifecycle tests in Chromium cover waiting updates, cancel/apply, one explicit reload, offline calculations, legacy migration, unrelated-cache preservation and newer-HTML/older-controller alignment. These checks are not a physical-iPhone or clinical validation.

The official-source cross-check found a separate pre-existing ROSC NaCl age-restriction mismatch; see REFERENCE_AUDIT.md. This release adds a conspicuous source-review warning without silently changing the clinical engine. Do not treat the display-consistency work as full clinical certification.

## Changes delivered

- Build 2026.10.03.2 pins only Critical's compact patient/condition controls. Back, Change and Aa display settings remain available while scrolling; main/subcategory menus scroll away. Normal and Large text headers measured 112–163 px at 320 px, and 112–120 px at 390 px/landscape in Chrome and WebKit.
- Medication cards have simpler borders and full-width dose/draw lines. Conditions, contraindications, repeat/max and administration/BHP cautions remain visible. The compact airway panel retains every applicable shared row and all metadata, with common expandable sizing references. In WebKit at 390 px, adult Arrest's airway section fell from 1,579 to 832 px; its first treatment moved up by 762 px. Arrest remains airway-first.
- Calculator Pain / Sedation uses the same terminology as Critical and includes the existing Analgesia, Combative Patient and Procedural Sedation cards. All calculations remains alphabetical and retains trauma/fluid content. Procedural Sedation is available under both Critical Pain / Sedation and Airway / Respiratory.
- Peds Find drug reveals matching cards. Patch shows selected medication/route cards and an expandable chooser, rather than appending the full chart; band weight, chart basis, discrepancy warnings and authorization notes remain. Chart dose and Draw volume are labelled explicitly. Equipment is expandable below the medication cards.
- Directives search expands matching bodies without overwriting ordinary browsing state; the search box stays below the patient bar. Critical pathway and ROSC checklist focus survives updates, and checklist controls retain native button semantics. Daylight Edit/Change band contrast is corrected.
- Calculator's airway adapter now includes the original repeat/max metadata (suction frequency and topical lidocaine ceiling) that was omitted from the displayed cards. Clinical formulas, directive data and raw PEDS54 chart data compare unchanged with deployed fc58afb.
- Build 2026.09.23.1 replaces Critical's Trauma category with Pain / Sedation, with Pain and Combative Patient subcategories. It reuses the full age-appropriate Analgesia card set and only the two combative-sedation cards, respectively; procedural sedation remains under Airway / Respiratory. Trauma Calculator/Directives content is retained.
- Both new pathways retain shared airway equipment and exact-directive Calculator destinations. Combative treatment is suppressed for unknown age and age <18; Pain applies existing drug-specific eligibility. Pediatric opioid/ketamine patch requirements, sequential-analgesia cautions and sedation/BHP cautions are visible before treatment cards, not hidden in reminders or below the last dose.
- Checked the affected mapping and cautions against ALS PCS 5.4 printed pp.161–169 (PDF pp.173–181). Corrected ketorolac's overly broad ibuprofen contraindication shorthand and added the missing ketamine allergy/sensitivity contraindication to combative cards, including missing-weight cards. No dose, formula, route, draw-volume or age-gate changes.
- Critical's Cardiac category contains Brady, Tachy, Cardiogenic shock and ACPE. ACPE has one category owner, so switching it cannot unexpectedly change categories.
- Cardiogenic shock uses the existing fluid and DOPamine calculations. Its Critical and focused Calculator views require a known adult age and prominently show the STEMI-positive/hypotensive cardiogenic-shock conditions. Contact BHP if bradycardic is visible, not hidden in reminders. Mapping checked against ALS PCS 5.4 printed pp.126-128 (PDF pp.138-140).
- Every Critical pathway includes the full applicable shared airway card set: ETT size/depth, suction catheter, blade, i-gel, suction pressure, arrest/ROSC ventilation and topical lidocaine ceiling. Existing half-unit rounding, age/weight eligibility and source distinctions remain. Missing age gets explicit placeholders; missing infant weight does not yield an insertion-depth estimate.
- Build 2026.09.19.3 removes the standalone Airway subcategory. Airway / Respiratory has four tabs: Bronchoconstriction, Procedural Sedation, Anaphylaxis and Croup. Original airway reminders, target references and OTI/SGA/suction links remain available in a shared expandable Airway guidance & directives section under each pathway, along with a focused Calculator link.
- Pediatric tachydysrhythmia electrical therapy has a separate heading; airway equipment is not labelled as electrical therapy. The mandatory patch warning remains explicit.
- The extra section-shortcut row was removed in build 2026.09.19.2 at the user's request to reduce clutter. Category/condition tabs, all content sections and bottom reference controls remain. Arrest remains airway-first.
- General pathway reminders are expandable, while targets, conditions, contraindications, patient-validation alerts and patch warnings remain outside the disclosure. Category selections are remembered for the current encounter and cleared by New patient.
- Patient-dependent DOPamine and TBSA tools are invalidated after patient inputs change. A visible notice asks the user to reopen the tool for current results, preventing stale values beneath an updated patient summary. Unrelated drip inputs are preserved.
- Fixed the selected TBSA age indicator on reopening and the below-one-whole-drop drip display. Corrected the GCS caption to match its combined adult/pediatric descriptors.
- Offline scope now explicitly excludes externally linked PDFs unless saved separately.

## Review findings retained / possible next improvements

- Calculator already expands scenario/search results, labels global search, preserves encounter navigation and flags estimated weights. These behaviors are retained.
- Tools can still lose GCS/APGAR selections when a different tool is opened; preserving each tool's draft would be a separate improvement. Existing patient-change invalidation safeguards are retained.
- PDF page fragments are not honored by every phone PDF viewer. The displayed PDF page number remains the fallback; source URLs cannot guarantee viewer behavior.
- Three older clinical summaries already carry reference-review warnings. Resolving those requires a separate clinical-source review, not a silent change during a layout update. See REFERENCE_AUDIT.md.

## Verification

- Visual navigation checks cover compact headers on 320/390 px phones and 844×390 landscape, display changes in place, keyboard focus, tappable Directive search, Peds filtering/focused Patch and New patient reset. Clinical engine/directive block and raw pediatric chart data are compared with fc58afb. Dosage layout checks cover 320–1280 px, both text sizes/themes and every adult/pediatric Critical pathway in Chrome/WebKit; no split or clipped measurements.
- Critical/Cardiac tests cover every pathway's complete airway content, shared airway directive/Calculator links, adult/pediatric/unknown age, adult unknown weight, newborn uncuffed fallback, pediatric chart limits, category memory/reset and separate electrical/airway content.
- Phone-size and dosage layout checks cover Chrome and WebKit, normal/Large text, dark/daylight modes and existing scenario/reference behavior. The Critical regression also checks that no section-shortcut row is rendered for any pathway.
- Pain/Sedation regression covers known/missing weight at ages 0, 1, 11, 12, 17, 18, 64, 65 and unknown; focused links, retained trauma references, category memory/reset, both themes and normal/Large text on narrow phones. Shared clinical data is compared with the previous deployed build with only the explicitly verified contraindication/source metadata corrections allowed; no medication or equipment formula changes are intended.
- Tools checks cover actual patient edits, reopening/recalculation, preservation of independent inputs, TBSA mode, New patient and low-rate drip handling.
