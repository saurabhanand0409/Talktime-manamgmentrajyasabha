"""
Analyze the document to find ALL seats that don't have photos.
This script checks each row for photo presence.
"""

import os
import sys
import time
import win32com.client

sys.stdout.reconfigure(encoding='utf-8')

DOC_PATH = os.path.join(os.path.dirname(__file__), '..', 'DIVISION LIST25 NOVEMBER 2025 - Copy - Copy.doc')


def find_seats_without_photos():
    """Find all seats that don't have photos in the document."""
    
    print("Opening document to analyze photo cells...")
    
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    
    seats_without_photos = []
    seats_with_photos = []
    
    try:
        doc = word.Documents.Open(os.path.abspath(DOC_PATH))
        time.sleep(1)
        
        print(f"Document opened. Tables found: {doc.Tables.Count}")
        
        for table_idx in range(1, doc.Tables.Count + 1):
            table = doc.Tables(table_idx)
            rows_count = table.Rows.Count
            cols_count = table.Columns.Count
            
            print(f"\nAnalyzing Table {table_idx}: {rows_count} rows x {cols_count} columns")
            
            for row_idx in range(1, rows_count + 1):
                try:
                    # Get seat number from first columns
                    seat_no = None
                    for col_idx in range(1, min(3, cols_count + 1)):
                        try:
                            cell = table.Cell(row_idx, col_idx)
                            cell_text = cell.Range.Text.replace('\x07', '').strip()
                            if cell_text.isdigit():
                                seat_no = int(cell_text)
                                break
                        except:
                            pass
                    
                    if not seat_no:
                        continue
                    
                    # Check if photo column (usually column 4 or 5) has an image
                    has_photo = False
                    
                    # Check columns 4 and 5 for inline shapes (images)
                    for col_idx in [4, 5]:
                        try:
                            cell = table.Cell(row_idx, col_idx)
                            # Check for inline shapes (images)
                            if cell.Range.InlineShapes.Count > 0:
                                has_photo = True
                                break
                        except:
                            pass
                    
                    if has_photo:
                        seats_with_photos.append(seat_no)
                    else:
                        seats_without_photos.append(seat_no)
                        
                except Exception as e:
                    continue
        
        doc.Close(False)
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            word.Quit()
        except:
            pass
    
    return sorted(seats_without_photos), sorted(seats_with_photos)


if __name__ == '__main__':
    print("="*70)
    print("FINDING SEATS WITHOUT PHOTOS")
    print("="*70)
    
    no_photos, with_photos = find_seats_without_photos()
    
    print(f"\n{'='*70}")
    print(f"RESULTS:")
    print(f"{'='*70}")
    print(f"\nSeats WITHOUT photos ({len(no_photos)} total):")
    print(no_photos)
    
    print(f"\nSeats WITH photos: {len(with_photos)} total")
    
    print(f"\n{'='*70}")
    print("Copy this list to import_from_doc_win.py:")
    print(f"SEATS_WITHOUT_PHOTOS = {no_photos}")
    print("="*70)

