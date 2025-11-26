// backend/models/User.js

import mongoose from 'mongoose';

// Define the User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true, // Username is a mandatory field
    unique: true,   // Each username must be unique
    trim: true,     // Remove whitespace from both ends of the string
    minlength: 3,   // Minimum length for username
  },
  password: {
    type: String,
    required: true, // Password is a mandatory field
    minlength: 6,   // Minimum length for password (before hashing)
  },
  employeeId: {
    type: String,
    required: true, // Employee ID is mandatory
    unique: true,   // Each employee ID must be unique
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'employee'], // Role can only be 'admin' or 'employee'
    default: 'employee',         // Default role is 'employee' if not specified
    required: true,              // Role is a mandatory field
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the creation date
  },
});

// Create the User model from the schema
const User = mongoose.model('User', userSchema);

export default User;
