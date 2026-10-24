-- Incident records remain available in the console; public disclosure is reversible.
ALTER TABLE incidents ADD COLUMN public_visible boolean NOT NULL DEFAULT true;
CREATE INDEX incidents_public_page_created_idx ON incidents (page_id, created_at DESC) WHERE public_visible = true;
