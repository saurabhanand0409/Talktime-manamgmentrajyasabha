"""
Import Parliament Members from .doc file using Windows COM

This script reads a .doc file containing the Rajya Sabha Division List
and imports member data (including photos) into the parliament_seats database.
"""

import os
import sys
import re
import tempfile
import time
import mysql.connector
from dotenv import load_dotenv

# Set console encoding for Hindi text
sys.stdout.reconfigure(encoding='utf-8')

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

# Path to the .doc file
DOC_PATH = os.path.join(os.path.dirname(__file__), '..', 'DIVISION LIST25 NOVEMBER 2025 - Copy - Copy.doc')


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
    return bool(re.search(r'[\u0900-\u097F]', text))


def is_mostly_hindi(text):
    """Check if text is mostly Hindi characters."""
    if not text:
        return False
    hindi_chars = len(re.findall(r'[\u0900-\u097F]', text))
    total_chars = len(text.replace(' ', ''))
    if total_chars == 0:
        return False
    return hindi_chars / total_chars > 0.5


def extract_hindi_and_english(text):
    """Split text into Hindi and English parts."""
    if not text:
        return '', ''
    
    lines = text.replace('\r', '\n').split('\n')
    
    hindi_parts = []
    english_parts = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        if is_mostly_hindi(line):
            hindi_parts.append(line)
        elif is_hindi(line):
            hindi_match = re.findall(r'[\u0900-\u097F\s\.]+', line)
            english_match = re.findall(r'[A-Za-z\s\.\']+', line)
            
            for h in hindi_match:
                h = h.strip()
                if h and len(h) > 2:
                    hindi_parts.append(h)
            for e in english_match:
                e = e.strip()
                if e and len(e) > 2 and not e.upper() in ['SHRI', 'SMT', 'DR', 'PROF', 'MR', 'MS', 'THE']:
                    english_parts.append(e)
        else:
            english_parts.append(line)
    
    hindi_name = ' '.join(hindi_parts).strip()
    english_name = ' '.join(english_parts).strip()
    
    skip_words = ['CABINET MINISTER', 'MINISTER', 'D.O.B', 'PRIME', 'PARLIAMENTARY', 
                  'AFFAIRS', 'LEADER', 'OPPOSITION', 'CHAIRMAN', 'DEPUTY', 'STATE']
    for word in skip_words:
        if word in english_name.upper():
            english_name = ''
            break
    
    return hindi_name, english_name


def clean_text(text):
    """Clean and normalize text."""
    if not text:
        return ''
    text = text.replace('\x07', '').replace('\r', '\n')
    text = ' '.join(text.split())
    return text.strip()


def extract_seat_number(text):
    """Extract numeric seat number from text."""
    if not text:
        return None
    match = re.search(r'^\s*(\d+)\s*$', str(text).strip())
    if match:
        return int(match.group(1))
    return None


def is_valid_party(text):
    """Check if text looks like a valid party abbreviation."""
    if not text:
        return False
    text = text.strip().upper()
    # Remove spaces for comparison
    text_no_space = text.replace(' ', '')
    
    known_parties = [
        # Major national parties
        'BJP', 'INC', 'AAP', 'BSP', 'SP', 'NCP',
        # Communist parties
        'CPI', 'CPI(M)', 'CPIM', 'CPM', 'CPI (M)', 'CPI(ML)',
        # Regional parties - South
        'DMK', 'AIADMK', 'ADMK', 'TDP', 'YSRCP', 'YSR', 'BRS', 'TRS', 'JD(S)', 'JDS',
        # Regional parties - East
        'AITC', 'TMC', 'BJD', 'JMM', 'JD(U)', 'JDU', 'RJD',
        # Regional parties - North/West
        'SAD', 'AGP', 'NPP', 'NPF', 'MNF', 'SKM', 'SDF',
        # Shiv Sena factions
        'SS', 'SHS', 'SS(UBT)', 'SHSUBT', 'SSUBT',
        # NCP factions  
        'NCP', 'NCP-SP', 'NCPSP', 'NCP(SP)', 'NCPAP', 'NCP-SCP',
        # J&K parties
        'JKNC', 'J&KNC', 'J&K NC', 'JKPDP',
        # Other parties
        'IUML', 'KC', 'KC(M)', 'KCM', 'RSP', 'RLP', 'RLD', 'RLTP',
        'MDMK', 'PMK', 'VCK', 'AIFB', 'MNM', 'RLM', 'RPI(A)', 'RPI (A)',
        'AJSUP', 'RLSP', 'HAM', 'JD', 'INLD', 'TMC(M)', 'UPP(L)',
        # Special categories
        'NOMINATED', 'NOM', 'IND', 'INDEPENDENT', 'VACANT'
    ]
    
    # Check exact match or without parentheses
    if text in known_parties or text_no_space in [p.replace(' ', '') for p in known_parties]:
        return True
    
    # Check if it's a short abbreviation (likely a party)
    if len(text) <= 10 and (text.replace('(', '').replace(')', '').replace('-', '').isalpha() or 
                            text.replace('(', '').replace(')', '').replace('-', '').replace(' ', '').isalnum()):
        return True
    
    return False


