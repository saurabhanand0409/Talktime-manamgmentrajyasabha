import sys
import socket
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QLabel, QLineEdit, QPushButton, QHBoxLayout, QMessageBox
)
from PyQt5.QtCore import QTimer


class InputWindow(QWidget):
    def __init__(self, host='127.0.0.1', port=65432, interval=10):
        super().__init__()
        self.setWindowTitle("Input Program")
        self.setGeometry(100, 100, 400, 300)

        self.host = host
        self.port = port
        self.interval = interval

        # Initial number to send
        self.number = "0"

        # Setup the GUI
        self.layout = QVBoxLayout()

        # Input label and field
        self.label = QLabel("Enter a Seat Number (1-245):")
        self.layout.addWidget(self.label)

        self.input_field = QLineEdit()
        self.input_field.setPlaceholderText("Type a seat number here")
        self.layout.addWidget(self.input_field)

        # Buttons layout
        self.buttons_layout = QHBoxLayout()

        self.start_button = QPushButton("Start Sending")
        self.start_button.clicked.connect(self.start_sending)
        self.buttons_layout.addWidget(self.start_button)

        self.stop_button = QPushButton("Stop Sending")
        self.stop_button.clicked.connect(self.stop_sending)
        self.stop_button.setEnabled(False)  # Initially disabled
        self.buttons_layout.addWidget(self.stop_button)

        self.layout.addLayout(self.buttons_layout)

        # Feedback label
        self.feedback_label = QLabel("Status: Not Sending")
        self.layout.addWidget(self.feedback_label)

        self.setLayout(self.layout)

        # Timer for sending data
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.send_data)

        # Socket setup
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

        # Flag to indicate if sending is in progress
        self.is_sending = False

    def start_sending(self):
        """Start sending data at regular intervals."""
        number = self.input_field.text().strip()
        if not number.isdigit():
            self.feedback_label.setText("Status: Invalid input. Enter a number between 1 and 245.")
            QMessageBox.warning(self, "Invalid Input", "Please enter a valid number between 1 and 245.")
            return

        number = int(number)
        if not (1 <= number <= 245):
            self.feedback_label.setText("Status: Wrong Seat No.")
            QMessageBox.warning(self, "Invalid Seat No.", "Wrong Seat No. Please enter a number between 1 and 245.")
            return

        self.number = str(number)  # Update the number to be sent
        self.feedback_label.setText(f"Status: Sending '{self.number}' to {self.host}:{self.port}.")

        if not self.is_sending:
            self.timer.start(self.interval)  # Start timer with interval
            self.stop_button.setEnabled(True)  # Enable stop button
            self.is_sending = True

    def stop_sending(self):
        """Stop sending data."""
        self.timer.stop()
        self.feedback_label.setText("Status: Sending stopped.")
        self.stop_button.setEnabled(False)  # Disable stop button
        self.is_sending = False

    def send_data(self):
        """Send the current number to the receiver program."""
        try:
            self.socket.sendto(self.number.encode(), (self.host, self.port))
        except Exception as e:
            self.feedback_label.setText(f"Error sending data: {e}")
            self.stop_sending()

    def closeEvent(self, event):
        """Ensure the socket is closed on window close."""
        self.stop_sending()
        self.socket.close()
        event.accept()


if __name__ == "__main__":
    host = '127.0.0.1'
    port = 65432
    interval = 10  # Default interval in milliseconds

    # Command-line argument parsing for host, port, and interval
    if len(sys.argv) > 1:
        try:
            host = sys.argv[1]
            port = int(sys.argv[2])
            if len(sys.argv) > 3:
                interval = int(sys.argv[3])
        except ValueError:
            print("Invalid arguments. Usage: python input_feeder.py [host] [port] [interval_ms]")
            sys.exit(1)

    app = QApplication(sys.argv)
    window = InputWindow(host=host, port=port, interval=interval)
    window.show()
    sys.exit(app.exec_())
