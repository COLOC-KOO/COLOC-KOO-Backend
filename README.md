# COLOC-KOO-Backend
npm install node-cron

## Mode « site en construction »

Le mode maintenance est actif par défaut. Il affiche une page temporaire côté frontend,
bloque l’inscription et réserve la connexion aux rôles `admin`, `super_admin` et
`moderator`. Pour restaurer l’accès public, définir `SITE_MAINTENANCE_MODE=false`
dans l’environnement du backend puis redémarrer le service. La valeur `true` (ou l’absence
de variable) réactive le mode maintenance.