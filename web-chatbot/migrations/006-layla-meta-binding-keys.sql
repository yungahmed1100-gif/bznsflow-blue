-- Additive preparation for reviewed sender changes. Old two-row keys remain
-- readable evidence; every current asset binding receives an isolated row.
begin;
alter table public.layla_meta_state
  drop constraint if exists layla_meta_state_key_check;
alter table public.layla_meta_state
  add constraint layla_meta_state_key_check check (
    key in ('bznsflow:mock', 'bznsflow:live') or
    key ~ '^bznsflow:(mock|live):[a-f0-9]{16}$'
  );
commit;
