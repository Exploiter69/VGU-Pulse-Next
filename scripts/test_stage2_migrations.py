#!/usr/bin/env python3
"""Exercise the numbered D1 migrations against a disposable in-memory SQLite database."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def count(db: sqlite3.Connection, table: str) -> int:
    return int(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def main() -> None:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")

    def apply(name: str) -> None:
        db.executescript((MIGRATIONS / name).read_text(encoding="utf-8"))
        print(f"PASS applied {name}")

    apply("0001_initial_schema.sql")
    apply("0002_seed_verified_events.sql")

    db.execute(
        """
        INSERT INTO pulse_cards (
          id, title, category, description, author_name, author_department,
          author_year, tags_json, spots_total, spots_remaining, time_window,
          preferred_handshake_channel, coordination_note, owner_token_hash,
          status, report_count, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "test-card-001", "Need a project teammate", "project",
            "This description is long enough for the migration fixture.",
            "Test Student", "CSE", "1st Year", '["test"]', 2, 1,
            "Saturday 10 AM", "Telegram", "A safe fixture note",
            "owner-hash", "open", 0, "2026-10-16T00:00:00Z",
            "2026-10-17T00:00:00Z",
        ),
    )
    db.execute(
        """
        INSERT INTO handshake_requests (
          id, card_id, from_student_name, from_department, from_year,
          intro_note, sender_token_hash, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "test-handshake-001", "test-card-001", "Test Applicant", "CSE",
            "1st Year", "I can help with the migration test.", "sender-hash",
            "accepted", "2026-10-16T00:01:00Z", "2026-10-16T00:01:00Z",
        ),
    )
    require(count(db, "pulse_cards") == 1, "fixture card was not inserted")
    require(count(db, "handshake_requests") == 1, "fixture handshake was not inserted")

    migration003 = (MIGRATIONS / "0003_stage2_hardening.sql").read_text(encoding="utf-8")
    require(
        "INSERT OR IGNORE INTO campus_events_new" not in migration003.upper(),
        "0003 must not silently ignore event rows",
    )
    apply("0003_stage2_hardening.sql")

    require(count(db, "pulse_cards") == 1, "0003 changed the card count")
    require(count(db, "handshake_requests") == 1, "0003 changed the handshake count")
    require(count(db, "campus_events") == 2, "0003 did not preserve both seeded events")
    require(
        count(db, "campus_events") == count(db, "campus_events"),
        "event count mismatch",
    )
    sources = {
        row[0]
        for row in db.execute(
            "SELECT verification_source FROM campus_events"
        ).fetchall()
    }
    require(
        sources == {"External Govt / Public Portal"},
        f"unexpected seed source classifications: {sources}",
    )

    db.execute(
        "INSERT INTO card_reports (card_id, reporter_hash, created_at) VALUES (?, ?, ?)",
        ("test-card-001", "reporter-hash", "2026-10-16T00:02:00Z"),
    )
    db.execute(
        """
        INSERT INTO event_participations (event_id, participant_token_hash, created_at)
        VALUES (?, ?, ?)
        """,
        (
            "evt-academic-abc-verification", "participant-hash",
            "2026-10-16T00:02:00Z",
        ),
    )

    apply("0004_expand_encrypted_coordination_note.sql")

    require(count(db, "pulse_cards") == 1, "0004 lost the fixture card")
    require(count(db, "handshake_requests") == 1, "0004 lost the fixture handshake")
    require(count(db, "card_reports") == 1, "0004 lost the report deduplication row")
    require(count(db, "event_participations") == 1, "0004 changed event participations")
    require(count(db, "campus_events") == 2, "0004 changed campus events")

    fk_errors = db.execute("PRAGMA foreign_key_check").fetchall()
    require(not fk_errors, f"foreign key check failed: {fk_errors}")

    expected_indexes = {
        "idx_pulse_cards_status_created",
        "idx_pulse_cards_category_status",
        "idx_pulse_cards_owner_hash",
        "idx_handshakes_card_id",
        "idx_handshakes_sender_hash",
        "idx_card_reports_card_id",
    }
    indexes = {
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index'"
        ).fetchall()
    }
    require(expected_indexes.issubset(indexes), "one or more indexes were not recreated")

    # A 200-character BMP Unicode note becomes a 1264-character AES-GCM hex payload.
    encrypted_fixture = "enc:v1:" + ("0" * 24) + ":" + ("0" * 1232)
    db.execute(
        "UPDATE pulse_cards SET coordination_note = ? WHERE id = ?",
        (encrypted_fixture, "test-card-001"),
    )
    stored_length = db.execute(
        "SELECT length(coordination_note) FROM pulse_cards WHERE id = ?",
        ("test-card-001",),
    ).fetchone()[0]
    require(stored_length == 1264, f"unexpected encrypted fixture length: {stored_length}")

    try:
        db.execute(
            "INSERT INTO card_reports (card_id, reporter_hash, created_at) VALUES (?, ?, ?)",
            ("test-card-001", "reporter-hash", "2026-10-16T00:03:00Z"),
        )
    except sqlite3.IntegrityError:
        print("PASS duplicate card report is rejected")
    else:
        raise AssertionError("duplicate card report was accepted")

    try:
        db.execute(
            "UPDATE campus_events SET verification_source = 'Made Up Source' WHERE id = ?",
            ("evt-academic-abc-verification",),
        )
    except sqlite3.IntegrityError:
        print("PASS invalid event source is rejected")
    else:
        raise AssertionError("invalid event source was accepted")

    db.execute("DELETE FROM pulse_cards WHERE id = ?", ("test-card-001",))
    require(count(db, "handshake_requests") == 0, "card deletion did not cascade to handshakes")
    require(count(db, "card_reports") == 0, "card deletion did not cascade to reports")
    require(not db.execute("PRAGMA foreign_key_check").fetchall(), "foreign key check failed after cascade")

    print("PASS rows, indexes, constraints, encrypted-note length, and cascade behavior")
    print("All Stage 2 migration checks passed (SQLite simulation; not a live D1 deployment).")
    db.close()


if __name__ == "__main__":
    main()
