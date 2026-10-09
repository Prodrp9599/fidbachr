# fidbachr

A browser prototype for structured creative feedback.

## What Loop 1 proves

The product is built around a two-sided workflow rather than a one-way comment stream:

**Reviewer raises change → Creator works/replies → Creator marks ready → Reviewer verifies/resolves or reopens.**

The reviewer keeps final approval authority. Creators cannot silently close requested changes.

### Included in this prototype

- Upload a local video or image for review
- Timestamped video feedback
- Pin feedback to a specific area
- Severity: Blocker / Major / Minor / Suggestion
- Feedback categories
- Reviewer and Creator views
- Threaded replies
- Creator states: Open → In progress → Ready for review
- Reviewer verification / reopen
- Activity notification simulation
- Auto-generated change checklist
- Review summary
- Local browser persistence

This Loop 1 prototype intentionally has no backend, authentication, billing, cloud storage or real notifications. Uploaded media stays in the local browser session.

## Anti-gaming pricing rule

Review-only participation remains free because shared review links are the distribution loop.

Production activity is metered separately:

- **Guest reviewer:** free. Can review/comment/annotate/approve where invited.
- **Workspace manager:** paid. Creates reviews, manages projects, permissions and workspace.
- **Active creator:** counts against a monthly creator allowance once they perform a production action such as uploading a revision or submitting fixes for verification.

Simply leaving review feedback never consumes creator capacity.

Initial model to validate:

- Free: 1 manager, 1 active creator, 2 active reviews
- Solo: $12 monthly or $9/month annual, 1 manager, 3 active creators/month
- Studio: $29/month, 3 managers, 8 active creators/month
- Agency: $79/month, 10 managers, 25 active creators/month
- Additional active creators: target $4/month each, subject to validation

## Run locally

Open `index.html` in a modern browser, or serve the directory with any static web server.

The same static build is intended to deploy directly to Vercel with no build step.

## Next loop

1. Real authentication and permissions
2. Shared review URLs
3. Cloud asset storage
4. V1/V2 revision uploads
5. Real notifications
6. AI feedback classification and cleanup
7. Billing / active-creator metering
