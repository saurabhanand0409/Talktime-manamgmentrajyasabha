"""
Fix photo alignment and clear state/tenure data from parliament_seats table.

The original document has some seats WITHOUT photos (seats 2, 3, 4, 8, etc.)
But photos were imported sequentially, causing misalignment.

This script:
1. Clears photos from seats that shouldn't have them
2. Re-aligns photos based on the actual document structure
3. Clears all state and tenure_start values
"""

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

# Seats that DO NOT have photos in the original document
# Based on the Division List - these are typically reserved/vacant seats
SEATS_WITHOUT_PHOTOS = [2, 3, 4, 8]  # Add more if needed


def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None


def fix_database():
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print("="*70)
    print("FIXING DATABASE")
    print("="*70)
    
    # Step 1: Clear state, state_hindi, and tenure_start for ALL records
    print("\n[Step 1] Clearing state and tenure_start for all records...")
    cursor.execute("""
        UPDATE parliament_seats 
        SET state = NULL, 
            state_hindi = NULL, 
            tenure_start = NULL
    """)
    print(f"  Cleared state/tenure from {cursor.rowcount} records")
    
    # Step 2: Clear photos from seats that shouldn't have them
    print(f"\n[Step 2] Removing photos from seats: {SEATS_WITHOUT_PHOTOS}...")
    for seat_no in SEATS_WITHOUT_PHOTOS:
        cursor.execute("""
            UPDATE parliament_seats 
            SET picture = NULL 
            WHERE seat_no = %s
        """, (seat_no,))
        print(f"  Cleared photo from seat {seat_no}")
    
    # Step 3: Get current photo data to realign
    print("\n[Step 3] Re-aligning photos...")
    
    # Get all seats with photos, ordered by seat_no
    cursor.execute("""
        SELECT seat_no, picture 
        FROM parliament_seats 
        WHERE picture IS NOT NULL 
        ORDER BY seat_no
    """)
    seats_with_photos = cursor.fetchall()
    
    # Get all seat numbers that SHOULD have photos (excluding the empty ones)
    cursor.execute("SELECT seat_no FROM parliament_seats ORDER BY seat_no")
    all_seats = [row['seat_no'] for row in cursor.fetchall()]
    
    # Determine which seats should have photos
    seats_needing_photos = [s for s in all_seats if s not in SEATS_WITHOUT_PHOTOS]
    
    print(f"  Total seats: {len(all_seats)}")
    print(f"  Seats without photos: {len(SEATS_WITHOUT_PHOTOS)}")
    print(f"  Seats that should have photos: {len(seats_needing_photos)}")
    print(f"  Photos currently in DB: {len(seats_with_photos)}")
    
    # We need to shift photos - the photos are currently assigned wrongly
    # Photo 1 should go to Seat 1, Photo 2 should go to Seat 5 (not 2), etc.
    
    # First, extract all photos into a list
    photos = [row['picture'] for row in seats_with_photos if row['picture']]
    
    print(f"  Total photos to realign: {len(photos)}")
    
    # Clear all photos first
    cursor.execute("UPDATE parliament_seats SET picture = NULL")
    print("  Cleared all photos temporarily")
    
    # Now assign photos to correct seats
    photo_idx = 0
    reassigned = 0
    for seat_no in seats_needing_photos:
        if photo_idx < len(photos):
            cursor.execute("""
                UPDATE parliament_seats 
                SET picture = %s 
                WHERE seat_no = %s
            """, (photos[photo_idx], seat_no))
            reassigned += 1
            photo_idx += 1
    
    print(f"  Reassigned {reassigned} photos to correct seats")
    
    conn.commit()
    
    # Verify
    print("\n[Verification] Checking first 10 seats...")
    cursor.execute("""
        SELECT seat_no, name, 
               CASE WHEN picture IS NOT NULL THEN 'YES' ELSE 'NO' END as has_photo,
               state, tenure_start
        FROM parliament_seats 
        WHERE seat_no <= 10
        ORDER BY seat_no
    """)
    
    print(f"{'Seat':>5} | {'Name':40} | Photo | State | Tenure")
    print("-"*75)
    for row in cursor.fetchall():
        name = (row['name'] or '-')[:40]
        print(f"{row['seat_no']:5} | {name:40} | {row['has_photo']:5} | {row['state'] or '-':5} | {row['tenure_start'] or '-'}")
    
    conn.close()
    
    print("\n" + "="*70)
    print("DATABASE FIX COMPLETE!")
    print("="*70)


if __name__ == '__main__':
    fix_database()

