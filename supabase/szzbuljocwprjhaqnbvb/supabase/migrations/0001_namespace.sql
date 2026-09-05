-- happy-wakey: isolated namespace inside the shared auth project
create schema if not exists happy_wakey;
revoke all on schema happy_wakey from public;
