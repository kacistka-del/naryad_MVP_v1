create extension if not exists "pgcrypto";

-- Пользователи: логин/пароль, роль платформы, произвольный профиль в data
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  role text not null default 'user',
  is_verified boolean not null default false,
  is_blocked boolean not null default false,
  otp_code text,
  otp_expires timestamptz,
  reset_token text,
  reset_token_expires timestamptz,
  google_id text unique,
  data jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- Универсальное хранилище сущностей (Order, Executor, Review, ...)
-- Документная модель повторяет семантику Base44 entities: filter/get/create/update/delete
create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create index if not exists records_entity_idx on records (entity);
create index if not exists records_entity_created_idx on records (entity, created_date desc);
create index if not exists records_data_idx on records using gin (data jsonb_path_ops);

-- Номера нарядов: Н-2026-000001
create sequence if not exists order_number_seq start 1;
