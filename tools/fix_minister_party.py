"""Fix party value for Minister positions."""

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

# Set party='-' for Minister positions
cursor.execute("""
    UPDATE parliament_seats 
    SET party = '-', party_hindi = '-' 
    WHERE seat_no IN (2, 3, 4, 8)
""")

print(f"Updated {cursor.rowcount} rows to have party='-'")
conn.commit()

# Clear photos from these seats
cursor.execute("""
    UPDATE parliament_seats 
    SET picture = NULL 
    WHERE seat_no IN (2, 3, 4, 8)
""")
print(f"Cleared photos from {cursor.rowcount} Minister seats")
conn.commit()

# Verify
print("\nVerification (seats 1-10):")
cursor.execute("""
    SELECT seat_no, name, party, 
           CASE WHEN picture IS NOT NULL THEN 'YES' ELSE 'NO' END as has_photo
    FROM parliament_seats 
    WHERE seat_no <= 10 
    ORDER BY seat_no
""")

print(f"{'Seat':>5} | {'Name':35} | {'Party':6} | Photo")
print("-"*60)
for row in cursor.fetchall():
    name = (row[1] or '-')[:35]
    print(f"{row[0]:5} | {name:35} | {row[2] or '-':6} | {row[3]}")

conn.close()
print("\nDone!")

