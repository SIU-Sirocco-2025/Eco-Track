# Eco‑Track Security Policy

This document describes how to report vulnerabilities and the security expectations for the Eco‑Track repository.

## Reporting a Vulnerability

- Do not open a public Issue for security problems.
- Use GitHub Security Advisories (Security tab → “Report a vulnerability”) for private disclosure.
- If Security Advisories are unavailable, contact the maintainers privately (do not post PoC publicly). Include:
  - Affected version/commit, environment, and steps to reproduce
  - Minimal PoC (requests, payloads, logs) with secrets redacted
  - Impact assessment and suggested remediation if possible
- We will acknowledge within 48 hours, triage within 5 business days, and target a fix or mitigation within 30 days (complex cases may take longer; we will keep you updated).

## Scope

- Server/API (Node.js/Express), routes and middleware
  - API prefix: see [config/system.js](config/system.js)
  - API key middleware: [`validateApiKey`](middlewares/auth.middleware.js)
- Authentication and account flows (login/register/password reset/OTP, API key management)
  - Client controller: [controllers/client/user.controller.js](controllers/client/user.controller.js)
  - OTP model (5‑minute TTL): [`OTP`](models/otp.model.js)
  - API Docs UI: [views/client/pages/docs/index.pug](views/client/pages/docs/index.pug)
- Data models (MongoDB/Mongoose)
  - Aggregated models: [models/index.js](models/index.js)
  - City/district reading schemas (e.g., [models/hcmc.model.js](models/hcmc.model.js))
- Admin area (auth, settings, users)
  - Admin auth/settings: [controllers/admin/auth.controller.js](controllers/admin/auth.controller.js), [controllers/admin/settings.controller.js](controllers/admin/settings.controller.js)

Third‑party services, upstream libraries, and user deployments are out of scope but may be impacted.

## Supported Versions

- main (active development): receives security updates
- Latest tagged release (e.g., v1.1.x per [CHANGELOG.md](CHANGELOG.md)): receives critical fixes
- Older releases: best‑effort only

## Secure Deployment Checklist

- Environment
  - Use HTTPS/TLS; set `NODE_ENV=production`
  - Keep secrets in `.env` (never commit); rotate regularly
  - Run MongoDB with authentication and least‑privilege credentials
- HTTP hardening
  - Add HTTP security headers (e.g., helmet)
  - Configure CORS to allowed origins only
  - Enable rate limiting for auth, OTP, and data endpoints
- Sessions & cookies
  - Use `httpOnly`, `secure` (on TLS), and `sameSite=strict/lax` cookies
  - Regenerate session on login/logout; short session lifetimes for admin
- Forms & APIs
  - Enable CSRF protection for state‑changing forms in web UI
  - Validate and sanitize all inputs (query, body, headers, params)
- Data & logs
  - Avoid logging secrets/API keys/OTP; scrub logs
  - Ensure TTL indexes exist for time‑bound data (e.g., OTP)
- Processes
  - Use PM2/systemd with restricted permissions; avoid running as root
  - Back up MongoDB securely and test restores

## Development & PR Security Requirements

- Do not commit secrets, keys, tokens, or production URLs
- Input validation and output encoding are mandatory for new endpoints
- Reuse existing auth flows and middleware where possible:
  - API key verification: [`validateApiKey`](middlewares/auth.middleware.js)
- Follow project structure and patterns from [README.md](README.md)

## Known Areas for Improvement (Tracked)

- Password hashing
  - MD5 is used in some admin/client flows (imports of `md5` in:
    - [controllers/admin/auth.controller.js](controllers/admin/auth.controller.js)
    - [controllers/admin/settings.controller.js](controllers/admin/settings.controller.js)
    - [controllers/client/user.controller.js](controllers/client/user.controller.js)
    - [scripts/create-admin.js](scripts/create-admin.js)
  )
  - Migrate to bcrypt/argon2 with per‑user salt and proper parameters; provide a migration path
- Add helmet and express‑rate‑limit defaults
- Add CSRF protection for web forms in client/admin layouts
- API key improvements
  - Add key rotation UI, usage quotas, and optional key scopes
- OTP security
  - Add rate limits and anti‑bruteforce around OTP verify/resend
  - Ensure TTL index on [`OTP`](models/otp.model.js) is created in production

## Data Protection

- Personal data stored: name, email, optional avatar, provider info, API key
  - See [`User` schema](models/user.model.js)
- OTP codes expire in 5 minutes: [`OTP`](models/otp.model.js)
- Users can view/regenerate their API key in settings UI:
  - [views/client/pages/auth/settings.pug](views/client/pages/auth/settings.pug)

## Dependency & Tooling Guidance

- Node.js: run `npm audit` regularly; update vulnerable packages
- Python (prediction): pin and audit packages defined in [requirements.txt](requirements.txt)
- Consider additional tooling (SAST/DAST) and CI checks for dependency risk

## Coordinated Disclosure

We follow a responsible disclosure model. Please allow us time to investigate and remediate before public disclosure. After a fix is released, we will credit reporters (if desired) in [CHANGELOG.md](CHANGELOG.md).

## License

Eco‑Track is GPL‑3.0. See [LICENSE](LICENSE). Security reports and patches are contributed under the project license.