"""Verify photo alignment for specific seats."""

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

print("="*80)
print("VERIFICATION: Photo and Name Alignment")
print("="*80)

# Check specific ranges
ranges = [(1, 20), (50, 60), (100, 110), (200, 210), (240, 250)]

for start, end in ranges:
    print(f"\nSeats {start}-{end}:")
    print("-"*80)
    
    cursor.execute("""
        SELECT seat_no, name, name_hindi, party,
               CASE WHEN picture IS NOT NULL THEN 'YES' ELSE 'NO' END as has_photo
        FROM parliament_seats 
        WHERE seat_no BETWEEN %s AND %s
        ORDER BY seat_no
    """, (start, end))
    
    for row in cursor.fetchall():
        name = (row[1] or '-')[:25]
        name_h = (row[2] or '-')[:20]
        party = (row[3] or '-')[:6]
        print(f"Seat {row[0]:3}: {name:25} | {name_h:20} | {party:6} | Photo: {row[4]}")

# Count total photos
cursor.execute("SELECT COUNT(*) FROM parliament_seats WHERE picture IS NOT NULL")
photo_count = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM parliament_seats")
total = cursor.fetchone()[0]

print(f"\n{'='*80}")
print(f"Total seats: {total}")
print(f"Seats with photos: {photo_count}")
print(f"Seats without photos: {total - photo_count}")
print("="*80)

conn.close()

