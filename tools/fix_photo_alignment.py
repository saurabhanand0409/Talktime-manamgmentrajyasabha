"""
Fix photo alignment in parliament_seats database.

The photos were extracted sequentially but some seats don't have photos.
This script identifies seats without photos based on naming patterns
(like "Minister", "Prime Minister", etc.) and re-aligns photos accordingly.
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

# Keywords that indicate a seat should NOT have a photo
# These are typically reserved/official position seats
NO_PHOTO_KEYWORDS = [
    'PRIME MINISTER', 'CABINET MINISTER', 'MINISTER OF', 
    'PARLIAMENTARY AFFAIRS', 'प्रधानमंत्री', 'मंत्री',
    'LEADER OF', 'DEPUTY CHAIRMAN', 'CHAIRMAN'
]


def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None


def should_have_no_photo(name, name_hindi):
    """Check if a seat should NOT have a photo based on name."""
    if not name and not name_hindi:
        return True
    
    combined = f"{name or ''} {name_hindi or ''}".upper()
    
    for keyword in NO_PHOTO_KEYWORDS:
        if keyword.upper() in combined:
            return True
    
    return False


def fix_photo_alignment():
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print("="*70)
    print("ANALYZING PHOTO ALIGNMENT")
    print("="*70)
    
    # Get all seats ordered by seat_no
    cursor.execute("""
        SELECT seat_no, name, name_hindi, picture IS NOT NULL as has_photo
        FROM parliament_seats 
        ORDER BY seat_no
    """)
    all_seats = cursor.fetchall()
    
    # Identify seats that should NOT have photos
    seats_without_photos = []
    for seat in all_seats:
        if should_have_no_photo(seat['name'], seat['name_hindi']):
            seats_without_photos.append(seat['seat_no'])
    
    print(f"\nSeats that should NOT have photos (Minister/Official positions):")
    print(f"  {seats_without_photos}")
    print(f"  Total: {len(seats_without_photos)} seats")
    
    # Also check if name contains specific Minister-related text and set party to '-'
    print("\n[Step 1] Setting party='-' for Minister entries...")
    cursor.execute("""
        UPDATE parliament_seats 
        SET party = '-', party_hindi = '-'
        WHERE UPPER(name) LIKE '%MINISTER%' 
           OR UPPER(name) LIKE '%PRIME%'
           OR UPPER(name_hindi) LIKE '%मंत्री%'
           OR UPPER(name_hindi) LIKE '%प्रधानमंत्री%'
    """)
    print(f"  Updated {cursor.rowcount} records with party='-'")
    
    # Now fix photo alignment
    print("\n[Step 2] Re-aligning photos...")
    
    # Get all photos currently in DB
    cursor.execute("""
        SELECT seat_no, picture 
        FROM parliament_seats 
        WHERE picture IS NOT NULL 
        ORDER BY seat_no
    """)
    photos_data = cursor.fetchall()
    
    # Extract just the photo binary data
    all_photos = [row['picture'] for row in photos_data]
    print(f"  Total photos in database: {len(all_photos)}")
    
    # Clear all photos first
    cursor.execute("UPDATE parliament_seats SET picture = NULL")
    print("  Cleared all photos")
    
    # Get list of seats that SHOULD have photos
    seats_needing_photos = [s['seat_no'] for s in all_seats if s['seat_no'] not in seats_without_photos]
    print(f"  Seats that should have photos: {len(seats_needing_photos)}")
    
    # Assign photos to correct seats
    photo_idx = 0
    assigned = 0
    for seat_no in seats_needing_photos:
        if photo_idx < len(all_photos):
            cursor.execute("""
                UPDATE parliament_seats 
                SET picture = %s 
                WHERE seat_no = %s
            """, (all_photos[photo_idx], seat_no))
            assigned += 1
            photo_idx += 1
    
    print(f"  Assigned {assigned} photos")
    
    # Clear photos from seats that shouldn't have them
    for seat_no in seats_without_photos:
        cursor.execute("""
            UPDATE parliament_seats 
            SET picture = NULL 
            WHERE seat_no = %s
        """, (seat_no,))
    
    conn.commit()
    
    # Verification
    print("\n[Verification] Checking seats 1-15...")
    cursor.execute("""
        SELECT seat_no, name, 
               CASE WHEN picture IS NOT NULL THEN 'YES' ELSE 'NO' END as has_photo,
               party
        FROM parliament_seats 
        WHERE seat_no <= 15
        ORDER BY seat_no
    """)
    
    print(f"{'Seat':>5} | {'Name':40} | Photo | Party")
    print("-"*70)
    for row in cursor.fetchall():
        name = (row['name'] or '-')[:40]
        print(f"{row['seat_no']:5} | {name:40} | {row['has_photo']:5} | {row['party'] or '-'}")
    
    conn.close()
    
    print("\n" + "="*70)
    print("PHOTO ALIGNMENT COMPLETE!")
    print("="*70)


if __name__ == '__main__':
    fix_photo_alignment()

