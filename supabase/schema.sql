-- TableFlow restaurant QR ordering schema
create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('staff','admin','developer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('ordered','preparing','ready','served','cancelled'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null unique,
  qr_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text,
  price numeric(12,2) not null check(price>=0),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  public_token uuid not null unique default gen_random_uuid(),
  status public.order_status not null default 'ordered',
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  source text not null default 'customer',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null check(quantity>0),
  line_total numeric(12,2) generated always as (unit_price * quantity) stored
);

create index if not exists orders_table_status_idx on public.orders(table_id,status,created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('staff','admin','developer'));
$$;
create or replace function public.is_admin_or_developer() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','developer'));
$$;
create or replace function public.is_developer() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='developer');
$$;

alter table public.profiles enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists profile_self on public.profiles;
create policy profile_self on public.profiles for select using (id=auth.uid() or public.is_admin_or_developer());
drop policy if exists public_tables_read on public.restaurant_tables;
create policy public_tables_read on public.restaurant_tables for select using (is_active=true);
drop policy if exists staff_tables_all on public.restaurant_tables;
create policy staff_tables_all on public.restaurant_tables for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists public_categories_read on public.categories;
create policy public_categories_read on public.categories for select using (true);
drop policy if exists public_menu_read on public.menu_items;
create policy public_menu_read on public.menu_items for select using (is_available=true or public.is_staff());
drop policy if exists staff_categories_all on public.categories;
create policy staff_categories_all on public.categories for all using (public.is_admin_or_developer()) with check (public.is_admin_or_developer());
drop policy if exists staff_menu_all on public.menu_items;
create policy staff_menu_all on public.menu_items for all using (public.is_admin_or_developer()) with check (public.is_admin_or_developer());
drop policy if exists staff_orders_all on public.orders;
create policy staff_orders_all on public.orders for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists staff_order_items_all on public.order_items;
create policy staff_order_items_all on public.order_items for all using (public.is_staff()) with check (public.is_staff());

-- Customer writes are intentionally performed by server routes with the service role after validating the QR token.

create or replace function public.table_occupied(p_table_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.orders where table_id=p_table_id and status in ('ordered','preparing','ready'));
$$;

-- Seed menu/categories. Safe to run repeatedly.
insert into public.categories(name,sort_order) values ('Starters',1),('Main Course',2),('Beverages',3),('Desserts',4) on conflict(name) do nothing;


-- Automatically create a staff profile when an Auth user is created. Promote selected users to admin/developer in SQL.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,role) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'staff') on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Broadcast order changes to the customer's private-by-unguessable-token channel.
create or replace function public.broadcast_order_change() returns trigger language plpgsql security definer set search_path=public,realtime as $$
begin
  perform realtime.broadcast_changes('order:' || new.id::text, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, new, old);
  return null;
end;
$$;
drop trigger if exists orders_realtime_broadcast on public.orders;
create trigger orders_realtime_broadcast after update on public.orders for each row execute function public.broadcast_order_change();

-- Menu management upgrade: half/full plate pricing and image storage.
alter table public.menu_items add column if not exists has_half_full boolean not null default false;
alter table public.menu_items add column if not exists half_price numeric(12,2);
alter table public.menu_items add column if not exists full_price numeric(12,2);
update public.menu_items set full_price=price where full_price is null;

insert into storage.buckets (id,name,public) values ('menu-images','menu-images',true) on conflict (id) do update set public=true;
drop policy if exists menu_images_public_read on storage.objects;
create policy menu_images_public_read on storage.objects for select using (bucket_id='menu-images');
drop policy if exists menu_images_staff_upload on storage.objects;
create policy menu_images_staff_upload on storage.objects for insert to authenticated with check (bucket_id='menu-images' and public.is_admin_or_developer());
drop policy if exists menu_images_staff_update on storage.objects;
create policy menu_images_staff_update on storage.objects for update to authenticated using (bucket_id='menu-images' and public.is_admin_or_developer()) with check (bucket_id='menu-images' and public.is_admin_or_developer());
drop policy if exists menu_images_staff_delete on storage.objects;
create policy menu_images_staff_delete on storage.objects for delete to authenticated using (bucket_id='menu-images' and public.is_admin_or_developer());
