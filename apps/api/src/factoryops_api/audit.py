from factoryops_domain.ids import new_id
from . import models

def audit(db, *, actor, action, target_type, target_id, site_id=None, before=None, after=None, actor_type="human", correlation_id=None):
    row = models.AuditEntry(
        id=new_id(), actor=actor, actor_type=actor_type, action=action,
        target_type=target_type, target_id=target_id, site_id=site_id,
        before=before, after=after, correlation_id=correlation_id,
    )
    db.add(row)
    return row