def normalize_party_name(party):
    """Normalize party name to standard format."""
    if not party:
        return ''
    
    party = party.strip().upper()
    
    # Normalize common variations
    party_map = {
        'CPIM': 'CPI(M)',
        'CPM': 'CPI(M)',
        'CPI (M)': 'CPI(M)',
        'JDU': 'JD(U)',
        'JDS': 'JD(S)',
        'ADMK': 'AIADMK',
        'TMC': 'AITC',
        'SHSUBT': 'SS(UBT)',
        'SSUBT': 'SS(UBT)',
        'NCPSP': 'NCP-SP',
        'NCP(SP)': 'NCP-SP',
        'KCM': 'KC(M)',
        'NOM': 'Nominated',
        'NOMINATED': 'Nominated',
        'IND': 'Independent',
        'INDEPENDENT': 'Independent',
        'J&KNC': 'JKNC',
        'J&K NC': 'JKNC',
    }
    
    return party_map.get(party, party)


def is_minister_position(name_cell, english_name, hindi_name):
    """
    Check if this row represents a Minister/official position that doesn't have a photo.
    These positions have generic titles instead of personal names.
    """
    combined = f"{name_cell} {english_name} {hindi_name}".upper()
    
    minister_keywords = [
        'MINISTER', 'PRIME MINISTER', 'CABINET MINISTER',
        'PARLIAMENTARY AFFAIRS', 'LEADER OF', 'CHAIRMAN', 'DEPUTY CHAIRMAN',
        'मंत्री', 'प्रधानमंत्री', 'कैबिनेट', 'संसदीय कार्य', 'सभापति'
    ]
    
    for keyword in minister_keywords:
        if keyword in combined:
            return True
    
    return False


def is_vacant_or_no_photo(name_cell, english_name, hindi_name, seat_no):
    """
    Check if this row should NOT have a photo assigned.
    Returns True if:
    - Name contains 'VACANT'
    - Seat is in the known list of seats without photos
    """
    combined = f"{name_cell} {english_name} {hindi_name}".upper()
    
    # Check for Vacant
    if 'VACANT' in combined or 'रिक्त' in combined or 'खाली' in combined:
        return True
    
    # Known seats without photos in the document (based on document analysis)
    # Found by analyzing InlineShapes in each row's photo column
    # Seats 2,3,4,8 are Minister positions
    # Seats 187, 220, 227, 246 have members but no photos in document
    SEATS_WITHOUT_PHOTOS = [2, 3, 4, 8, 187, 220, 227, 246]
    
    if seat_no in SEATS_WITHOUT_PHOTOS:
        return True
    
    return False


def extract_minister_title(name_cell):
    """
    For Minister positions, extract just the title (not a person's name).
    Returns (english_title, hindi_title)
    """
    text = clean_text(name_cell)
    
    # Common minister position mappings
    minister_titles = {
        'PRIME MINISTER': ('Prime Minister', 'प्रधानमंत्री'),
        'CABINET MINISTER': ('Cabinet Minister', 'कैबिनेट मंत्री'),
        'MINISTER OF PARLIAMENTARY AFFAIRS': ('Minister of Parliamentary Affairs', 'संसदीय कार्य मंत्री'),
        'PARLIAMENTARY AFFAIRS': ('Minister of Parliamentary Affairs', 'संसदीय कार्य मंत्री'),
    }
    
    text_upper = text.upper()
    
    for key, (eng, hin) in minister_titles.items():
        if key in text_upper:
            return eng, hin
    
    # Default: return generic minister title
    if 'MINISTER' in text_upper or 'मंत्री' in text:
        return 'Minister', 'मंत्री'
    
    return '', ''


