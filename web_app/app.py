"""
Parliament Talk Time Management System - Web Version
Flask Backend with WebSocket support
"""

import os
import socket
import threading
import logging
from datetime import datetime, timezone, timedelta
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import mysql.connector
from dotenv import load_dotenv

# IST Timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    """Get current datetime in IST timezone"""
    return datetime.now(IST)

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Flask app setup
app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'parliament-secret-key-2024')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Shared broadcast feed state for remote broadcast viewers
broadcast_state = {
    'is_active': False,
    'mode': 'Idle',
    'payload': {},
    'updated_at': datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S')
}

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'dashboard_db'),
}

# UDP Receiver for seat signals
class UDPReceiver:
    def __init__(self, host='127.0.0.1', port=65432):
        self.host = host
        self.port = port
        self.sock = None
        self.running = False
        self.thread = None
    
    def start(self):
        """Start the UDP receiver thread."""
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._listen, daemon=True)
        self.thread.start()
        logger.info(f"UDP Receiver started on {self.host}:{self.port}")
    
    def stop(self):
        """Stop the UDP receiver."""
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
        logger.info("UDP Receiver stopped")
    
    def _listen(self):
        """Listen for incoming UDP messages."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.settimeout(1.0)  # 1 second timeout to allow clean shutdown
            self.sock.bind((self.host, self.port))
            
            while self.running:
                try:
                    data, addr = self.sock.recvfrom(1024)
                    seat_no = data.decode().strip()
                    logger.info(f"Received seat signal: {seat_no}")
                    # Emit to all connected clients
                    socketio.emit('seat_selected', {'seat_no': seat_no})
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        logger.error(f"UDP receive error: {e}")
        except Exception as e:
            logger.error(f"UDP socket error: {e}")
        finally:
            if self.sock:
                self.sock.close()

# Global UDP receiver instance
udp_receiver = UDPReceiver()

# Hindi Translation Setup
try:
    from deep_translator import GoogleTranslator
    hindi_translator = GoogleTranslator(source='en', target='hi')
    TRANSLATION_AVAILABLE = True
    logger.info("Hindi translation enabled using deep-translator")
except ImportError:
    logger.warning("deep-translator not installed. Hindi translation disabled.")
    TRANSLATION_AVAILABLE = False

# Static Hindi translations for common terms
HINDI_STATES = {
    'Andhra Pradesh': 'आंध्र प्रदेश', 'Arunachal Pradesh': 'अरुणाचल प्रदेश',
    'Assam': 'असम', 'Bihar': 'बिहार', 'Chhattisgarh': 'छत्तीसगढ़',
    'Delhi': 'दिल्ली', 'Goa': 'गोवा', 'Gujarat': 'गुजरात',
    'Haryana': 'हरियाणा', 'Himachal Pradesh': 'हिमाचल प्रदेश',
    'Jharkhand': 'झारखंड', 'Karnataka': 'कर्नाटक', 'Kerala': 'केरल',
    'Madhya Pradesh': 'मध्य प्रदेश', 'Maharashtra': 'महाराष्ट्र',
    'Manipur': 'मणिपुर', 'Meghalaya': 'मेघालय', 'Mizoram': 'मिज़ोरम',
    'Nagaland': 'नागालैंड', 'Odisha': 'ओडिशा', 'Punjab': 'पंजाब',
    'Rajasthan': 'राजस्थान', 'Sikkim': 'सिक्किम', 'Tamil Nadu': 'तमिलनाडु',
    'Telangana': 'तेलंगाना', 'Tripura': 'त्रिपुरा', 'Uttar Pradesh': 'उत्तर प्रदेश',
    'UP': 'उत्तर प्रदेश', 'Uttarakhand': 'उत्तराखंड', 'West Bengal': 'पश्चिम बंगाल',
    'WB': 'पश्चिम बंगाल', 'Jammu & Kashmir': 'जम्मू और कश्मीर',
    'Ladakh': 'लद्दाख', 'Puducherry': 'पुडुचेरी', 'Nominated': 'मनोनीत',
    'Maharastra': 'महाराष्ट्र'
}

HINDI_PARTIES = {
    'BJP': 'भाजपा', 'INC': 'कांग्रेस', 'Congress': 'कांग्रेस',
    'AAP': 'आम आदमी पार्टी', 'TMC': 'तृणमूल कांग्रेस', 'AITC': 'तृणमूल कांग्रेस',
    'DMK': 'द्रमुक', 'AIADMK': 'अन्नाद्रमुक', 'ADMK': 'अन्नाद्रमुक',
    'NCP': 'राष्ट्रवादी कांग्रेस पार्टी', 'NCPSP': 'राकांपा (शरद पवार)',
    'NCP-SP': 'राष्ट्रवादी कांग्रेस (शरद पवार)', 'SS(UBT)': 'शिवसेना (उद्धव)',
    'SS': 'शिवसेना', 'SHS': 'शिवसेना', 'SHSUBT': 'शिवसेना (उद्धव)',
    'JD(U)': 'जदयू', 'JDU': 'जदयू', 'RJD': 'राजद', 'SP': 'समाजवादी पार्टी',
    'BSP': 'बहुजन समाज पार्टी', 'TDP': 'तेदेपा', 'YSRCP': 'वाईएसआर कांग्रेस',
    'BJD': 'बीजद', 'CPIM': 'माकपा', 'CPM': 'माकपा',
    'CPI': 'भाकपा', 'TRS': 'तेरास', 'BRS': 'भारत राष्ट्र समिति', 'JMM': 'झामुमो',
    'SAD': 'अकाली दल', 'NOMINATED': 'मनोनीत', 'NOM': 'मनोनीत',
    'IND': 'निर्दलीय', 'Independent': 'निर्दलीय',
    'IUML': 'मुस्लिम लीग', 'JKNC': 'नेशनल कांफ्रेंस',
    'AGP': 'असम गण परिषद', 'NPF': 'नागा पीपुल्स फ्रंट', 'NPP': 'नेशनल पीपुल्स पार्टी',
    'RSP': 'आरएसपी', 'RLP': 'राष्ट्रीय लोकतांत्रिक पार्टी',
    'PMK': 'पीएमके', 'VCK': 'विदुथलाई चिरुथैगल काची', 'MDMK': 'एमडीएमके',
    'SDF': 'सिक्किम डेमोक्रेटिक फ्रंट', 'SKM': 'सिक्किम क्रांतिकारी मोर्चा',
    'VACANT': 'रिक्त', 'Vacant': 'रिक्त', '-': '-', '': '-', 'Other': 'अन्य'
}

def migrate_chairperson_positions():
    """Migrate old position names to new naming convention."""
    connection = get_db_connection()
    if not connection:
        return
    
    try:
        cursor = connection.cursor()
        # Update position names
        updates = [
            ("UPDATE chairpersons SET position = 'Chairman' WHERE position = 'Chairperson'", ),
            ("UPDATE chairpersons SET position = 'Deputy Chairman' WHERE position IN ('Vice-Chairperson', 'Vice Chairperson', 'Deputy-Chairman')", ),
            ("UPDATE chairpersons SET position = 'In The Chair' WHERE position = 'Co-Chairperson'", ),
        ]
        
        for sql in updates:
            cursor.execute(sql[0])
        
        connection.commit()
        logger.info("Chairperson positions migrated to new naming convention")
    except mysql.connector.Error as err:
        logger.warning(f"Position migration (may already be done): {err}")
    finally:
        connection.close()

def translate_to_hindi(text, translation_type='name'):
    """Translate text to Hindi using deep-translator or static mapping."""
    if not text:
        return ''
    
    # Check static mappings first
    if translation_type == 'state' and text in HINDI_STATES:
        return HINDI_STATES[text]
    if translation_type == 'party' and text in HINDI_PARTIES:
        return HINDI_PARTIES[text]
    
    # Use Google Translate for names
    if TRANSLATION_AVAILABLE:
        try:
            result = hindi_translator.translate(text)
            return result
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return text
    return text

# Database helper functions
def get_db_connection():
    """Create and return a database connection."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG, connection_timeout=5)
        return connection
    except mysql.connector.Error as err:
        logger.error(f"Database connection error: {err}")
        return None

