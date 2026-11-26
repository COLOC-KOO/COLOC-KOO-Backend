# COLOC-KOO-Backend
npm install node-cron

## Déployer l'API Contrats Immo sur le VPS OVH

Le navigateur ne peut pas utiliser les logiciels installés sur le VPS tant que le frontend appelle `http://localhost:4000/api`. `VITE_API_URL` est intégré au bundle frontend au moment du build : il doit donc contenir l'URL publique de l'API, puis le frontend doit être reconstruit et redéployé.

### 1. Installer les outils PDF sur le VPS Ubuntu

Exécuter ces commandes sur le VPS avec un compte administrateur (root directement, ou `sudo` si disponible) :

```sh
apt-get update
apt-get install -y libreoffice-writer ghostscript icc-profiles-free
command -v soffice
command -v gs
find /usr/share/color/icc -type f -iname '*rgb*.icc' -print
```

LibreOffice convertit les modèles Word en PDF sur le serveur. Pour l’aperçu,
Ghostscript transforme ensuite chaque page en image affichée dans l’application :
les utilisateurs n’ont pas besoin d’un lecteur PDF natif sur leur appareil et le
PDF source n’est pas transmis au navigateur.

Si `sudo` n'existe pas et que le compte n'est pas root, l'installation doit être faite par l'administrateur OVH ou la personne qui administre le VPS. Ne pas lancer les commandes d'installation depuis Git Bash sur Windows.

### 2. Configurer et lancer le backend

Dans le `.env` du backend sur le VPS, conserver les vrais paramètres de base de données et ajouter/ajuster les valeurs suivantes. Remplacer les deux domaines d'exemple par les domaines réellement utilisés :

```dotenv
NODE_ENV=production
PORT=4000
LIBREOFFICE_BIN=/usr/bin/soffice
GS_BIN=/usr/bin/gs
PDF_A_ICC_PROFILE=/usr/share/color/icc/ghostscript/default_rgb.icc
CORS_ORIGINS=https://votre-domaine-frontend.mg
APP_BASE_URL=https://votre-domaine-frontend.mg
```

La valeur `PDF_A_ICC_PROFILE` doit correspondre à un chemin réellement affiché par `find` à l'étape précédente. Puis, depuis le dossier backend :

```sh
npm ci --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs colockoo-api
```

L'API doit être publiée derrière HTTPS sur un domaine ou sous-domaine, par exemple `https://api.votre-domaine.mg`. Le proxy HTTPS doit transférer les requêtes `/api` vers le port `4000` du VPS. `localhost` ne doit pas être utilisé comme adresse de l'API dans le frontend déployé.

### 3. Rebuild le frontend avec l'URL publique de l'API

Dans le frontend, définir `VITE_API_URL` avant le build :

```dotenv
VITE_API_URL=https://api.votre-domaine.mg/api
```

Puis reconstruire et redéployer le frontend. Remplacer l'URL d'exemple par le domaine réel. Une modification faite après `npm run build` ne change pas le bundle déjà déployé.

### 4. Vérifier le routage et les dépendances

Depuis un navigateur ouvert sur le site en production, dans l'onglet Réseau, vérifier que les appels de l'aperçu partent vers `https://api.../api/documents-contractuels/preview`, et non vers `localhost:4000`. Sur le VPS, `pm2 logs colockoo-api` doit montrer le traitement de la requête. Si le processus signale un chemin ICC absent, corriger `PDF_A_ICC_PROFILE` avec le chemin trouvé à l'étape 1, puis redémarrer avec `pm2 restart colockoo-api`.

## Modèles Word Contrats Immo

Les modèles balisés sont versionnés dans `src/Templates/contrats-immo`. Le backend les
remplit avec Docxtemplater (`{{...}}`, blocs conditionnels, sections inversées, boucles
de paragraphes et lignes de tableaux), puis LibreOffice doit être présent sur chaque
instance backend pour convertir les DOCX en PDF.

