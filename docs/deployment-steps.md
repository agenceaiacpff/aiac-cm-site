# Deploiement AIAC sur GitHub et Vercel

## Comptes

- GitHub : `agenceaiacpff`
- E-mail GitHub : `agence.aiac@gmail.com`
- Equipe Vercel : `aiac-cm`

## Etapes GitHub

1. Creer un nouveau depot GitHub nomme `aiac-cm-site`.
2. Envoyer le contenu du dossier `aiac-next` dans ce depot.
3. Ne jamais envoyer `.env` ou `.env.local`.

Commandes possibles depuis le dossier `aiac-next` :

```bash
git init
git add .
git commit -m "Initial AIAC Next.js site"
git branch -M main
git remote add origin https://github.com/agenceaiacpff/aiac-cm-site.git
git push -u origin main
```

## Etapes Vercel

1. Aller dans Vercel.
2. Choisir l'equipe `aiac-cm`.
3. Cliquer sur Add New Project.
4. Importer le depot GitHub `aiac-cm-site`.
5. Garder les reglages par defaut Next.js.
6. Cliquer sur Deploy.

## Domaine

Apres le premier deploiement :

1. Ouvrir le projet dans Vercel.
2. Aller dans Settings > Domains.
3. Ajouter le nom de domaine achete.
4. Copier les DNS donnes par Vercel chez le fournisseur du domaine.

## Supabase et Cloudinary

Les variables seront ajoutees plus tard dans Vercel :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`

Les cles secretes serveur ne doivent pas commencer par `NEXT_PUBLIC_`.
