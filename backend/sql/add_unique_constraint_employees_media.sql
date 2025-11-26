-- Add unique constraint to employees_media table to ensure only 1 record per user
-- This prevents duplicate records at the database level

-- First, remove any existing duplicates (if any)
DELETE t1 FROM employees_media t1
INNER JOIN employees_media t2 
WHERE t1.objid > t2.objid 
AND t1.emp_objid = t2.emp_objid;

-- Add unique constraint on emp_objid
ALTER TABLE employees_media 
ADD CONSTRAINT unique_employee_media UNIQUE (emp_objid);

-- Add index for better performance (if not already exists)
CREATE INDEX IF NOT EXISTS idx_employees_media_emp_objid ON employees_media(emp_objid);

-- Verify the constraint was added
SELECT 
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_NAME = 'employees_media' 
AND CONSTRAINT_NAME = 'unique_employee_media';
