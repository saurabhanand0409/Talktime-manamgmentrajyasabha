"""
Import Parliament Members from Word Document (.docx)

This script reads a Word document containing member details in table format
and imports them into the parliament_seats database.

Expected table format (based on Rajya Sabha list):
| Seat No | Seat No | Hindi Name | Party | Photo | ... |
|---------|---------|------------|-------|-------|-----|
| 130     | 130     | श्री देरेक ओब्राईन | AITC | [img] | ... |
|         |         | SHRI DEREK O' BRIEN |      |       |     |

Usage:
    python import_members_from_doc.py <path_to_docx_file>
"""

import sys
import os
import re
import mysql.connector
from dotenv import load_dotenv

# Try to import python-docx
try:
    from docx import Document
except ImportError:
    print("ERROR: python-docx is not installed.")
    print("Please install it with: pip install python-docx")
    sys.exit(1)

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'dashboard_db'),
    'charset': 'utf8mb4'
}


def get_db_connection():
    """Create database connection."""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None


def is_hindi(text):
    """Check if text contains Hindi (Devanagari) characters."""
    if not text:
        return False
    # Devanagari Unicode range: U+0900 to U+097F
    return bool(re.search(r'[\u0900-\u097F]', text))


def clean_name(name):
    """Clean and normalize name string."""
    if not name:
        return ''
    # Remove extra whitespace
    name = ' '.join(name.split())
    # Remove common prefixes for standardization (optional)
    # name = re.sub(r'^(SHRI|SMT\.?|DR\.?|PROF\.?)\s+', '', name, flags=re.IGNORECASE)
    return name.strip()


def extract_seat_number(text):
    """Extract numeric seat number from text."""
    if not text:
        return None
    # Find first number in the text
    match = re.search(r'\d+', str(text))
    if match:
        return int(match.group())
    return None


def parse_docx_table(doc_path):
    """
    Parse Word document and extract member data from tables.
    
    Returns list of dicts: [{seat_no, name, name_hindi, party}, ...]
    """
    print(f"Reading document: {doc_path}")
    
    try:
        doc = Document(doc_path)
    except Exception as e:
        print(f"Error reading document: {e}")
        return []
    
    members = []
    
    # Process all tables in the document
    for table_idx, table in enumerate(doc.tables):
        print(f"\nProcessing table {table_idx + 1} ({len(table.rows)} rows)...")
        
        current_member = {}
        
        for row_idx, row in enumerate(table.rows):
            cells = [cell.text.strip() for cell in row.cells]
            
            # Skip empty rows
            if not any(cells):
                continue
            
            # Debug: Print row content
            # print(f"  Row {row_idx}: {cells[:5]}")  # First 5 cells
            
            # Try to identify seat number (usually in first or second column)
            seat_no = None
            for i, cell in enumerate(cells[:3]):  # Check first 3 columns
                seat_no = extract_seat_number(cell)
                if seat_no:
                    break
            
            if seat_no:
                # This is likely a new member row
                if current_member and current_member.get('seat_no'):
                    members.append(current_member)
                
                current_member = {
                    'seat_no': seat_no,
                    'name': '',
                    'name_hindi': '',
                    'party': ''
                }
                
                # Look for Hindi name, English name, and party in the row
                for cell in cells:
                    cell = cell.strip()
                    if not cell or cell.isdigit():
                        continue
                    
                    if is_hindi(cell):
                        # This is Hindi name
                        if not current_member['name_hindi']:
                            current_member['name_hindi'] = clean_name(cell)
                    elif len(cell) <= 10 and cell.isupper() and not ' ' in cell:
                        # Short uppercase text is likely party abbreviation
                        if not current_member['party']:
                            current_member['party'] = cell
                    elif cell.isupper() or cell.istitle():
                        # This might be English name
                        if not current_member['name'] and len(cell) > 3:
                            current_member['name'] = clean_name(cell)
            
            else:
                # This might be a continuation row (English name below Hindi name)
                if current_member:
                    for cell in cells:
                        cell = cell.strip()
                        if not cell:
                            continue
                        
                        # Check if this is an English name (continuation)
                        if not is_hindi(cell) and (cell.isupper() or cell.istitle()):
                            if not current_member['name'] and len(cell) > 3:
                                current_member['name'] = clean_name(cell)
                        
                        # Check for party if not already set
                        if len(cell) <= 10 and cell.isupper() and not ' ' in cell:
                            if not current_member['party']:
                                current_member['party'] = cell
        
        # Don't forget the last member
        if current_member and current_member.get('seat_no'):
            members.append(current_member)
    
    return members


