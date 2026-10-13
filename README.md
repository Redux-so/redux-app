# Redux

Agentic photo editing platform

## Development

Use Node.js 20.9 or newer and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

Keep local configuration in `.env.local`. Next.js loads that file for `pnpm dev`. Prisma reads `DATABASE_URL` and `DIRECT_URL` for PostgreSQL, and the Prisma CLI needs the file passed explicitly:

```bash
node --env-file=.env.local ./node_modules/prisma/build/index.js generate
node --env-file=.env.local ./node_modules/prisma/build/index.js migrate dev
```
