-- New report reasons for things that happen in person. Added on their own because a new
-- enum value can't be used in the same migration that adds it.
alter type public.report_reason add value if not exists 'assault';
alter type public.report_reason add value if not exists 'violence';
