# AIAC Cameroun - Projet Next.js

Ce projet est la base robuste pour faire evoluer le site AIAC vers une plateforme dynamique.

## Contenu actuel

- Application Next.js prete pour Vercel
- Ancien site HTML conserve dans `public/ancien-site`
- Base pour ajouter Supabase, Cloudinary, formulaires, rapports, reunions et admin

## Commandes

```bash
npm install
npm run dev
npm run build
```

## Variables futures

Copier `.env.example` vers `.env.local`, puis ajouter :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`

Ne jamais publier les cles secretes dans GitHub.
