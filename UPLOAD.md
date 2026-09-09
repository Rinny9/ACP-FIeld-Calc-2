# GitHub upload

Build 2026.09.09.1 audits reference destinations against CD v26.08.27, ALS PCS v5.4 and the PDC v5.4 PDF:

- Companion printed pages now match the current edition (ETT sizing p.58, suction sizing p.21, ROSC p.61). Its PDF pages equal printed pages; PCS PDF pages are printed +12; PDC PDF pages are printed −55.
- Each cited page in a list/range has its own link. Mixed PCS/CD sources are separately clickable. Directive source ranges, inline Companion notes, patient-summary references and tool references are linked.
- PDF viewer page numbers are shown when different; some phone PDF viewers ignore page fragments, so users can enter the displayed PDF page manually.
- Corrected PCS references include estimated weight p.15, ROSC ECG/dopamine p.119 and ACP childbirth pp.175–177. All 34 directive page ranges and all 13 PDC bands were checked.
- Calculated doses and equipment values are unchanged. Three older directive summaries carry explicit reference-review warnings (tension-pneumothorax needle sizing, ischemia vital-sign restart rule, and D50-to-D10 preparation); the old RED RULE attribution was removed because it was not found in the current Companion Document. This is a citation audit, not clinical certification. See REFERENCE_AUDIT.md.

Build 2026.09.08.2 fixes all shared Companion Document reference links using the supplied v26.08.27 FINAL PDF URL. This is a link repair only: clinical content and printed page citations have not been re-audited against the new document. The cache version is updated so installed apps receive the repaired links when refreshed online.

Build 2026.09.08.1:

- Atropine uses only service stock 1 mg/5 mL (0.2 mg/mL). Old saved concentration overrides are ignored, and Settings shows the fixed stock. Calculator/Critical draw volumes use this concentration; prescribed doses are unchanged.
- Peds chart and patch views show only the existing 0.2 mg/mL atropine row. The original PDF/transcription is retained as a source, not a stock selector. The 30–36 kg chart's concentration and dose-discrepancy warnings remain visible and self-contained.
- Critical opens with six categories and no default scenario for a new encounter. A user-selected pathway is retained when returning during that encounter; New patient clears it. Expanded main categories now appear above subcategories; the expanded picker scrolls on small screens.
- The Calculator scenario label is ROSC. IV Drip Rate offers only 10 and 60 gtt/mL sets.

Earlier changes are retained:

Upload all four files in this folder to the root of the GitHub Pages repository:

- `index.html`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

Do not upload the ZIP itself. After GitHub Pages deploys, open the site once while connected, hard-refresh, and wait for **Offline pack ready** before testing airplane mode.

The Critical tab is a patient-specific high-acuity reference hub. Its first screen uses six larger categories—Arrest / pre-arrest, Unstable rhythm, Airway / Respiratory, Trauma, Neuro / Metabolic, and OB / newborn—then reveals the relevant subpath.

Build 2026.09.07.4 rounds calculated ETT sizes to the nearest 0.5 mm and oral insertion depths to the nearest 0.5 cm throughout Calculator and Critical. Exact halfway values round up. For age ≥1 year, the existing 3 × ETT ID depth convention uses the rounded tube size; suction sizing also stays consistent with that tube. Infant depth retains the weight + 6 cm formula before rounding. Printed pediatric chart equipment values are unchanged. No medication doses are changed.

Build 2026.09.07.3 adds focused Critical subcategories:

- Airway / Respiratory: Airway, Bronchoconstriction, ACPE, Procedural Sedation, Anaphylaxis and Croup.
- Neuro / Metabolic: Seizure, Hypoglycemia, Opioid Overdose and Adrenal Crisis.
- Shock / trauma is renamed Trauma.

Each subcategory opens its own existing treatment cards and relevant directive links. Related Calculator links use exact directive filters, and the main Calculator scenario menu remains unchanged. Existing dose values, conditions, contraindications and cautions are preserved.

Build 2026.09.07.2 fixes phone dose readability. Route, dose and draw volume/administration notes each have a full-width line, and numbers/ranges stay together with their units. Repeat-dose panels wrap to the card width, draw-volume labels are smaller than the values, and the patient banner respects the iPhone status-bar inset. Clinical values and instructions are unchanged.

The scenario and navigation improvements from build 2026.09.07.1 are retained:

- Scenario selection opens the matching directive calculations, scrolls to results and collapses the scenario picker. All calculations remains alphabetical.
- Search shows expanded matches across all calculations, labels their directive and offers Clear to return to the previous scenario.
- Medication cards label draw volumes, keep conditions and cautions visible, and provide expandable concentration/reference details.
- Tab scroll positions, open sections, search and Critical pathway state are retained during an encounter and cleared with New patient.
- Critical has a persistent patient/pathway header, Back to Calculator and a directive chooser for multi-directive pathways. Arrest still shows Airway / equipment first.
- Daylight mode applies to Critical, the selected Field/Reference control has improved contrast, and Settings includes a persistent Large text option.

Medication doses, electrical settings and source directive data are unchanged. The ETT rounding update is described above.

If this repository already contains the manifest and icon, replacing only `index.html` and `sw.js` is sufficient for this update. The changed service-worker cache name ensures devices fetch the new interface after deployment.

Before operational use, independently validate every dose, concentration, authorization condition, contraindication, patch point, and equipment convention against the current ALS PCS, Companion Document, RBHP direction, service stock, and local policy.
