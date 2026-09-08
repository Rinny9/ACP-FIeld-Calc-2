# GitHub upload

Upload all four files in this folder to the root of the GitHub Pages repository:

- `index.html`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

Do not upload the ZIP itself. After GitHub Pages deploys, open the site once while connected, hard-refresh, and wait for **Offline pack ready** before testing airplane mode.

The Critical tab is a patient-specific high-acuity reference hub. Its first screen uses six larger categories—Arrest / pre-arrest, Unstable rhythm, Airway/breathing, Shock/trauma, Neuro/metabolic, and OB/newborn—then reveals the relevant subpath.

Build 2026.09.07.1 improves access to treatment cards:

- Scenario selection opens the matching directive calculations, scrolls to results and collapses the scenario picker. All calculations remains alphabetical.
- Search shows expanded matches across all calculations, labels their directive and offers Clear to return to the previous scenario.
- Medication cards label draw volumes, keep conditions and cautions visible, and provide expandable concentration/reference details.
- Tab scroll positions, open sections, search and Critical pathway state are retained during an encounter and cleared with New patient.
- Critical has a persistent patient/pathway header, Back to Calculator and a directive chooser for multi-directive pathways. Arrest still shows Airway / equipment first.
- Daylight mode applies to Critical, the selected Field/Reference control has improved contrast, and Settings includes a persistent Large text option.

Clinical calculation formulas, doses, electrical settings and source directive data are unchanged in this interface update.

If this repository already contains the manifest and icon, replacing only `index.html` and `sw.js` is sufficient for this update. The changed service-worker cache name ensures devices fetch the new interface after deployment.

Before operational use, independently validate every dose, concentration, authorization condition, contraindication, patch point, and equipment convention against the current ALS PCS, Companion Document, RBHP direction, service stock, and local policy.
