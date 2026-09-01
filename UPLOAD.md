# GitHub upload

Upload all four files in this folder to the root of the GitHub Pages repository:

- `index.html`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

Do not upload the ZIP itself. After GitHub Pages deploys, open the site once while connected, hard-refresh, and wait for **Offline pack ready** before testing airplane mode.

The Critical tab is a patient-specific high-acuity reference hub. Its first screen uses six larger categories—Arrest / pre-arrest, Unstable rhythm, Airway/breathing, Shock/trauma, Neuro/metabolic, and OB/newborn—then reveals the relevant subpath.

Build 2026.08.31.8 displays Airway / equipment before Patient-specific treatment in Critical ▸ Arrest. Other Critical pathways retain their existing content order. The Arrest / pre-arrest category continues to contain Arrest, ROSC / check and Hyperkalemia as sibling tabs.

If this repository already contains the manifest and icon, replacing only `index.html` and `sw.js` is sufficient for this update. The changed service-worker cache name ensures devices fetch the new interface after deployment.

Before operational use, independently validate every dose, concentration, authorization condition, contraindication, patch point, and equipment convention against the current ALS PCS, Companion Document, RBHP direction, service stock, and local policy.
