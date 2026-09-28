-- Who sees each plan / My Out (circle = 1st degree only), and splitting the bill.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create or replace function pg_temp.new_user(p_email text, p_name text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('accepted_terms', true, 'full_name', p_name, 'birthdate', '1990-01-01'), now(), now());
  return uid;
end $$;
create temp table t (k text primary key, id uuid);
grant select on t to authenticated;
create temp table ids (k text primary key, id bigint);
grant select on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = id.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.connect(a text, b text) returns void language sql as $$
  insert into connections (user_a, user_b, source)
  values (least(pg_temp.uid(a), pg_temp.uid(b)), greatest(pg_temp.uid(a), pg_temp.uid(b)), 'manual')
$$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a18@test.dev', 'Ada Eighteen')),
                     ('b', pg_temp.new_user('b18@test.dev', 'Bo Eighteen')),
                     ('c', pg_temp.new_user('c18@test.dev', 'Cy Eighteen')),
                     ('s', pg_temp.new_user('s18@test.dev', 'Sal Eighteen'));
-- a–b are 1st degree; b–c too, so c is a's 2nd degree. s is a stranger.
select pg_temp.connect('a', 'b');
select pg_temp.connect('b', 'c');

-- ── Going-out plan audience ───────────────────────────────────────────────
select pg_temp.act_as('a');
select ok(post_going_out('tonight', null, null, 'Rooftop', '{}', null, 38.9, -77.03) is not null, 'Post a plan');
select pg_temp.admin();
insert into ids select 'plan', id from going_out_posts where user_id = pg_temp.uid('a');
select is((select audience from going_out_posts where id = pg_temp.id('plan')), 'everyone', 'Plans start as they were: network and nearby');
select pg_temp.act_as('c');
select is((select count(*)::int from tonight_network() where user_id = pg_temp.uid('a')), 1, 'Your 2nd degree sees it');
select pg_temp.act_as('a');
select lives_ok(format('select set_plan_audience(%s, %L)', pg_temp.id('plan'), 'circle'), 'Make this one circle-only');
select pg_temp.admin();
select is((select audience::text from pins where going_out_post_id = pg_temp.id('plan')), 'circle', 'Its pin follows');
select pg_temp.act_as('b');
select is((select count(*)::int from tonight_network() where user_id = pg_temp.uid('a')), 1, '1st degree still sees it');
select is((select count(*)::int from jsonb_array_elements(going_out_feed('tonight', 38.9, -77.03)->'people') x where x->>'user_id' = pg_temp.uid('a')::text), 1, 'Also on the Tonight list');
select pg_temp.act_as('c');
select is((select count(*)::int from tonight_network() where user_id = pg_temp.uid('a')), 0, '2nd degree doesn''t');
select is((select count(*)::int from jsonb_array_elements(going_out_feed('tonight', 38.9, -77.03)->'people') x where x->>'user_id' = pg_temp.uid('a')::text), 0, 'Not on their Tonight list either');
select is(profile_card(pg_temp.uid('a'))->'tonight', 'null'::jsonb, 'Or on your profile');
select pg_temp.act_as('s');
select is((select count(*)::int from jsonb_array_elements(going_out_feed('tonight', 38.9, -77.03)->'people') x where x->>'user_id' = pg_temp.uid('a')::text), 0, 'Strangers nearby don''t');
select pg_temp.act_as('a');
select lives_ok(format('select set_plan_audience(%s, %L)', pg_temp.id('plan'), 'everyone'), 'Open it back up');
select pg_temp.act_as('s');
select is((select count(*)::int from jsonb_array_elements(going_out_feed('tonight', 38.9, -77.03)->'people') x where x->>'user_id' = pg_temp.uid('a')::text), 1, 'Now people nearby see it');
select throws_ok(format('select set_plan_audience(%s, %L)', pg_temp.id('plan'), 'circle'), '42501', null, 'Only you choose for your plan');

