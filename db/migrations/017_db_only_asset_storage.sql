-- S3 storage was removed; PostgreSQL is the only asset backend. Fails loudly if
-- any row still points at S3, since those objects cannot be read any more.
ALTER TABLE assets DROP CONSTRAINT assets_storage_driver_check;
ALTER TABLE data_export_jobs DROP CONSTRAINT data_export_jobs_storage_driver_check;
ALTER TABLE asset_deletion_jobs DROP CONSTRAINT asset_deletion_jobs_storage_driver_check;
ALTER TABLE assets ADD CONSTRAINT assets_storage_driver_check CHECK (storage_driver = 'DB');
ALTER TABLE data_export_jobs ADD CONSTRAINT data_export_jobs_storage_driver_check CHECK (storage_driver = 'DB');
ALTER TABLE asset_deletion_jobs ADD CONSTRAINT asset_deletion_jobs_storage_driver_check CHECK (storage_driver = 'DB');
