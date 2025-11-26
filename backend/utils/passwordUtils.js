import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Password encryption that fits VARCHAR(50) - using SHA-256 with truncation
export const encryptPassword = async (password) => {
    if (!password) return null;
    
    try {
        // Use SHA-256 hash which produces 64 characters, but we'll truncate to fit VARCHAR(50)
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        // Truncate to 50 characters to fit the database column
        return hash.substring(0, 50);
    } catch (error) {
        console.error('Error encrypting password:', error);
        return null;
    }
};

// Password verification for SHA-256 hashes
export const verifyPassword = async (password, hashedPassword) => {
    if (!password || !hashedPassword) return false;
    
    try {
        // Hash the provided password and compare with stored hash
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        const truncatedHash = hash.substring(0, 50);
        return truncatedHash === hashedPassword;
    } catch (error) {
        console.error('Error verifying password:', error);
        return false;
    }
};

// Function to decrypt password based on the stored format
export const decryptPassword = (storedPassword) => {
    if (!storedPassword) return '';
    
    console.log('=== PASSWORD DECRYPTION ANALYSIS ===');
    console.log('Stored password type:', typeof storedPassword);
    console.log('Stored password length:', storedPassword.length);
    console.log('Stored password starts with tab:', storedPassword.startsWith('\t'));
    console.log('Stored password value:', storedPassword);
    
    // Method 1: Check if it's a plain text password with tab prefix (legacy format)
    if (storedPassword.startsWith('\t')) {
        const decryptedPassword = storedPassword.substring(1); // Remove the tab character
        console.log('✅ Decrypted password (removed tab):', decryptedPassword);
        return decryptedPassword;
    }
    
    // Method 2: Check if it's a plain text password without tab
    if (storedPassword.length <= 50 && !storedPassword.match(/^[a-fA-F0-9]{50}$/)) {
        // If it's not a 50-character hex string, it's likely plain text
        console.log('✅ Decrypted password (plain text):', storedPassword);
        return storedPassword;
    }
    
    // Method 3: Check if it's a SHA-256 hash (cannot be decrypted)
    if (storedPassword.match(/^[a-fA-F0-9]{50}$/)) {
        console.log('❌ Cannot decrypt SHA-256 hash (one-way encryption)');
        return '[SHA-256 Hash - Cannot Decrypt]';
    }
    
    // Method 4: Check if it's a bcrypt hash (cannot be decrypted)
    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
        console.log('❌ Cannot decrypt bcrypt hash (one-way encryption)');
        return '[Bcrypt Hash - Cannot Decrypt]';
    }
    
    // Method 5: Unknown format, return as-is
    console.log('❓ Unknown password format, returning as-is');
    return storedPassword;
};

// Legacy function for backward compatibility (deprecated)
export const customEncryptPassword = async (password) => {
    console.warn('customEncryptPassword is deprecated. Use encryptPassword instead.');
    return await encryptPassword(password);
};

// Legacy function for backward compatibility (deprecated)
export const customDecryptPassword = (encryptedPassword) => {
    console.warn('customDecryptPassword is deprecated. Use decryptPassword instead.');
    return decryptPassword(encryptedPassword);
};