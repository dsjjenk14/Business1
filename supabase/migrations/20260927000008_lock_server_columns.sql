-- I'm In: 008 Server-controlled columns
-- Members may only fill in the columns listed here when creating rows.
-- Timestamps, counters, priority flags and statuses are set by the database,
-- so nobody can backdate a message, pre-fill a like count, or boost a post.

revoke insert on public.messages from authenticated, anon;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

revoke insert on public.pins from authenticated, anon;
grant insert (author_id, category, body, audience, approx_location, city_id, place_label, venue_id, event_id, going_out_post_id)
  on public.pins to authenticated;

revoke insert on public.pin_replies from authenticated, anon;
grant insert (pin_id, author_id, body) on public.pin_replies to authenticated;

revoke insert on public.pin_likes from authenticated, anon;
grant insert (pin_id, user_id) on public.pin_likes to authenticated;

revoke insert on public.pin_bookmarks from authenticated, anon;
grant insert (pin_id, user_id) on public.pin_bookmarks to authenticated;

revoke insert on public.vouches from authenticated, anon;
grant insert (voucher_id, vouchee_id, type, word_id, encounter_id) on public.vouches to authenticated;

revoke insert on public.going_out_posts from authenticated, anon;
grant insert (user_id, when_kind, starts_at, expires_at, venue_id, place_text, approx_location, vibes, note, is_hosting, event_id)
  on public.going_out_posts to authenticated;

revoke insert on public.intros from authenticated, anon;
grant insert (connector_id, person_a, person_b, message, predicted_score) on public.intros to authenticated;

revoke insert on public.intro_requests from authenticated, anon;
grant insert (requester_id, target_id, via_id, note) on public.intro_requests to authenticated;

revoke insert on public.vouch_requests from authenticated, anon;
grant insert (requester_id, target_id, encounter_id) on public.vouch_requests to authenticated;

revoke insert on public.group_join_requests from authenticated, anon;
grant insert (group_id, user_id, why, how_found) on public.group_join_requests to authenticated;

revoke insert on public.events from authenticated, anon;
grant insert (host_id, group_id, venue_id, title, emoji, description, starts_at, ends_at, capacity, is_recurring)
  on public.events to authenticated;

revoke insert on public.groups from authenticated, anon;
grant insert (name, emoji, category, description, join_type, owner_id, city_id, schedule_label) on public.groups to authenticated;

revoke insert on public.location_pings from authenticated, anon;
grant insert (user_id, location, accuracy_m, purpose, venue_id, event_id) on public.location_pings to authenticated;
