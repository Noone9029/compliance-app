# Runbook: Deployment Smoke Checks

## Purpose

Confirm baseline service health immediately after deployment before business traffic is considered safe.

## Prerequisites

- deployed API, worker, and web services are running
- database migrations applied (`pnpm db:deploy` in release process)
- access to service logs and health endpoints

## Exact Steps

1. Verify API basic health:
   - `GET /health`
   - expect `status = ok`.
2. Verify API readiness:
   - `GET /ready`
   - expect `status = ready` and database check ok.
3. Verify web sign-in page loads.
4. Verify worker startup log:
   - contains JSON with `status: "ready"` and compliance queue name.
5. Verify authenticated compliance overview route:
   - `GET /v1/compliance/overview`.
6. Verify integration summary route:
   - `GET /v1/compliance/integration`.
7. Verify dead-letter list route:
   - `GET /v1/compliance/dead-letter`.

## Expected Results

- API passes health and readiness checks
- worker is connected to Redis and subscribed to compliance queue
- web can reach API routes
- compliance read endpoints return valid authenticated responses

## Failure Cases

- `/ready` failure indicates database or startup config issue
- worker not ready indicates Redis/env/runtime issue
- compliance routes failing auth indicates session/cookie/cors mismatch

## Escalation Notes

- block rollout completion if `/ready` fails
- block rollout completion if worker is not consuming queue
- escalate any production env validation startup failures immediately to deployment owner
