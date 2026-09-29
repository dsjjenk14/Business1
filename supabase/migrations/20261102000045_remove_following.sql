-- No more one-way following ("Tap in"). On I'm In you connect with someone
-- and become each other's Insiders; that's the only relationship.
--
-- The follows table stays (empty) so the feeds that once read it keep
-- working unchanged, but nothing can add to it any more: the only way in was
-- follow_user, which is dropped. Old follow notices are cleared.

delete from public.follows;
delete from public.notifications where kind = 'follow';

drop function if exists public.follow_user(uuid);
drop function if exists public.unfollow_user(uuid);
drop function if exists public.follow_info(uuid);

-- Belt and braces: members can't write to it directly either.
revoke insert, update, delete on public.follows from anon, authenticated;