def get_member_by_seat(seat_no):
    """Get member details by seat number with Hindi translation."""
    connection = get_db_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor(dictionary=True)
        query = """
            SELECT seat_no, name, party, state, tenure_start, picture,
                   name_hindi, party_hindi, state_hindi
            FROM parliament_seats
            WHERE seat_no = %s
        """
        cursor.execute(query, (seat_no,))
        result = cursor.fetchone()
        
        if result:
            # Convert binary picture to base64 for web display
            if result.get('picture'):
                import base64
                result['picture'] = base64.b64encode(result['picture']).decode('utf-8')
            
            # Auto-translate if Hindi fields are empty or whitespace
            name_hindi = result.get('name_hindi')
            party_hindi = result.get('party_hindi')
            state_hindi = result.get('state_hindi')
            
            # Check for None, empty string, or whitespace-only strings
            if (not name_hindi or str(name_hindi).strip() == '') and result.get('name'):
                name_hindi = translate_to_hindi(result['name'], 'name')
            if (not party_hindi or str(party_hindi).strip() == '') and result.get('party'):
                party_hindi = translate_to_hindi(result['party'], 'party')
            if (not state_hindi or str(state_hindi).strip() == '') and result.get('state'):
                state_hindi = translate_to_hindi(result['state'], 'state')
            
            result['name_hindi'] = name_hindi
            result['party_hindi'] = party_hindi
            result['state_hindi'] = state_hindi
            
            # Cache translations in database
            if name_hindi or party_hindi or state_hindi:
                try:
                    update_query = """
                        UPDATE parliament_seats 
                        SET name_hindi = %s, party_hindi = %s, state_hindi = %s
                        WHERE seat_no = %s AND (
                            name_hindi IS NULL OR name_hindi = '' OR 
                            party_hindi IS NULL OR party_hindi = '' OR 
                            state_hindi IS NULL OR state_hindi = ''
                        )
                    """
                    cursor.execute(update_query, (name_hindi, party_hindi, state_hindi, seat_no))
                    connection.commit()
                except:
                    pass  # Ignore caching errors
        
        return result
    except mysql.connector.Error as err:
        logger.error(f"Database query error: {err}")
        return None
    finally:
        connection.close()

def get_chairpersons():
    """Get list of chairpersons from the chairpersons table with photos from parliament_seats."""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Ensure picture column exists in chairpersons table
        try:
            cursor.execute("ALTER TABLE chairpersons ADD COLUMN picture LONGBLOB")
            connection.commit()
            logger.info("Added picture column to chairpersons table")
        except:
            pass  # Column already exists
        
        # Try new chairpersons table first, join with parliament_seats for photos
        try:
            cursor.execute("""
                SELECT c.id, c.position, c.name, c.picture as chair_picture, ps.picture as mp_picture
                FROM chairpersons c
                LEFT JOIN parliament_seats ps ON LOWER(TRIM(c.name)) = LOWER(TRIM(ps.name))
                ORDER BY 
                    CASE c.position 
                        WHEN 'Chairman' THEN 1 
                        WHEN 'Chairperson' THEN 1 
                        WHEN 'Deputy Chairman' THEN 2 
                        WHEN 'Deputy-Chairman' THEN 2 
                        WHEN 'Vice-Chairperson' THEN 2 
                        WHEN 'Vice Chairperson' THEN 2 
                        ELSE 3 
                    END, 
                    c.name
            """)
            results = cursor.fetchall()
            
            # Convert pictures to base64 and prefer chair_picture over mp_picture
            import base64
            for result in results:
                picture = result.get('chair_picture') or result.get('mp_picture')
                if picture:
                    result['picture'] = base64.b64encode(picture).decode('utf-8')
                else:
                    result['picture'] = None
                # Clean up intermediate fields
                if 'chair_picture' in result:
                    del result['chair_picture']
                if 'mp_picture' in result:
                    del result['mp_picture']
            
            return results
        except Exception as e:
            logger.error(f"Error fetching chairpersons with photos: {e}")
            # Fallback to old on_the_chair table
            cursor.execute("SELECT position, name FROM on_the_chair")
            return cursor.fetchall()
    except mysql.connector.Error as err:
        logger.error(f"Database query error: {err}")
        return []
    finally:
        connection.close()

def get_running_bills():
    """Get list of running bills."""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM bill_details WHERE status = 'Running'")
        return cursor.fetchall()
    except mysql.connector.Error as err:
        logger.error(f"Database query error: {err}")
        return []
    finally:
        connection.close()

def get_all_members():
    """Get all parliament members."""
    connection = get_db_connection()
    if not connection:
        return []
    
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT seat_no, name, party, state, tenure_start FROM parliament_seats ORDER BY seat_no")
        return cursor.fetchall()
    except mysql.connector.Error as err:
        logger.error(f"Database query error: {err}")
        return []
    finally:
        connection.close()

# Flask Routes
@app.route('/')
def index():
    """Main dashboard page."""
    return render_template('index.html')

@app.route('/zero-hour')
def zero_hour():
    """Zero Hour page."""
    return render_template('zero_hour.html')

@app.route('/member-speaking')
def member_speaking():
    """Member Speaking page."""
    return render_template('member_speaking.html')

@app.route('/bill-discussions')
def bill_discussions():
    """Bill Discussions page."""
    return render_template('bill_discussions.html')

# API Routes
@app.route('/api/member/<seat_no>')
def api_get_member(seat_no):
    """API endpoint to get member details."""
    member = get_member_by_seat(seat_no)
    if member:
        return jsonify({'success': True, 'data': member})
    return jsonify({'success': False, 'error': 'Member not found'}), 404

@app.route('/api/chairpersons')
def api_get_chairpersons():
    """API endpoint to get chairpersons list."""
    chairpersons = get_chairpersons()
    return jsonify({'success': True, 'data': chairpersons})

@app.route('/api/bills/running')
def api_get_running_bills():
    """API endpoint to get running bills."""
    bills = get_running_bills()
    return jsonify({'success': True, 'data': bills})

@app.route('/api/members')
def api_get_all_members():
    """API endpoint to get all members."""
    members = get_all_members()
    return jsonify({'success': True, 'data': members})

