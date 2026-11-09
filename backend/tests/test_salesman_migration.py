"""The one-time SQLite upgrade must preserve existing users and order references."""

import sqlite3

import pytest

from scripts.upgrade_salesman_role import migrate


def create_old_db(path):
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("""
            CREATE TABLE users (
                id INTEGER NOT NULL PRIMARY KEY,
                phone VARCHAR(15) NOT NULL,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(20) NOT NULL,
                is_active BOOLEAN NOT NULL,
                CONSTRAINT valid_user_role CHECK (
                    role IN ('retailer', 'order_desk')
                )
            )
        """)
        db.execute("CREATE UNIQUE INDEX ix_users_phone ON users (phone)")
        db.execute("""
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY,
                retailer_id INTEGER NOT NULL REFERENCES users(id)
            )
        """)
        db.execute("""
            INSERT INTO users (id, phone, name, role, is_active)
            VALUES (17, '9000000001', 'Original Shop', 'retailer', 1)
        """)
        db.execute("INSERT INTO orders (id, retailer_id) VALUES (9, 17)")
        db.commit()


def test_migration_keeps_accounts_orders_and_adds_role(tmp_path, monkeypatch):
    monkeypatch.setattr("scripts.upgrade_salesman_role.Path.home", lambda: tmp_path)
    path = tmp_path / "existing.db"
    create_old_db(path)

    result = migrate(path)
    assert "Upgraded" in result
    assert len(list((tmp_path / "dukaanflow-db-backups").glob("existing.pre-salesman-*.db.bak"))) == 1

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        assert db.execute("SELECT id, name, role FROM users").fetchone() == (
            17, "Original Shop", "retailer"
        )
        assert db.execute("SELECT retailer_id FROM orders").fetchone() == (17,)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []

        db.execute("""
            INSERT INTO users (phone, name, role, is_active)
            VALUES ('9000000005', 'Demo Salesman', 'salesman', 1)
        """)
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("""
                INSERT INTO users (phone, name, role, is_active)
                VALUES ('9000000001', 'Duplicate', 'retailer', 1)
            """)


def test_migration_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr("scripts.upgrade_salesman_role.Path.home", lambda: tmp_path)
    path = tmp_path / "existing.db"
    create_old_db(path)
    migrate(path)
    assert migrate(path) == "Already upgraded"


def test_missing_db_is_not_created(tmp_path):
    with pytest.raises(FileNotFoundError):
        migrate(tmp_path / "missing.db")
    assert not (tmp_path / "missing.db").exists()