-- ── My Out audience ───────────────────────────────────────────────────────
select pg_temp.act_as('a');
select ok(send_out(pg_temp.uid('a') || '/n.jpg', null, array[]::uuid[], true, 'network') is not null, 'My Out to your network');
select pg_temp.act_as('c');
select is(jsonb_array_length(outs_inbox()->'stories'), 1, 'Your 2nd degree sees a network Out');
select pg_temp.act_as('a');
select ok(send_out(pg_temp.uid('a') || '/c.jpg', null, array[]::uuid[], true, 'circle') is not null, 'My Out to your circle');
select pg_temp.act_as('c');
select is(jsonb_array_length(outs_inbox()->'stories'->0->'out_ids'), 1, 'But not a circle-only one');
select pg_temp.act_as('s');
select is(jsonb_array_length(outs_inbox()->'stories'), 0, 'Strangers see neither');

-- ── Split the bill ────────────────────────────────────────────────────────
select pg_temp.act_as('a');
select is((select count(*)::int from bill_people()), 1, 'You can tag your circle');
select throws_ok(format($q$select create_bill('Dinner', 9000, 1800, 'even', %L::jsonb)$q$,
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.uid('s'), 'amount_cents', 3600))), '23514', null, 'Not strangers');
select throws_ok(format($q$select create_bill('Dinner', 9000, 0, 'custom', %L::jsonb)$q$,
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.uid('b'), 'amount_cents', 9500))), '23514', 'The amounts add up to more than the bill.', 'Can''t ask for more than the bill');
select ok(create_bill('Dinner', 9000, 1800, 'even', jsonb_build_array(jsonb_build_object('user_id', pg_temp.uid('b'), 'amount_cents', 5400)),
  pg_temp.uid('a') || '/r.jpg') is not null, 'Split it');
select pg_temp.admin();
insert into ids select 'bill', id from bills where creator_id = pg_temp.uid('a');
select is((select body from notifications where user_id = pg_temp.uid('b') and kind = 'bill'), 'Your share is $54.00. Tap to see the receipt and pay.', 'They''re told their share');
select pg_temp.act_as('c');
select is(bill_detail(pg_temp.id('bill')), null, 'People not on the bill can''t see it');
select pg_temp.act_as('a');
select lives_ok($$select set_payment_handles('@ada-pays', '$AdaCash', '')$$, 'Save where to pay you');
select is(my_payment_handles()->>'venmo', 'ada-pays', 'The @ is dropped');
select throws_ok($$select set_payment_handles('bad name!', null, null)$$, '23514', null, 'Usernames only');
select is((bill_detail(pg_temp.id('bill'))->>'creator_share_cents')::int, 5400, 'Your own share is what''s left');
select is(bill_detail(pg_temp.id('bill'))->'pay_to', 'null'::jsonb, 'You don''t see your own pay links');
select pg_temp.act_as('b');
select is(bill_detail(pg_temp.id('bill'))->'pay_to'->>'cashapp', 'AdaCash', 'The friend sees where to pay');
select mark_bill_paid(pg_temp.id('bill'));
select is((select x->>'my_status' from jsonb_array_elements(my_bills()) x where (x->>'id')::bigint = pg_temp.id('bill')), 'paid', 'I paid');
select pg_temp.admin();
select is((select title from notifications where user_id = pg_temp.uid('a') and kind = 'bill_paid'), 'Bo E. says they paid you $54.00', 'The payer is told');
select pg_temp.act_as('b');
select throws_ok(format('select settle_bill_share(%s, %L)', pg_temp.id('bill'), pg_temp.uid('b')), '42501', null, 'Only the bill''s owner marks it received');
select pg_temp.act_as('a');
select settle_bill_share(pg_temp.id('bill'), pg_temp.uid('b'));
select is((select (x->>'outstanding_cents')::int from jsonb_array_elements(my_bills()) x where (x->>'id')::bigint = pg_temp.id('bill')), 0, 'All square');

select * from finish();
rollback;