def extract_images_from_doc(doc_path, temp_dir):
    """
    Extract all images from the .doc file by saving as HTML.
    Returns dict mapping approximate row number to image data.
    """
    import win32com.client
    
    print("Extracting images by converting to HTML...")
    
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    row_images = {}
    
    try:
        doc = word.Documents.Open(os.path.abspath(doc_path))
        time.sleep(1)
        
        # Save document as filtered HTML to extract images
        html_path = os.path.join(temp_dir, "doc_export.html")
        doc.SaveAs(html_path, FileFormat=10)  # wdFormatFilteredHTML = 10
        doc.Close(False)
        
        # Find extracted images
        files_dir = html_path.replace('.html', '_files')
        if os.path.exists(files_dir):
            image_files = sorted([f for f in os.listdir(files_dir) 
                                 if f.endswith(('.png', '.jpg', '.jpeg', '.gif'))])
            print(f"Found {len(image_files)} images in export")
            
            # Map images to approximate row numbers
            # Images are typically named image001.png, image002.png, etc.
            for idx, img_file in enumerate(image_files):
                img_path = os.path.join(files_dir, img_file)
                with open(img_path, 'rb') as f:
                    # Row index approximation (images appear roughly in order)
                    row_images[idx + 1] = f.read()
        
    except Exception as e:
        print(f"Error extracting images: {e}")
    finally:
        try:
            word.Quit()
        except:
            pass
    
    return row_images


