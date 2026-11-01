# Password reset setup

1. Apply `firebase-user-migration.sql` and `password-reset-migration.sql` to the
   application database. The Firebase migration adds the `firebase_uid` column
   used by authentication and password recovery.
2. For Gmail, create a Google App Password (requires 2-Step Verification) and
   configure these backend environment variables in local `.env` and the
   production hosting environment. Do not use your regular Gmail password:
   - `SMTP_PROVIDER=gmail`
   - `SMTP_USER` (your Gmail address)
   - `SMTP_PASSWORD` (the Google App Password)
   - `SMTP_FROM` (optional; defaults to `SMTP_USER`)

   Gmail defaults to `smtp.gmail.com`, port `465`, and implicit TLS. You can
   override these using the generic SMTP variables below. For other SMTP
   providers, configure:
   - `SMTP_HOST`
   - `SMTP_PORT` (usually `587` or `465`; Gmail defaults to `465`)
   - `SMTP_SECURE` (`false` for STARTTLS/587, `true` for implicit TLS/465)
   - `SMTP_USER`
   - `SMTP_PASSWORD`
   - `SMTP_FROM` (the sender address authorized by the SMTP provider)
3. Set `APP_BASE_URL` to the deployed web app origin if web users should open
   reset links in the browser. The default `likhalocal://` deep link is for
   installed native builds. The `likhalocal` URL scheme is configured in
   `app.json`; native builds must be rebuilt to include it.

Reset links expire after 30 minutes and can only be used once. Requests are
limited to one email per account per minute. Configure SMTP before enabling the
forgot-password form in production.
