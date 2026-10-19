# Maison 🏡

App du foyer : cartes de fidélité, repas de la semaine, liste de courses, dépenses, journal et budget personnel.

## Déploiement (VPS)

```sh
cp .env.example .env   # remplir JWT_SECRET (openssl rand -hex 32) et les mots de passe initiaux
docker compose up -d --build
```

L'app écoute sur le port **1000** — faire pointer cloudflared vers `http://localhost:1000`.
Les comptes sont créés au premier démarrage ; ensuite, chaque personne change son mot de passe depuis le profil.
Données (SQLite + photos) dans le volume Docker `data` → c'est lui qu'il faut sauvegarder.

Mise à jour : `git pull && docker compose up -d --build`.

### Budget : connexion bancaire (Enable Banking)

1. Créer une application sur [enablebanking.com](https://enablebanking.com) (sandbox pour tester, puis « restricted production » pour ses propres comptes) avec l'URL de retour `https://<domaine>/budget/banque`.
2. Copier la clé privée dans le volume : `docker compose cp enablebanking.pem app:/data/`.
3. Renseigner `EB_APP_ID`, `EB_PRIVATE_KEY_PATH` et `PUBLIC_URL` dans `.env`, puis relancer.

Les comptes se synchronisent toutes les 6 h ; l'accès bancaire est à renouveler tous les ~180 jours (l'app prévient).

## Développement

```sh
cd backend && npm i && npx prisma migrate dev && npm run seed && npm run dev   # API sur :3000
cd frontend && npm i && npm run dev                                           # http://localhost:5173
```

Le backend lit `backend/.env` (DATABASE_URL, JWT_SECRET, USER1_*, USER2_*).
