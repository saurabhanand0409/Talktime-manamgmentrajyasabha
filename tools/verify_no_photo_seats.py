"""Verify seats that should NOT have photos."""

import os
import sys
import mysql.connector
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'dashboard_db'),
    'charset': 'utf8mb4'
}

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor()

# Seats that should NOT have photos
NO_PHOTO_SEATS = [2, 3, 4, 8, 187, 220, 227, 246]

print("="*70)
print("VERIFICATION: Seats that should NOT have photos")
print("="*70)

cursor.execute("""
    SELECT seat_no, name, party,
           CASE WHEN picture IS NOT NULL THEN 'HAS PHOTO!' ELSE 'NO PHOTO' END as photo_status
    FROM parliament_seats 
    WHERE seat_no IN (%s)
    ORDER BY seat_no
""" % ','.join(str(s) for s in NO_PHOTO_SEATS))

print(f"{'Seat':>5} | {'Name':35} | {'Party':6} | Status")
print("-"*70)
for row in cursor.fetchall():
    name = (row[1] or '-')[:35]
    status = row[3]
    # Mark errors
    marker = " ❌" if "HAS PHOTO" in status else " ✓"
    print(f"{row[0]:5} | {name:35} | {row[2] or '-':6} | {status}{marker}")

# Count total photos
cursor.execute("SELECT COUNT(*) FROM parliament_seats WHERE picture IS NOT NULL")
photo_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM parliament_seats")
total = cursor.fetchone()[0]

print(f"\n{'='*70}")
print(f"Total seats: {total}")
print(f"Seats with photos: {photo_count}")
print(f"Seats without photos: {total - photo_count}")
print("="*70)

conn.close()

