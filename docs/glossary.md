# Glossary & wording rules

Postloom is built for people with limited technical knowledge. These terms are used **consistently** in the UI, help articles and error messages. Code may use different internal names (noted in brackets).

| Term (UI) | Meaning | Avoid in UI |
|---|---|---|
| **Email Account** | A connection to an email service that actually sends mail (e.g. "Office Gmail"). Holds the login and sending limits. [`EmailAccount`] | SMTP server, transport, provider config |
| **Sender** | Who an email appears to come from: name, address, reply-to, signature, brand kit. Linked to one Email Account. [`SenderProfile`] | Identity, from-header, profile |
| **Brand Kit** | Logo, colors and fonts applied to templates. [`BrandKit`] | Theme, stylesheet |
| **Template** | A reusable email design with a subject line. [`Template`] | Layout, MJML, HTML body |
| **Field** | A column from the recipients' spreadsheet that can be inserted into a template, e.g. *First Name*. [`MergeField`] | Placeholder, variable, token, `{{…}}` |
| **Recipients** | The people an email goes to, usually from an Excel or CSV file. | Data source, rows, dataset |
| **Send** | One run of sending a template to a list of recipients. [`Send`] | Campaign, batch, job |
| **Test email** | A single copy sent to yourself to check how it looks. | Dry run, test send |
| **Do not email list** | Addresses Postloom will never send to. [`SuppressionList`] | Suppression list, blocklist |
| **Wait between emails** | Pause between two emails to avoid limits. | Delay (ms), throttle |
| **Daily limit** | Maximum emails an Email Account may send per day. | Daily cap, quota |
| **App password** | A special password some providers (e.g. Gmail) require for apps like Postloom. | - |

## Wording rules

1. **Plain language**, short sentences, second person ("your email"). Reading level: plain English, no jargon on the main path.
2. **Errors:** *what happened* → *why* → *what to do*, plus an action button.
   *"Gmail didn't accept the password. Gmail needs an app password for apps like this one. [Show me how]"*
3. **Buttons are verbs:** "Send test email", "Save template", not "OK"/"Submit".
4. **Numbers with units:** "2 seconds", "450 emails per day".
5. **Never blame the user;** never show stack traces or error codes without an explanation.
6. All strings live in i18n resource files; no hard-coded UI text.
