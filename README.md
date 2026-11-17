# Hosting: ready-to-run build

This branch (`deploy`) is generated automatically by GitHub Actions from `main`.
Don't edit it by hand; changes are overwritten on the next build.

On the server (cPanel → Setup Node.js App):

- **Application root:** the folder this branch is cloned into
- **Application startup file:** `app.js`
- **Environment variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAP_ID`

No `npm install` and no build step are needed. Everything is already in `standalone/`.

To update: cPanel → Git Version Control → Manage → Pull or Deploy → **Update from Remote**,
then cPanel → Setup Node.js App → **Restart**.
