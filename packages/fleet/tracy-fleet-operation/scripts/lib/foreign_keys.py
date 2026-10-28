"""Foreign-key metadata for scratch copies and restore cutovers; no DDL text parsing."""
import argparse
import json
import os
from pathlib import Path


def quote(name):
    return "`" + name.replace("`", "``") + "`"


def capture(sql, schema):
    literal = "'" + schema.replace("\\", "\\\\").replace("'", "''") + "'"
    rows = sql.run(f"""SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME,
        k.REFERENCED_TABLE_SCHEMA, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
        r.UPDATE_RULE, r.DELETE_RULE
        FROM information_schema.KEY_COLUMN_USAGE k
        JOIN information_schema.REFERENTIAL_CONSTRAINTS r
          ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME
          AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA={literal} AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;""")
    keys = {}
    for table, name, column, parent_schema, parent, parent_column, update, delete in rows:
        key = keys.setdefault((table, name), dict(schema=schema, table=table, name=name,
            columns=[], parent_schema=parent_schema, parent=parent, parent_columns=[], update=update, delete=delete))
        key["columns"].append(column)
        key["parent_columns"].append(parent_column)
    return list(keys.values())


def rebase(key, source, target):
    return {**key, "schema": target,
            "parent_schema": target if key["parent_schema"] == source else key["parent_schema"]}


def add_sql(key):
    cols = lambda names: ", ".join(quote(n) for n in names)
    if key["update"] not in ("CASCADE", "SET NULL", "RESTRICT", "NO ACTION", "SET DEFAULT") or key["delete"] not in ("CASCADE", "SET NULL", "RESTRICT", "NO ACTION", "SET DEFAULT"):
        raise ValueError("unknown foreign-key action")
    return (f"ALTER TABLE {quote(key['schema'])}.{quote(key['table'])} ADD CONSTRAINT {quote(key['name'])}"
            f" FOREIGN KEY ({cols(key['columns'])}) REFERENCES {quote(key['parent_schema'])}.{quote(key['parent'])}"
            f" ({cols(key['parent_columns'])}) ON UPDATE {key['update']} ON DELETE {key['delete']};")


def drop(sql, keys):
    if keys:
        sql.run("\n".join(f"ALTER TABLE {quote(k['schema'])}.{quote(k['table'])} DROP FOREIGN KEY {quote(k['name'])};" for k in keys))


def ensure(sql, keys):
    existing = {(k['schema'], k['table'], k['name']): k for schema in {k['schema'] for k in keys} for k in capture(sql, schema)}
    for key in keys:
        old = existing.get((key['schema'], key['table'], key['name']))
        if old is not None and old != key:
            drop(sql, [old])
        if old != key:
            # Checks ON validates the resulting rows, including writes made while the scratch
            # merge had checks disabled. A refusal goes through the restore's existing rollback.
            sql.run("SET FOREIGN_KEY_CHECKS=1; " + add_sql(key))


def main():
    from live_sync import Sql
    parser = argparse.ArgumentParser()
    parser.add_argument('op', choices=['prepare', 'drop-before', 'apply', 'drop-after', 'rollback', 'recover'])
    parser.add_argument('--plan', required=True)
    parser.add_argument('--live')
    parser.add_argument('--stage')
    parser.add_argument('--trash')
    parser.add_argument('--old-tables')
    parser.add_argument('--new-tables')
    args = parser.parse_args()
    if args.op == 'recover' and not Path(args.plan).exists():
        return
    sql = Sql(json.loads(os.environ['TRACY_SYNC_SQL']))
    try:
        if args.op == 'prepare':
            old_tables = set(Path(args.old_tables).read_text().splitlines())
            new_tables = set(Path(args.new_tables).read_text().splitlines())
            moved = old_tables | new_tables
            literal = lambda s: "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"
            if moved and sql.run("SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA="
                    + literal(args.live) + " AND TABLE_SCHEMA<>" + literal(args.live)
                    + " AND REFERENCED_TABLE_NAME IN (" + ','.join(literal(t) for t in moved) + ") LIMIT 1;"):
                raise ValueError("restore cannot replace a table referenced from another database")
            before = capture(sql, args.live)
            old = [k for k in before if k['table'] in moved or (k['parent_schema'] == args.live and k['parent'] in moved)]
            staged = capture(sql, args.stage)
            desired = [k for k in old if k['table'] not in moved]
            desired += [rebase(k, args.stage, args.live) for k in staged]
            # Atomic and durable before changing the live graph.
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', dir=Path(args.plan).parent, delete=False) as out:
                json.dump(dict(live=args.live, stage=args.stage, trash=args.trash, new_tables=sorted(new_tables), moved=sorted(moved), old=old, staged=staged, desired=desired), out)
                out.flush()
                os.fsync(out.fileno())
            os.replace(out.name, args.plan)
        else:
            plan = json.loads(Path(args.plan).read_text())
            if args.op == 'recover':
                # The trash database is created in the same SQL batch immediately before the
                # atomic rename. Its tables distinguish a finished swap from a pre-swap crash.
                trash = plan.get('trash')
                def tables(schema):
                    return {r[0] for r in sql.run("SELECT table_name FROM information_schema.tables WHERE table_schema='" + schema.replace("'", "''") + "';")}
                rolled_back = bool(trash and tables(trash.replace('_tracy_trash_', '_tracy_failed_')))
                swapped = not rolled_back and (bool(trash and tables(trash)) or
                    bool(set(plan.get('new_tables', [])) - tables(plan['stage'])))
                ensure(sql, plan['desired'] if swapped else plan['old'])
                Path(args.plan).unlink()
            elif args.op == 'drop-before':
                drop(sql, plan['old'] + plan['staged'])
            elif args.op == 'apply':
                ensure(sql, plan['desired'])
            elif args.op == 'rollback':
                ensure(sql, plan['old'])
            else:
                moved = set(plan['moved'])
                drop(sql, [k for k in capture(sql, plan['live']) if k['table'] in moved or
                    (k['parent_schema'] == plan['live'] and k['parent'] in moved)])
    finally:
        sql.close()


if __name__ == '__main__':
    main()
