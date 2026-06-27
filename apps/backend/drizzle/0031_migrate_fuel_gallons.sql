-- ─── 0031_migrate_fuel_gallons.sql ─────────────────────────────────────
--
-- Backfill gallons column in company_fuel_entries from liters
-- (US gal = liters / 3.785411784) for rows where gallons is 0 or null.
--
-- The backend now writes BOTH columns on POST/PUT. This migration ensures
-- existing historical records are also populated so all queries read gallons.
-- ────────────────────────────────────────────────────────────────────────

-- Step 1: convert gallons from TEXT to numeric(12, 4) and backfill from liters
ALTER TABLE company_fuel_entries
  ALTER COLUMN gallons TYPE numeric(12, 4)
  USING CASE WHEN gallons IN ('0', '') THEN (liters / 3.785411784)::numeric(12, 4) ELSE gallons::numeric END;

-- Step 2: backfill any that are still 0 or NULL
UPDATE company_fuel_entries
SET    gallons = (liters / 3.785411784)::numeric(12, 4)
WHERE  gallons = 0
   OR  gallons IS NULL;

-- Step 3: verify
DO $$
DECLARE
  null_count INTEGER;
  zero_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM company_fuel_entries WHERE gallons IS NULL;
  SELECT COUNT(*) INTO zero_count FROM company_fuel_entries WHERE gallons = 0;
  RAISE NOTICE 'company_fuel_entries with NULL gallons: %', null_count;
  RAISE NOTICE 'company_fuel_entries with gallons = 0:   %', zero_count;
END $$;
