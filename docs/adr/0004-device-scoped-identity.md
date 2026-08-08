# ADR 0004 — Identity is a device-scoped UUID, and clearing storage loses progression

**Status**: Accepted · **Date**: 2026-08-08 · **Requirements**: FR-053, FR-054, FR-066, FR-064, SC-007

## Context

Progression needs something to attach to. The spec's Out of Scope list rules out the usual
candidates in the same breath: **no user accounts, no passwords, no email, no social sign-in,
no cross-device sync, and no progression recovery code.**

FR-053 states the replacement positively — a client-generated identifier stored on the device,
created on first visit with no sign-up step — and FR-054 constrains what may accompany it: no
personal information, only the generated identifier, gameplay statistics, and hand logs.

SC-007 is the one that fixes the boundary precisely, and its wording repays attention:

> *"A returning player on the same device sees their level, statistics, and unlocks restored on
> 100% of visits **where local identity is intact**."*

The qualifier is the decision. The success criterion itself declines to promise anything when
local identity is gone.

## Decision

A v4 UUID, generated on first visit and stored under `bj.player_id` in `localStorage`
(`src/sync/identity.ts`). It is the sole scope for every read and write (FR-069), and it travels
with nothing that identifies a person.

Practical details that follow from treating it as the *only* identity:

- **A stored value that is not a UUID is treated as absent, not repaired.** A half-trusted
  identifier would scope every future write to a row nobody owns.
- **`crypto.randomUUID` where available, with a v4-shaped fallback.** The API is absent over
  plain HTTP in some browsers — exactly the local-development case. Uniqueness here scopes one
  device's own rows; it is not a security boundary, so the fallback is adequate.
- **Play begins before any persistence call completes** (FR-066). A new identity is created
  locally and the row appears on the first `PUT`; a 404 from `GET /api/progress` is the normal
  first-visit path, not an error.
- **Identity is never sent anywhere except as the scope parameter.** There is no profile, no
  display name, and nowhere to put one.

## Consequences

**Good.** There is no sign-up step, which is the single largest drop-off point a trainer like
this could have — SC-002 gives an experienced player ten seconds and two interactions to reach
a live hand, and an account form would consume both. There is no password to store, no reset
flow, no session handling, and no personal data to protect, breach, or delete on request.
FR-054 is satisfied structurally: there is no field in either table that could hold personal
information.

**The accepted loss.** Clearing site data, using private browsing, or switching browser or
device loses all progression, with **no recovery path whatsoever**. There is no code to write
down, no email to send, and no support route. A player who has reached level 8 and clears their
cache is back to level 1.

This is a real cost and it is accepted deliberately, on three grounds. The stakes are
play-money statistics rather than anything a person would grieve. SC-007 was written to exclude
exactly this case, so the product promise is not being quietly broken. And every mechanism that
would fix it — an account, a recovery code, a device-linking flow — reintroduces either
personal data or a credential, both of which the spec excludes by name.

**What it does not affect.** Because the outbox is durable and the endpoints are idempotent,
losing identity loses *future access* to the stored rows, not the rows themselves. They remain
in the database, orphaned. Retention is flagged as an outstanding item; before any public
launch, orphaned rows are the first thing a retention policy should address.

## Alternatives rejected

**User accounts.** Excluded by the Out of Scope list, and disproportionate: password storage,
reset flows, and personal data, to protect a play-money XP total.

**A progression recovery code** — a short phrase the player can write down and re-enter.
Explicitly excluded by the spec, and worth noting *why* it is tempting: it would close the
entire gap above at the cost of one input field. It is the first thing to revisit if losing
progression turns out to hurt real users, and it needs no personal data, which makes it
compatible with FR-054.

**A fingerprint-derived identifier** — deriving stability from browser and hardware
characteristics rather than storage. Rejected outright: it survives a cache clear precisely
*because* it is not under the player's control, which makes it tracking. FR-054 forbids
collecting personal information, and a fingerprint is personal information wearing a technical
name.

**A server-assigned identifier.** The client could not then recognise its own retry (R4), and
it would put a network round trip in front of the first hand — which FR-066 forbids.
