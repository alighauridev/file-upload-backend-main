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

Make sure PostgreSQL is running, then run migrations:

```bash
npm run generate
npm run migrate
```

### 5. Start Development Server

```bash
npm run dev
```
