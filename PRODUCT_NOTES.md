# fidbachr — Loop 1.1 product model

## Core workflow

A feedback item is a workflow/thread, not just a comment.

**Open → In progress → Ready for review → Resolved**

- Reviewer creates and prioritizes formal feedback.
- Creator works through requested changes and replies inside the same thread.
- Creator can move an item to **In progress** and then **Ready for review**.
- Reviewer gets notified and either **Verifies & resolves** or reopens it.
- Only the reviewer owns final resolution.

This prevents creators checking off their own work before the reviewer verifies the result.

## Roles and anti-gaming model

### Guest reviewer — free
Can open a shared review, comment/annotate, reply as a reviewer and approve where invited. Review-only activity should never consume a paid seat.

### Workspace manager — paid
Can create projects, upload initial assets, invite people, manage versions, control permissions, see the dashboard and access workspace-level reporting/AI.

### Active creator — metered paid capacity
Creator permission is project-scoped. A creator can reply as the assigned creator, move production statuses, upload revisions and submit fixes for verification.

To prevent one cheap workspace becoming a free 30-person production account, creator capacity is measured monthly. An identity counts as active when it performs its first creator-side action in that workspace during the billing month, including a creator reply, moving work to In progress/Ready, or uploading a revision. Review-only activity never counts.

Removing, renaming or re-inviting the same verified creator does not reset that month's activation. The activation ledger is enforced server-side.

Proposed included active creators:

- Free: 1 creator/month for trial use
- Solo: 3 active creators/month
- Studio: 8 active creators/month
- Agency: 25 active creators/month
- Extra active creator target: $4/month, to validate

The simple promise is: **reviewers are free; production capacity is what the workspace pays for.**

## Notification rules

High-value notifications:

1. Creator replies to reviewer → reviewer in-app ping.
2. Creator marks item ready → reviewer in-app + optional email.
3. Reviewer replies → creator ping.
4. Reviewer resolves/reopens → creator ping.
5. @mention → direct ping.

Avoid email-per-comment spam. Batch low-priority activity into digests.

## Pricing hypothesis

### Free — $0
- 1 workspace manager
- Unlimited guest reviewers
- 1 active creator/month
- 2 active reviews
- 1 GB active storage
- 500 MB max file
- 2 versions/review
- 25 AI-organized feedback items/month
- Threads, replies, checklist and verification workflow
- Completed assets expire after 30 days

### Solo — $12 monthly / $9 monthly billed annually
- 1 workspace manager
- Unlimited guest reviewers
- 3 active creators/month
- Unlimited active reviews within storage
- 20 GB active storage
- 2 GB max file
- 500 AI-organized feedback items/month
- 90-day completed-review history

### Studio — $29 monthly
- 3 workspace managers
- Unlimited guest reviewers
- 8 active creators/month
- 100 GB storage
- 5 GB max file
- 5,000 AI-organized feedback items/month
- Assignments, internal notes, approvals

### Agency — $79 monthly
- 10 workspace managers
- Unlimited guest reviewers
- 25 active creators/month
- 250 GB storage
- 5 GB max file
- 20,000 AI-organized feedback items/month
- Client spaces, branding, granular permissions, longer history

## Cost architecture

Early beta:

- Frontend: Vercel/static deployment
- Auth/data/realtime later: Supabase
- Media later: Cloudflare R2
- Transactional email later: Resend
- AI structuring later: low-cost OpenAI model
- Video initially: direct browser playback of browser-friendly codecs

Production usage should be controlled with active-storage caps, completed-review retention, maximum file size, AI allowance and active-creator allowance. Do not sell unlimited permanent source-file storage.

## Current prototype boundaries

The Reviewer/Creator switch is currently a demonstration of permission behavior, not a security boundary. Server-side enforcement comes with the backend loop.

Current behavior:

- Reviewer creates formal feedback, priority, category and pins.
- Creator replies and moves work to In progress / Ready for review.
- Reviewer owns final resolution.
- Checklist compiles automatically.
- Activity feed simulates notifications.
- State persists in localStorage.
