# openMessage User Web

Independent external client for openMessage. It presents one decision card at a time and keeps
only local queue, attention, and processing state. Canonical messages and interactions stay in
Core.

## Run

```sh
cp apps/user-web/.env.example apps/user-web/.env
pnpm --filter @openmessage/user-web build
pnpm --filter @openmessage/user-web start
```

The service exposes `/health`, receives Core HTTP egress at `/api/inbound`, and serves the PWA
from the same independent process. When `USER_WEB_REGISTER_ENDPOINT=true`, startup registers
`USER_WEB_PUBLIC_URL` as the HTTP endpoint for `USER_WEB_CLIENT_ID`.

## Action contract

- `send-fixed-message` and `send-custom-message`: reply to the original sender in the same
  interaction, then mark handled.
- `handled` and `later`: local state changes.
- `mark-read` and `mark-unread`: local attention changes.
- `skip`: advances only the current browser pass.
- `no-op`: does not persist or advance.

Set `USER_WEB_INBOUND_TOKEN` to require the `x-openmessage-token` header on inbound delivery.
