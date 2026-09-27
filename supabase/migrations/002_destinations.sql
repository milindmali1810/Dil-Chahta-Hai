-- 002_destinations.sql: the hand-checked destination sheet (DRAFT until the user approves).
-- Reference city: Pune. cost_per_person_inr = rough 2026 estimate for a 5-day / 4-night
-- trip per person: return travel from Pune + shared stay + food + local transport + entries.
-- Estimates, not live prices: check each by hand before relying on them.
--
-- Rules (see 001_init.sql): upsert only, never delete or truncate (decided trips reference
-- these ids). ids that equal a photo key in lib/photos.ts get that photo on result cards.
-- attributes must be a subset of DEALBREAKER_TAGS: international, trekking, overnight_journey
-- ("overnight_journey" = the realistic way to get there from Pune involves a night of travel).

insert into public.destinations (id, name, cost_per_person_inr, best_months, trip_type, attributes) values
  ('goa',       'Goa',                               14000, array[11,12,1,2,3],        'beach',     array['overnight_journey']),
  ('jaipur',    'Jaipur',                            21000, array[10,11,12,1,2,3],     'city',      array[]::text[]),
  ('kerala',    'Kerala (Munnar + Alleppey)',        27000, array[9,10,11,12,1,2,3],   'hills',     array[]::text[]),
  ('manali',    'Manali + Kasol (Kheerganga trek)',  22000, array[4,5,6,9,10,11],      'hills',     array['trekking','overnight_journey']),
  ('rishikesh', 'Rishikesh',                         23000, array[10,11,12,1,2,3,4],   'adventure', array[]::text[]),
  ('ladakh',    'Ladakh',                            38000, array[5,6,7,8,9],          'adventure', array[]::text[]),
  ('andaman',   'Andaman (Havelock)',                35000, array[11,12,1,2,3,4],      'beach',     array[]::text[]),
  ('bali',      'Bali',                              55000, array[4,5,6,7,8,9,10],     'beach',     array['international','overnight_journey']),
  ('santorini', 'Santorini',                        110000, array[5,6,7,8,9,10],       'beach',     array['international','overnight_journey']),
  ('alps',      'Swiss Alps (Zermatt)',             135000, array[6,7,8,9,12,1,2],     'hills',     array['international','overnight_journey'])
on conflict (id) do update set
  name                = excluded.name,
  cost_per_person_inr = excluded.cost_per_person_inr,
  best_months         = excluded.best_months,
  trip_type           = excluded.trip_type,
  attributes          = excluded.attributes;
