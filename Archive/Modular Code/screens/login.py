from PyQt5.QtWidgets import QWidget, QLabel, QLineEdit, QPushButton, QVBoxLayout, QMessageBox
from utils import connect_to_database, check_password

class LoginWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Login - Talk Time Management System")
        self.setFixedSize(600, 400)
        self.init_ui()

    def init_ui(self):
        self.username_input = QLineEdit()
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.Password)

        login_button = QPushButton("Login")
        login_button.clicked.connect(self.verify_login)

        layout = QVBoxLayout()
        layout.addWidget(QLabel("Username:"))
        layout.addWidget(self.username_input)
        layout.addWidget(QLabel("Password:"))
        layout.addWidget(self.password_input)
        layout.addWidget(login_button)
        self.setLayout(layout)

    def verify_login(self):
        username = self.username_input.text()
        password = self.password_input.text()

        connection = connect_to_database()
        if connection:
            cursor = connection.cursor()
            cursor.execute("SELECT password FROM users WHERE username = %s", (username,))
            result = cursor.fetchone()
            if result and check_password(password, result[0]):
                QMessageBox.information(self, "Success", "Login successful!")
            else:
                QMessageBox.warning(self, "Error", "Invalid credentials")
            connection.close()
