import os 
import logging
import sys
import mysql.connector
import signal  
import threading
import socket
from PyQt5.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, QVBoxLayout, QHBoxLayout, QGridLayout, QLineEdit, QMessageBox, QFrame, QComboBox, QSpacerItem, QSizePolicy,QFileDialog, QDateEdit
)
from PyQt5.QtGui import QPixmap
from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtCore import QTime, QDate
from PyQt5.QtCore import pyqtSignal, QObject, QThread

signal.signal(signal.SIGINT, lambda *args: sys.exit(0))  

logging.basicConfig(filename='error.log', level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')

def connect_to_database():
    try:
        connection = mysql.connector.connect(
            host=os.environ.get('DB_HOST', '127.0.0.1'),
            user=os.environ.get('DB_USER', 'root'),
            password=os.environ.get('DB_PASSWORD', 'meeku0409@nand'),
            database=os.environ.get('DB_NAME', 'dashboard_db')
        )
        return connection
    except mysql.connector.Error as err:
        logging.error(f"Database Error: {err}")
        QMessageBox.critical(None, "Database Error", f"Error connecting to the database: {err}")
        return None

class SignalEmitter(QObject):
    data_received = pyqtSignal(str)

class DatabaseWorker(QThread):
    data_loaded = pyqtSignal(dict)  
    error_occurred = pyqtSignal(str)  

    def __init__(self, seat_no):
        super().__init__()
        self.seat_no = seat_no

    def run(self):
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    SELECT name, party, state, tenure_start, picture
                    FROM parliament_seats
                    WHERE seat_no = %s
                """
                cursor.execute(query, (self.seat_no,))
                result = cursor.fetchone()
                if result:
                    name, party, state, tenure_start, picture = result
                    data = {
                        "seat_no": self.seat_no,
                        "name": name,
                        "party": party,
                        "state": state,
                        "tenure_start": tenure_start,
                        "picture": picture,
                    }
                    self.data_loaded.emit(data)
                else:
                    self.error_occurred.emit("No data found for the provided seat number.")
            except Exception as e:
                self.error_occurred.emit(str(e))
            finally:
                connection.close()
        else:
            self.error_occurred.emit("Database connection failed.")

    def stop(self):
        """Stops the worker thread."""
        self.running = False
        self.wait()  # Wait for the thread to finish

class ReceiverThread:
    def __init__(self, signal_emitter, host='127.0.0.1', port=65432):
        self.signal_emitter = signal_emitter
        self.host = host
        self.port = port
        self.sock = None
        self.running = True
        self.thread = threading.Thread(target=self.listen, daemon=True)
        self.thread.start()

    def listen(self):
        """Listen for incoming UDP messages and emit signals."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.bind((self.host, self.port))
            print(f"Listening for data on {self.host}:{self.port}...")
            while self.running:
                data, addr = self.sock.recvfrom(1024)
                received_data = data.decode()
                self.signal_emitter.data_received.emit(received_data)
        except OSError as e:
            logging.error(f"Socket error: {e}")
        finally:
            if self.sock:
                self.sock.close()



    def stop(self):
        """Stop the receiver thread and close the socket."""
        self.running = False
        if self.sock:
            self.sock.close()

class WelcomeScreen(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Welcome - Talk Time Management System")
        self.setFixedSize(1000, 700)
        self.setStyleSheet("background-color: #F5F5DC;")

        title_label = QLabel("Welcome to\nTalk Time Management System\nfor Rajya Sabha")
        title_label.setStyleSheet("font-size: 50px; font-weight: bold; color: #B22222;")
        title_label.setAlignment(Qt.AlignCenter)

        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(800, 800, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        line = QFrame()
        line.setFrameShape(QFrame.HLine)  # Horizontal line
        line.setFrameShadow(QFrame.Sunken)  # Sunken shadow for 3D effect
        line.setLineWidth(2)  # Line thickness


        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        main_layout = QVBoxLayout()
        main_layout.addWidget(title_label)
        main_layout.addWidget(logo_label)
        main_layout.addStretch()
        main_layout.addWidget(line)
        main_layout.addWidget(footer_label)
        self.setLayout(main_layout)

        QTimer.singleShot(4000, self.open_login)

    def open_login(self):
        self.login_window = LoginWindow()
        self.login_window.show()
        self.close()

class LoginWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Login - Talk Time Management System")
        self.setFixedSize(600, 400)
        self.setStyleSheet("background-color: #F5F5DC;")

        # Title Label
        title_label = QLabel("Login")
        title_label.setAlignment(Qt.AlignCenter)
        title_label.setStyleSheet("font-size: 36px; font-weight: bold; color: #B22222;")

        # Username and Password
        username_label = QLabel("Username:")
        username_label.setStyleSheet("font-size: 20px;")
        self.username_input = QLineEdit()
        self.username_input.setPlaceholderText("Enter your username")
        self.username_input.setStyleSheet("font-size: 18px; padding: 5px;")

        password_label = QLabel("Password:")
        password_label.setStyleSheet("font-size: 20px;")
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.Password)
        self.password_input.setPlaceholderText("Enter your password")
        self.password_input.setStyleSheet("font-size: 18px; padding: 5px;")

        # Login Button
        login_button = QPushButton("Login")
        login_button.setStyleSheet("""
            font-size: 20px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            border-radius: 5px; 
            padding: 10px;
        """)
        login_button.clicked.connect(self.verify_login)


        # Trigger Login with Enter Key
        self.username_input.returnPressed.connect(self.verify_login)
        self.password_input.returnPressed.connect(self.verify_login)


        # Layout
        form_layout = QGridLayout()
        form_layout.addWidget(username_label, 0, 0)
        form_layout.addWidget(self.username_input, 0, 1)
        form_layout.addWidget(password_label, 1, 0)
        form_layout.addWidget(self.password_input, 1, 1)
        form_layout.addWidget(login_button, 2, 0, 1, 2, alignment=Qt.AlignCenter)

        main_layout = QVBoxLayout()
        main_layout.addStretch()
        main_layout.addWidget(title_label)
        main_layout.addLayout(form_layout)
        main_layout.addStretch()
        self.setLayout(main_layout)

    def verify_login(self):
        username = self.username_input.text()
        password = self.password_input.text()

        if not username or not password:
            QMessageBox.warning(self, "Input Error", "Username and Password cannot be empty!")
            return

        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = "SELECT * FROM users WHERE username = %s AND password = %s"
                cursor.execute(query, (username, password))
                result = cursor.fetchone()
                if result:
                    self.open_dashboard()
                else:
                    QMessageBox.warning(self, "Login Failed", "Invalid Username or Password.")
            except mysql.connector.Error as err:
                logging.error(f"Login Error: {err}")
                QMessageBox.critical(self, "Database Error", f"Error: {err}")
            finally:
                connection.close()
        else:
            QMessageBox.critical(self, "Connection Error", "Unable to connect to the database.")

    def open_dashboard(self):
        self.dashboard_window = DashboardWindow()
        self.dashboard_window.show()
        self.close()

class DashboardWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Dashboard - Rajya Sabha Talk Time Management System")
        self.showFullScreen()
        self.setStyleSheet("background-color: #F5F5DC;")

        # **Logo and Title**
        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(230, 230, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        title_label = QLabel("Rajya Sabha Talk Time Management System")
        title_label.setStyleSheet("font-size: 72px; font-weight: 950; color: #B22222;")
        title_label.setAlignment(Qt.AlignLeft)

        # **Title Layout**
        title_layout = QHBoxLayout()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title_label)

        # **Dropdown Setup**
        self.dropdown = QComboBox()
        self.populate_dropdown()
        self.dropdown.setFixedSize(420, 48)  # Length increased by 20% (350 * 1.2 = 420), height by 20% (40 * 1.2 = 48)
        self.dropdown.setStyleSheet("""
            font-size: 24px;  /* 20% increase from original 20px */
            font-weight: bold;  /* Makes the font bold */
            padding: 5px;
            selection-background-color: none;  /* Removes the blue background color */
            background-color: white;  /* Ensures white background for the dropdown */
        """)

        # **Restore previous selection if it exists**
        previous_selection = QApplication.instance().property("on_the_chair_selection")
        if previous_selection is not None and previous_selection in [self.dropdown.itemText(i) for i in range(self.dropdown.count())]:
            index = self.dropdown.findText(previous_selection)
            if index != -1:
                self.dropdown.setCurrentIndex(index)

        # **Save the current selection whenever it changes**
        self.dropdown.currentIndexChanged.connect(self.save_dropdown_selection)

        # **Label for "On The Chair"**
        on_the_chair_label = QLabel("ON THE CHAIR")
        on_the_chair_label.setStyleSheet("""
        font-size: 26px; 
        font-weight: bold;
        color: #B22222;
        """)

        # **Dropdown and Label Layout**
        dropdown_layout = QHBoxLayout()
        dropdown_layout.addStretch(4)  # Push "On The Chair" label 20% to the left from center
        dropdown_layout.addWidget(on_the_chair_label, alignment=Qt.AlignVCenter)  # Place the "On The Chair" label
        dropdown_layout.addWidget(self.dropdown, alignment=Qt.AlignVCenter)  # Place the dropdown next to the label
        dropdown_layout.addStretch(1)  # Space after the dropdown to keep the layout balanced

        # **Vertical Layout to Position the Dropdown**
        vertical_dropdown_layout = QVBoxLayout()
        vertical_dropdown_layout.addSpacing(20)  # Space to create 20% distance from the top
        vertical_dropdown_layout.addLayout(dropdown_layout)  # Add the dropdown layout
        vertical_dropdown_layout.addSpacing(20)  # Space after the dropdown

        # **Button Labels**
        button_labels = ["Zero Hour", "Member's \nSpeaking", "Bill \nDiscussions",
                         "Bill Details \n Entry", "Previous\n Bills Details", "Database\nEntry"]

        # **Button Layout**
        button_layout = QGridLayout()
        button_layout.setHorizontalSpacing(80)  # Space between buttons
        button_layout.setVerticalSpacing(100)  # Space between rows of buttons

        # Dynamically generate and add buttons
        for i, label in enumerate(button_labels):
            button = self.create_button(label)
            button_layout.addWidget(button, i // 3, i % 3)  # Arranges buttons into a grid (3x2)

        # **Line Separator**
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        # **Footer Label**
        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        # **Main Layout**
        main_layout = QVBoxLayout()
        main_layout.addLayout(title_layout)  # Title layout
        main_layout.addLayout(vertical_dropdown_layout)  # Dropdown layout below the title
        main_layout.addSpacing(40)  # Space between dropdown and buttons
        main_layout.addLayout(button_layout)  # Button layout
        main_layout.addStretch()  # Pushes everything up
        main_layout.addWidget(line)  # Horizontal line
        main_layout.addWidget(footer_label)  # Footer label

        self.setLayout(main_layout)

    def save_dropdown_selection(self):
            """Saves the current selection of the dropdown to the QApplication property."""
            current_selection = self.dropdown.currentText()
            QApplication.instance().setProperty("on_the_chair_selection", current_selection)
            
    def populate_dropdown(self):
        """Populates the dropdown with data from the on_the_chair table."""
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT position, name FROM on_the_chair")
                results = cursor.fetchall()
                for position, name in results:
                    self.dropdown.addItem(f"{position} - {name}")
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
            finally:
                connection.close()

    def create_button(self, label):
        """Creates and returns a QPushButton with a given label."""
        button = QPushButton(label)
        button.setStyleSheet("""
            font-size: 48px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            border-radius: 10px; 
            padding: 20px;
        """)
        button.setFixedSize(442, 260)  # Original size retained
        button.clicked.connect(lambda: self.handle_button_click(label))
        return button

    def handle_button_click(self, label):
        if label == "Zero Hour":
            self.open_zero_hour()
        elif label == "Member's \nSpeaking":
            self.open_member_speaking() 
        elif label == "Bill \nDiscussions":
            self.open_bill_discussions()
        elif label == "Bill Details \n Entry":
            self.open_bill_details_entry()       
        elif label == "Database\nEntry":
            self.open_database_entry()

    def open_zero_hour(self):
        self.zero_hour_window = ZeroHourWindow()
        self.zero_hour_window.show()
        self.close()

    def open_database_entry(self):
        self.database_entry_window = DatabaseEntryWindow()
        self.database_entry_window.show()
        self.close()

    def open_member_speaking(self):
        self.member_speaking_window = MemberSpeakingWindow()
        self.member_speaking_window.show()
        self.close()

    def open_bill_discussions(self):
        self.bill_discussions_window = BillDiscussionsWindow()
        self.bill_discussions_window.show()
        self.close()

    def open_bill_details_entry(self):
        self.bill_details_entry_window = BillDetailsEntryWindow()
        self.bill_details_entry_window.show()
        self.close()

class ZeroHourWindow(QWidget):
    def __init__(self,  host='127.0.0.1', port=65432):
        super().__init__()
        self.setWindowTitle("Zero Hour - Rajya Sabha Talk Time Management System")
        self.showFullScreen()
        self.setStyleSheet("background-color: #F5F5DC;")

        self.host = host
        self.port = port
        self.signal_emitter = SignalEmitter()
        self.signal_emitter.data_received.connect(self.update_received_signal)

        self.setup_ui()

        self.receiver_thread = None
        QTimer.singleShot(0, self.start_receiver_thread)

    def setup_ui(self):

        # **Logo and Title Setup**
        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(230, 230, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        title_label = QLabel("Rajya Sabha Talk Time Management System")
        title_label.setStyleSheet("font-size: 72px; font-weight: 950; color: #B22222;")
        title_label.setAlignment(Qt.AlignLeft)

        # **Title Layout**
        title_layout = QHBoxLayout()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title_label)
        
        # **Back Button Setup**
        back_button = QPushButton("Back")
        back_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        back_button.setFixedSize(150, 50)
        back_button.clicked.connect(self.back_to_dashboard)  

        back_button_layout = QHBoxLayout()
        back_button_layout.addWidget(back_button, alignment=Qt.AlignRight)

        # **Timer Setup**
        self.time_left = QTime(0, 3, 0)  # 3-minute timer
        self.timer_label = QLabel(self.time_left.toString("mm:ss"))
        self.timer_label.setStyleSheet("font-size: 50px; font-weight: bold; color: #B22222;")
        self.timer_label.setAlignment(Qt.AlignCenter)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_timer)
        self.timer.start(1000)  # Timer runs every second

        # **Start and Stop Buttons**
        start_button = QPushButton("Start")
        start_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #28A745; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        start_button.setFixedSize(150, 50)
        start_button.clicked.connect(self.start_timer)

        stop_button = QPushButton("Stop")
        stop_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #DC3545; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        stop_button.setFixedSize(150, 50)
        stop_button.clicked.connect(self.stop_timer)

        # **Timer, Start, and Stop buttons in a single row**
        timer_button_layout = QHBoxLayout()
        timer_button_layout.addStretch()
        timer_button_layout.addWidget(self.timer_label)
        timer_button_layout.addWidget(start_button)
        timer_button_layout.addWidget(stop_button)
        timer_button_layout.addStretch()

        # Member Details Section
        picture_frame = QFrame()
        picture_frame.setFixedSize(420, 520)  # Frame size for the picture
        picture_frame.setStyleSheet("""
            border: 2px solid #B22222;  /* Red border */
            border-radius: 5px;
            background-color: #FFFFFF;  /* Optional background for the frame */
            """)
        self.picture_label = QLabel()
        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
        self.picture_label.setAlignment(Qt.AlignCenter)

        # Add the picture_label to the picture_frame layout
        picture_layout = QVBoxLayout()
        picture_layout.addWidget(self.picture_label, alignment=Qt.AlignCenter)
        picture_frame.setLayout(picture_layout)

        # Horizontal line utility
        def create_horizontal_line():
            line = QFrame()
            line.setFrameShape(QFrame.HLine)
            line.setFrameShadow(QFrame.Sunken)
            line.setStyleSheet("""
                background-color: #888888;  /* Gray color */
                height: 2px;  /* Slightly broader line */
            """)
            return line

        # Labels for Member Information
        self.seat_no_label = QLabel("Seat No.:")
        self.seat_no_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.seat_no_value_label = QLabel("No Seat Selected")
        self.seat_no_value_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.name_label = QLabel("Name:")
        self.name_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.party_label = QLabel("Party:")
        self.party_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.state_label = QLabel("State:")
        self.state_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.tenure_start_label = QLabel("Tenure Start:")
        self.tenure_start_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        # Horizontal layout for Seat No and Value
        seat_no_layout = QHBoxLayout()
        seat_no_layout.addWidget(self.seat_no_label, alignment=Qt.AlignLeft)
        seat_no_layout.addWidget(self.seat_no_value_label, alignment=Qt.AlignLeft)

        # Member Details Layout (Vertical for Other Labels)
        details_layout = QVBoxLayout()
        details_layout.addLayout(seat_no_layout)  # Add Seat No and Value in one line
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.name_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.party_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.state_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.tenure_start_label, alignment=Qt.AlignLeft)

        # Combine Picture and Details (Horizontal)
        member_layout = QHBoxLayout()
        member_layout.addWidget(picture_frame, alignment=Qt.AlignCenter)
        member_layout.addLayout(details_layout)

        # **On The Chair Section**
        on_the_chair_label = QLabel("ON THE CHAIR:")
        on_the_chair_label.setStyleSheet("font-size: 42px; font-weight: bold; color: #B22222;")

        on_the_chair_value = QApplication.instance().property("on_the_chair_selection")
        if not on_the_chair_value:
            on_the_chair_value = "No selection made"

        on_the_chair_details_label = QLabel(on_the_chair_value)
        on_the_chair_details_label.setStyleSheet("font-size: 42px; font-weight: bold; color: black;")

        on_the_chair_layout = QHBoxLayout()
        on_the_chair_layout.addStretch()
        on_the_chair_layout.addWidget(on_the_chair_label)
        on_the_chair_layout.addWidget(on_the_chair_details_label)
        on_the_chair_layout.addStretch()

        # **Footer Section**
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        # **Main Layout**
        main_layout = QVBoxLayout()
        main_layout.addLayout(title_layout)  
        main_layout.addLayout(back_button_layout)
        main_layout.addLayout(timer_button_layout)
        main_layout.addLayout(member_layout)  
        main_layout.addStretch()
        main_layout.addLayout(on_the_chair_layout)
        main_layout.addWidget(line)
        main_layout.addWidget(footer_label)

        self.setLayout(main_layout)

    def start_receiver_thread(self):
        """Safely initialize or restart the receiver thread."""
        if not hasattr(self, 'signal_emitter') or self.signal_emitter is None:
            return

        if self.receiver_thread is None:
            self.receiver_thread = ReceiverThread(self.signal_emitter, self.host, self.port)
        else:
            self.receiver_thread.stop()
            self.receiver_thread = ReceiverThread(self.signal_emitter, self.host, self.port)

    def load_member_data(self, seat_no):
        
        """ Loads member data from the database and updates the UI. """
       
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    SELECT name, party, state, tenure_start, picture
                    FROM parliament_seats
                    WHERE seat_no = %s
                """
                cursor.execute(query, (seat_no,))
                result = cursor.fetchone()
                if result:
                    name, party, state, tenure_start, picture = result
                    self.seat_no_value_label.setText(seat_no)
                    self.name_label.setText(f"Name: {name}")
                    self.party_label.setText(f"Party: {party}")
                    self.state_label.setText(f"State: {state}")
                    self.tenure_start_label.setText(f"Tenure Start: {tenure_start}")
                    pixmap = QPixmap()
                    if picture:
                        pixmap.loadFromData(picture)
                        self.picture_label.setPixmap(pixmap.scaled(400, 500, Qt.KeepAspectRatio))
                    else:
                        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
            except mysql.connector.Error as err:
             logging.error(f"Database Error: {err}")
            finally:
                connection.close()

    def update_received_signal(self, seat_no):
        """Updates the GUI with details of the received seat number."""
        self.seat_no_value_label.setText(seat_no)
        self.load_member_data(seat_no)
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    SELECT name, party, state, tenure_start, picture 
                    FROM parliament_seats 
                    WHERE seat_no = %s
                """
                cursor.execute(query, (seat_no,))
                result = cursor.fetchone()
                if result:
                    name, party, state, tenure_start, picture = result
                    self.name_label.setText(f"Name: {name}")
                    self.party_label.setText(f"Party: {party}")
                    self.state_label.setText(f"State: {state}")
                    self.tenure_start_label.setText(f"Tenure Start: {tenure_start}")
                    pixmap = QPixmap()
                    if picture:
                        pixmap.loadFromData(picture)
                        self.picture_label.setPixmap(pixmap.scaled(400, 500, Qt.KeepAspectRatio))
                    else:
                        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
                else:
                    self.name_label.setText("Name: -")
                    self.party_label.setText("Party: -")
                    self.state_tenure_label.setText("State: - | Tenure Start: -")
                    self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
            finally:
                 connection.close()

    def update_timer(self):
        self.time_left = self.time_left.addSecs(-1)
        self.timer_label.setText(self.time_left.toString("mm:ss"))

        if self.time_left == QTime(0, 0, 0):
            self.timer.stop()
            self.back_to_dashboard()

    def start_timer(self):
        self.timer.start(1000)

    def stop_timer(self):
        self.timer.stop()

    def back_to_dashboard(self):
        self.dashboard_window = DashboardWindow()
        self.dashboard_window.show()
        self.close()

class MemberSpeakingWindow(QWidget):
    def __init__(self, host='127.0.0.1', port=65432):
        super().__init__()

        self.setWindowTitle("Member Speaking - Rajya Sabha Talk Time Management System")
        self.showFullScreen()
        self.setStyleSheet("background-color: #F5F5DC;")

        self.host = host
        self.port = port
        self.signal_emitter = SignalEmitter()
        self.signal_emitter.data_received.connect(self.update_received_signal)
      
        self.setup_ui()

        self.receiver_thread = None
        QTimer.singleShot(0, self.start_receiver_thread)

    def closeEvent(self, event):
        """Clean up threads when the window is closed."""
        if hasattr(self, 'database_worker') and self.database_worker is not None:
            self.database_worker.stop()  # Stop the database worker
        if hasattr(self, 'receiver_thread') and self.receiver_thread is not None:
            self.receiver_thread.stop()  # Stop the receiver thread
        event.accept()
        
    def setup_ui(self):
        """Sets up the GUI layout."""
        # Logo and Title
        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(230, 230, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        title_label = QLabel("Rajya Sabha Talk Time Management System")
        title_label.setStyleSheet("font-size: 72px; font-weight: 950; color: #B22222;")
        title_label.setAlignment(Qt.AlignLeft)

        title_layout = QHBoxLayout()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title_label)

        # Back Button
        back_button = QPushButton("Back")
        back_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        back_button.setFixedSize(150, 50)
        back_button.clicked.connect(self.back_to_dashboard)

        back_button_layout = QHBoxLayout()
        back_button_layout.addWidget(back_button, alignment=Qt.AlignRight)

        # Timer Setup
        self.time_elapsed = QTime(0, 0, 0)  # Timer starts at zero
        self.timer_label = QLabel(self.time_elapsed.toString("hh:mm:ss"))
        self.timer_label.setStyleSheet("font-size: 50px; font-weight: bold; color: #B22222;")
        self.timer_label.setAlignment(Qt.AlignCenter)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_timer)
        self.timer.start(1000)

        start_button = QPushButton("Start")
        start_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #28A745; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        start_button.setFixedSize(150, 50)
        start_button.clicked.connect(self.start_timer)

        stop_button = QPushButton("Stop")
        stop_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #DC3545; 
            color: white; 
                padding: 10px 20px;
        border-radius: 5px;
        """)
        stop_button.setFixedSize(150, 50)
        stop_button.clicked.connect(self.stop_timer)

        timer_button_layout = QHBoxLayout()
        timer_button_layout.addStretch()
        timer_button_layout.addWidget(self.timer_label)
        timer_button_layout.addWidget(start_button)
        timer_button_layout.addWidget(stop_button)
        timer_button_layout.addStretch()

        # Member Details Section
        picture_frame = QFrame()
        picture_frame.setFixedSize(420, 520)  # Frame size for the picture
        picture_frame.setStyleSheet("""
            border: 2px solid #B22222;  /* Red border */
            border-radius: 5px;
            background-color: #FFFFFF;  /* Optional background for the frame */
            """)
        self.picture_label = QLabel()
        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
        self.picture_label.setAlignment(Qt.AlignCenter)

        # Add the picture_label to the picture_frame layout
        picture_layout = QVBoxLayout()
        picture_layout.addWidget(self.picture_label, alignment=Qt.AlignCenter)
        picture_frame.setLayout(picture_layout)

        # Horizontal line utility
        def create_horizontal_line():
            line = QFrame()
            line.setFrameShape(QFrame.HLine)
            line.setFrameShadow(QFrame.Sunken)
            line.setStyleSheet("""
                background-color: #888888;  /* Gray color */
                height: 2px;  /* Slightly broader line */
            """)
            return line

        # Labels for Member Information
        self.seat_no_label = QLabel("Seat No.:")
        self.seat_no_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.seat_no_value_label = QLabel("No Seat Selected")
        self.seat_no_value_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.name_label = QLabel("Name:")
        self.name_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.party_label = QLabel("Party:")
        self.party_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.state_label = QLabel("State:")
        self.state_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.tenure_start_label = QLabel("Tenure Start:")
        self.tenure_start_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        # Horizontal layout for Seat No and Value
        seat_no_layout = QHBoxLayout()
        seat_no_layout.addWidget(self.seat_no_label, alignment=Qt.AlignLeft)
        seat_no_layout.addWidget(self.seat_no_value_label, alignment=Qt.AlignLeft)

        # Member Details Layout (Vertical for Other Labels)
        details_layout = QVBoxLayout()
        details_layout.addLayout(seat_no_layout)  # Add Seat No and Value in one line
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.name_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.party_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.state_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.tenure_start_label, alignment=Qt.AlignLeft)

        # Combine Picture and Details (Horizontal)
        member_layout = QHBoxLayout()
        member_layout.addWidget(picture_frame, alignment=Qt.AlignCenter)
        member_layout.addLayout(details_layout)

        # **On The Chair Section**
        on_the_chair_label = QLabel("ON THE CHAIR:")
        on_the_chair_label.setStyleSheet("font-size: 42px; font-weight: bold; color: #B22222;")

        on_the_chair_value = QApplication.instance().property("on_the_chair_selection")
        if not on_the_chair_value:
            on_the_chair_value = "No selection made"

        on_the_chair_details_label = QLabel(on_the_chair_value)
        on_the_chair_details_label.setStyleSheet("font-size: 42px; font-weight: bold; color: black;")

        on_the_chair_layout = QHBoxLayout()
        on_the_chair_layout.addStretch()
        on_the_chair_layout.addWidget(on_the_chair_label)
        on_the_chair_layout.addWidget(on_the_chair_details_label)
        on_the_chair_layout.addStretch()

        # Footer Section
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        # Main Layout
        main_layout = QVBoxLayout()
        main_layout.addLayout(title_layout)
        main_layout.addLayout(back_button_layout)
        main_layout.addLayout(timer_button_layout)
        main_layout.addLayout(member_layout)
        main_layout.addStretch()
        main_layout.addLayout(on_the_chair_layout)
        main_layout.addWidget(line)
        main_layout.addWidget(footer_label)

        self.setLayout(main_layout)

    def load_member_data(self, seat_no):
        """Start the worker to fetch member data."""
        self.database_worker = DatabaseWorker(seat_no)
        self.database_worker.data_loaded.connect(self.update_ui_with_data)
        self.database_worker.error_occurred.connect(self.handle_database_error)
        self.database_worker.start()

    def update_received_signal(self, seat_no):
        """Handles the received seat number and updates the UI."""
        self.seat_no_value_label.setText(seat_no)
        self.load_member_data(seat_no) 
        
    def update_ui_with_data(self, data):
        """
        Updates the UI with the data received from the database.
        :param data: A tuple containing (name, party, state, tenure_start, picture)
        """
        if len(data) == 5:
            name, party, state, tenure_start, picture = data
            self.name_label.setText(f"Name: {name}")
            self.party_label.setText(f"Party: {party}")
            self.state_label.setText(f"State: {state}")
            self.tenure_start_label.setText(f"Tenure Start: {tenure_start}")
            pixmap = QPixmap()
            if picture:
                pixmap.loadFromData(picture)
                self.picture_label.setPixmap(pixmap.scaled(450, 550, Qt.KeepAspectRatio))
            else:
              self.picture_label.setPixmap(QPixmap().scaled(450, 550, Qt.KeepAspectRatio))
        else:
            logging.error(f"Unexpected data format: {data}")
            self.name_label.setText("Name: -")
            self.party_label.setText("Party: -")
            self.state_label.setText("State: -")
            self.tenure_start_label.setText("Tenure Start: -")
            self.picture_label.setPixmap(QPixmap().scaled(450, 550, Qt.KeepAspectRatio))

           

    def on_data_loaded(self, data):
        """Update UI with data loaded from the database."""
        self.name_label.setText(f"Name: {data['name']}")
        self.party_label.setText(f"Party: {data['party']}")
        self.state_label.setText(f"State: {data['state']}")
        self.tenure_start_label.setText(f"Tenure Start: {data['tenure_start']}")

        pixmap = QPixmap()
        if data['picture']:
            pixmap.loadFromData(data['picture'])
        self.picture_label.setPixmap(pixmap.scaled(450, 550, Qt.KeepAspectRatio))

    def on_data_error(self, error_message):
            """Handles errors during data fetching."""
            logging.error(f"Error: {error_message}")
            QMessageBox.critical(self, "Database Error", error_message)

    def handle_database_error(self, error_message):
        """Handles database errors emitted by the worker."""
        QMessageBox.critical(self, "Database Error", f"An error occurred while fetching data: {error_message}")

    def start_receiver_thread(self):
        """Safely initialize or restart the receiver thread."""
        if not hasattr(self, 'signal_emitter') or self.signal_emitter is None:
            return

        if self.receiver_thread is None:
            self.receiver_thread = ReceiverThread(self.signal_emitter, self.host, self.port)
        else:
            self.receiver_thread.stop()
            self.receiver_thread = ReceiverThread(self.signal_emitter, self.host, self.port)
    
    def update_timer(self):
        """Increments the timer."""
        self.time_elapsed = self.time_elapsed.addSecs(1)
        self.timer_label.setText(self.time_elapsed.toString("hh:mm:ss"))

    def start_timer(self):
        """Starts the timer."""
        self.timer.start(1000)

    def stop_timer(self):
        """Stops the timer."""
        self.timer.stop()

    def back_to_dashboard(self):
        """Stop the timer, reset state, and navigate back to the dashboard."""
        if self.timer.isActive():
            self.timer.stop()

        self.time_elapsed = QTime(0, 0, 0)  # Reset elapsed time

        if hasattr(self, 'receiver_thread') and self.receiver_thread is not None:
            self.receiver_thread.stop()  # Ensure the thread is stopped

        self.dashboard_window = DashboardWindow()
        self.dashboard_window.show()
        self.close()

class BillDiscussionsWindow(QWidget):
    def __init__(self, host='127.0.0.1', port=65432):
        super().__init__()

        self.setWindowTitle("Bill Discussions - Rajya Sabha Talk Time Management System")
        self.showFullScreen()
        self.setStyleSheet("background-color: #F5F5DC;")

        self.host = host
        self.port = port
        self.signal_emitter = SignalEmitter()
        self.signal_emitter.data_received.connect(self.update_received_signal)
      
        self.setup_ui()

        self.receiver_thread = None
        QTimer.singleShot(0, self.start_receiver_thread)

    def setup_ui(self):
        """Sets up the GUI layout."""
        # Logo and Title
        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(230, 230, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        title_label = QLabel("Rajya Sabha Talk Time Management System")
        title_label.setStyleSheet("font-size: 72px; font-weight: 950; color: #B22222;")
        title_label.setAlignment(Qt.AlignLeft)

        title_layout = QHBoxLayout()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title_label)

        # Back Button
        back_button = QPushButton("Back")
        back_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        back_button.setFixedSize(150, 50)
        back_button.clicked.connect(self.back_to_dashboard)

        back_button_layout = QHBoxLayout()
        back_button_layout.addWidget(back_button, alignment=Qt.AlignRight)

        # Timer Setup
        self.time_elapsed = QTime(0, 0, 0)  # Timer starts at zero
        self.timer_label = QLabel(self.time_elapsed.toString("hh:mm:ss"))
        self.timer_label.setStyleSheet("font-size: 50px; font-weight: bold; color: #B22222;")
        self.timer_label.setAlignment(Qt.AlignCenter)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_timer)
        self.timer.start(1000)

        start_button = QPushButton("Start")
        start_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #28A745; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        start_button.setFixedSize(150, 50)
        start_button.clicked.connect(self.start_timer)

        stop_button = QPushButton("Stop")
        stop_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #DC3545; 
            color: white; 
                padding: 10px 20px;
        border-radius: 5px;
        """)
        stop_button.setFixedSize(150, 50)
        stop_button.clicked.connect(self.stop_timer)

        timer_button_layout = QHBoxLayout()
        timer_button_layout.addStretch()
        timer_button_layout.addWidget(self.timer_label)
        timer_button_layout.addWidget(start_button)
        timer_button_layout.addWidget(stop_button)
        timer_button_layout.addStretch()

        # Member Details Section
        picture_frame = QFrame()
        picture_frame.setFixedSize(420, 520)  # Frame size for the picture
        picture_frame.setStyleSheet("""
            border: 2px solid #B22222;  /* Red border */
            border-radius: 5px;
            background-color: #FFFFFF;  /* Optional background for the frame */
            """)
        self.picture_label = QLabel()
        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
        self.picture_label.setAlignment(Qt.AlignCenter)

        # Add the picture_label to the picture_frame layout
        picture_layout = QVBoxLayout()
        picture_layout.addWidget(self.picture_label, alignment=Qt.AlignCenter)
        picture_frame.setLayout(picture_layout)

        # Horizontal line utility
        def create_horizontal_line():
            line = QFrame()
            line.setFrameShape(QFrame.HLine)
            line.setFrameShadow(QFrame.Sunken)
            line.setStyleSheet("""
                background-color: #888888;  /* Gray color */
                height: 2px;  /* Slightly broader line */
            """)
            return line

        # Labels for Member Information
        self.seat_no_label = QLabel("Seat No.:")
        self.seat_no_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.seat_no_value_label = QLabel("No Seat Selected")
        self.seat_no_value_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.name_label = QLabel("Name:")
        self.name_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.party_label = QLabel("Party:")
        self.party_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.state_label = QLabel("State:")
        self.state_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        self.tenure_start_label = QLabel("Tenure Start:")
        self.tenure_start_label.setStyleSheet("font-size: 60px; font-weight: bold; color: #B22222;")

        # Horizontal layout for Seat No and Value
        seat_no_layout = QHBoxLayout()
        seat_no_layout.addWidget(self.seat_no_label, alignment=Qt.AlignLeft)
        seat_no_layout.addWidget(self.seat_no_value_label, alignment=Qt.AlignLeft)

        # Member Details Layout (Vertical for Other Labels)
        details_layout = QVBoxLayout()
        details_layout.addLayout(seat_no_layout)  # Add Seat No and Value in one line
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.name_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.party_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.state_label, alignment=Qt.AlignLeft)
        details_layout.addWidget(create_horizontal_line())
        details_layout.addWidget(self.tenure_start_label, alignment=Qt.AlignLeft)

        # Combine Picture and Details (Horizontal)
        member_layout = QHBoxLayout()
        member_layout.addWidget(picture_frame, alignment=Qt.AlignCenter)
        member_layout.addLayout(details_layout)

        # **On The Chair Section**
        on_the_chair_label = QLabel("ON THE CHAIR:")
        on_the_chair_label.setStyleSheet("font-size: 42px; font-weight: bold; color: #B22222;")

        on_the_chair_value = QApplication.instance().property("on_the_chair_selection")
        if not on_the_chair_value:
            on_the_chair_value = "No selection made"

        on_the_chair_details_label = QLabel(on_the_chair_value)
        on_the_chair_details_label.setStyleSheet("font-size: 42px; font-weight: bold; color: black;")

        on_the_chair_layout = QHBoxLayout()
        on_the_chair_layout.addStretch()
        on_the_chair_layout.addWidget(on_the_chair_label)
        on_the_chair_layout.addWidget(on_the_chair_details_label)
        on_the_chair_layout.addStretch()

        # Footer Section
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        # Main Layout
        main_layout = QVBoxLayout()
        main_layout.addLayout(title_layout)
        main_layout.addLayout(back_button_layout)
        main_layout.addLayout(timer_button_layout)
        main_layout.addLayout(member_layout)
        main_layout.addStretch()
        main_layout.addLayout(on_the_chair_layout)
        main_layout.addWidget(line)
        main_layout.addWidget(footer_label)

        self.setLayout(main_layout)


    def start_receiver_thread(self):
        """Safely initialize or restart the receiver thread."""
        if not hasattr(self, 'signal_emitter') or self.signal_emitter is None:
            return

        if self.receiver_thread is None:
            self.receiver_thread = ReceiverThread(self.signal_emitter, self.host, self.port)
        else:
            self.receiver_thread.stop()
            self.receiver_thread = ReceiverThread(self.signal_emitter, self.host, self.port)

    def load_member_data(self, seat_no):
        
        """ Loads member data from the database and updates the UI. """
       
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    SELECT name, party, state, tenure_start, picture
                    FROM parliament_seats
                    WHERE seat_no = %s
                """
                cursor.execute(query, (seat_no,))
                result = cursor.fetchone()
                if result:
                    name, party, state, tenure_start, picture = result
                    self.seat_no_value_label.setText(seat_no)
                    self.name_label.setText(f"Name: {name}")
                    self.party_label.setText(f"Party: {party}")
                    self.state_label.setText(f"State: {state}")
                    self.tenure_start_label.setText(f"Tenure Start: {tenure_start}")
                    pixmap = QPixmap()
                    if picture:
                        pixmap.loadFromData(picture)
                        self.picture_label.setPixmap(pixmap.scaled(400, 500, Qt.KeepAspectRatio))
                    else:
                        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
            except mysql.connector.Error as err:
             logging.error(f"Database Error: {err}")
            finally:
                connection.close()

    def update_received_signal(self, seat_no):
        """Updates the GUI with details of the received seat number."""
        self.seat_no_value_label.setText(seat_no)
        self.load_member_data(seat_no)
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    SELECT name, party, state, tenure_start, picture 
                    FROM parliament_seats 
                    WHERE seat_no = %s
                """
                cursor.execute(query, (seat_no,))
                result = cursor.fetchone()
                if result:
                    name, party, state, tenure_start, picture = result
                    self.name_label.setText(f"Name: {name}")
                    self.party_label.setText(f"Party: {party}")
                    self.state_label.setText(f"State: {state}")
                    self.tenure_start_label.setText(f"Tenure Start: {tenure_start}")
                    pixmap = QPixmap()
                    if picture:
                        pixmap.loadFromData(picture)
                        self.picture_label.setPixmap(pixmap.scaled(400, 500, Qt.KeepAspectRatio))
                    else:
                        self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
                else:
                    self.name_label.setText("Name: -")
                    self.party_label.setText("Party: -")
                    self.state_tenure_label.setText("State: - | Tenure Start: -")
                    self.picture_label.setPixmap(QPixmap().scaled(400, 500, Qt.KeepAspectRatio))
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
            finally:
                 connection.close()
    
    def update_timer(self):
        """Increments the timer."""
        self.time_elapsed = self.time_elapsed.addSecs(1)
        self.timer_label.setText(self.time_elapsed.toString("hh:mm:ss"))

    def start_timer(self):
        """Starts the timer."""
        self.timer.start(1000)

    def stop_timer(self):
        """Stops the timer."""
        self.timer.stop()


    def back_to_dashboard(self):
        """Stop the timer, reset state, and navigate back to the dashboard."""
        if self.timer.isActive():
            self.timer.stop()

        self.time_elapsed = QTime(0, 0, 0)  # Reset elapsed time

        if hasattr(self, 'receiver_thread') and self.receiver_thread is not None:
            self.receiver_thread.stop()  # Ensure the thread is stopped

        self.dashboard_window = DashboardWindow()
        self.dashboard_window.show()
        self.close()

class BillDetailsEntryWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Bill Details - Rajya Sabha Talk Time Management System")
        self.showFullScreen()
        self.setStyleSheet("background-color: #F5F5DC;")

        # **Logo and Title Setup**
        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(230, 230, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        title_label = QLabel("Rajya Sabha Talk Time Management System")
        title_label.setStyleSheet("font-size: 72px; font-weight: 950; color: #B22222;")
        title_label.setAlignment(Qt.AlignLeft)

        # **Title Layout**
        title_layout = QHBoxLayout()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title_label)
        
        # **Back Button Setup**
        back_button = QPushButton("Back")
        back_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        back_button.setFixedSize(150, 50)
        back_button.clicked.connect(self.back_to_dashboard)  

        back_button_layout = QHBoxLayout()
        back_button_layout.addWidget(back_button, alignment=Qt.AlignRight)
       
        # Left Side Layout (Bill Entry)
        left_layout = QVBoxLayout()

        left_title_label = QLabel("Enter Bill Details")
        left_title_label.setStyleSheet("font-size: 45px; font-weight: bold; color: #B22222;")
        left_title_label.setAlignment(Qt.AlignCenter)

        date_label = QLabel("Date Tabled:")
        date_label.setStyleSheet("font-size: 25px; font-weight: bold;")
        self.date_input = QDateEdit()
        self.date_input.setCalendarPopup(True)
        self.date_input.setDisplayFormat("yyyy-MM-dd")
        self.date_input.setDate(QDate.currentDate())
        self.date_input.setStyleSheet("font-size: 22px; padding: 5px;")

        bill_name_label = QLabel("Name of the Bill:")
        bill_name_label.setStyleSheet("font-size: 25px; font-weight: bold;")
        self.bill_name_input = QLineEdit()
        self.bill_name_input.setPlaceholderText("Enter Bill Name")
        self.bill_name_input.setStyleSheet("font-size: 22px; padding: 5px;")

        add_button = QPushButton("Add Bill to Database")
        add_button.setStyleSheet("""
            font-size: 22px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px;
            border-radius: 5px;
        """)
        add_button.setFixedSize(200, 40)
        add_button.clicked.connect(self.add_bill_to_database)

        left_layout.addWidget(left_title_label)
        left_layout.addSpacing(20)
        left_layout.addWidget(date_label)
        left_layout.addWidget(self.date_input)
        left_layout.addWidget(bill_name_label)
        left_layout.addWidget(self.bill_name_input)
        left_layout.addWidget(add_button, alignment=Qt.AlignCenter)
        left_layout.addStretch()

        # Vertical Line Separator
        vertical_line = QFrame()
        vertical_line.setFrameShape(QFrame.VLine)
        vertical_line.setFrameShadow(QFrame.Sunken)
        vertical_line.setLineWidth(2)

        # Right Side Layout (Bill Details Viewer)
        right_layout = QVBoxLayout()

        right_title_label = QLabel("Bill Details Viewer")
        right_title_label.setStyleSheet("font-size: 45px; font-weight: bold; color: #B22222;")
        right_title_label.setAlignment(Qt.AlignCenter)

        dropdown_label = QLabel("Select a Running Bill:")
        dropdown_label.setStyleSheet("font-size: 25px; font-weight: bold;")
        self.bill_dropdown = QComboBox()
        self.bill_dropdown.setStyleSheet("font-size: 22px; padding: 5px;")
        self.bill_dropdown.currentIndexChanged.connect(self.load_bill_details)

        self.populate_bill_dropdown()

        self.bill_details_label = QLabel("")
        self.bill_details_label.setStyleSheet("font-size: 22px; font-weight: bold; color: #333333;")

        right_layout.addWidget(right_title_label)
        right_layout.addSpacing(20)
        right_layout.addWidget(dropdown_label)
        right_layout.addWidget(self.bill_dropdown)
        right_layout.addSpacing(20)
        right_layout.addWidget(self.bill_details_label)
        right_layout.addStretch()

        # Main Layout
        main_layout = QHBoxLayout()
        main_layout.addLayout(left_layout)
        main_layout.addWidget(vertical_line)
        main_layout.addLayout(right_layout)
        # **Footer Section**
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

       # Combine Everything
        complete_layout = QVBoxLayout()
        complete_layout.addLayout(title_layout)
        complete_layout.addLayout(back_button_layout)
        complete_layout.addLayout(main_layout)
        complete_layout.addStretch()
        complete_layout.addWidget(line)
        complete_layout.addWidget(footer_label)

        self.setLayout(complete_layout)

    def populate_bill_dropdown(self):
        """Fetch and populate the dropdown with running bills."""
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = "SELECT bill_name FROM bill_details WHERE status = 'Running'"
                cursor.execute(query)
                results = cursor.fetchall()
                self.bill_dropdown.clear()
                self.bill_dropdown.addItem("Select a Bill")
                for result in results:
                    self.bill_dropdown.addItem(result[0])
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
            finally:
                connection.close()

    def load_bill_details(self):
        """Load the details of the selected bill."""
        bill_name = self.bill_dropdown.currentText()
        if bill_name == "Select a Bill":
            self.bill_details_label.setText("")
            return

        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    SELECT tabled_date, bill_name, status
                    FROM bill_details
                    WHERE bill_name = %s
                """
                cursor.execute(query, (bill_name,))
                result = cursor.fetchone()
                if result:
                    tabled_date, bill_name, status = result
                    self.bill_details_label.setText(
                        f"Date Tabled: {tabled_date}\n"
                        f"Name of the Bill: {bill_name}\n"
                        f"Status: {status}"
                    )
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
            finally:
                connection.close()

    def add_bill_to_database(self):
        """Add bill details to the database."""
        tabled_date = self.date_input.date().toString("yyyy-MM-dd")
        bill_name = self.name_input.text().strip()

        if not bill_name:
            QMessageBox.warning(self, "Input Error", "Bill name cannot be empty!")
            return

        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    INSERT INTO bill_details (tabled_date, bill_name, status)
                    VALUES (%s, %s, %s)
                """
                cursor.execute(query, (tabled_date, bill_name, "Running"))
                connection.commit()
                QMessageBox.information(self, "Success", "Bill details added successfully!")
                self.name_input.clear()
                self.date_input.setDate(QDate.currentDate())  # Reset date to today
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
                QMessageBox.critical(self, "Database Error", f"Error: {err}")
            finally:
                connection.close()

    def back_to_dashboard(self):
       self.dashboard_window = DashboardWindow()
       self.dashboard_window.show()
       self.close() 

class DatabaseEntryWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Database Entry - Rajya Sabha Talk Time Management System")
        self.showFullScreen()
        self.setStyleSheet("background-color: #F5F5DC;")

        # **Main Layout Initialization**
        complete_layout = QVBoxLayout()

        # **Logo and Title Setup**
        logo_label = QLabel()
        logo_pixmap = QPixmap("parliament_logo.png").scaled(230, 230, Qt.KeepAspectRatio)
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        title_label = QLabel("Rajya Sabha Talk Time Management System")
        title_label.setStyleSheet("font-size: 72px; font-weight: 950; color: #B22222;")
        title_label.setAlignment(Qt.AlignLeft)

        # **Title Layout**
        logo_and_title_layout = QHBoxLayout()
        logo_and_title_layout.addWidget(logo_label)
        logo_and_title_layout.addWidget(title_label)

        # **Back Button Setup**
        back_button = QPushButton("Back")
        back_button.setStyleSheet("""
            font-size: 25px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px 20px;
            border-radius: 5px;
        """)
        back_button.setFixedSize(150, 50)
        back_button.clicked.connect(self.back_to_dashboard)

        # **Back Button Layout**
        back_button_layout = QVBoxLayout()
        back_button_layout.addSpacing(20)
        back_button_layout.addWidget(back_button, alignment=Qt.AlignRight)

        # **Combine Logo, Title, and Back Button**
        combined_layout = QVBoxLayout()
        combined_layout.addLayout(logo_and_title_layout)
        combined_layout.addLayout(back_button_layout)

        complete_layout.addLayout(combined_layout)

        # **Left Side Form for Parliament Data Entry**
        left_side_layout = QVBoxLayout()
        
        # Add a heading above the form
        heading_label = QLabel("Details of New Member")
        heading_label.setStyleSheet("""
            font-size: 45px; 
            font-weight: bold; 
            color: #B22222; 
            margin-bottom: 20px;
        """)
        heading_label.setAlignment(Qt.AlignCenter)
        left_side_layout.addWidget(heading_label)

        # Parliament Data Entry Form
        form_layout = QGridLayout()
        form_layout.setVerticalSpacing(20)

        labels = ["Seat No.:", "Name:", "Party:", "State:", "Tenure Start:", "Picture of Member:"]
        self.inputs = {}

        for i, label_text in enumerate(labels[:-1]):  
            label = QLabel(label_text)
            label.setStyleSheet("font-size: 25px; font-weight: bold;")
            input_field = QLineEdit()
            input_field.setStyleSheet("font-size: 22px; padding: 5px;")
            input_field.setFixedHeight(40)
            # Add placeholder for Tenure Start field
            if label_text == "Tenure Start:":
                input_field.setPlaceholderText("Enter in YYYY-MM-DD format")  # Add placeholder text
            self.inputs[label_text] = input_field
            form_layout.addWidget(label, i, 0)
            form_layout.addWidget(input_field, i, 1)

        # Add Picture of Member row
        picture_label = QLabel("Picture of Member:")
        picture_label.setStyleSheet("font-size: 22px; font-weight: bold;")
        self.picture_button = QPushButton("Upload in Jpeg Format")
        self.picture_button.setStyleSheet("""
            font-size: 22px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px;
            border-radius: 5px;
        """)
        self.picture_button.setFixedSize(275, 50)
        self.picture_button.clicked.connect(self.upload_picture)

        # Define the QLabel for displaying the file name
        self.file_name_label = QLabel()  # Initialize the file_name_label
        self.file_name_label.setStyleSheet("font-size: 20px; color: #333333;")  # Styling for the file name
        self.file_name_label.setAlignment(Qt.AlignLeft)

        form_layout.addWidget(picture_label, len(labels) - 1, 0)
        file_upload_layout = QHBoxLayout()
        file_upload_layout.addWidget(self.picture_button)
        file_upload_layout.addWidget(self.file_name_label)
        form_layout.addWidget(self.picture_button, len(labels) - 1, 1)

        # Add the form layout below the heading
        left_side_layout.addLayout(form_layout)

        # Add "Add to Database" button for the left panel
        add_member_button = QPushButton("Add to Database")
        add_member_button.setStyleSheet("""
            font-size: 22px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px;
            border-radius: 5px;
        """)
        add_member_button.setFixedSize(200, 50)
        add_member_button.clicked.connect(self.add_member_to_parliament_seats)
        add_member_button_layout = QHBoxLayout()
        add_member_button_layout.addStretch()
        add_member_button_layout.addWidget(add_member_button)
        add_member_button_layout.addStretch()
        left_side_layout.addLayout(add_member_button_layout)
        left_side_layout.addStretch()

        # **Vertical Line Separator**
        vertical_line = QFrame()
        vertical_line.setFrameShape(QFrame.VLine)
        vertical_line.setFrameShadow(QFrame.Sunken)
        vertical_line.setLineWidth(2)
        vertical_line.setMinimumHeight(800) 

        # **Right Side Form for User Addition**
        right_side_layout = QVBoxLayout()
        
        # Add a heading above the user form
        user_heading_label = QLabel("Details of New User")
        user_heading_label.setStyleSheet("""
            font-size: 45px; 
            font-weight: bold; 
            color: #B22222; 
            margin-bottom: 20px;
        """)
        user_heading_label.setAlignment(Qt.AlignCenter)
        right_side_layout.addWidget(user_heading_label)

        # User Data Entry Form
        user_form_layout = QGridLayout()
        user_form_layout.setVerticalSpacing(20)

        user_labels = ["Username:", "Password:","Role:"]
        self.user_inputs = {}

        for i, label_text in enumerate(user_labels):
            label = QLabel(label_text)
            label.setStyleSheet("font-size: 25px; font-weight: bold;")
            input_field = QLineEdit()
            input_field.setStyleSheet("font-size: 22px; padding: 5px;")
            input_field.setFixedHeight(40)
            self.user_inputs[label_text] = input_field
            user_form_layout.addWidget(label, i, 0)
            user_form_layout.addWidget(input_field, i, 1)
        # Add Role Dropdown
        role_label = QLabel(user_labels[2])  # Define role_label here
        role_label.setStyleSheet("font-size: 25px; font-weight: bold;")
        self.role_dropdown = QComboBox()
        self.role_dropdown.addItems(["Administrator", "User"])
        self.role_dropdown.setStyleSheet("font-size: 22px; padding: 5px;")
        self.role_dropdown.setFixedHeight(40)
        user_form_layout.addWidget(role_label, 2, 0)
        user_form_layout.addWidget(self.role_dropdown, 2, 1)

        right_side_layout.addLayout(user_form_layout)

        # Add "Add to Database" button for the right panel
        add_user_button = QPushButton("Add to Database")
        add_user_button.setStyleSheet("""
            font-size: 22px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px;
            border-radius: 5px;
        """)
        add_user_button.setFixedSize(200, 50) 
        add_user_button.clicked.connect(self.add_user_to_database)
        add_user_button_layout = QHBoxLayout()
        add_user_button_layout.addStretch()
        add_user_button_layout.addWidget(add_user_button)
        add_user_button_layout.addStretch()
        right_side_layout.addLayout(add_user_button_layout)

        right_side_layout.addStretch()
       
        # Add Chairperson Details Section
        chairperson_heading_label = QLabel("Details of Chairperson")
        chairperson_heading_label.setStyleSheet("""
            font-size: 45px; 
            font-weight: bold; 
            color: #B22222; 
            margin-bottom: 20px;
        """)
        chairperson_heading_label.setAlignment(Qt.AlignCenter)
        right_side_layout.addWidget(chairperson_heading_label)

        # Chairperson Data Entry Form
        chairperson_form_layout = QGridLayout()
        chairperson_form_layout.setVerticalSpacing(20)

        # Position dropdown
        position_label = QLabel("Position:")
        position_label.setStyleSheet("font-size: 25px; font-weight: bold;")
        self.position_dropdown = QComboBox()
        self.position_dropdown.addItems(["Chairperson", "Vice-Chairperson", "Co-Chairman"])
        self.position_dropdown.setStyleSheet("font-size: 22px; padding: 5px;")
        self.position_dropdown.setFixedHeight(40)

        # Name entry
        name_label = QLabel("Name:")
        name_label.setStyleSheet("font-size: 25px; font-weight: bold;")
        self.name_input = QLineEdit()
        self.name_input.setStyleSheet("font-size: 22px; padding: 5px;")
        self.name_input.setFixedHeight(40)

        # Add widgets to the layout
        chairperson_form_layout.addWidget(position_label, 0, 0)
        chairperson_form_layout.addWidget(self.position_dropdown, 0, 1)
        chairperson_form_layout.addWidget(name_label, 1, 0)
        chairperson_form_layout.addWidget(self.name_input, 1, 1)

        right_side_layout.addLayout(chairperson_form_layout)

        # Add "Add to Database" button for the chairperson section
        add_chairperson_button = QPushButton("Add to Database")
        add_chairperson_button.setStyleSheet("""
            font-size: 22px; 
            font-weight: bold; 
            background-color: #B22222; 
            color: white; 
            padding: 10px;
            border-radius: 5px;
        """)
        add_chairperson_button.setFixedSize(200, 50)
        add_chairperson_button.clicked.connect(self.add_chairperson_to_database)
        add_chairperson_button_layout = QHBoxLayout()
        add_chairperson_button_layout.addStretch()
        add_chairperson_button_layout.addWidget(add_chairperson_button)
        add_chairperson_button_layout.addStretch()
        right_side_layout.addLayout(add_chairperson_button_layout)
        right_side_layout.addStretch()

        # **Main Layout for Left and Right Sections**
        main_layout = QHBoxLayout()
        main_layout.addLayout(left_side_layout)
        main_layout.addWidget(vertical_line)
        main_layout.addLayout(right_side_layout)

        layout_with_spacer = QVBoxLayout()
        layout_with_spacer.addLayout(main_layout)
        layout_with_spacer.addStretch()

        # **Horizontal Line**
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        # **Footer Label**
        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        complete_layout.addLayout(layout_with_spacer)
        complete_layout.addWidget(line)
        complete_layout.addWidget(footer_label)
        self.setLayout(complete_layout)

    def upload_picture(self):
        """Handle picture upload."""
        file_dialog = QFileDialog(self)
        file_dialog.setNameFilter("JPEG Files (*.jpeg *.jpg)")
        if file_dialog.exec_():
            self.uploaded_picture_path = file_dialog.selectedFiles()[0]
            file_name = os.path.basename(self.uploaded_picture_path)  # Extract file name from the path
            self.file_name_label.setText(file_name)
            QMessageBox.information(self, "Upload Success", f"Picture selected: {self.uploaded_picture_path}")


    def add_member_to_parliament_seats(self):
        """Add member details from the right side to the parliament_seats table in the database."""
        # Collect data from input fields
        seat_no = self.inputs["Seat No.:"].text().strip()
        name = self.inputs["Name:"].text().strip()
        party = self.inputs["Party:"].text().strip()
        state = self.inputs["State:"].text().strip()
        tenure_start = self.inputs["Tenure Start:"].text().strip()
        picture_path = getattr(self, 'uploaded_picture_path', None)  # Get uploaded file path if exists

        # Validate inputs
        if not seat_no or not name or not party or not state or not tenure_start:
            QMessageBox.warning(self, "Input Error", "All fields except Picture must be filled!")
            return

        # Read and convert the JPEG file to binary
        picture_binary = None
        if picture_path:
            try:
                with open(picture_path, 'rb') as file:
                    picture_binary = file.read()
            except Exception as e:
                QMessageBox.critical(self, "File Error", f"Error reading the picture file: {e}")
                return

        # Insert data into the database
        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    INSERT INTO parliament_seats (seat_no, name, party, state, tenure_start, picture)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """
                cursor.execute(query, (seat_no, name, party, state, tenure_start, picture_binary))
                connection.commit()
                QMessageBox.information(self, "Success", "Member added to Parliament Seats successfully!")
                for key in self.inputs:
                    self.inputs[key].clear()  
                self.uploaded_picture_path = None  
                
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
                QMessageBox.critical(self, "Database Error", f"Error adding member: {err}")
            finally:
                connection.close()


    def add_user_to_database(self):
        """Add user details from the right side to the users table in the database."""
        # Paste the provided method here.
        username = self.user_inputs["Username:"].text().strip()
        password = self.user_inputs["Password:"].text().strip()
        role = self.role_dropdown.currentText().strip()

        if not username or not password or not role:
            QMessageBox.warning(self, "Input Error", "All fields must be filled!")
            return

        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    INSERT INTO users (username, password, type)
                    VALUES (%s, %s, %s)
                """
                cursor.execute(query, (username, password, role))
                connection.commit()
                QMessageBox.information(self, "Success", "User added to the database successfully!")
                # Reset the input fields and dropdown
                self.user_inputs["Username:"].clear()  # Clear username field
                self.user_inputs["Password:"].clear()  # Clear password field
                self.role_dropdown.setCurrentIndex(0)  
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
                QMessageBox.critical(self, "Database Error", f"Error adding user: {err}")
            finally:
                connection.close()
        else:
            QMessageBox.critical(self, "Database Connection Error", "Could not connect to the database.")

    def add_chairperson_to_database(self):
        """Add chairperson details to the on_the_chair table in the database."""
        position = self.position_dropdown.currentText().strip()
        name = self.name_input.text().strip()

        if not position or not name:
            QMessageBox.warning(self, "Input Error", "Both Position and Name must be filled!")
            return

        connection = connect_to_database()
        if connection:
            try:
                cursor = connection.cursor()
                query = """
                    INSERT INTO on_the_chair (position, name)
                    VALUES (%s, %s)
                """
                cursor.execute(query, (position, name))
                connection.commit()
                QMessageBox.information(self, "Success", "Chairperson details added to the database successfully!")
                self.position_dropdown.setCurrentIndex(0)  
                self.name_input.clear()  
            except mysql.connector.Error as err:
                logging.error(f"Database Error: {err}")
                QMessageBox.critical(self, "Database Error", f"Error adding chairperson: {err}")
            finally:
                connection.close()
        else:
            QMessageBox.critical(self, "Database Connection Error", "Could not connect to the database.")        

    def back_to_dashboard(self):
        self.dashboard_window = DashboardWindow()
        self.dashboard_window.show()
        self.close()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    welcome_screen = WelcomeScreen()
    welcome_screen.show()

    sys.exit(app.exec_())
