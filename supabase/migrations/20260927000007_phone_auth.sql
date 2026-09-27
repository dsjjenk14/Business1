-- I'm In: 007 Phone verification codes + phone-login rate limiting
-- Both tables are server-only: RLS is on and there are no policies, so the app
-- can never read them. Only Edge Functions (service role) use them.

create table public.phone_verifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  phone       text not null,
  code_hash   text not null,          -- sha256 of the code; the code itself is never stored
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);

create table public.login_attempts (
  id           bigserial primary key,
  phone        text not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_phone_idx on public.login_attempts (phone, attempted_at desc);

alter table public.phone_verifications enable row level security;
alter table public.login_attempts      enable row level security;

insert into public.app_config (key, value, description) values
  ('sms_code_ttl_min',          '10', 'Phone verification codes expire after this many minutes.'),
  ('sms_codes_per_hour',        '5',  'Max verification texts per member per hour.'),
  ('phone_login_max_failures',  '10', 'Failed phone logins allowed per number per 15 minutes.');
