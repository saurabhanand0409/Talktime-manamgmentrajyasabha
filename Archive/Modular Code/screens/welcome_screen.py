from PyQt5.QtWidgets import QWidget, QLabel, QVBoxLayout, QFrame
from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtGui import QPixmap
import logging

class WelcomeScreen(QWidget):
    def __init__(self):
        super().__init__()
        print("WelcomeScreen initialized!")  # Debugging
        logging.info("WelcomeScreen initialized")

        # Set window properties
        self.setWindowTitle("Welcome - Talk Time Management System")
        self.setFixedSize(1000, 700)
        self.setStyleSheet("background-color: #F5F5DC;")

        # Title Label
        title_label = QLabel("Welcome to\nTalk Time Management System\nfor Rajya Sabha")
        title_label.setStyleSheet("font-size: 50px; font-weight: bold; color: #B22222;")
        title_label.setAlignment(Qt.AlignCenter)

        # Parliament Logo
        logo_label = QLabel()
        logo_pixmap = QPixmap("assets/parliament_logo.png")  # Ensure this file exists in the working directory
        logo_pixmap = logo_pixmap.scaled(800, 800, Qt.KeepAspectRatio)  # Scale the image
        logo_label.setPixmap(logo_pixmap)
        logo_label.setAlignment(Qt.AlignCenter)

        # Horizontal Line
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        line.setLineWidth(2)

        # Footer Label
        footer_label = QLabel("© Bihar Communications Pvt. Ltd 2024")
        footer_label.setStyleSheet("font-size: 22px; color: #888888;")
        footer_label.setAlignment(Qt.AlignCenter)

        # Main Layout
        layout = QVBoxLayout()
        layout.addWidget(title_label)
        layout.addWidget(logo_label)  # Add the parliament logo
        layout.addStretch()  # Push everything up slightly
        layout.addWidget(line)
        layout.addWidget(footer_label)
        self.setLayout(layout)

        # Navigate to the next screen after 4 seconds
        QTimer.singleShot(4000, self.navigate_next)

    def navigate_next(self):
        print("Navigating to the next screen!")  # Debugging
        logging.info("Navigating to the next screen")
        # Logic for navigation to the next screen
