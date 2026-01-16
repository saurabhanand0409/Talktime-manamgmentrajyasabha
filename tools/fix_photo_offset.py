"""
Fix photo offset - the extracted images may have header/logo images at the start.
This shifts all photos by a specified offset to correct alignment.
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

# Number of images to skip at the start (header/logo images)
SKIP_FIRST_N_IMAGES = 0


def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None


def analyze_current_state():
    """Analyze current photo assignments."""
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print("="*70)
    print("CURRENT PHOTO STATE (seats 1-20)")
    print("="*70)
    
    cursor.execute("""
        SELECT seat_no, name, name_hindi,
               CASE WHEN picture IS NOT NULL THEN 'HAS PHOTO' ELSE '-' END as photo_status
        FROM parliament_seats 
        WHERE seat_no <= 20
        ORDER BY seat_no
    """)
    
    print(f"{'Seat':>5} | {'Name':35} | Photo")
    print("-"*60)
    for row in cursor.fetchall():
        name = (row['name'] or '-')[:35]
        print(f"{row['seat_no']:5} | {name:35} | {row['photo_status']}")
    
    # Count photos
    cursor.execute("SELECT COUNT(*) as cnt FROM parliament_seats WHERE picture IS NOT NULL")
    total_photos = cursor.fetchone()['cnt']
    
    cursor.execute("SELECT COUNT(*) as cnt FROM parliament_seats")
    total_seats = cursor.fetchone()['cnt']
    
    print(f"\nTotal seats: {total_seats}")
    print(f"Total photos: {total_photos}")
    
    conn.close()


def shift_photos(offset=1):
    """
    Shift all photos by the given offset.
    If offset=1, photo that was at seat 5 moves to seat 6, etc.
    If offset=-1, photo at seat 6 moves to seat 5, etc.
    """
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print(f"\n{'='*70}")
    print(f"SHIFTING PHOTOS BY {offset}")
    print("="*70)
    
    # Get all current photos with their seat numbers
    cursor.execute("""
        SELECT seat_no, picture 
        FROM parliament_seats 
        WHERE picture IS NOT NULL 
        ORDER BY seat_no
    """)
    photos = cursor.fetchall()
    
    print(f"Found {len(photos)} photos to shift")
    
    # Clear all photos
    cursor.execute("UPDATE parliament_seats SET picture = NULL")
    
    # Re-assign with offset
    for photo_data in photos:
        old_seat = photo_data['seat_no']
        new_seat = old_seat + offset
        
        # Skip if new seat would be invalid or should not have photo
        if new_seat < 1 or new_seat in SEATS_WITHOUT_PHOTOS:
            continue
        
        cursor.execute("""
            UPDATE parliament_seats 
            SET picture = %s 
            WHERE seat_no = %s
        """, (photo_data['picture'], new_seat))
    
    conn.commit()
    
    # Clear photos from seats that shouldn't have them
    for seat_no in SEATS_WITHOUT_PHOTOS:
        cursor.execute("UPDATE parliament_seats SET picture = NULL WHERE seat_no = %s", (seat_no,))
    
    conn.commit()
    
    print("Photo shift complete!")
    
    conn.close()


def reassign_from_scratch():
    """Re-assign photos from scratch based on proper seat mapping."""
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print(f"\n{'='*70}")
    print("RE-ASSIGNING PHOTOS FROM SCRATCH")
    print("="*70)
    
    # Get all photos
    cursor.execute("""
        SELECT seat_no, picture 
        FROM parliament_seats 
        WHERE picture IS NOT NULL 
        ORDER BY seat_no
    """)
    all_photos = [row['picture'] for row in cursor.fetchall()]
    
    print(f"Total photos available: {len(all_photos)}")
    print(f"Skipping first {SKIP_FIRST_N_IMAGES} images (headers/logos)")
    
    # Skip first N images if configured
    photos_to_use = all_photos[SKIP_FIRST_N_IMAGES:]
    print(f"Photos to assign: {len(photos_to_use)}")
    
    # Clear all photos
    cursor.execute("UPDATE parliament_seats SET picture = NULL")
    
    # Get all seats in order
    cursor.execute("SELECT seat_no FROM parliament_seats ORDER BY seat_no")
    all_seats = [row['seat_no'] for row in cursor.fetchall()]
    
    # Assign photos, skipping seats that shouldn't have them
    photo_idx = 0
    assigned = 0
    
    for seat_no in all_seats:
        if seat_no in SEATS_WITHOUT_PHOTOS:
            continue
        
        if photo_idx < len(photos_to_use):
            cursor.execute("""
                UPDATE parliament_seats 
                SET picture = %s 
                WHERE seat_no = %s
            """, (photos_to_use[photo_idx], seat_no))
            assigned += 1
            photo_idx += 1
    
    conn.commit()
    
    print(f"Assigned {assigned} photos to seats")
    
    conn.close()


if __name__ == '__main__':
    # First, show current state
    analyze_current_state()
    
    # Ask what to do
    print("\n" + "="*70)
    print("OPTIONS:")
    print("  1. Shift all photos by +1 (move each photo to next seat)")
    print("  2. Shift all photos by -1 (move each photo to previous seat)")
    print("  3. Re-assign from scratch (skip first N images)")
    print("  4. Just analyze (no changes)")
    print("="*70)
    
    choice = input("\nEnter choice (1-4): ").strip()
    
    if choice == '1':
        shift_photos(offset=1)
        analyze_current_state()
    elif choice == '2':
        shift_photos(offset=-1)
        analyze_current_state()
    elif choice == '3':
        skip = input("How many images to skip at start? (default 0): ").strip()
        SKIP_FIRST_N_IMAGES = int(skip) if skip else 0
        reassign_from_scratch()
        analyze_current_state()
    else:
        print("No changes made.")

