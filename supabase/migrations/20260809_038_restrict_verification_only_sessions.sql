-- A browser flag is not an authorization boundary. Require an authentication
-- method that is suitable for ordinary JR OS business access, so recovery,
-- magic-link, anonymous and other verification-only JWTs fail closed in RLS.

create or replace function private.has_active_auth_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.role() = 'service_role'
    or (
      exists (
        select 1
        from auth.sessions session
        where session.id::text = (auth.jwt() ->> 'session_id')
          and session.user_id = (select auth.uid())
      )
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr'
            else '[]'::jsonb
          end
        ) as authentication_method(value)
        where case jsonb_typeof(authentication_method.value)
          when 'object' then authentication_method.value ->> 'method'
          when 'string' then trim(both '"' from authentication_method.value::text)
          else null
        end = any (array[
          'password',
          'email/signup',
          'oauth',
          'sso/saml',
          'web3',
          'passkey',
          'oauth_provider/authorization_code'
        ]::text[])
      )
    ),
    false
  )
$$;

revoke execute on function private.has_active_auth_session()
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
