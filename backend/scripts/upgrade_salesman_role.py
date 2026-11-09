"""One-time SQLite user-role migration for Build 12.

Run after stopping FastAPI, from backend/:\n
    .\\.venv\\Scripts\\python.exe scripts\\upgrade_salesman_role.py

This creates a timestamped backup and preserves existing user IDs. It never
creates demo accounts; those are seeded by normal application startup.
"""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote


def db_path() -> Path:
    url = os.getenv("DATABASE_URL", "sqlite:///./dukaanflow.db")
    if not url.startswith("sqlite:///:") and not url.startswith("sqlite:///"):
        raise RuntimeError("Only a local SQLite database is supported")
    # sqlite:///./dukaanflow.db -> ./dukaanflow.db
    path = unquote(url[len("sqlite:///"):].split("?", 1)[0])
    if not path or path == ":memory:":
        raise RuntimeError("Expected a file-backed SQLite database")
    return Path(path).resolve()


def migrate(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"Database not found: {path}")

    with sqlite3.connect(path, timeout=5.0) as db:
        definition = db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
        ).fetchone()

        if not definition or not definition[0]:
            raise RuntimeError("Expected existing users table")

        if "'salesman'" in definition[0]:
            return "Already upgraded"

        original_roles = db.execute(
            "SELECT DISTINCT role FROM users ORDER BY role"
        ).fetchall()
        if any(role not in {"retailer", "order_desk"} for (role,) in original_roles):
            raise RuntimeError("Unexpected role in users table")

        expected_columns = {"id", "phone", "name", "role", "is_active"}
        columns = {row[1] for row in db.execute("PRAGMA table_info(users)")}
        if columns != expected_columns:
            raise RuntimeError(f"Unexpected users columns: {sorted(columns)}")

        # The migration needs the server stopped so the backup is consistent.
        # Keep database backups OUTSIDE the public Git repository.
        backup_dir = Path.home() / "dukaanflow-db-backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / (
            f"{path.stem}.pre-salesman-"
            f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.db.bak"
        )
        with sqlite3.connect(backup) as target:
            db.backup(target)

        # SQLite cannot directly replace a table-level CHECK constraint.
        # Rebuild only users, preserving IDs and the unique phone index.
        db.execute("PRAGMA foreign_keys=OFF")
        try:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""
                CREATE TABLE users_salesman_upgrade (
                    id INTEGER NOT NULL PRIMARY KEY,
                    phone VARCHAR(15) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    is_active BOOLEAN NOT NULL,
                    CONSTRAINT valid_user_role CHECK (
                        role IN ('retailer', 'order_desk', 'salesman')
                    )
                )
            """)
            db.execute("""
                INSERT INTO users_salesman_upgrade
                    (id, phone, name, role, is_active)
                SELECT id, phone, name, role, is_active FROM users
            """)
            db.execute("DROP TABLE users")
            db.execute("ALTER TABLE users_salesman_upgrade RENAME TO users")
            db.execute("CREATE UNIQUE INDEX ix_users_phone ON users (phone)")

            issues = db.execute("PRAGMA foreign_key_check").fetchall()
            if issues:
                raise RuntimeError(f"Foreign key validation failed: {issues[:3]}")

            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.execute("PRAGMA foreign_keys=ON")

        return f"Upgraded; backup: {backup}"


if __name__ == "__main__":
    try:
        print(migrate(db_path()))
    except (RuntimeError, FileNotFoundError, sqlite3.Error) as error:
        raise SystemExit(f"STOP: {error}") from error
