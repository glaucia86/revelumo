# Security

## Development status

Revelumo is a development preview without a public release or a maintained release-support matrix. Record the exact commit where you observed a problem; when safe, check whether it also affects the current `main` branch. Review the [README](README.md) for current implementation and verification limits.

## Reporting a suspected vulnerability

**Do not post sensitive details in a public issue, pull request, commit message, screenshot, or log.** Public issue forms are not a confidential reporting channel.

A private reporting channel is not established by this document. Before disclosing technical details, request a private contact from the maintainer using the contact options listed on [Glaucia Lemos's GitHub profile](https://github.com/glaucia86). If you need to make a public contact request, say only that you would like a private security contact. Do not include exploit steps, affected private data, or a proof of concept. Wait for an agreed private route before sharing the report.

Once a private route has been agreed, a useful report identifies the tested commit and environment, the affected behavior, the potential impact, and a minimal reproduction using synthetic data. Share only information needed to investigate; do not send credentials, personal photographs, catalogs, or private EXIF/GPS data.

## Safe investigation

- Work on systems and data you own or have permission to test. Use an isolated development catalog and synthetic fixtures.
- Preserve original photographs and avoid destructive testing against a real library.
- Do not disable Electron sandboxing, context isolation, web security, or operating-system protections as a workaround.
- For an ordinary bug or setup problem without sensitive security details, use [SUPPORT.md](SUPPORT.md).
