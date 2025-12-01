# Media Path Format in employees_media Table

## Overview

The `employees_media` table stores references to media files in the `signature_path`, `photo_path`, and `thumb_path` columns. The system supports two formats:

1. **New Format (Recommended)**: Stores `pathid` (integer) that references the `media_path` table
2. **Old Format (Legacy)**: Stores file paths (strings) for backward compatibility

## Sample Formats

### Current Format (Using pathid - INT columns)

The `employees_media` table columns are now INT type, storing pathid values:

```sql
-- Example records in employees_media table
signature_path: 2    -- Integer (pathid from media_path table)
photo_path: 1        -- Integer (pathid from media_path table)  
thumb_path: 3        -- Integer (pathid from media_path table)
```

**NULL values are allowed** - if a media file doesn't exist, the pathid will be NULL.

**How it works:**
- `pathid` is an integer that references `media_path.pathid`
- The system resolves the pathid to the actual file path by:
  1. Looking up `media_path.mediapath` using the pathid
  2. Constructing the full path: `mediapath + "/" + employeeObjId + "." + extension`
  3. Example: If `pathid=1` points to `\\192.168.11.26\hris\uploads\photo`, and `employeeObjId=0a5130f7-3926-4b40-b38e-315742d48201`, the full path becomes: `\\192.168.11.26\hris\uploads\photo\0a5130f7-3926-4b40-b38e-315742d48201.jpg`

### Legacy Format (No longer supported)

**Note:** Since the columns are now INT type, file path strings are no longer supported. All values must be pathid (integers) or NULL.

If you have old data with file paths, you must migrate them to pathid format using the migration script.

## Database Schema

### employees_media Table

```sql
CREATE TABLE employees_media (
  objid VARCHAR(36) PRIMARY KEY,
  emp_objid VARCHAR(36) NOT NULL,
  signature_path INT NULL,  -- pathid (integer) that references media_path.pathid
  photo_path INT NULL,       -- pathid (integer) that references media_path.pathid
  thumb_path INT NULL,       -- pathid (integer) that references media_path.pathid
  date_accomplished DATE NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (signature_path) REFERENCES media_path(pathid),
  FOREIGN KEY (photo_path) REFERENCES media_path(pathid),
  FOREIGN KEY (thumb_path) REFERENCES media_path(pathid)
);
```

**Note:** The columns are now INT type, storing pathid values that reference `media_path.pathid`.

### media_path Table

```sql
CREATE TABLE media_path (
  pathid INT AUTO_INCREMENT PRIMARY KEY,
  foldername VARCHAR(255) NOT NULL,    -- e.g., "photo", "signature", "thumb"
  folderfor VARCHAR(255) NOT NULL,     -- e.g., "Employee Photos", "Employee Signatures"
  mediapath TEXT NOT NULL              -- Full path, e.g., "\\192.168.11.26\hris\uploads\photo"
);
```

## Example Data

### media_path Table (Reference Table)

```sql
INSERT INTO media_path (pathid, foldername, folderfor, mediapath) VALUES
(1, 'photo', 'Employee Photos', '\\192.168.11.26\hris\uploads\photo'),
(2, 'signature', 'Employee Signatures', '\\192.168.11.26\hris\uploads\signature'),
(3, 'thumb', 'Employee Thumbmarks', '\\192.168.11.26\hris\uploads\thumb');
```

### employees_media Table (Current Format - INT columns)

```sql
INSERT INTO employees_media (objid, emp_objid, signature_path, photo_path, thumb_path) VALUES
('uuid-1', '0a5130f7-3926-4b40-b38e-315742d48201', 2, 1, 3);
-- signature_path = 2 (INT, references pathid 2 = signature folder)
-- photo_path = 1 (INT, references pathid 1 = photo folder)
-- thumb_path = 3 (INT, references pathid 3 = thumb folder)
```

**Example with NULL values (no media files):**
```sql
INSERT INTO employees_media (objid, emp_objid, signature_path, photo_path, thumb_path) VALUES
('uuid-2', 'another-employee-id', NULL, NULL, NULL);
-- All paths are NULL - no media files uploaded yet
```

## How the System Works

Since the columns are now INT type:

1. **All values are pathid (integers)** or NULL
   - System always resolves pathid using `media_path` table
   - Requires `employeeObjId` and `type` parameters when reading/deleting
   - Constructs full path: `media_path.mediapath + "/" + employeeObjId + "." + extension`

2. **NULL values** indicate no media file exists for that type

## Migration from Old to New Format

To migrate existing records from old format to new format:

```sql
-- Step 1: Ensure media_path table has the correct folders
-- Step 2: Update employees_media to use pathid instead of file paths

-- Example migration query (adjust pathid values based on your media_path table):
UPDATE employees_media 
SET 
  signature_path = 2,  -- Replace with actual pathid for signature folder
  photo_path = 1,      -- Replace with actual pathid for photo folder
  thumb_path = 3       -- Replace with actual pathid for thumb folder
WHERE 
  signature_path LIKE 'uploads/signature/%' OR
  photo_path LIKE 'uploads/photo/%' OR
  thumb_path LIKE 'uploads/thumb/%';
```

## Current Issue

The error you're seeing suggests the database still has old format paths like `"uploads/photo/..."`. The system is trying to read these as file paths, but they don't exist locally.

**Solution Options:**

1. **Migrate existing data** to use pathid format (recommended)
2. **Keep old format** but ensure files exist at those paths
3. **Use a hybrid approach** - new uploads use pathid, old records keep file paths

## Format for All Records

**All records must use pathid (integer) format since columns are INT:**

```sql
-- Example: Save pathid values
signature_path: 2    -- Integer (INT column), references media_path.pathid = 2
photo_path: 1        -- Integer (INT column), references media_path.pathid = 1
thumb_path: 3        -- Integer (INT column), references media_path.pathid = 3
```

**Benefits of INT column format:**
- ✅ Type safety (database enforces integer values)
- ✅ Foreign key constraints possible (can add FK to media_path.pathid)
- ✅ More flexible (can change folder paths without updating all records)
- ✅ Centralized configuration (all paths in media_path table)
- ✅ Network share compatible (paths automatically use network share when configured)
- ✅ Easier to maintain (update one record in media_path to change all file locations)
- ✅ Better performance (integer comparisons are faster than string comparisons)

