def timeline(db, entity=None):
    if entity:
        return db.query("SELECT * FROM audit_log WHERE entidade=? ORDER BY id DESC", (entity,))
    return db.query("SELECT * FROM audit_log ORDER BY id DESC")