- Linux : installer le paquet système `libreoffice-writer` (ou l'équivalent fourni par
  la distribution) et les polices utilisées par les modèles.
- Windows : installer LibreOffice et définir `LIBREOFFICE_BIN` si `soffice.exe` n'est
  pas dans le `PATH`.
- `LIBREOFFICE_BIN` (facultatif) : chemin complet du binaire `soffice`.

La conversion utilise un répertoire temporaire isolé par document et le supprime après
conversion. Les règles métier du classeur doivent être validées côté serveur avant toute
génération ou paiement.

## Mode « site en construction »

Le mode maintenance est actif par défaut. Il affiche une page temporaire côté frontend,
bloque l’inscription et réserve la connexion aux rôles `admin`, `super_admin` et
`moderator`. Pour restaurer l’accès public, définir `SITE_MAINTENANCE_MODE=false`
dans l’environnement du backend puis redémarrer le service. La valeur `true` (ou l’absence
de variable) réactive le mode maintenance.

## Archivage PDF/A des contrats et états des lieux

La création d’une demande enregistre un brouillon sans générer ni archiver de PDF. Les réponses
sont chiffrées en base pendant le traitement afin que l’équipe puisse préparer le document ; elles
sont effacées quand la demande est validée ou refusée. Le client soumet sa référence Mobile Money
(et la capture MVola lorsqu’elle est requise). Un opérateur vérifie le paiement puis valide la
demande dans le back-office. Cette validation déclenche la génération du PDF final, son marquage
avec le nom de l’acheteur et la référence de transaction, la conversion PDF/A et le calcul de
l’empreinte SHA-256. Seul ce PDF/A non chiffré est conservé dans
`private_uploads/document-archives`. Il devient téléchargeable après validation du paiement.

Le dossier doit rester privé et être inclus dans les sauvegardes. Appliquer également la migration
`src/Database/2026-11-12_contract_document_pdf_archive.sql` sur la base de production.
Ghostscript et un profil ICC sRGB sont nécessaires sur chaque instance backend :

- `GS_BIN` (facultatif, par défaut `gs`) : chemin de l’exécutable Ghostscript.
- `PDF_A_ICC_PROFILE` (facultatif, par défaut `/usr/share/color/icc/ghostscript/default_rgb.icc`) :
  chemin du profil ICC sRGB.

Le client crée un lien de téléchargement à usage temporaire, valable 15 minutes. Le lien sert le
même PDF/A archivé, sans chiffrement ni mot de passe ; l’empreinte est vérifiée avant chaque
téléchargement. L’historique client permet de demander un nouveau lien et de supprimer une
demande de sa liste. La suppression masque la demande et efface ses réponses, tout en conservant
l’archive contractuelle et son empreinte côté Coloc’KOO.

Pour un contrat Intercolocs, la copie PDF de l’Autorisation signée est obligatoire et jointe au
contrat. Pour un Mandacolocs, le Mandat de gestion signé est obligatoire et placé en annexe 0.
Ces annexes sont stockées dans `private_uploads/document-annexes` durant le traitement puis
supprimées après validation, refus ou suppression client. L’état des lieux est joint
automatiquement ; la charte, l’attestation de logement et l’attestation espèces sont générées
depuis les réponses de la même session quand elles sont sélectionnées. L’attestation espèces
comporte deux exemplaires avec les parties préremplies ; montant, motif, lieu et date restent
vierges. La quittance reste un modèle vierge téléchargeable.

Le Super Admin peut modifier le texte des neuf modèles Word depuis « Modèles Contrats Immo »
dans le back-office. Les révisions sont conservées en base ; les balises de données et de
conditions ne peuvent pas être changées par l’éditeur. Les PDF/A déjà vendus restent les mêmes
fichiers archivés et ne sont jamais régénérés à partir d’une version de modèle plus récente.

Pour plusieurs Sous-occupants, chaque contrat dispose de sa propre demande et de son paiement.
Le bouton de demande suivante conserve les réponses communes en mémoire et vide les huit champs
d’identité du Sous-occupant précédent.

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
