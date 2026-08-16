update public.task_reports
set reporter_signature_block_side='left'
where reporter_signature_block_side is distinct from 'left';

update public.task_report_approvals
set signature_block_side='right'
where signature_block_side is distinct from 'right';

alter table public.task_reports
  alter column reporter_signature_block_side set default 'left';

alter table public.task_report_approvals
  alter column signature_block_side set default 'right';

create or replace function private.enforce_report_signature_positions()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_name='task_reports' then
    new.reporter_signature_block_side:='left';
  elsif tg_table_name='task_report_approvals' then
    new.signature_block_side:='right';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_report_signature_positions() from public,anon,authenticated;

drop trigger if exists enforce_task_report_signature_position on public.task_reports;
create trigger enforce_task_report_signature_position
before insert or update of reporter_signature_block_side on public.task_reports
for each row execute function private.enforce_report_signature_positions();

drop trigger if exists enforce_task_report_approval_signature_position on public.task_report_approvals;
create trigger enforce_task_report_approval_signature_position
before insert or update of signature_block_side on public.task_report_approvals
for each row execute function private.enforce_report_signature_positions();
