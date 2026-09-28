-- The Catalog look (L) is the new default; Catalog Night (N) is its dark
-- version. Everyone moves over once: light-look members to Catalog, dark-look
-- members to Catalog Night. The older looks stay available in Appearance.
alter table public.user_settings drop constraint if exists user_settings_theme_id_check;
alter table public.user_settings add constraint user_settings_theme_id_check check (theme_id in ('L','N','O','A','B','C','D'));
alter table public.user_settings alter column theme_id set default 'L';
update public.user_settings set theme_id = case when theme_id = 'D' then 'L' else 'N' end where theme_id in ('O','A','B','C','D');
