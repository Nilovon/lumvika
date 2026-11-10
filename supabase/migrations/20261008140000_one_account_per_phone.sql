-- One phone number, one account. The phone step of an email signup used to verify a number without
-- looking at who already held it, which let a visitor open a second account, and a second trial,
-- on the number of the first.

-- The accounts that did so are sent back to the phone step: the oldest holder of a number keeps
-- it, the others are unverified and have to prove another one. Nothing is deleted.
update public.user_phones as later
set verified_at = null
where later.verified_at is not null
  and later.phone is not null
  and exists (
      select 1
      from public.user_phones as earlier
      where earlier.phone = later.phone
        and earlier.verified_at is not null
        and (earlier.required_at, earlier.user_id) < (later.required_at, later.user_id)
  );

-- Replaces the plain index of the same shape, which signing in looked the owner of a number up with.
drop index if exists public.user_phones_verified_phone_idx;
create unique index if not exists user_phones_verified_phone_key on public.user_phones (phone) where verified_at is not null;
