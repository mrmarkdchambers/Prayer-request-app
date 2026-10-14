#!/usr/bin/env python3
"""
Builds one SQL file that brings a live Supabase database up to date with
supabase/migrations, for pasting into the dashboard's SQL Editor (the GitHub
integration hasn't been applying migrations to this project).

Each migration runs only if the thing it creates is missing, checked against
the real schema rather than Supabase's migration record, then gets recorded.
Safe to run any number of times.

Usage: python3 scripts/make-db-update.py > database-update.sql
When adding a migration, add a check for it to CHECKS below.
"""
import glob
import os
import sys

# version -> SQL that is true when the migration still needs applying
CHECKS = {
    '20261011000000': "to_regclass('public.prayers') is null",
    '20261013000000': "to_regclass('public.push_keys') is null",
    '20261014000000': "true",  # only replaces a function; always safe
    '20261015000000': "not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prayers' and column_name = 'kind')",
}
TABLES = ['profiles', 'groups', 'group_members', 'prayers', 'intercessions',
          'notification_settings', 'push_subscriptions', 'notifications', 'push_keys']

root = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
files = sorted(glob.glob(os.path.join(root, '*.sql')))
out = ['''-- Intercede database update. Paste ALL of this into Supabase -> SQL Editor -> New query, then Run.
-- Safe to run more than once. The result at the bottom should show every row with present = true.

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
''']
for path in files:
    base = os.path.basename(path)
    version, name = base.split('_', 1)[0], base.split('_', 1)[1][:-4]
    if version not in CHECKS:
        sys.exit(f'Add a check for {base} to CHECKS in {__file__}')
    sql = open(path).read()
    assert '$mig$' not in sql
    out.append(f'''
-- ---------------------------------------------------------------- {base}
do $do$
begin
  if {CHECKS[version]} then
    execute $mig$
{sql}
$mig$;
    raise notice 'Applied: {base}';
  else
    raise notice 'Already in place: {base}';
  end if;
  insert into supabase_migrations.schema_migrations (version, name) values ('{version}', '{name}')
  on conflict (version) do nothing;
end
$do$;
''')
checks = ',\n  '.join(f"('table {t}', to_regclass('public.{t}') is not null)" for t in TABLES)
out.append(f'''
-- Make changes visible to the API straight away.
notify pgrst, 'reload schema';

-- Check: every row should say present = true.
select item, present from (values
  {checks},
  ('praise reports', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prayers' and column_name = 'kind'))
) as t(item, present);
''')
sys.stdout.write(''.join(out))
