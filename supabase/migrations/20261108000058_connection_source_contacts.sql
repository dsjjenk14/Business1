-- Insiders can come from a request sent to someone in your phone's contacts.
-- (Its own migration: a new enum value can't be used in the same transaction.)
alter type public.connection_source add value if not exists 'contacts';
