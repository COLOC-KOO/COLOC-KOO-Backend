# COLOC-KOO-Backend
npm install node-cron

## Mode « site en construction »

Le mode maintenance est actif par défaut. Il affiche une page temporaire côté frontend,
bloque l’inscription et réserve la connexion aux rôles `admin`, `super_admin` et
`moderator`. Pour restaurer l’accès public, définir `SITE_MAINTENANCE_MODE=false`
dans l’environnement du backend puis redémarrer le service. La valeur `true` (ou l’absence
de variable) réactive le mode maintenance.

## Archivage PDF/A des contrats et états des lieux

Lorsqu’une demande est validée, le backend crée une archive PDF/A non chiffrée, la conserve
dans `private_uploads/document-archives` et enregistre son empreinte SHA-256 en base. Ce
dossier doit rester privé et être inclus dans les sauvegardes. Appliquer également la migration
`src/Database/2026-11-12_contract_document_pdf_archive.sql` sur la base de production.
Ghostscript et un profil ICC
sRGB sont nécessaires sur chaque instance backend :

- `GS_BIN` (facultatif, par défaut `gs`) : chemin de l’exécutable Ghostscript.
- `PDF_A_ICC_PROFILE` (facultatif, par défaut `/usr/share/color/icc/ghostscript/default_rgb.icc`) :
  chemin du profil ICC sRGB.

Le demandeur choisit un mot de passe à chaque téléchargement de sa copie PDF chiffrée. Le
mot de passe n’est pas stocké ; les permissions PDF autorisent l’impression et bloquent la
modification, la copie et l’annotation.