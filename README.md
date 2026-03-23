# TaskFlow Next

TaskFlow Next is the real-stack rebuild of the TaskFlow prototype using:

- `Next.js`
- `React`
- `Supabase`
- `Vercel`

The original static prototype is preserved in [/Users/wbfour/Documents/Dev Discovery/prototype-static](/Users/wbfour/Documents/Dev%20Discovery/prototype-static).

## Run locally

This project expects the newer Homebrew Node install that was added during setup.

```bash
cd "/Users/wbfour/Documents/Dev Discovery/taskflow-next"
PATH="/usr/local/opt/node@20/bin:$PATH" npm run dev
```

Then open `http://localhost:3000`.

## Environment variables

Copy `.env.example` to `.env.local` and add:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

If those values are missing, the app still works in demo mode with local storage.

## Supabase setup

Create a `tasks` table:

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);
```

Enable Row Level Security:

```sql
alter table public.tasks enable row level security;
```

Add policies so authenticated users can only access their own rows:

```sql
create policy "Users can read their own tasks"
on public.tasks
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own tasks"
on public.tasks
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
on public.tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

In Supabase Auth, enable the sign-in methods you want to use. Email/password is the simplest starting point.

## Verification

These commands pass:

```bash
PATH="/usr/local/opt/node@20/bin:$PATH" npm run lint
PATH="/usr/local/opt/node@20/bin:$PATH" npm run build
```

## Deploy to Vercel

1. Create a new Vercel project from `/Users/wbfour/Documents/Dev Discovery/taskflow-next` or push it to Git.
2. Add the same `NEXT_PUBLIC_SUPABASE_*` environment variables in Vercel.
3. Deploy.

## Current product status

The app currently includes:

- sign in / sign up UI
- demo mode fallback
- dashboard layout from the design exercise
- add task
- mark complete
- completed tasks move to the bottom
- subtle visual polish carried over from the prototype