@app.route('/api/bills', methods=['POST'])
def api_add_bill():
    """API endpoint to add a new bill."""
    data = request.get_json()
    bill_name = data.get('bill_name', '').strip()
    tabled_date = data.get('tabled_date', get_ist_now().strftime('%Y-%m-%d'))
    
    if not bill_name:
        return jsonify({'success': False, 'error': 'Bill name is required'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        query = "INSERT INTO bill_details (tabled_date, bill_name, status) VALUES (%s, %s, %s)"
        cursor.execute(query, (tabled_date, bill_name, 'Running'))
        connection.commit()
        return jsonify({'success': True, 'message': 'Bill added successfully'})
    except mysql.connector.Error as err:
        # If columns are missing (e.g., allotted_seconds/spoken_seconds), try to add them once and retry insert
        if isinstance(err, mysql.connector.Error) and err.errno == 1054:
            logger.warning("Column missing in activity_logs, attempting to add columns and retry insert...")
            try:
                cursor = connection.cursor()
                try:
                    cursor.execute("ALTER TABLE activity_logs ADD COLUMN allotted_seconds INT DEFAULT 0")
                    connection.commit()
                except mysql.connector.Error:
                    pass
                try:
                    cursor.execute("ALTER TABLE activity_logs ADD COLUMN spoken_seconds INT DEFAULT 0")
                    connection.commit()
                except mysql.connector.Error:
                    pass
                # Retry insert once
                cursor.execute("""
                    INSERT INTO activity_logs 
                    (activity_type, member_name, chairperson, start_time, end_time, duration_seconds, allotted_seconds, spoken_seconds, bill_name, party, seat_no, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (activity_type, member_name, chairperson, start_time, end_time, duration_seconds, allotted_seconds, spoken_seconds, bill_name, party, seat_no, notes))
                connection.commit()
                logger.info("Insert retried after adding missing columns.")
                return jsonify({'success': True, 'message': 'Activity logged successfully', 'id': cursor.lastrowid})
            except mysql.connector.Error as retry_err:
                logger.error(f"Retry insert failed: {retry_err}")
                return jsonify({'success': False, 'error': str(retry_err)}), 500
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/login', methods=['POST'])
def api_login():
    """API endpoint for user authentication."""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password are required'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        query = "SELECT * FROM users WHERE username = %s AND password = %s"
        cursor.execute(query, (username, password))
        result = cursor.fetchone()
        
        if result:
            return jsonify({'success': True, 'message': 'Login successful', 'user': username})
        else:
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
    except mysql.connector.Error as err:
        logger.error(f"Login error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/hex-seat', methods=['POST'])
def api_hex_seat():
    """API endpoint to receive seat number in hex format."""
    data = request.get_json()
    hex_value = data.get('hex', '').strip()
    
    if not hex_value:
        return jsonify({'success': False, 'error': 'Hex value is required'}), 400
    
    try:
        # Convert hex to decimal seat number
        # Remove '0x' prefix if present
        hex_clean = hex_value.replace('0x', '').replace('0X', '')
        seat_no = int(hex_clean, 16)
        
        if seat_no < 1 or seat_no > 245:
            return jsonify({'success': False, 'error': f'Seat number {seat_no} out of range (1-245)'}), 400
        
        # Broadcast to all connected clients
        socketio.emit('seat_selected', {'seat_no': str(seat_no)})
        logger.info(f"Hex seat received: {hex_value} -> Seat {seat_no}")
        
        return jsonify({'success': True, 'seat_no': seat_no, 'hex': hex_value})
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Invalid hex value: {hex_value}'}), 400

@app.route('/api/member', methods=['POST'])
def api_add_member():
    """API endpoint to add a new member."""
    try:
        seat_no = request.form.get('seat_no')
        name = request.form.get('name', '').strip()
        party = request.form.get('party', '').strip()
        state = request.form.get('state', '').strip()
        tenure_start_raw = request.form.get('tenure_start', None)
        
        # Parse date to MySQL format (YYYY-MM-DD)
        tenure_start = None
        if tenure_start_raw:
            try:
                from dateutil import parser
                parsed_date = parser.parse(tenure_start_raw)
                tenure_start = parsed_date.strftime('%Y-%m-%d')
            except:
                # Try direct format if dateutil fails
                tenure_start = tenure_start_raw if len(tenure_start_raw) == 10 else None
        
        if not seat_no or not name or not party or not state:
            return jsonify({'success': False, 'error': 'Seat number, name, party, and state are required'}), 400
        
        # Translate to Hindi
        name_hindi = translate_to_hindi(name)
        party_hindi = HINDI_PARTIES.get(party.upper(), translate_to_hindi(party))
        state_hindi = HINDI_STATES.get(state, translate_to_hindi(state))
        
        # Handle special cases
        if party == '-' or party == 'Vacant':
            party_hindi = '-' if party == '-' else 'रिक्त'
        if state == '-':
            state_hindi = '-'
        
        # Handle picture upload
        picture_data = None
        if 'picture' in request.files:
            file = request.files['picture']
            if file and file.filename:
                picture_data = file.read()
        
        connection = get_db_connection()
        if not connection:
            return jsonify({'success': False, 'error': 'Database connection failed'}), 500
        
        try:
            cursor = connection.cursor()
            
            if picture_data:
                query = """
                    INSERT INTO parliament_seats (seat_no, name, name_hindi, party, party_hindi, state, state_hindi, tenure_start, picture)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query, (seat_no, name, name_hindi, party, party_hindi, state, state_hindi, tenure_start, picture_data))
            else:
                query = """
                    INSERT INTO parliament_seats (seat_no, name, name_hindi, party, party_hindi, state, state_hindi, tenure_start)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query, (seat_no, name, name_hindi, party, party_hindi, state, state_hindi, tenure_start))
            
            connection.commit()
            logger.info(f"Added member: Seat {seat_no} - {name} ({name_hindi})")
            return jsonify({'success': True, 'message': 'Member added successfully'})
        except mysql.connector.Error as err:
            logger.error(f"Database error: {err}")
            return jsonify({'success': False, 'error': str(err)}), 500
        finally:
            connection.close()
    except Exception as e:
        logger.error(f"Error adding member: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/member/<seat_no>', methods=['PUT'])
def api_update_member(seat_no):
    """API endpoint to update a member."""
    try:
        name = request.form.get('name', '').strip()
        party = request.form.get('party', '').strip()
        state = request.form.get('state', '').strip()
        tenure_start_raw = request.form.get('tenure_start', None)
        
        # Parse date to MySQL format (YYYY-MM-DD)
        tenure_start = None
        if tenure_start_raw:
            try:
                from dateutil import parser
                parsed_date = parser.parse(tenure_start_raw)
                tenure_start = parsed_date.strftime('%Y-%m-%d')
            except:
                # Try direct format if dateutil fails
                tenure_start = tenure_start_raw if len(tenure_start_raw) == 10 else None
        
        if not name or not party or not state:
            return jsonify({'success': False, 'error': 'Name, party, and state are required'}), 400
        
        # Translate to Hindi
        name_hindi = translate_to_hindi(name)
        party_hindi = HINDI_PARTIES.get(party.upper(), translate_to_hindi(party))
        state_hindi = HINDI_STATES.get(state, translate_to_hindi(state))
        
        # Handle special cases
        if party == '-' or party == 'Vacant':
            party_hindi = '-' if party == '-' else 'रिक्त'
        if state == '-':
            state_hindi = '-'
        
        # Handle picture upload
        picture_data = None
        if 'picture' in request.files:
            file = request.files['picture']
            if file and file.filename:
                picture_data = file.read()
        
        connection = get_db_connection()
        if not connection:
            return jsonify({'success': False, 'error': 'Database connection failed'}), 500
        
        try:
            cursor = connection.cursor()
            
            if picture_data:
                query = """
                    UPDATE parliament_seats 
                    SET name = %s, name_hindi = %s, party = %s, party_hindi = %s, 
                        state = %s, state_hindi = %s, tenure_start = %s, picture = %s
                    WHERE seat_no = %s
                """
                cursor.execute(query, (name, name_hindi, party, party_hindi, state, state_hindi, tenure_start, picture_data, seat_no))
            else:
                query = """
                    UPDATE parliament_seats 
                    SET name = %s, name_hindi = %s, party = %s, party_hindi = %s, 
                        state = %s, state_hindi = %s, tenure_start = %s
                    WHERE seat_no = %s
                """
                cursor.execute(query, (name, name_hindi, party, party_hindi, state, state_hindi, tenure_start, seat_no))
            
            connection.commit()
            logger.info(f"Updated member: Seat {seat_no} - {name} ({name_hindi})")
            return jsonify({'success': True, 'message': 'Member updated successfully'})
        except mysql.connector.Error as err:
            logger.error(f"Database error: {err}")
            return jsonify({'success': False, 'error': str(err)}), 500
        finally:
            connection.close()
    except Exception as e:
        logger.error(f"Error updating member: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/member/<seat_no>', methods=['DELETE'])
def api_delete_member(seat_no):
    """API endpoint to delete a member."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM parliament_seats WHERE seat_no = %s", (seat_no,))
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Deleted member: Seat {seat_no}")
            return jsonify({'success': True, 'message': 'Member deleted successfully'})
        else:
            return jsonify({'success': False, 'error': 'Member not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/member/<seat_no>/vacant', methods=['POST'])
def api_set_vacant(seat_no):
    """API endpoint to mark a seat as vacant - clears all data except seat_no."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        
        # Check if seat exists
        cursor.execute("SELECT seat_no FROM parliament_seats WHERE seat_no = %s", (seat_no,))
        if not cursor.fetchone():
            # Create the vacant seat if it doesn't exist
            cursor.execute("""
                INSERT INTO parliament_seats (seat_no, name, name_hindi, party, party_hindi, state, state_hindi, tenure_start, picture)
                VALUES (%s, 'VACANT', 'रिक्त', '-', '-', '-', '-', NULL, NULL)
            """, (seat_no,))
        else:
            # Update existing seat to vacant
            cursor.execute("""
                UPDATE parliament_seats 
                SET name = 'VACANT',
                    name_hindi = 'रिक्त',
                    party = '-',
                    party_hindi = '-',
                    state = '-',
                    state_hindi = '-',
                    tenure_start = NULL,
                    picture = NULL
                WHERE seat_no = %s
            """, (seat_no,))
        
        connection.commit()
        logger.info(f"Set seat {seat_no} as VACANT")
        return jsonify({'success': True, 'message': f'Seat {seat_no} marked as vacant'})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

# ============ CHAIRPERSON API ENDPOINTS ============

# Note: GET /api/chairpersons is defined earlier using get_chairpersons() function

@app.route('/api/chairperson', methods=['POST'])
def api_add_chairperson():
    """API endpoint to add a new chairperson (supports JSON or form data with photo)."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        # Handle both JSON and form data (for photo upload)
        if request.content_type and 'multipart/form-data' in request.content_type:
            name = request.form.get('name', '').strip()
            position = request.form.get('position', '').strip()
            picture = request.files.get('picture')
        else:
            data = request.get_json()
            name = data.get('name', '').strip()
            position = data.get('position', '').strip()
            picture = None
        
        if not name or not position:
            return jsonify({'success': False, 'error': 'Name and position are required'}), 400
        
        cursor = connection.cursor()
        
        # Create table if not exists (with picture column)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chairpersons (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                position VARCHAR(100) NOT NULL,
                picture LONGBLOB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add picture column if it doesn't exist
        try:
            cursor.execute("ALTER TABLE chairpersons ADD COLUMN picture LONGBLOB")
            connection.commit()
        except:
            pass  # Column already exists
        
        if picture:
            picture_data = picture.read()
            cursor.execute(
                "INSERT INTO chairpersons (name, position, picture) VALUES (%s, %s, %s)",
                (name, position, picture_data)
            )
        else:
            cursor.execute(
                "INSERT INTO chairpersons (name, position) VALUES (%s, %s)",
                (name, position)
            )
        connection.commit()
        logger.info(f"Added chairperson: {position} - {name}")
        return jsonify({'success': True, 'message': 'Chairperson added successfully', 'id': cursor.lastrowid})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/chairperson/<int:id>', methods=['PUT'])
def api_update_chairperson(id):
    """API endpoint to update a chairperson (supports JSON or form data with photo)."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        # Handle both JSON and form data (for photo upload)
        if request.content_type and 'multipart/form-data' in request.content_type:
            name = request.form.get('name', '').strip()
            position = request.form.get('position', '').strip()
            picture = request.files.get('picture')
        else:
            data = request.get_json()
            name = data.get('name', '').strip()
            position = data.get('position', '').strip()
            picture = None
        
        if not name or not position:
            return jsonify({'success': False, 'error': 'Name and position are required'}), 400
        
        cursor = connection.cursor()
        
        # Ensure picture column exists
        try:
            cursor.execute("ALTER TABLE chairpersons ADD COLUMN picture LONGBLOB")
            connection.commit()
        except:
            pass  # Column already exists
        
        if picture:
            picture_data = picture.read()
            cursor.execute(
                "UPDATE chairpersons SET name = %s, position = %s, picture = %s WHERE id = %s",
                (name, position, picture_data, id)
            )
        else:
            cursor.execute(
                "UPDATE chairpersons SET name = %s, position = %s WHERE id = %s",
                (name, position, id)
            )
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Updated chairperson: {id} - {position} - {name}")
            return jsonify({'success': True, 'message': 'Chairperson updated successfully'})
        else:
            return jsonify({'success': False, 'error': 'Chairperson not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/chairperson/<int:id>', methods=['DELETE'])
def api_delete_chairperson(id):
    """API endpoint to delete a chairperson."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM chairpersons WHERE id = %s", (id,))
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Deleted chairperson: {id}")
            return jsonify({'success': True, 'message': 'Chairperson deleted successfully'})
        else:
            return jsonify({'success': False, 'error': 'Chairperson not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

# ============ ACTIVITY LOG API ENDPOINTS ============

@app.route('/api/activity-logs')
def api_get_activity_logs():
    """API endpoint to get all activity logs."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                activity_type VARCHAR(50) NOT NULL,
                member_name VARCHAR(255),
                chairperson VARCHAR(255),
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_seconds INT DEFAULT 0,
                bill_name VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Get filters from query params
        date_filter = request.args.get('date', None)
        activity_type = request.args.get('activity_type', None)
        fetch_all = str(request.args.get('all', '')).lower() in ('1', 'true', 'yes', 'all')

        if date_filter:
            if activity_type:
                cursor.execute("""
                    SELECT * FROM activity_logs 
                    WHERE DATE(start_time) = %s AND activity_type = %s
                    ORDER BY start_time DESC
                """, (date_filter, activity_type))
            else:
                cursor.execute("""
                    SELECT * FROM activity_logs 
                    WHERE DATE(start_time) = %s
                    ORDER BY start_time DESC
                """, (date_filter,))
        else:
            if activity_type:
                query = """
                    SELECT * FROM activity_logs 
                    WHERE activity_type = %s
                    ORDER BY start_time DESC
                """
                params = (activity_type,)
            else:
                query = """
                    SELECT * FROM activity_logs 
                    ORDER BY start_time DESC
                """
                params = ()

            if not fetch_all:
                query += " LIMIT 100"

            cursor.execute(query, params)
        
        logs = cursor.fetchall()
        
        # Convert datetime objects to strings
        for log in logs:
            if log.get('start_time'):
                log['start_time'] = log['start_time'].strftime('%Y-%m-%d %H:%M:%S')
            if log.get('end_time'):
                log['end_time'] = log['end_time'].strftime('%Y-%m-%d %H:%M:%S')
            if log.get('created_at'):
                log['created_at'] = log['created_at'].strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({'success': True, 'data': logs})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': True, 'data': []})
    finally:
        connection.close()

@app.route('/api/activity-log', methods=['POST'])
def api_add_activity_log():
    """API endpoint to add a new activity log."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    def ensure_activity_table(cur):
        """Create activity_logs table with all expected columns if missing."""
        cur.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                activity_type VARCHAR(50) NOT NULL,
                member_name VARCHAR(255),
                chairperson VARCHAR(255),
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_seconds INT DEFAULT 0,
                allotted_seconds INT DEFAULT 0,
                spoken_seconds INT DEFAULT 0,
                bill_name VARCHAR(255),
                bill_id INT,
                party VARCHAR(100),
                seat_no VARCHAR(20),
                heading VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Add columns defensively in case schema drifted
        for col_sql in [
            "ALTER TABLE activity_logs ADD COLUMN allotted_seconds INT DEFAULT 0",
            "ALTER TABLE activity_logs ADD COLUMN spoken_seconds INT DEFAULT 0",
            "ALTER TABLE activity_logs ADD COLUMN party VARCHAR(100)",
            "ALTER TABLE activity_logs ADD COLUMN seat_no VARCHAR(20)",
            "ALTER TABLE activity_logs ADD COLUMN bill_id INT",
            "ALTER TABLE activity_logs ADD COLUMN heading VARCHAR(255)"
        ]:
            try:
                cur.execute(col_sql)
                connection.commit()
            except mysql.connector.Error:
                pass  # column already exists
    
    try:
        data = request.get_json()
        activity_type = data.get('activity_type', '')
        member_name = data.get('member_name', '')
        chairperson = data.get('chairperson', '')
        start_time = data.get('start_time', '')
        end_time = data.get('end_time', None)
        duration_seconds = data.get('duration_seconds', 0)
        allotted_seconds = data.get('allotted_seconds', 0)
        spoken_seconds = data.get('spoken_seconds', 0)
        bill_name = data.get('bill_name', '')
        bill_id = data.get('bill_id', None)  # Bill ID for linking to bill_details
        notes = data.get('notes', '')
        party = data.get('party', '')  # Party of the speaking member
        heading = data.get('heading', '')
        
        if not activity_type or not start_time:
            return jsonify({'success': False, 'error': 'Activity type and start time are required'}), 400
        
        cursor = connection.cursor()
        ensure_activity_table(cursor)
        
        seat_no = data.get('seat_no', '')
        
        cursor.execute("""
            INSERT INTO activity_logs 
            (activity_type, member_name, chairperson, start_time, end_time, duration_seconds, allotted_seconds, spoken_seconds, bill_name, bill_id, party, seat_no, heading, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (activity_type, member_name, chairperson, start_time, end_time, duration_seconds, allotted_seconds, spoken_seconds, bill_name, bill_id, party, seat_no, heading, notes))
        
        connection.commit()
        logger.info(f"Added activity log: {activity_type} - {member_name} (Seat: {seat_no}, Party: {party})")
        return jsonify({'success': True, 'message': 'Activity logged successfully', 'id': cursor.lastrowid})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/clear', methods=['DELETE'])
def api_clear_activity_logs():
    """API endpoint to clear all activity logs."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM activity_logs")
        connection.commit()
        logger.info("Cleared all activity logs")
        return jsonify({'success': True, 'message': 'All logs cleared'})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-log/<int:log_id>', methods=['DELETE'])
def api_delete_activity_log(log_id):
    """API endpoint to delete a specific activity log entry."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM activity_logs WHERE id = %s", (log_id,))
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Deleted activity log entry: {log_id}")
            return jsonify({'success': True, 'message': 'Log entry deleted'})
        else:
            return jsonify({'success': False, 'error': 'Log entry not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-log/<int:log_id>', methods=['PATCH'])
def api_update_activity_log(log_id):
    """API endpoint to update duration/spoken seconds for a specific activity log entry."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        data = request.get_json()
        spoken_seconds = data.get('spoken_seconds')
        duration_seconds = data.get('duration_seconds')
        
        if spoken_seconds is None and duration_seconds is None:
            return jsonify({'success': False, 'error': 'spoken_seconds or duration_seconds is required'}), 400
        
        updates = []
        update_statements = []
        params = []
        if duration_seconds is not None:
            updates.append("duration_seconds = %s")
            params.append(int(duration_seconds))
            update_statements.append(f"duration_seconds={int(duration_seconds)}")
        if spoken_seconds is not None:
            updates.append("spoken_seconds = %s")
            params.append(int(spoken_seconds))
            update_statements.append(f"spoken_seconds={int(spoken_seconds)}")
        
        cursor = connection.cursor()
        cursor.execute(
            f"UPDATE activity_logs SET {', '.join(updates)} WHERE id = %s",
            (*params, log_id)
        )
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Updated activity log entry {log_id}: {', '.join(update_statements)}")
            return jsonify({'success': True, 'message': 'Log entry updated'})
        else:
            return jsonify({'success': False, 'error': 'Log entry not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/by-bill', methods=['DELETE'])
def api_delete_activity_logs_by_bill():
    """API endpoint to delete all activity logs for a specific bill."""
    bill_name = request.args.get('bill_name')
    date_filter = request.args.get('date')  # Optional date filter
    
    if not bill_name:
        return jsonify({'success': False, 'error': 'bill_name parameter is required'}), 400
    
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        
        if date_filter:
            cursor.execute("""
                DELETE FROM activity_logs 
                WHERE bill_name = %s AND DATE(start_time) = %s
            """, (bill_name, date_filter))
        else:
            cursor.execute("DELETE FROM activity_logs WHERE bill_name = %s", (bill_name,))
        
        deleted_count = cursor.rowcount
        connection.commit()
        
        logger.info(f"Deleted {deleted_count} activity log entries for bill: {bill_name}")
        return jsonify({
            'success': True, 
            'message': f'Deleted {deleted_count} log entries for "{bill_name}"',
            'deleted_count': deleted_count
        })
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/migrate-bill-ids', methods=['POST'])
def api_migrate_bill_ids():
    """Migrate existing activity logs to use bill_id instead of just bill_name.
    This will match logs with bill_details entries and set the bill_id."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # Ensure bill_id column exists
        try:
            cursor.execute("ALTER TABLE activity_logs ADD COLUMN bill_id INT")
            connection.commit()
        except:
            pass  # Column already exists
        
        # Get all bill_details
        cursor.execute("SELECT id, bill_name FROM bill_details")
        bills = cursor.fetchall()
        
        updated_count = 0
        for bill in bills:
            # Update logs that match this bill name but don't have bill_id set
            cursor.execute("""
                UPDATE activity_logs 
                SET bill_id = %s 
                WHERE bill_name = %s AND (bill_id IS NULL OR bill_id != %s)
            """, (bill['id'], bill['bill_name'], bill['id']))
            updated_count += cursor.rowcount
        
        connection.commit()
        
        logger.info(f"Migrated {updated_count} activity log entries with bill_id")
        return jsonify({
            'success': True,
            'message': f'Updated {updated_count} log entries with bill_id',
            'updated_count': updated_count
        })
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/merge-bills', methods=['POST'])
def api_merge_bill_logs():
    """Merge activity logs from an old bill name to a target bill_id.
    This is used when a bill name was changed and old logs still have the old name."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        data = request.get_json()
        old_bill_name = data.get('old_bill_name')
        target_bill_id = data.get('target_bill_id')
        
        if not old_bill_name or not target_bill_id:
            return jsonify({'success': False, 'error': 'old_bill_name and target_bill_id are required'}), 400
        
        cursor = connection.cursor(dictionary=True)
        
        # Get the current bill name for the target
        cursor.execute("SELECT bill_name FROM bill_details WHERE id = %s", (target_bill_id,))
        target_bill = cursor.fetchone()
        if not target_bill:
            return jsonify({'success': False, 'error': 'Target bill not found'}), 404
        
        new_bill_name = target_bill['bill_name']
        
        # Update all logs with the old bill name to use the new bill_id and name
        cursor.execute("""
            UPDATE activity_logs 
            SET bill_id = %s, bill_name = %s
            WHERE bill_name = %s
        """, (target_bill_id, new_bill_name, old_bill_name))
        
        merged_count = cursor.rowcount
        connection.commit()
        
        logger.info(f"Merged {merged_count} logs from '{old_bill_name}' to bill_id {target_bill_id} ('{new_bill_name}')")
        return jsonify({
            'success': True,
            'message': f'Merged {merged_count} log entries from "{old_bill_name}" to "{new_bill_name}"',
            'merged_count': merged_count
        })
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/update-seat-numbers', methods=['POST'])
def api_update_activity_log_seat_numbers():
    """API endpoint to update all activity logs with seat numbers from parliament_seats table."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        
        # First, ensure seat_no column exists
        try:
            cursor.execute("ALTER TABLE activity_logs ADD COLUMN seat_no VARCHAR(20)")
            connection.commit()
        except:
            pass  # Column already exists
        
        # Get all activity logs that don't have seat_no or have empty seat_no
        cursor.execute("""
            SELECT id, member_name FROM activity_logs 
            WHERE seat_no IS NULL OR seat_no = ''
        """)
        logs_to_update = cursor.fetchall()
        
        updated_count = 0
        not_found_count = 0
        
        for log in logs_to_update:
            member_name = log.get('member_name')
            if member_name:
                # Look up seat_no from parliament_seats by member name
                cursor.execute("""
                    SELECT seat_no FROM parliament_seats 
                    WHERE name = %s OR name LIKE %s
                    LIMIT 1
                """, (member_name, f"%{member_name}%"))
                
                result = cursor.fetchone()
                if result and result.get('seat_no'):
                    # Update the activity log with the seat_no
                    cursor.execute("""
                        UPDATE activity_logs 
                        SET seat_no = %s 
                        WHERE id = %s
                    """, (result['seat_no'], log['id']))
                    updated_count += 1
                else:
                    not_found_count += 1
        
        connection.commit()
        logger.info(f"Updated {updated_count} activity logs with seat numbers, {not_found_count} members not found")
        
        return jsonify({
            'success': True, 
            'message': f'Updated {updated_count} activity logs with seat numbers',
            'updated': updated_count,
            'not_found': not_found_count
        })
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/bill/<bill_name>')
def api_get_bill_activity_logs(bill_name):
    """API endpoint to get activity logs for a specific bill (optionally filtered by date).
    Now also looks up by bill_id if the bill_name matches a bill in bill_details."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        date_filter = request.args.get('date')
        
        # First, try to find the bill_id for this bill_name
        cursor.execute("SELECT id FROM bill_details WHERE bill_name = %s", (bill_name,))
        bill_row = cursor.fetchone()
        bill_id = bill_row['id'] if bill_row else None
        
        # Query logs by bill_id OR bill_name (to catch both old and new logs)
        if bill_id:
            base_query = """
                SELECT * FROM activity_logs 
                WHERE activity_type = 'Bill Discussion' 
                  AND (bill_id = %s OR bill_name = %s)
            """
            params = [bill_id, bill_name]
        else:
            base_query = """
                SELECT * FROM activity_logs 
                WHERE activity_type = 'Bill Discussion' 
                  AND bill_name = %s
            """
            params = [bill_name]
        
        if date_filter:
            base_query += " AND DATE(start_time) = %s"
            params.append(date_filter)
        
        base_query += " ORDER BY start_time DESC"
        cursor.execute(base_query, tuple(params))
        
        logs = cursor.fetchall()
        
        # Convert datetime objects to strings
        for log in logs:
            if log.get('start_time'):
                log['start_time'] = log['start_time'].isoformat()
            if log.get('end_time'):
                log['end_time'] = log['end_time'].isoformat()
            if log.get('created_at'):
                log['created_at'] = log['created_at'].isoformat()
        
        return jsonify({'success': True, 'data': logs})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-logs/by-bill-id/<int:bill_id>')
def api_get_activity_logs_by_bill_id(bill_id):
    """API endpoint to get activity logs for a specific bill by bill_id."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        date_filter = request.args.get('date')
        
        base_query = """
            SELECT a.*, b.bill_name as current_bill_name 
            FROM activity_logs a
            LEFT JOIN bill_details b ON a.bill_id = b.id
            WHERE a.activity_type = 'Bill Discussion' 
              AND a.bill_id = %s
        """
        params = [bill_id]
        
        if date_filter:
            base_query += " AND DATE(a.start_time) = %s"
            params.append(date_filter)
        
        base_query += " ORDER BY a.start_time DESC"
        cursor.execute(base_query, tuple(params))
        
        logs = cursor.fetchall()
        
        for log in logs:
            if log.get('start_time'):
                log['start_time'] = log['start_time'].isoformat()
            if log.get('end_time'):
                log['end_time'] = log['end_time'].isoformat()
            if log.get('created_at'):
                log['created_at'] = log['created_at'].isoformat()
        
        return jsonify({'success': True, 'data': logs})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

# ============ BROADCAST FEED API ============

@app.route('/api/broadcast-feed', methods=['GET'])
def api_get_broadcast_feed():
    """Return the latest broadcast screen payload for remote viewers."""
    return jsonify({'success': True, 'state': broadcast_state})

@app.route('/api/broadcast-feed', methods=['POST'])
def api_set_broadcast_feed():
    """Update the broadcast feed payload (called by the controller app)."""
    global broadcast_state
    data = request.get_json() or {}
    try:
        broadcast_state['is_active'] = bool(data.get('is_active', False))
        broadcast_state['mode'] = data.get('mode', 'Idle')
        broadcast_state['payload'] = data.get('payload') or {}
        broadcast_state['updated_at'] = datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S')
        return jsonify({'success': True})
    except Exception as err:
        logger.error(f"Broadcast feed error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500

# ============ BILL DETAILS API ENDPOINTS ============

@app.route('/api/bill-details')
def api_get_bill_details():
    """API endpoint to get bill details (optionally filtered by status)."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        status_param = request.args.get('status')
        status_value = None
        if status_param:
            status_norm = status_param.strip().lower()
            if status_norm in ('current', 'active'):
                status_value = 'Active'
            elif status_norm in ('past', 'archived', 'inactive'):
                status_value = 'Past'
            else:
                status_value = status_param
        
        # Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bill_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bill_name VARCHAR(500) NOT NULL,
                party_allocations JSON,
                others_time JSON,
                status VARCHAR(50) DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        # Ensure status column exists for older databases
        try:
            cursor.execute("ALTER TABLE bill_details ADD COLUMN status VARCHAR(50) DEFAULT 'Active'")
            connection.commit()
        except mysql.connector.Error:
            pass
        
        if status_value:
            cursor.execute("SELECT * FROM bill_details WHERE status = %s ORDER BY created_at DESC", (status_value,))
        else:
            cursor.execute("SELECT * FROM bill_details ORDER BY created_at DESC")
        bills = cursor.fetchall()
        
        # Parse JSON fields
        import json
        for bill in bills:
            if bill.get('party_allocations'):
                if isinstance(bill['party_allocations'], str):
                    bill['party_allocations'] = json.loads(bill['party_allocations'])
            else:
                bill['party_allocations'] = []
            
            if bill.get('others_time'):
                if isinstance(bill['others_time'], str):
                    bill['others_time'] = json.loads(bill['others_time'])
                if bill['others_time'] is None:
                    bill['others_time'] = {'hours': 0, 'minutes': 0, 'members': []}
                else:
                    bill['others_time']['hours'] = bill['others_time'].get('hours', 0)
                    bill['others_time']['minutes'] = bill['others_time'].get('minutes', 0)
                    bill['others_time']['members'] = bill['others_time'].get('members', [])
            else:
                bill['others_time'] = {'hours': 0, 'minutes': 0, 'members': []}
            
            if bill.get('created_at'):
                bill['created_at'] = bill['created_at'].strftime('%Y-%m-%d %H:%M:%S')
            if bill.get('updated_at'):
                bill['updated_at'] = bill['updated_at'].strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({'success': True, 'data': bills})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': True, 'data': []})
    finally:
        connection.close()

@app.route('/api/bill-details', methods=['POST'])
def api_add_bill_details():
    """API endpoint to add a new bill."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        import json
        data = request.get_json()
        bill_name = data.get('bill_name', '')
        party_allocations = data.get('party_allocations', [])
        others_time = data.get('others_time', {'hours': 0, 'minutes': 0})
        
        if not bill_name:
            return jsonify({'success': False, 'error': 'Bill name is required'}), 400
        
        cursor = connection.cursor()
        
        # Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bill_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bill_name VARCHAR(500) NOT NULL,
                party_allocations JSON,
                others_time JSON,
                status VARCHAR(50) DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            INSERT INTO bill_details (bill_name, party_allocations, others_time, status)
            VALUES (%s, %s, %s, %s)
        """, (bill_name, json.dumps(party_allocations), json.dumps(others_time), 'Active'))
        
        connection.commit()
        logger.info(f"Added bill: {bill_name}")
        return jsonify({'success': True, 'message': 'Bill created successfully', 'id': cursor.lastrowid})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/bill-details/<int:id>', methods=['PUT'])
def api_update_bill_details(id):
    """API endpoint to update a bill."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        import json
        data = request.get_json()
        bill_name = data.get('bill_name', '')
        party_allocations = data.get('party_allocations', [])
        others_time = data.get('others_time', {'hours': 0, 'minutes': 0})
        
        if not bill_name:
            return jsonify({'success': False, 'error': 'Bill name is required'}), 400
        
        cursor = connection.cursor(dictionary=True)
        
        # Fetch existing bill to capture previous name (used for updating logs)
        cursor.execute("SELECT bill_name FROM bill_details WHERE id = %s", (id,))
        existing_bill = cursor.fetchone()
        if not existing_bill:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
        
        old_bill_name = existing_bill['bill_name']
        
        update_sql = """
            UPDATE bill_details 
            SET bill_name = %s, party_allocations = %s, others_time = %s
            WHERE id = %s
        """
        params = (bill_name, json.dumps(party_allocations), json.dumps(others_time), id)
        cursor.execute(update_sql, params)
        
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Updated bill: {id}")
            
            try:
                # Update existing activity logs to use the new bill name and ensure bill_id is set
                cursor.execute("""
                    UPDATE activity_logs
                    SET bill_name = %s, bill_id = %s
                    WHERE bill_id = %s OR bill_name = %s
                """, (bill_name, id, id, old_bill_name))
                connection.commit()
                logger.info(f"Updated {cursor.rowcount} activity log entries for bill rename {old_bill_name} -> {bill_name}")
            except mysql.connector.Error as log_err:
                logger.error(f"Error updating activity logs after bill rename: {log_err}")
            
            return jsonify({'success': True, 'message': 'Bill updated successfully'})
        else:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/bill-details/<int:id>/status', methods=['PUT'])
def api_update_bill_status(id):
    """Update the status of a bill (Active/Past)."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        data = request.get_json() or {}
        status = data.get('status', '')
        if not status:
            return jsonify({'success': False, 'error': 'Status is required'}), 400
        
        status_norm = status.strip().lower()
        if status_norm in ('current', 'active'):
            status_value = 'Active'
        elif status_norm in ('past', 'archived', 'inactive'):
            status_value = 'Past'
        else:
            return jsonify({'success': False, 'error': 'Invalid status value'}), 400
        
        cursor = connection.cursor()
        cursor.execute("""
            UPDATE bill_details 
            SET status = %s
            WHERE id = %s
        """, (status_value, id))
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Updated bill {id} status to {status_value}")
            return jsonify({'success': True, 'message': f'Bill marked as {status_value.lower()}.'})
        else:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/bill-details/<int:id>', methods=['DELETE'])
def api_delete_bill_details(id):
    """API endpoint to delete a bill."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM bill_details WHERE id = %s", (id,))
        connection.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"Deleted bill: {id}")
            return jsonify({'success': True, 'message': 'Bill deleted successfully'})
        else:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/activity-log', methods=['POST'])
def api_create_activity_log():
    """API endpoint to create an activity log entry."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        data = request.get_json()
        
        activity_type = data.get('activity_type', '')
        member_name = data.get('member_name', '')
        chairperson = data.get('chairperson', '')
        start_time = data.get('start_time', '')
        end_time = data.get('end_time', '')
        duration_seconds = data.get('duration_seconds', 0)
        bill_name = data.get('bill_name', '')
        party = data.get('party', '')  # Party of the speaking member
        seat_no = data.get('seat_no', '')  # Seat number of the speaking member
        heading = data.get('heading', '')
        notes = data.get('notes', '')
        
        # Create activity_logs table if it doesn't exist (with party and seat_no columns)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                activity_type VARCHAR(100),
                member_name VARCHAR(255),
                chairperson VARCHAR(255),
                start_time DATETIME,
                end_time DATETIME,
                duration_seconds INT,
                bill_name VARCHAR(255),
                party VARCHAR(100),
                seat_no VARCHAR(20),
                heading VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Add party column if it doesn't exist (for existing tables)
        try:
            cursor.execute("ALTER TABLE activity_logs ADD COLUMN party VARCHAR(100)")
            connection.commit()
        except mysql.connector.Error:
            pass  # Column already exists
        
        # Add seat_no column if it doesn't exist (for existing tables)
        try:
            cursor.execute("ALTER TABLE activity_logs ADD COLUMN seat_no VARCHAR(20)")
            connection.commit()
        except mysql.connector.Error:
            pass  # Column already exists

        # Add heading column if it doesn't exist (for existing tables)
        try:
            cursor.execute("ALTER TABLE activity_logs ADD COLUMN heading VARCHAR(255)")
            connection.commit()
        except mysql.connector.Error:
            pass  # Column already exists
        
        cursor.execute('''
            INSERT INTO activity_logs (activity_type, member_name, chairperson, start_time, end_time, duration_seconds, bill_name, party, seat_no, heading, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ''', (activity_type, member_name, chairperson, start_time, end_time, duration_seconds, bill_name, party, seat_no, heading, notes))
        
        connection.commit()
        
        return jsonify({'success': True, 'message': 'Activity logged successfully'})
    except mysql.connector.Error as err:
        logger.error(f"Database error creating activity log: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

@app.route('/api/bill-consumed-time/<int:bill_id>')
def api_get_bill_consumed_time(bill_id):
    """API endpoint to get consumed time per party for a specific bill."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        import json
        
        # First get the bill details including allocated parties
        cursor.execute("SELECT bill_name, party_allocations FROM bill_details WHERE id = %s", (bill_id,))
        bill = cursor.fetchone()
        
        if not bill:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
        
        bill_name = bill['bill_name']
        date_param = request.args.get('date')
        
        # Parse allocated parties list
        party_allocations = bill.get('party_allocations')
        if party_allocations:
            if isinstance(party_allocations, str):
                party_allocations = json.loads(party_allocations)
        else:
            party_allocations = []
        
        # Get list of party names that have allocated time
        allocated_party_names = [p.get('party', '') for p in party_allocations]
        
        # Get all activity logs for this bill - party is now stored directly in activity_logs
        query = """
            SELECT party, duration_seconds, seat_no
            FROM activity_logs 
            WHERE activity_type = 'Bill Discussion' 
              AND (bill_id = %s OR (bill_id IS NULL AND bill_name = %s))
        """
        params = [bill_id, bill_name]
        if date_param:
            query += " AND DATE(start_time) = %s"
            params.append(date_param)
        cursor.execute(query, tuple(params))
        
        results = cursor.fetchall()
        
        # Create lowercase lookup for allocated parties
        allocated_party_lower = {p.lower().strip(): p for p in allocated_party_names}
        
        # Calculate consumed time - if party is in allocated list, use party; otherwise use Others
        consumed_time = {}
        member_totals = {}
        for row in results:
            member_party = row['party']
            duration = row['duration_seconds'] or 0
            seat_no = row.get('seat_no')
            
            # Check if member's party is in the allocated parties list (case-insensitive)
            if member_party:
                member_party_lower = member_party.lower().strip()
                if member_party_lower in allocated_party_lower:
                    # Use the original party name from allocations
                    original_party = allocated_party_lower[member_party_lower]
                    if original_party not in consumed_time:
                        consumed_time[original_party] = 0
                    consumed_time[original_party] += duration
                else:
                    # Party not in allocated list, count under Others
                    if 'Others' not in consumed_time:
                        consumed_time['Others'] = 0
                    consumed_time['Others'] += duration
            else:
                # No party, count under Others
                if 'Others' not in consumed_time:
                    consumed_time['Others'] = 0
                consumed_time['Others'] += duration
        
            # Track member-level totals (if seat number available)
            if seat_no:
                member_key = f"member_{seat_no}"
                if member_key not in member_totals:
                    member_totals[member_key] = 0
                member_totals[member_key] += duration
        
        # Combine party totals and member totals into single dict (front-end expects both)
        combined_data = {**consumed_time, **member_totals}
        
        return jsonify({'success': True, 'data': combined_data})
    except mysql.connector.Error as err:
        logger.error(f"Database error: {err}")
        return jsonify({'success': True, 'data': {}})
    finally:
        connection.close()

@app.route('/api/bill-member-totals/<int:bill_id>')
def api_get_bill_member_totals(bill_id):
    """Return cumulative spoken time per member (seat) for a given bill discussion."""
    connection = get_db_connection()
    if not connection:
        return jsonify({'success': False, 'error': 'Database connection failed'}), 500
    
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT bill_name FROM bill_details WHERE id = %s", (bill_id,))
        bill = cursor.fetchone()
        if not bill:
            return jsonify({'success': False, 'error': 'Bill not found'}), 404
        
        bill_name = bill['bill_name']
        date_param = request.args.get('date')
        query = """
            SELECT seat_no, SUM(spoken_seconds) AS total_spoken
            FROM activity_logs
            WHERE activity_type = 'Bill Discussion'
              AND (bill_id = %s OR (bill_id IS NULL AND bill_name = %s))
        """
        params = [bill_id, bill_name]
        if date_param:
            query += " AND DATE(start_time) = %s"
            params.append(date_param)
        query += " GROUP BY seat_no"
        cursor.execute(query, tuple(params))
        
        results = cursor.fetchall()
        totals = {}
        for row in results:
            seat_no = row['seat_no']
            total_spoken = row['total_spoken'] or 0
            if seat_no is None:
                continue
            totals[str(seat_no)] = total_spoken
        return jsonify({'success': True, 'data': totals})
    except mysql.connector.Error as err:
        logger.error(f"Database error fetching member totals: {err}")
        return jsonify({'success': False, 'error': str(err)}), 500
    finally:
        connection.close()

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    logger.info(f"Client connected: {request.sid}")
    emit('connected', {'status': 'Connected to Parliament Server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection."""
    logger.info(f"Client disconnected: {request.sid}")

@socketio.on('request_member')
def handle_request_member(data):
    """Handle member data request from client."""
    seat_no = data.get('seat_no')
    if seat_no:
        member = get_member_by_seat(seat_no)
        if member:
            emit('member_data', {'success': True, 'data': member})
        else:
            emit('member_data', {'success': False, 'error': 'Member not found'})

@socketio.on('timer_update')
def handle_timer_update(data):
    """Broadcast timer updates to all clients."""
    emit('timer_sync', data, broadcast=True)

@socketio.on('select_chairperson')
def handle_select_chairperson(data):
    """Broadcast chairperson selection to all clients."""
    emit('chairperson_update', data, broadcast=True)

# Start the application
if __name__ == '__main__':
    # Run position migration
    migrate_chairperson_positions()
    
    # Start UDP receiver
    udp_receiver.start()
    
    try:
        logger.info("Starting Parliament Web Server on http://localhost:5000")
        socketio.run(app, host='0.0.0.0', port=5000, debug=True)
    finally:
        udp_receiver.stop()