def read_doc_file(doc_path, image_data=None):
    """
    Read .doc file using Windows COM automation.
    """
    import win32com.client
    
    print(f"Opening document for text extraction...")
    
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    members = []
    
    try:
        doc = word.Documents.Open(os.path.abspath(doc_path))
        time.sleep(1)
        
        print(f"Document opened. Tables found: {doc.Tables.Count}")
        
        member_index = 0  # Track which image goes with which member
        
        for table_idx in range(1, doc.Tables.Count + 1):
            table = doc.Tables(table_idx)
            rows_count = table.Rows.Count
            cols_count = table.Columns.Count
            
            print(f"\nProcessing Table {table_idx}: {rows_count} rows x {cols_count} columns")
            
            for row_idx in range(1, rows_count + 1):
                try:
                    cells_raw = []
                    for col_idx in range(1, min(cols_count + 1, 8)):
                        try:
                            cell = table.Cell(row_idx, col_idx)
                            cell_text = cell.Range.Text.replace('\x07', '')
                            cells_raw.append(cell_text)
                        except:
                            cells_raw.append('')
                    
                    # Find seat number
                    seat_no = None
                    for i in range(min(2, len(cells_raw))):
                        seat_no = extract_seat_number(cells_raw[i])
                        if seat_no:
                            break
                    
                    if not seat_no:
                        continue
                    
                    # Extract name
                    name_cell = cells_raw[2] if len(cells_raw) > 2 else ''
                    
                    # First check if this is a Minister position
                    is_minister = is_minister_position(name_cell, '', '')
                    
                    if is_minister:
                        # For Minister positions, use the title only (not person names)
                        english_name, hindi_name = extract_minister_title(name_cell)
                        party = '-'
                    else:
                        # Normal member - extract names
                        hindi_name, english_name = extract_hindi_and_english(name_cell)
                        
                        # Extract party
                        party = ''
                        if len(cells_raw) > 3:
                            party_cell = clean_text(cells_raw[3])
                            if is_valid_party(party_cell):
                                party = normalize_party_name(party_cell)
                        if not party and len(cells_raw) > 4:
                            party_cell = clean_text(cells_raw[4])
                            if is_valid_party(party_cell):
                                party = normalize_party_name(party_cell)
                    
                    # Check if this seat should NOT have a photo
                    is_vacant = is_vacant_or_no_photo(name_cell, english_name, hindi_name, seat_no)
                    skip_photo = is_minister or is_vacant
                    
                    # Get associated image (if available)
                    # IMPORTANT: Only increment image index for rows that HAVE photos
                    # Minister positions and Vacant seats don't have photos in the document
                    picture_data = None
                    if image_data and not skip_photo:
                        member_index += 1
                        picture_data = image_data.get(member_index)
                    
                    if seat_no and (hindi_name or english_name or is_minister):
                        members.append({
                            'seat_no': seat_no,
                            'name': english_name,
                            'name_hindi': hindi_name,
                            'party': party,
                            'picture': picture_data,
                            'is_minister': is_minister,
                            'is_vacant': is_vacant
                        })
                    
                except Exception as e:
                    continue
        
        doc.Close(False)
        
    except Exception as e:
        print(f"Error reading document: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            word.Quit()
        except:
            pass
    
    return members


def import_to_database(members):
    """Import members into the database - OVERWRITES existing data completely."""
    if not members:
        print("No members to import.")
        return 0, 0, 0
    
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database.")
        return 0, 0, 0
    
    cursor = conn.cursor(dictionary=True)
    
    inserted = 0
    updated = 0
    photos_added = 0
    
    for member in members:
        seat_no = member['seat_no']
        name = member['name'] or ''
        name_hindi = member['name_hindi'] or ''
        party = member['party'] or ''
        picture = member.get('picture')
        is_minister = member.get('is_minister', False)
        is_vacant = member.get('is_vacant', False)
        
        # For Minister positions: clear photo and set party to '-'
        if is_minister:
            picture = None
            party = '-'
        
        # For Vacant/no-photo seats: clear photo
        if is_vacant:
            picture = None
        
        cursor.execute("SELECT * FROM parliament_seats WHERE seat_no = %s", (seat_no,))
        existing = cursor.fetchone()
        
        if existing:
            # OVERWRITE all data completely (don't preserve old values)
            cursor.execute("""
                UPDATE parliament_seats 
                SET name = %s,
                    name_hindi = %s,
                    party = %s,
                    party_hindi = %s,
                    picture = %s,
                    state = NULL,
                    state_hindi = NULL,
                    tenure_start = NULL
                WHERE seat_no = %s
            """, (name, name_hindi, party, '-' if is_minister else '', picture, seat_no))
            updated += 1
            if picture:
                photos_added += 1
        else:
            cursor.execute("""
                INSERT INTO parliament_seats (seat_no, name, name_hindi, party, party_hindi, picture, state, state_hindi, tenure_start)
                VALUES (%s, %s, %s, %s, %s, %s, NULL, NULL, NULL)
            """, (seat_no, name, name_hindi, party, '-' if is_minister else '', picture))
            inserted += 1
            if picture:
                photos_added += 1
    
    conn.commit()
    conn.close()
    
    return inserted, updated, photos_added


def main():
    if not os.path.exists(DOC_PATH):
        print(f"Error: File not found: {DOC_PATH}")
        sys.exit(1)
    
    print("="*80)
    print("RAJYA SABHA MEMBER IMPORT TOOL (WITH PHOTOS)")
    print("="*80)
    
    # Create temp directory
    temp_dir = tempfile.mkdtemp()
    
    try:
        # First: Extract images by saving as HTML
        print("\nStep 1: Extracting images from document...")
        image_data = extract_images_from_doc(DOC_PATH, temp_dir)
        print(f"Extracted {len(image_data)} images")
        
        time.sleep(2)  # Give Word time to fully close
        
        # Second: Read text data
        print("\nStep 2: Reading member data...")
        members = read_doc_file(DOC_PATH, image_data)
        
        print(f"\nExtracted {len(members)} members from document.")
        
        # Count photos
        photos_count = sum(1 for m in members if m.get('picture'))
        print(f"Members with photos: {photos_count}")
        
        if members:
            print("\n" + "="*80)
            print("PREVIEW (first 15 members):")
            print("="*80)
            print(f"{'Seat':>5} | {'English Name':35} | {'Hindi Name':22} | Party | Photo")
            print("-"*90)
            for m in members[:15]:
                eng = (m['name'] or '-')[:35]
                hin = (m['name_hindi'] or '-')[:22]
                has_photo = '✓' if m.get('picture') else '-'
                print(f"{m['seat_no']:5} | {eng:35} | {hin:22} | {m['party']:5} | {has_photo}")
            print("-"*90)
            
            print("\nStep 3: Importing to database...")
            inserted, updated, photos_added = import_to_database(members)
            
            print(f"\n{'='*80}")
            print(f"IMPORT COMPLETE!")
            print(f"  New records inserted: {inserted}")
            print(f"  Existing records updated: {updated}")
            print(f"  Photos added/updated: {photos_added}")
            print(f"  Total processed: {len(members)}")
            print(f"{'='*80}")
        else:
            print("No members found to import.")
            
    finally:
        # Clean up temp directory
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except:
            pass


if __name__ == '__main__':
    main()
