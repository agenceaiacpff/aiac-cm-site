delete from public.notifications n
using public.task_reports r
where n.entity_type='task_report'
  and n.entity_id=r.id
  and n.title='Rapport terrain à valider'
  and r.validation_authority_type='collective_body';
