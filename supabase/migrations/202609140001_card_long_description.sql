-- Persist the simplified product card model without changing legacy descriptions.
alter table card_definitions
  add column if not exists long_description text;
