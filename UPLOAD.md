# GitHub upload

Upload all four files in this folder to the root of the GitHub Pages repository:

- `index.html`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

Do not upload the ZIP itself. After GitHub Pages deploys, open the site once while connected, hard-refresh, and wait for **Offline pack ready** before testing airplane mode.

The Critical tab is a patient-specific high-acuity reference hub. Its first screen now uses six larger categories—Arrest, Unstable rhythm, Airway/breathing, Shock/trauma, Neuro/metabolic, and OB/newborn—then reveals the relevant subpath.

Build 2026.08.31.6 sequences the Critical treatment cards to the ALS PCS 5.4 treatment directions. In Critical ▸ Unstable rhythm ▸ Brady, the order is atropine, indicated fluid bolus, TCP, DOPamine and procedural sedation; the fluid card explicitly states that TCP must not be delayed. Adult tachy now begins with Valsalva before adenosine, and the newborn view begins with the resuscitation sequence before medication cards. The ROSC checklist remains beside Cardiac arrest under Critical ▸ Arrest, and the pediatric tachy view remains a mandatory BHP patch reference.

If this repository already contains the manifest and icon, replacing only `index.html` and `sw.js` is sufficient for this update. The changed service-worker cache name ensures devices fetch the new interface after deployment.

Before operational use, independently validate every dose, concentration, authorization condition, contraindication, patch point, and equipment convention against the current ALS PCS, Companion Document, RBHP direction, service stock, and local policy.
