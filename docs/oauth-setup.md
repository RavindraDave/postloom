# Setting up "Sign in with Google" and "Sign in with Microsoft"

Postloom's release builds offer sign-in for Gmail and Outlook when they are
built with Google's and Microsoft's app ids. This is a one-time setup for the
publisher (R2DSolutions); people using Postloom never see any of it. A build
without the ids still works: it offers app passwords and other mail servers
only.

How it works: Postloom opens the provider's sign-in page in the person's web
browser and waits on a loopback address (`http://127.0.0.1:<port>/` for
Google, `http://localhost:<port>/` for Microsoft) with PKCE (RFC 8252). It keeps
only the refresh token, encrypted with the operating system's key.

| Provider  | Permission                                   | How email is sent                        |
| --------- | -------------------------------------------- | ---------------------------------------- |
| Google    | `openid email https://www.googleapis.com/auth/gmail.send` | Gmail API (`messages.send`)  |
| Microsoft | `openid email offline_access https://outlook.office.com/SMTP.Send` | SMTP with XOAUTH2 (`smtp-mail.outlook.com:587`) |

## 1. Google Cloud

1. In [console.cloud.google.com](https://console.cloud.google.com), create a
   project called "Postloom".
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **Google Auth Platform → Branding**: app name "Postloom", support email,
   logo, home page, and the privacy policy link (docs/privacy.md, published).
   Add the home page's domain under **Authorized domains**.
4. **Audience**: User type **External**.
5. **Data access → Add or remove scopes**: add `openid`, `.../auth/userinfo.email`
   and `https://www.googleapis.com/auth/gmail.send`.
6. **Clients → Create client**: type **Desktop app**, name "Postloom desktop".
   Copy the **Client ID** and **Client secret**. (A desktop app can't keep a
   secret, so Google doesn't treat it as one; PKCE protects the sign-in.)
7. **Audience → Publish app**. `gmail.send` is a *sensitive* scope, so Google
   verifies the app before anyone outside the test users can sign in: submit
   for verification with a short video of the sign-in and a test email being
   sent. It doesn't need the paid security assessment that restricted scopes
   do. Until it is verified, add yourself under **Test users** to try it; other
   people see an "unverified app" warning and at most 100 can sign in.

## 2. Microsoft Entra (Azure)

1. In [entra.microsoft.com](https://entra.microsoft.com), **App registrations →
   New registration**.
   - Name: "Postloom".
   - Supported account types: **Accounts in any organizational directory and
     personal Microsoft accounts**.
   - Redirect URI: platform **Public client/native (mobile & desktop)**, value
     `http://localhost`. (Any port is allowed for `localhost`.)
2. **Authentication**: under Advanced settings, **Allow public client flows:
   Yes**. No client secret is needed; don't create one.
3. **API permissions → Add a permission → Microsoft Graph → Delegated**:
   `openid`, `email`, `offline_access`, and `SMTP.Send`.
4. **Branding & properties**: logo, home page, privacy link, and a verified
   publisher domain if you can (it removes the "unverified" label on the
   consent screen).
5. Copy the **Application (client) ID** from Overview.

Work accounts: some organisations only allow apps an admin has approved, and
some turn SMTP sending off per mailbox. Postloom says so when that happens; the
person's IT team can approve Postloom or turn on "Authenticated SMTP".

## 3. The release build

In the GitHub repository, **Settings → Secrets and variables → Actions**:

| Kind     | Name                            | Value                        |
| -------- | ------------------------------- | ---------------------------- |
| Variable | `POSTLOOM_GOOGLE_CLIENT_ID`     | Google client ID             |
| Secret   | `POSTLOOM_GOOGLE_CLIENT_SECRET` | Google client secret         |
| Variable | `POSTLOOM_MICROSOFT_CLIENT_ID`  | Microsoft application ID     |

The release workflow passes them to `pnpm package`, which builds them into the
app. To try sign-in locally, set the same three environment variables before
`pnpm dev` or `pnpm package`.

## Testing without the real services

The end-to-end tests use a fake sign-in service and Gmail API
(`apps/desktop/e2e/oauth-server.ts`). Unpackaged builds read
`POSTLOOM_TEST_OAUTH_BASE`, `POSTLOOM_TEST_GMAIL_API` and
`POSTLOOM_TEST_MICROSOFT_SMTP` to point at it; packaged builds ignore them.
