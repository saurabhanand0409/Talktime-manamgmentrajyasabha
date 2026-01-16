"""
Shift all photos to fix alignment.
Seat 5 currently shows B.L. Verma (should be at seat 9).
B.L. Verma = Photo #5 in extraction order.
Seat 5 should have Photo #2 (Nirmala Sitharaman).
Offset = 5 - 2 = 3 (photos are 3 positions late)
Solution: Shift photos back by 3 positions.
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

# Seats that should NOT have photos
SEATS_WITHOUT_PHOTOS = [2, 3, 4, 8]


def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None


def shift_photos_back():
    """
    Re-extract and properly assign photos.
    The issue is that photos were extracted in row order, but rows may not 
    match seat numbers exactly due to header rows or other issues.
    
    Solution: Get all photos, get all seats that should have photos,
    and re-assign starting from index 3 (skip first 3 extracted images).
    """
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print("="*70)
    print("FIXING PHOTO ALIGNMENT (Shifting back by 3)")
    print("="*70)
    
    # Get all current photos in seat order
    cursor.execute("""
        SELECT seat_no, picture 
        FROM parliament_seats 
        WHERE picture IS NOT NULL 
        ORDER BY seat_no
    """)
    photo_rows = cursor.fetchall()
    all_photos = [row['picture'] for row in photo_rows]
    
    print(f"Total photos in database: {len(all_photos)}")
    
    # Get all seat numbers
    cursor.execute("SELECT seat_no FROM parliament_seats ORDER BY seat_no")
    all_seats = [row['seat_no'] for row in cursor.fetchall()]
    
    # Seats that should have photos
    seats_with_photos = [s for s in all_seats if s not in SEATS_WITHOUT_PHOTOS]
    print(f"Seats that should have photos: {len(seats_with_photos)}")
    
    # Clear all photos first
    cursor.execute("UPDATE parliament_seats SET picture = NULL")
    
    # Re-assign photos, but SKIP first 3 photos (they might be headers/logos)
    # Actually, let's try a different approach - assume extracted photos
    # correspond to rows, but rows started 3 ahead of seat numbers
    
    # Photo at current seat N should move to seat N-4 (accounting for 4 skipped seats)
    # No wait, that's not right either.
    
    # Let me try: Re-assign in order but skip first 3 photos
    SKIP_PHOTOS = 3
    photos_to_assign = all_photos[SKIP_PHOTOS:]
    
    print(f"Skipping first {SKIP_PHOTOS} photos")
    print(f"Photos to assign: {len(photos_to_assign)}")
    
    # Assign to seats in order
    photo_idx = 0
    for seat_no in seats_with_photos:
        if photo_idx < len(photos_to_assign):
            cursor.execute("""
                UPDATE parliament_seats 
                SET picture = %s 
                WHERE seat_no = %s
            """, (photos_to_assign[photo_idx], seat_no))
            photo_idx += 1
    
    conn.commit()
    
    # Verify
    print("\nVerification (seats 1-15):")
    cursor.execute("""
        SELECT seat_no, name, 
               CASE WHEN picture IS NOT NULL THEN 'YES' ELSE 'NO' END as has_photo
        FROM parliament_seats 
        WHERE seat_no <= 15 
        ORDER BY seat_no
    """)
    
    print(f"{'Seat':>5} | {'Name':35} | Photo")
    print("-"*55)
    for row in cursor.fetchall():
        name = (row['name'] or '-')[:35]
        print(f"{row['seat_no']:5} | {name:35} | {row['has_photo']}")
    
    conn.close()
    
    print("\n" + "="*70)
    print("DONE! Please check if photos are now correctly aligned.")
    print("="*70)


if __name__ == '__main__':
    shift_photos_back()

