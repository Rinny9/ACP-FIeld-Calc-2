# GitHub upload

Upload all four files in this folder to the root of the GitHub Pages repository:

- `index.html`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

Do not upload the ZIP itself. After GitHub Pages deploys, open the site once while connected, hard-refresh, and wait for **Offline pack ready** before testing airplane mode.

The Critical tab is a patient-specific high-acuity reference hub. Its first screen now uses six larger categories—Arrest, Unstable rhythm, Airway/breathing, Shock/trauma, Neuro/metabolic, and OB/newborn—then reveals the relevant subpath.

Build 2026.08.31.4 adds a tappable ROSC checklist to Critical ▸ Shock / trauma ▸ ROSC / shock. It also adds patient-band PDC v5.4 adenosine, amiodarone, synchronized-cardioversion and pulseless defibrillation reference values to Critical ▸ Unstable rhythm ▸ Tachy whenever the entered patient is under 18. The pediatric tachy view is prominently marked as a mandatory BHP patch point and does not present the chart as independent authorization.

If this repository already contains the manifest and icon, replacing only `index.html` and `sw.js` is sufficient for this update. The changed service-worker cache name ensures devices fetch the new interface after deployment.

Before operational use, independently validate every dose, concentration, authorization condition, contraindication, patch point, and equipment convention against the current ALS PCS, Companion Document, RBHP direction, service stock, and local policy.
