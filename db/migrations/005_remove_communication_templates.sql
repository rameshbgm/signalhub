-- Communication templates are no longer part of the product. Dropping these
-- tables permanently removes all saved template groups and template content.
DROP TABLE IF EXISTS incident_templates;
DROP TABLE IF EXISTS template_groups;
