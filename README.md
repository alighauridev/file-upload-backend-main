# File Upload Backend

Backend API for file upload and user management.

## Tech Stack

- Node.js
- Express
- TypeScript
- Drizzle ORM
- PostgreSQL
- JWT Authentication

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/talhaghauridev/file-upload-backend.git
cd file-upload-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the environment variables in `.env` with your configuration.

### 4. Database Setup

Development runs entirely in Docker: Postgres on port 5435 and a small file server on port 9000 standing in for Supabase Storage. Production (`NODE_ENV=production`) uses Supabase for both.

```bash
npm run db:up      # start Postgres + storage
npm run migrate
```

Stop them with `npm run db:down` (data is kept in Docker volumes).

### 5. Start Development Server

```bash
npm run dev
```

## Deploying (Render)

- **Build command:** `bun install` (or `npm install`). `postinstall` compiles TypeScript into `dist/`.
- **Start command:** `bun run start`
- **Environment:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_BUCKET_NAME`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` (plus optional `USER_STORAGE_LIMIT`). Render sets `PORT`.
