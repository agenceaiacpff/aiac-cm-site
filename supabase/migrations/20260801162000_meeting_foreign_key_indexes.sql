-- Index de support des clés étrangères utilisés lors des audits et suppressions.
create index if not exists meeting_participants_invited_by_idx on public.meeting_participants(invited_by);
create index if not exists meeting_guests_invited_by_idx on public.meeting_guests(invited_by);
