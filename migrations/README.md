# NICE Database Migrations

## Conventions

- Files are numbered sequentially: `001_description.sql`, `002_description.sql`, etc.
- Each migration should be idempotent when possible (use `IF NOT EXISTS`).
- Migrations are applied manually via the Supabase SQL Editor or CLI.
- Never modify a migration that has already been applied to production.
- To roll back, create a new migration that reverses the changes.

## Current Migrations

| # | File | Description |
|---|------|-------------|
| 001 | `001_initial_schema.sql` | All tables used by NICE (profiles, agents, spaceships, tasks, ship_log, vault, fuel, audit, errors, notifications, workflows) |
