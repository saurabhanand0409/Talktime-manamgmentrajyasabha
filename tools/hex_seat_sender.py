"""
Hex Seat Sender - Dummy tool to simulate hardware input
Sends seat numbers in hex format to the Parliament web app
"""

import sys
import requests
import tkinter as tk
from tkinter import ttk, messagebox
import time
import threading

class HexSeatSender:
    def __init__(self, root):
        self.root = root
        self.root.title("Hex Seat Sender - Parliament System")
        self.root.geometry("400x500")
        self.root.configure(bg='#F5F5DC')
        
        self.api_url = "http://localhost:5000/api/hex-seat"
        self.is_sending = False
        self.send_thread = None
        
        self.setup_ui()
    
    def setup_ui(self):
        # Title
        title = tk.Label(
            self.root, 
            text="Hex Seat Sender", 
            font=("Segoe UI", 18, "bold"),
            fg="#B22222",
            bg="#F5F5DC"
        )
        title.pack(pady=20)
        
        subtitle = tk.Label(
            self.root,
            text="Simulates hardware hex input",
            font=("Segoe UI", 10),
            fg="#666666",
            bg="#F5F5DC"
        )
        subtitle.pack()
        
        # Input Frame
        input_frame = tk.Frame(self.root, bg="#F5F5DC")
        input_frame.pack(pady=20, padx=20, fill="x")
        
        # Seat Number Input (Decimal)
        tk.Label(
            input_frame, 
            text="Seat Number (1-245):", 
            font=("Segoe UI", 12),
            bg="#F5F5DC"
        ).pack(anchor="w")
        
        self.seat_entry = tk.Entry(
            input_frame, 
            font=("Segoe UI", 14),
            width=20
        )
        self.seat_entry.pack(pady=5, fill="x")
        self.seat_entry.bind('<Return>', lambda e: self.send_seat())
        
        # Hex Display
        tk.Label(
            input_frame, 
            text="Hex Value:", 
            font=("Segoe UI", 12),
            bg="#F5F5DC"
        ).pack(anchor="w", pady=(15, 0))
        
        self.hex_display = tk.Label(
            input_frame,
            text="0x00",
            font=("Consolas", 24, "bold"),
            fg="#B22222",
            bg="white",
            relief="sunken",
            padx=20,
            pady=10
        )
        self.hex_display.pack(pady=5, fill="x")
        
        # Update hex on entry change
        self.seat_entry.bind('<KeyRelease>', self.update_hex_display)
        
        # Buttons Frame
        btn_frame = tk.Frame(self.root, bg="#F5F5DC")
        btn_frame.pack(pady=20)
        
        # Send Once Button
        self.send_btn = tk.Button(
            btn_frame,
            text="Send Once",
            font=("Segoe UI", 12, "bold"),
            bg="#28A745",
            fg="white",
            padx=20,
            pady=10,
            command=self.send_seat
        )
        self.send_btn.pack(side="left", padx=5)
        
        # Continuous Send Button
        self.continuous_btn = tk.Button(
            btn_frame,
            text="Start Continuous",
            font=("Segoe UI", 12, "bold"),
            bg="#B22222",
            fg="white",
            padx=20,
            pady=10,
            command=self.toggle_continuous
        )
        self.continuous_btn.pack(side="left", padx=5)
        
        # Interval setting
        interval_frame = tk.Frame(self.root, bg="#F5F5DC")
        interval_frame.pack(pady=10)
        
        tk.Label(
            interval_frame,
            text="Send Interval (ms):",
            font=("Segoe UI", 10),
            bg="#F5F5DC"
        ).pack(side="left")
        
        self.interval_var = tk.StringVar(value="1000")
        self.interval_entry = tk.Entry(
            interval_frame,
            textvariable=self.interval_var,
            font=("Segoe UI", 10),
            width=8
        )
        self.interval_entry.pack(side="left", padx=5)
        
        # Status
        self.status_label = tk.Label(
            self.root,
            text="Status: Ready",
            font=("Segoe UI", 10),
            fg="#666666",
            bg="#F5F5DC"
        )
        self.status_label.pack(pady=10)
        
        # Response Log
        log_frame = tk.Frame(self.root, bg="#F5F5DC")
        log_frame.pack(pady=10, padx=20, fill="both", expand=True)
        
        tk.Label(
            log_frame,
            text="Response Log:",
            font=("Segoe UI", 10),
            bg="#F5F5DC",
            anchor="w"
        ).pack(fill="x")
        
        self.log_text = tk.Text(
            log_frame,
            height=6,
            font=("Consolas", 9),
            wrap="word"
        )
        self.log_text.pack(fill="both", expand=True)
    
    def update_hex_display(self, event=None):
        """Update the hex display when seat number changes."""
        try:
            seat_no = int(self.seat_entry.get())
            if 1 <= seat_no <= 245:
                hex_val = f"0x{seat_no:02X}"
                self.hex_display.config(text=hex_val, fg="#B22222")
            else:
                self.hex_display.config(text="Invalid", fg="red")
        except ValueError:
            self.hex_display.config(text="0x00", fg="#888888")
    
    def send_seat(self):
        """Send the seat number to the server."""
        try:
            seat_no = int(self.seat_entry.get())
            if seat_no < 1 or seat_no > 245:
                messagebox.showerror("Error", "Seat number must be between 1 and 245")
                return
            
            hex_value = f"0x{seat_no:02X}"
            
            # Send to API
            response = requests.post(
                self.api_url,
                json={"hex": hex_value},
                timeout=5
            )
            
            result = response.json()
            
            if result.get('success'):
                self.log(f"✓ Sent: {hex_value} -> Seat {seat_no}")
                self.status_label.config(text=f"Status: Sent {hex_value}", fg="green")
            else:
                self.log(f"✗ Error: {result.get('error')}")
                self.status_label.config(text="Status: Error", fg="red")
                
        except requests.exceptions.ConnectionError:
            self.log("✗ Connection failed - Is server running?")
            self.status_label.config(text="Status: Server not running", fg="red")
        except ValueError:
            messagebox.showerror("Error", "Please enter a valid number")
        except Exception as e:
            self.log(f"✗ Error: {str(e)}")
    
    def toggle_continuous(self):
        """Toggle continuous sending."""
        if self.is_sending:
            self.is_sending = False
            self.continuous_btn.config(text="Start Continuous", bg="#B22222")
            self.status_label.config(text="Status: Stopped", fg="#666666")
        else:
            self.is_sending = True
            self.continuous_btn.config(text="Stop Continuous", bg="#DC3545")
            self.status_label.config(text="Status: Sending continuously...", fg="orange")
            self.send_thread = threading.Thread(target=self.continuous_send, daemon=True)
            self.send_thread.start()
    
    def continuous_send(self):
        """Continuously send the seat number."""
        while self.is_sending:
            try:
                self.send_seat()
                interval = int(self.interval_var.get())
                time.sleep(interval / 1000)
            except Exception as e:
                self.log(f"✗ Error: {str(e)}")
                break
    
    def log(self, message):
        """Add a message to the log."""
        timestamp = time.strftime("%H:%M:%S")
        self.log_text.insert("end", f"[{timestamp}] {message}\n")
        self.log_text.see("end")


if __name__ == "__main__":
    root = tk.Tk()
    app = HexSeatSender(root)
    root.mainloop()
