-- migrate:up
ALTER TABLE endpoints
  ADD COLUMN headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT endpoints_headers_object CHECK (jsonb_typeof(headers) = 'object');

-- migrate:down
ALTER TABLE endpoints DROP CONSTRAINT endpoints_headers_object;
ALTER TABLE endpoints DROP COLUMN headers;
