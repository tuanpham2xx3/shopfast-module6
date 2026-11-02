# Ticket list background refresh — 2026-11-02

Root cause: ticket list loaded only on mount, local revision, filter/page change.
Creating a ticket from a separate customer's session did not notify that view.
The order socket namespace does not provide ticket-list subscriptions.

Fix: poll the authorized current list every 10 seconds while the document is
visible; resync on window focus/visibility return. No overlapping list requests;
abort on cleanup, unchanged payload preserves state. Preserve filters, page,
selected ticket and reply draft; background errors do not replace draft/error UI.
This does not refresh or overwrite selected detail fields or implement WebSocket
push. A filter/page can legitimately exclude a new ticket.

Browser regression first failed because a newly published ticket never appeared
within 15 seconds. After implementation, the ticket appeared at the next poll;
an exact label selector then failed to locate the edited textarea even though the
browser snapshot retained the draft. Using the textbox accessible role/name fixed
the verifier. The full rerun passed 4/4 browser cases (three existing creation
cases plus new-ticket arrival with draft and URL preserved). TypeScript and scoped
ESLint passed. Production verification is pending deployment.
