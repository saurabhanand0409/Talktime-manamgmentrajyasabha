"""
Fix party Hindi translations in the database.
Also auto-translate any missing Hindi names.
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

# Correct Party Hindi translations
PARTY_HINDI_MAP = {
    # Major national parties
    'BJP': 'भाजपा',
    'INC': 'कांग्रेस',
    'AAP': 'आम आदमी पार्टी',
    'BSP': 'बहुजन समाज पार्टी',
    'SP': 'समाजवादी पार्टी',
    'NCP': 'राष्ट्रवादी कांग्रेस पार्टी',
    'NCP-SP': 'राकांपा (शरद पवार)',
    'NCPSP': 'राकांपा (शरद पवार)',
    
    # Communist parties
    'CPI': 'भाकपा',
    'CPI(M)': 'माकपा',
    'CPIM': 'माकपा',
    'CPM': 'माकपा',
    
    # South Indian parties
    'DMK': 'द्रमुक',
    'AIADMK': 'अन्नाद्रमुक',
    'ADMK': 'अन्नाद्रमुक',
    'TDP': 'तेलुगु देशम पार्टी',
    'YSRCP': 'वाईएसआर कांग्रेस',
    'BRS': 'भारत राष्ट्र समिति',
    'TRS': 'तेलंगाना राष्ट्र समिति',
    'JD(S)': 'जद(एस)',
    'JDS': 'जद(एस)',
    
    # East Indian parties
    'AITC': 'तृणमूल कांग्रेस',
    'TMC': 'तृणमूल कांग्रेस',
    'BJD': 'बीजू जनता दल',
    'JMM': 'झारखंड मुक्ति मोर्चा',
    'JD(U)': 'जनता दल (यूनाइटेड)',
    'JDU': 'जनता दल (यूनाइटेड)',
    'RJD': 'राष्ट्रीय जनता दल',
    
    # Shiv Sena factions
    'SS': 'शिवसेना',
    'SHS': 'शिवसेना',
    'SS(UBT)': 'शिवसेना (उद्धव बालासाहेब ठाकरे)',
    'SHSUBT': 'शिवसेना (उद्धव बालासाहेब ठाकरे)',
    
    # North/West parties
    'SAD': 'शिरोमणि अकाली दल',
    'AGP': 'असम गण परिषद',
    'NPP': 'नेशनल पीपल्स पार्टी',
    'NPF': 'नागा पीपल्स फ्रंट',
    'MNF': 'मिज़ो नेशनल फ्रंट',
    'SKM': 'सिक्किम क्रांतिकारी मोर्चा',
    'SDF': 'सिक्किम डेमोक्रेटिक फ्रंट',
    
    # Other regional parties
    'IUML': 'इंडियन यूनियन मुस्लिम लीग',
    'JKNC': 'जम्मू कश्मीर नेशनल कॉन्फ्रेंस',
    'J&KNC': 'जम्मू कश्मीर नेशनल कॉन्फ्रेंस',
    'J&K NC': 'जम्मू कश्मीर नेशनल कॉन्फ्रेंस',
    'KC(M)': 'केरल कांग्रेस (एम)',
    'KCM': 'केरल कांग्रेस (एम)',
    'RSP': 'रिवोल्यूशनरी सोशलिस्ट पार्टी',
    'RLP': 'राष्ट्रीय लोकतांत्रिक पार्टी',
    'RLD': 'राष्ट्रीय लोक दल',
    'RLTP': 'राष्ट्रीय लोकतांत्रिक पार्टी',
    'MDMK': 'मरुमलर्ची द्रविड़ मुनेत्र कड़गम',
    'PMK': 'पट्टाली मक्कल काची',
    'VCK': 'विदुथलाई चिरुथैकल काची',
    'MNM': 'मक्कल नीति मय्यम',
    'RLM': 'आरएलएम',
    
    # Special categories
    'NOMINATED': 'मनोनीत',
    'NOM': 'मनोनीत',
    'Nominated': 'मनोनीत',
    'INDEPENDENT': 'निर्दलीय',
    'IND': 'निर्दलीय',
    'Independent': 'निर्दलीय',
    'VACANT': 'रिक्त',
    'Vacant': 'रिक्त',
    '': '-',
    '-': '-',
    'OTHER': 'अन्य',
}


def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        print(f"Database connection error: {err}")
        return None


def translate_to_hindi(text):
    """Translate English text to Hindi using Google Translate."""
    if not text or text == '-':
        return '-'
    
    try:
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source='en', target='hi')
        result = translator.translate(text)
        return result if result else text
    except Exception as e:
        print(f"  Translation error for '{text}': {e}")
        return text


def fix_database():
    conn = get_db_connection()
    if not conn:
        return
    
    cursor = conn.cursor(dictionary=True)
    
    print("="*70)
    print("FIXING PARTY HINDI & AUTO-TRANSLATING NAMES")
    print("="*70)
    
    # Step 1: Fix party_hindi for all records
    print("\n[Step 1] Fixing party Hindi translations...")
    
    cursor.execute("SELECT DISTINCT party FROM parliament_seats WHERE party IS NOT NULL AND party != ''")
    parties = [row['party'] for row in cursor.fetchall()]
    
    for party in parties:
        party_upper = party.upper().strip()
        hindi = PARTY_HINDI_MAP.get(party_upper, None)
        
        if hindi:
            cursor.execute("""
                UPDATE parliament_seats 
                SET party_hindi = %s 
                WHERE UPPER(party) = %s
            """, (hindi, party_upper))
            print(f"  {party} -> {hindi} ({cursor.rowcount} records)")
        else:
            # Translate if not in map
            hindi = translate_to_hindi(party)
            cursor.execute("""
                UPDATE parliament_seats 
                SET party_hindi = %s 
                WHERE UPPER(party) = %s
            """, (hindi, party_upper))
            print(f"  {party} -> {hindi} (translated, {cursor.rowcount} records)")
    
    # Set party_hindi to '-' for empty parties
    cursor.execute("""
        UPDATE parliament_seats 
        SET party_hindi = '-' 
        WHERE party IS NULL OR party = ''
    """)
    print(f"  Empty parties set to '-': {cursor.rowcount} records")
    
    # Step 2: Auto-translate missing Hindi names
    print("\n[Step 2] Auto-translating missing Hindi names...")
    
    cursor.execute("""
        SELECT seat_no, name, name_hindi 
        FROM parliament_seats 
        WHERE name IS NOT NULL AND name != '' 
        AND (name_hindi IS NULL OR name_hindi = '' OR name_hindi = name)
    """)
    
    missing_hindi = cursor.fetchall()
    print(f"  Found {len(missing_hindi)} records with missing/same Hindi names")
    
    translated_count = 0
    for row in missing_hindi:
        seat_no = row['seat_no']
        name = row['name']
        
        # Translate name to Hindi
        hindi_name = translate_to_hindi(name)
        
        if hindi_name and hindi_name != name:
            cursor.execute("""
                UPDATE parliament_seats 
                SET name_hindi = %s 
                WHERE seat_no = %s
            """, (hindi_name, seat_no))
            translated_count += 1
            if translated_count <= 10:
                print(f"  Seat {seat_no}: {name} -> {hindi_name}")
    
    if translated_count > 10:
        print(f"  ... and {translated_count - 10} more")
    
    print(f"  Total translated: {translated_count}")
    
    conn.commit()
    
    # Verification
    print("\n[Verification] Sample records:")
    cursor.execute("""
        SELECT seat_no, name, name_hindi, party, party_hindi 
        FROM parliament_seats 
        WHERE seat_no <= 10 
        ORDER BY seat_no
    """)
    
    print(f"{'Seat':>5} | {'Name':30} | {'Party':8} | {'Party Hindi'}")
    print("-"*70)
    for row in cursor.fetchall():
        name = (row['name'] or '-')[:30]
        print(f"{row['seat_no']:5} | {name:30} | {row['party'] or '-':8} | {row['party_hindi'] or '-'}")
    
    conn.close()
    
    print("\n" + "="*70)
    print("FIX COMPLETE!")
    print("="*70)


if __name__ == '__main__':
    fix_database()

