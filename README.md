# Redux

Agentic photo editing platform

## Development

Use Node.js 20.9 or newer and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

Keep local configuration in `.env.local`. Prisma reads `DATABASE_URL` and `DIRECT_URL` for PostgreSQL. Generate the client and apply migrations before using the database:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate dev
```
