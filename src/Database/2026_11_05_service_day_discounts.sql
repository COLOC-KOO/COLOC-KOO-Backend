SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'services_ckoo'
    AND COLUMN_NAME = 'reduction_4_jours'
);
SET @migration = IF(
  @column_exists = 0,
  'ALTER TABLE services_ckoo ADD COLUMN reduction_4_jours DECIMAL(5,2) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'services_ckoo'
    AND COLUMN_NAME = 'reduction_5_jours'
);
SET @migration = IF(
  @column_exists = 0,
  'ALTER TABLE services_ckoo ADD COLUMN reduction_5_jours DECIMAL(5,2) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'demandes_service'
    AND COLUMN_NAME = 'reduction_pourcentage'
);
SET @migration = IF(
  @column_exists = 0,
  'ALTER TABLE demandes_service ADD COLUMN reduction_pourcentage DECIMAL(5,2) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE migration_statement FROM @migration;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
