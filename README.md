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

## Envoi des contrats de colocation

Lors du lancement officiel de la colocation, le backend envoie automatiquement les PDF
aux parties après vérification de tous les paiements (`conforme` ou `valide`). Le détail
d’un contrat dans le back-office permet également de relancer l’envoi avec « Envoyer les
PDF à tous ». Le backend conserve
une archive PDF/A non chiffrée par transaction dans
`private_uploads/contract-document-archives`, et inscrit l’empreinte SHA-256 de l’archive
et de chaque copie envoyée dans `contrats_documents_empreintes`. Ces fichiers privés
doivent être inclus dans les sauvegardes.

Les parties reçoivent par e-mail une copie PDF chiffrée, autorisée à l’impression et
protégée contre la modification. Chaque copie porte le nom de l’acheteur et la référence
de sa transaction en pied de page. Pour répondre au flux retenu, le mot de passe est inclus
dans le même e-mail que les pièces jointes. PDF/A ne permettant pas le chiffrement, seule
l’archive conservée par Coloc’KOO est au format PDF/A ; les copies envoyées sont chiffrées.

Ghostscript et le profil ICC décrits ci-dessus sont requis pour l’archivage des contrats
également. La table d’empreintes des contrats est créée automatiquement par le backend.

## Délivrabilité des e-mails

Utiliser un fournisseur d’envoi transactionnel (par exemple Brevo) plutôt qu’une adresse
Gmail personnelle. Dans `.env`, configurer `SMTP_HOST=smtp-relay.brevo.com`,
`SMTP_PORT=587`, `SMTP_EMAIL` avec le login SMTP Brevo, `SMTP_PASSWORD` avec la clé SMTP
(pas la clé API), puis `MAIL_FROM_ADDRESS` avec une adresse d’expéditeur vérifiée dans
Brevo et `MAIL_FROM_NAME=Coloc'KOO`. Le port 587 exige STARTTLS. Redémarrer le backend
après modification. Ne jamais enregistrer les identifiants réels dans `.env.example` ni
les communiquer dans un ticket.

Avant l’envoi, authentifier `sarintany-coloc.com` dans Brevo et publier exactement les
enregistrements DKIM et autres enregistrements d’authentification affichés dans le compte
Brevo. Les enregistrements DNS actuels de ce domaine sont gérés avec OVH ; son SPF
autorise OVH (`include:mx.ovh.com`) mais pas encore Brevo, et aucun DMARC n’est publié.
Ne pas remplacer l’enregistrement SPF existant par un second SPF : conserver les expéditeurs
OVH et fusionner les mécanismes requis dans un seul enregistrement selon les instructions
Brevo. Ajouter un enregistrement DMARC en mode surveillance (`p=none`) avec une adresse
de rapport surveillée, puis renforcer progressivement la politique après vérification de
tous les expéditeurs du domaine. Les changements DNS doivent être faits dans le gestionnaire
du domaine et peuvent nécessiter un délai de propagation ; le backend ne peut pas les
publier lui-même.

Le code utilise `MAIL_FROM_ADDRESS` et `MAIL_FROM_NAME` pour le nouvel expéditeur, tout
en conservant `MAIL_FROM` comme configuration de compatibilité. SPF/DKIM/DMARC et une
bonne réputation d’envoi améliorent la délivrabilité, sans pouvoir garantir que chaque
message arrive en boîte de réception.