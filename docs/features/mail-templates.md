# Mail Templates — `cms`'s to breve

> Auto-written by `cardmem_initialize_project` when this project was linked.
> The two stories under this epic are the deliverable; this doc is the why.

## Why a project owes cardmem two templates

cardmem sends mail **on this project's behalf** — a customer-portal invitation, a
monthly status. Without a submitted template those letters go out in *cardmem's*
design, to *your* customer. The template is how the letter looks like it came
from you.

## Why TWO, and why `audience` is not part of the name

`purpose` is a free text field. `audience` is a closed set with a consequence:
it is the only field that answers *"does this letter leave the house?"*. Encoded
in a name (`invite-internal`, `invite_team`) the convention drifts, and the
failure it produces is the expensive one — an internal phrasing in a customer's
inbox. There is deliberately **no default**; a submission without an audience is
refused with a message naming both legal values.

- `enduser` — letters to a customer.
- `internal` — letters to your own team / project group.

## No design line yet? Submit the plain one today

Every brand field is optional. A template with no logo and the house accent is a
**fully valid** template and sends readable mail from day one. Submitting again
with better content is free, and identical content is **not** a new version — so
there is no cost to fixing it the day the brand exists. The original lives in
your repo; the sync hash tells you whether cardmem's copy still matches it.

## Stories

- **mail.1** — the customer-facing template (`enduser`).
- **mail.2** — the internal template (`internal`).

## Done when

`cardmem_list_mail_templates` returns an EMPTY `missing_audiences` for this
project, and a render of each returns finished HTML with `unfilled: []`.
