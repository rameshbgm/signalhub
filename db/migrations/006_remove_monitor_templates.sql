-- Retire reusable monitor blueprints while retaining the concrete monitors
-- previously created from them as independently managed monitors.
UPDATE monitors SET template_id = NULL WHERE template_id IS NOT NULL;
ALTER TABLE monitors DROP COLUMN IF EXISTS template_id;
DROP TABLE IF EXISTS monitor_templates;
