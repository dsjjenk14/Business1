-- A vouch can come from having someone's number saved in your phone's contacts.
-- (Its own migration: a new enum value can't be used in the same transaction.)
alter type public.vouch_type add value if not exists 'contact';
