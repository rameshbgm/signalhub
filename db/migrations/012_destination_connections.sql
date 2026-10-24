-- Team destination providers become opt-in: a platform administrator adds each
-- one, optionally with a shared connection organizations can send through.
-- Existing organization destinations keep delivering; only new ones need an added provider.
ALTER TABLE platform_configuration
  ADD COLUMN destination_connections_ciphertext text;

UPDATE platform_configuration SET enabled_destination_channels = '{}' WHERE id = 'global';
