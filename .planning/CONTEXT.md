# lex-web project context

## Supabase migrations

IMPORTANT: All new Supabase tables MUST include explicit GRANT statements
for anon, authenticated, and service_role roles. Required from May 30 2026.

Use `db/migration_template.sql` as the starting point for every new migration.
PostgREST will silently return 401 / empty result sets if grants are missing,
which is hard to diagnose from the client. Failing to add grants has shipped
broken endpoints before — this is non-negotiable for new tables.

Verify after each migration:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = '<new_table>';
```

anon should at minimum have SELECT; authenticated and service_role should
have full CRUD (SELECT, INSERT, UPDATE, DELETE).
