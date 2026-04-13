# 🦊 Foxtrot

A minimal, sharp, and beautifully animated cost center management system for small organisations.

## Features

- **Cost Center Management** — Create and manage department cost centers with balance tracking
- **Transaction Ledger** — Full audit trail of every money movement (top-ups, transfers, payments, adjustments)
- **Payments Ledger** — Track pending payments that need to be paid from the bank
- **Fund Requests** — Cost center owners can request funds; super admins approve/reject
- **Reports** — Monthly summaries and cost center comparisons with CSV export
- **Email Notifications** — Via Resend (invites, password resets, fund requests, etc.)
- **Microsoft SSO** — Optional Microsoft Azure AD authentication
- **Role-based Access** — Super Admins and Cost Center Owners with appropriate permissions
- **Swiss Brutalist Design** — Sharp, minimal, 0px border-radius, dark/light mode
- **Framer Motion** — Beautiful animations throughout

## Quick Deploy

### Option 1: With Caddy (Recommended for production + Cloudflare)

```bash
git clone https://github.com/Taptic-Education/foxtrot.taptic.org.git
cd foxtrot.taptic.org
sudo bash install.sh
```

You'll be prompted for:
- Your domain name
- Cloudflare API token (for automatic TLS)
- Admin email

### Option 2: Without Caddy (with Nginx)

```bash
git clone https://github.com/Taptic-Education/foxtrot.taptic.org.git
cd foxtrot.taptic.org
sudo bash install-no-caddy.sh
```

### Option 3: Manual Docker Compose

```bash
cp .env.example .env
# Edit .env with your values
docker compose up -d --build
```

Visit http://localhost:3000/setup to create your first admin account.

## Manual Setup

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for local development)

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password (generate a strong one) |
| `JWT_SECRET` | JWT signing secret (min 32 characters) |
| `APP_URL` | Your app URL (e.g. `https://foxtrot.yourdomain.com`) |
| `RESEND_API_KEY` | Resend API key for email notifications |
| `RESEND_FROM_EMAIL` | From address for emails |
| `MICROSOFT_CLIENT_ID` | Azure AD app client ID (optional, for SSO) |
| `MICROSOFT_CLIENT_SECRET` | Azure AD app secret (optional) |
| `MICROSOFT_TENANT_ID` | Azure AD tenant ID (optional) |

### Microsoft SSO Setup (Optional)

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App Registrations
2. Create a new registration
3. Set redirect URI to `https://yourdomain.com/api/auth/microsoft/callback`
4. Note the **Client ID** and **Tenant ID**
5. Create a client secret under "Certificates & secrets"
6. Add these to your `.env`

### Cloudflare + Caddy Setup

1. Point your domain's A record to your VPS IP in Cloudflare
2. Set SSL mode to **Full (Strict)** in Cloudflare SSL/TLS settings
3. Create a Cloudflare API token with `Zone:DNS:Edit` permission
4. Run `sudo bash install.sh` and provide the token

## Development

```bash
# Backend
cd api
cp .env.example .env
npm install
npx prisma migrate dev
npm run seed
npm run dev

# Frontend (new terminal)
cd web
npm install
npm run dev
```

App: http://localhost:5173  
API: http://localhost:3001

### Seed credentials
After running `npm run seed` in the api directory:
- Super Admin: `admin@foxtrot.local` / `password123`
- Cost Center Owner: `marketing@foxtrot.local` / `password123`

## Architecture

```
foxtrot/
├── api/                  # Node.js/Express backend
│   ├── prisma/           # Database schema & migrations
│   └── src/
│       ├── lib/          # Prisma, email, audit utilities
│       ├── middleware/   # Auth, security
│       └── routes/       # API route handlers
├── web/                  # React/Vite frontend
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── lib/          # API client, Zustand store, utils
│       ├── pages/        # Page components
│       └── styles/       # Global CSS
├── docker-compose.yml    # Docker services
├── Caddyfile            # Caddy reverse proxy config
├── install.sh           # One-command installer with Caddy
└── install-no-caddy.sh  # One-command installer with Nginx
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router v6, Zustand |
| Animations | Framer Motion |
| Charts | Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL 16, Prisma ORM |
| Auth | JWT + httpOnly cookies, refresh token rotation |
| Email | Resend |
| File uploads | Multer |
| Validation | Zod |
| Infrastructure | Docker, Caddy v2, Cloudflare |

## Security

- JWT access tokens (15min) + refresh tokens (7 days) in httpOnly cookies
- Rate limiting on auth routes (5 req/min)
- CSRF protection via Origin header verification
- Input sanitisation and validation on all endpoints
- SQL injection prevention via Prisma parameterised queries
- File upload validation (images + PDFs, max 5MB)
- Atomic database transactions for all financial operations
- Role-based access control on every route

## License

MIT