def import_to_database(members, dry_run=True):
    """
    Import members into the database.
    
    If dry_run=True, only shows what would be done without making changes.
    """
    if not members:
        print("No members to import.")
        return
    
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database.")
        return
    
    cursor = conn.cursor(dictionary=True)
    
    # Check if table exists, create if not
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parliament_seats (
            seat_no INT PRIMARY KEY,
            name VARCHAR(255),
            name_hindi VARCHAR(255),
            party VARCHAR(100),
            party_hindi VARCHAR(100),
            state VARCHAR(100),
            state_hindi VARCHAR(100),
            tenure_start DATE,
            picture LONGBLOB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    """)
    
    inserted = 0
    updated = 0
    skipped = 0
    
    print(f"\n{'='*60}")
    print(f"{'DRY RUN - No changes will be made' if dry_run else 'IMPORTING TO DATABASE'}")
    print(f"{'='*60}\n")
    
    for member in members:
        seat_no = member['seat_no']
        name = member['name']
        name_hindi = member['name_hindi']
        party = member['party']
        
        # Check if seat already exists
        cursor.execute("SELECT * FROM parliament_seats WHERE seat_no = %s", (seat_no,))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing record
            changes = []
            if name and name != existing.get('name'):
                changes.append(f"name: '{existing.get('name')}' -> '{name}'")
            if name_hindi and name_hindi != existing.get('name_hindi'):
                changes.append(f"name_hindi: '{existing.get('name_hindi')}' -> '{name_hindi}'")
            if party and party != existing.get('party'):
                changes.append(f"party: '{existing.get('party')}' -> '{party}'")
            
            if changes:
                print(f"UPDATE Seat {seat_no}: {', '.join(changes)}")
                if not dry_run:
                    cursor.execute("""
                        UPDATE parliament_seats 
                        SET name = COALESCE(%s, name),
                            name_hindi = COALESCE(%s, name_hindi),
                            party = COALESCE(%s, party)
                        WHERE seat_no = %s
                    """, (name or None, name_hindi or None, party or None, seat_no))
                updated += 1
            else:
                print(f"SKIP Seat {seat_no}: No changes needed")
                skipped += 1
        else:
            # Insert new record
            print(f"INSERT Seat {seat_no}: {name} / {name_hindi} [{party}]")
            if not dry_run:
                cursor.execute("""
                    INSERT INTO parliament_seats (seat_no, name, name_hindi, party)
                    VALUES (%s, %s, %s, %s)
                """, (seat_no, name, name_hindi, party))
            inserted += 1
    
    if not dry_run:
        conn.commit()
    
    print(f"\n{'='*60}")
    print(f"Summary: {inserted} inserted, {updated} updated, {skipped} skipped")
    if dry_run:
        print("This was a DRY RUN. Run with --apply to make changes.")
    print(f"{'='*60}")
    
    conn.close()


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_members_from_doc.py <path_to_docx_file> [--apply]")
        print("\nOptions:")
        print("  --apply    Actually import data (without this, runs in dry-run mode)")
        print("\nExample:")
        print("  python import_members_from_doc.py rajya_sabha_members.docx")
        print("  python import_members_from_doc.py rajya_sabha_members.docx --apply")
        sys.exit(1)
    
    doc_path = sys.argv[1]
    dry_run = '--apply' not in sys.argv
    
    if not os.path.exists(doc_path):
        print(f"Error: File not found: {doc_path}")
        sys.exit(1)
    
    if not doc_path.lower().endswith('.docx'):
        print("Warning: This script works best with .docx files.")
        print("If you have a .doc file, please convert it to .docx first.")
        print("(Open in Word and Save As .docx)")
    
    # Parse document
    members = parse_docx_table(doc_path)
    
    print(f"\nFound {len(members)} members in document.")
    
    if members:
        # Show preview
        print("\nPreview of first 5 members:")
        print("-" * 60)
        for m in members[:5]:
            print(f"  Seat {m['seat_no']}: {m['name']} / {m['name_hindi']} [{m['party']}]")
        print("-" * 60)
        
        # Import to database
        import_to_database(members, dry_run=dry_run)


if __name__ == '__main__':
    main()

