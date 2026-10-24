-- New team destination providers are available by default, matching a fresh
-- installation; administrators can still disable them in Platform configuration.
UPDATE platform_configuration
SET enabled_destination_channels = (
  SELECT array_agg(DISTINCT channel)
  FROM unnest(
    enabled_destination_channels ||
    ARRAY['MATTERMOST', 'ROCKET_CHAT', 'WEBEX', 'ZULIP', 'SPLUNK_ON_CALL', 'PUSHOVER', 'GOTIFY', 'HTTP']
  ) AS channel
)
WHERE id = 'global';
