"""
Script to fetch Rajya Sabha MP list from Parliament website
and save to CSV for bulk import
"""

import csv
import os

# Since the official Parliament website uses dynamic content,
# here's a sample template with known MPs.
# You can fill this with actual data from: https://rajyasabha.nic.in/

# Sample data based on party-wise distribution shown on Parliament site:
# BJP: 103, INC: 27, AITC: 13, AAP: 10, DMK: 10, BJD: 7, Nominated: 7, YSRCP: 7, AIADMK: 5

SAMPLE_MPS = [
    # Format: (seat_no, name, party, state)
    # This is sample data - replace with actual MP list
    (1, "M. Venkaiah Naidu", "BJP", "Karnataka"),
    (2, "Piyush Goyal", "BJP", "Maharashtra"),
    (3, "Nirmala Sitharaman", "BJP", "Karnataka"),
    (4, "Smriti Irani", "BJP", "Gujarat"),
    (5, "Ashwini Vaishnaw", "BJP", "Odisha"),
    (6, "Jyotiraditya Scindia", "BJP", "Madhya Pradesh"),
    (7, "Ram Nath Kovind", "BJP", "Uttar Pradesh"),
    (8, "Sarbananda Sonowal", "BJP", "Assam"),
    (9, "Dharmendra Pradhan", "BJP", "Madhya Pradesh"),
    (10, "Mukhtar Abbas Naqvi", "BJP", "Jharkhand"),
    (11, "Bhupender Yadav", "BJP", "Rajasthan"),
    (12, "Mansukh Mandaviya", "BJP", "Gujarat"),
    (13, "Rajeev Chandrasekhar", "BJP", "Karnataka"),
    (14, "John Barla", "BJP", "West Bengal"),
    (15, "Mallikarjun Kharge", "INC", "Karnataka"),
    (16, "Jairam Ramesh", "INC", "Karnataka"),
    (17, "P. Chidambaram", "INC", "Tamil Nadu"),
    (18, "Digvijaya Singh", "INC", "Madhya Pradesh"),
    (19, "Randeep Surjewala", "INC", "Haryana"),
    (20, "Pramod Tiwari", "INC", "Uttar Pradesh"),
    (21, "Derek O'Brien", "TMC", "West Bengal"),
    (22, "Sukhendu Sekhar Ray", "TMC", "West Bengal"),
    (23, "Mahua Moitra", "TMC", "West Bengal"),
    (24, "Dola Sen", "TMC", "West Bengal"),
    (25, "Raghav Chadha", "AAP", "Punjab"),
    (26, "Sanjay Singh", "AAP", "Delhi"),
    (27, "Sandeep Pathak", "AAP", "Delhi"),
    (28, "Swati Maliwal", "AAP", "Delhi"),
    (29, "Tiruchi Siva", "DMK", "Tamil Nadu"),
    (30, "Kanimozhi", "DMK", "Tamil Nadu"),
    # Add more MPs here...
]

def create_csv_template():
    """Create a CSV template for bulk MP import"""
    csv_path = os.path.join(os.path.dirname(__file__), 'mp_template.csv')
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['seat_no', 'name', 'party', 'state', 'tenure_start'])
        
        # Write sample data
        for seat_no, name, party, state in SAMPLE_MPS:
            writer.writerow([seat_no, name, party, state, '2024-04-01'])
        
        # Add empty rows for remaining seats (up to 245)
        for i in range(len(SAMPLE_MPS) + 1, 246):
            writer.writerow([i, '', '', '', ''])
    
    print(f"CSV template created: {csv_path}")
    print(f"Template has {len(SAMPLE_MPS)} sample MPs and {245 - len(SAMPLE_MPS)} empty rows")
    return csv_path

def create_sql_insert_file():
    """Create SQL INSERT statements for sample data"""
    sql_path = os.path.join(os.path.dirname(__file__), 'sample_mps.sql')
    
    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write("-- Sample MP data for Rajya Sabha\n")
        f.write("-- Run this in MySQL to insert sample data\n\n")
        
        for seat_no, name, party, state in SAMPLE_MPS:
            f.write(f"INSERT INTO parliament_seats (seat_no, name, party, state, tenure_start) VALUES ({seat_no}, '{name}', '{party}', '{state}', '2024-04-01') ON DUPLICATE KEY UPDATE name='{name}', party='{party}', state='{state}';\n")
    
    print(f"SQL file created: {sql_path}")
    return sql_path

if __name__ == "__main__":
    print("Rajya Sabha MP Data Helper")
    print("=" * 50)
    print("\nNote: For complete MP list, visit:")
    print("https://rajyasabha.nic.in/")
    print("\nParty-wise strength (as of website):")
    print("  BJP: 103")
    print("  INC: 27")
    print("  AITC (TMC): 13")
    print("  AAP: 10")
    print("  DMK: 10")
    print("  BJD: 7")
    print("  Nominated: 7")
    print("  YSRCP: 7")
    print("  AIADMK: 5")
    print()
    
    create_csv_template()
    create_sql_insert_file()
