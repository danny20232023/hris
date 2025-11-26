-- Add file path columns to employees_media table
-- This allows gradual migration from BLOB to filesystem storage

ALTER TABLE employees_media 
ADD COLUMN signature_path VARCHAR(255) NULL AFTER signature,
ADD COLUMN photo_path VARCHAR(255) NULL AFTER photo,
ADD COLUMN thumb_path VARCHAR(255) NULL AFTER thumb;

-- Add indexes for better performance
CREATE INDEX idx_employees_media_signature_path ON employees_media(signature_path);
CREATE INDEX idx_employees_media_photo_path ON employees_media(photo_path);
CREATE INDEX idx_employees_media_thumb_path ON employees_media(thumb_path);

-- Optional: After migration is complete and tested, you can drop the BLOB columns:
-- ALTER TABLE employees_media DROP COLUMN signature;
-- ALTER TABLE employees_media DROP COLUMN photo;
-- ALTER TABLE employees_media DROP COLUMN thumb;
