ALTER TABLE `utilisateurs`
  ADD COLUMN `cin` VARCHAR(50) NULL AFTER `telephone`;

-- Optional: backfill existing rows with NULL if the column already exists
-- ALTER TABLE `utilisateurs` MODIFY COLUMN `cin` VARCHAR(50) NULL;
