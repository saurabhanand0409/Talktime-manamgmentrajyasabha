/**
 * Timezone utility functions for IST (Indian Standard Time)
 * IST is UTC+5:30
 */

/**
 * Get current date/time in IST
 * @returns {Date} Date object representing current IST time
 */
export function getISTNow() {
    // Get current UTC time
    const now = new Date();
    
    // IST is UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const istTime = new Date(utcTime + istOffset);
    
    return istTime;
}

/**
 * Format IST datetime to MySQL format (YYYY-MM-DD HH:MM:SS)
 * @param {Date} date - Date object to format
 * @returns {string} Formatted datetime string
 */
export function formatISTForMySQL(date) {
    if (!date) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Get IST datetime formatted for MySQL
 * @returns {string} Current IST datetime in MySQL format
 */
export function getISTNowForMySQL() {
    return formatISTForMySQL(getISTNow());
}

/**
 * Format IST date for HTML date input (YYYY-MM-DD)
 * @param {Date} date - Date object to format (optional, defaults to now)
 * @returns {string} Formatted date string
 */
export function formatISTDateForInput(date = null) {
    const d = date || getISTNow();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Normalize seat number by removing leading zeros
 * e.g., "01" -> "1", "056" -> "56", "009" -> "9"
 * @param {string|number} seat - Seat number to normalize
 * @returns {string} Normalized seat number
 */
export function normalizeSeatNo(seat) {
    if (seat === null || seat === undefined || seat === '') return '';
    // Convert to string, remove leading zeros, but keep at least one character
    const str = String(seat).replace(/^0+/, '');
    return str === '' ? '0' : str;
}

/**
 * Compare two seat numbers for equality (ignoring leading zeros)
 * @param {string|number} seat1 - First seat number
 * @param {string|number} seat2 - Second seat number
 * @returns {boolean} True if seats are equal (after normalization)
 */
export function seatsEqual(seat1, seat2) {
    return normalizeSeatNo(seat1) === normalizeSeatNo(seat2);
}
