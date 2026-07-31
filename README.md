# AIAC Cameroun - Projet Next.js

Ce projet est la base robuste pour faire evoluer le site AIAC vers une plateforme dynamique.

## Contenu actuel

- Application Next.js prete pour Vercel
- Site public HTML conservé dans `public/nouveau-site`
- Authentification Supabase avec confirmation e-mail et récupération du mot de passe
- Profils et rôles AIAC, espace personnel, demandes, messagerie et notifications
- Espace de travail du personnel et administration des comptes
- Validation des nouveaux comptes et suspension avec révocation des sessions
- MFA obligatoire pour les administrateurs et super-administrateurs
- Séparation des pouvoirs du super-administrateur, messagerie privée et journal d’audit

## Sécurité — phase 1

La migration `supabase/migrations/20260731140000_phase1_security.sql` ajoute les contrôles de sécurité de la première phase. Les changements de fonction ou de statut exigent une session MFA de niveau AAL2. Seul un super-administrateur peut gérer les comptes super-administrateurs, et le dernier super-administrateur actif ne peut pas être retiré.

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Variables requises

Copier `.env.example` vers `.env.local`, puis ajouter :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`

Ne jamais publier les cles secretes dans GitHub.
