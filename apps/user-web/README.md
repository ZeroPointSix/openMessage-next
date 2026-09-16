# openMessage User Web

Independent external client for openMessage. It presents one decision card at a time and keeps
only local queue, attention, reply-recovery, and processing state. Canonical messages and
interactions stay in Core.

## Run

```sh
cp apps/user-web/.env.example apps/user-web/.env
pnpm --filter @openmessage/user-web build
pnpm --filter @openmessage/user-web start
```

The service exposes public `/health`, receives authenticated Core HTTP egress at `/api/inbound`,
and serves the PWA from the same independent process. When `USER_WEB_REGISTER_ENDPOINT=true`,
startup registers `USER_WEB_PUBLIC_URL` as the HTTP endpoint for `USER_WEB_CLIENT_ID`, including
the configured inbound token as an endpoint header.

All Human APIs require `Authorization: Bearer <USER_WEB_HUMAN_API_TOKEN>`. The PWA asks for this
token and retains it only in browser session storage. Core delivery uses the separate
`x-openmessage-token: <USER_WEB_INBOUND_TOKEN>` contract. Do not reuse the two tokens.

## Action contract

- `send-fixed-message` and `send-custom-message`: persist a recovery record, reply to the original
  sender in the same interaction, then mark handled. A retry reconciles against Core before it can
  submit another reply.
- `handled` and `later`: local state changes.
- `mark-read` and `mark-unread`: local attention changes.
- `skip`: advances only the current browser pass.
- `no-op`: does not persist or advance.
