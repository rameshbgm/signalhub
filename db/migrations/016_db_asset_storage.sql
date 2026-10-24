-- Store uploaded images and data exports in PostgreSQL (driver DB) instead of
-- the local filesystem. Blobs live in their own table so metadata queries on
-- `assets` never drag the bytes along. Rows that used the LOCAL driver are
-- re-labelled DB; their files must be imported into asset_blobs (a row without
-- a blob is served as 503 until then).

CREATE TABLE asset_blobs (
  storage_key text PRIMARY KEY,
  content_type text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assets DROP CONSTRAINT assets_storage_driver_check;
ALTER TABLE data_export_jobs DROP CONSTRAINT data_export_jobs_storage_driver_check;
ALTER TABLE asset_deletion_jobs DROP CONSTRAINT asset_deletion_jobs_storage_driver_check;

UPDATE assets SET storage_driver = 'DB' WHERE storage_driver = 'LOCAL';
UPDATE data_export_jobs SET storage_driver = 'DB' WHERE storage_driver = 'LOCAL';
UPDATE asset_deletion_jobs SET storage_driver = 'DB' WHERE storage_driver = 'LOCAL';

ALTER TABLE assets ADD CONSTRAINT assets_storage_driver_check CHECK (storage_driver IN ('DB', 'S3'));
ALTER TABLE data_export_jobs ADD CONSTRAINT data_export_jobs_storage_driver_check CHECK (storage_driver IN ('DB', 'S3'));
ALTER TABLE asset_deletion_jobs ADD CONSTRAINT asset_deletion_jobs_storage_driver_check CHECK (storage_driver IN ('DB', 'S3'));
