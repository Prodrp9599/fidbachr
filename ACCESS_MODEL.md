# fidbachr access + entitlement model

This is the server-side contract for the backend loop. The current static prototype demonstrates these roles but does not yet enforce them securely.

## 1. Workspace manager

A manager is a paid workspace role.

Can:
- Create and archive reviews/projects
- Upload initial creative assets
- Create versions
- Invite/revoke reviewers and creators
- Assign creator permissions
- Configure review settings
- Access workspace dashboard, reporting and billing

A creator or reviewer cannot gain these abilities from a shared review link.

## 2. Guest reviewer

Review-only participation is free and intentionally unlimited.

Can, when invited:
- Open the review link
- View permitted asset/version
- Leave formal feedback and annotations
- Reply as a reviewer
- Set severity/category when allowed
- Approve/reject when the review owner allows it

Cannot:
- Create projects/reviews
- Upload new production versions
- Manage workspace/team/billing
- Assign work
- Submit creator work as Ready for review

Review-only activity never consumes creator capacity.

## 3. Creator

Creator access is project-scoped production access.

Can, for assigned reviews only:
- View requested changes
- Reply and ask questions as the assigned creator
- Move assigned feedback Open → In progress → Ready for review
- Upload a revision when permitted
- Notify the reviewer that fixes are ready

Cannot:
- Create unrelated projects
- Invite their own team through someone else's workspace
- Access workspace administration/billing
- Resolve reviewer-owned feedback

## 4. Active creator metering

A creator becomes an **active creator for that workspace and billing month** when an identity with Creator permission performs its first creator-side action.

Qualifying actions:
- Replying or asking a question in Creator role
- Uploading a revision
- Moving an item to In progress
- Submitting an item Ready for review
- Other future production actions that modify the deliverable workflow

Non-qualifying actions:
- Viewing
- Review-only comments
- Reviewer annotations
- Replies made only with Reviewer permission

The backend stores an immutable monthly activation ledger keyed to `workspace_id + creator_identity_id + billing_period`.

Removing, renaming, downgrading and re-inviting the same verified identity does **not** erase that month's activation. This prevents invite cycling or temporary role changes from evading limits.

## 5. Identity rules

- Review links may be frictionless for review-only participation.
- Creator-side actions require a verified identity (email magic link/OAuth or an equivalent secure identity).
- Project creator permissions are explicit grants, not inferred from possession of a generic review URL.
- Share tokens are scoped, revocable and expire/rotate where appropriate.
- The same identity may be a Reviewer on one project and a Creator on another; creator metering starts only when that identity performs a creator-side action in that workspace.

## 6. Plan entitlement hypothesis

### Free
- 1 manager
- Unlimited guest reviewers
- 1 active creator/month
- 2 active reviews
- 2 versions/review
- Storage/retention caps

### Solo
- $12 monthly or $9/month annual
- 1 manager
- Unlimited guest reviewers
- 3 active creators/month
- Extra creator requires add-on/upgrade

### Studio
- $29/month
- 3 managers
- 8 active creators/month

### Agency
- $79/month
- 10 managers
- 25 active creators/month

## 7. Enforcement principle

All limits are enforced on the API/database side, never only in frontend code. The client may display usage and upgrade prompts, but it is not the authority for entitlement decisions.
