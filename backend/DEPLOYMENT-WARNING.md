# Deployment Warning — Do Not Deploy to Vercel / Serverless

This backend uses SQLite as its database (`prisma/schema.prisma`, provider = "sqlite")
and an in-memory write-serialization queue (`src/lib/sqlite-mutex.ts`) to prevent
concurrent-write lock errors. Both of these assume a single, long-running Node
process with a persistent local filesystem — i.e. the Electron desktop deployment
this app currently ships as.

Deploying this backend to Vercel or any other serverless/multi-instance platform
will break it silently in two ways:

1. Serverless functions are stateless and short-lived. The in-memory write queue
   in `sqlite-mutex.ts` resets on every invocation and across every instance —
   it provides zero protection against concurrent writes in that environment.
2. Serverless filesystems are ephemeral (and often read-only). A SQLite file
   written during one invocation is not guaranteed to exist, or be consistent,
   on the next.

Do not import/deploy this repo's `backend` directory on Vercel unless the
database layer is first migrated to a real network database (Postgres/MySQL)
and the write-serialization is moved to that database's native locking/
transaction handling. Until then, this app is single-instance-desktop only.
