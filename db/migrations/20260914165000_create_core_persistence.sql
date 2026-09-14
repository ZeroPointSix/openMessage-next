-- migrate:up

CREATE TABLE messages (
  id text PRIMARY KEY,
  origin text NOT NULL,
  destination text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE interactions (
  id text PRIMARY KEY
);

CREATE TABLE interaction_messages (
  interaction_id text NOT NULL,
  message_id text PRIMARY KEY,
  position bigint NOT NULL,
  CONSTRAINT interaction_messages_interaction_id_fkey
    FOREIGN KEY (interaction_id) REFERENCES interactions (id),
  CONSTRAINT interaction_messages_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES messages (id),
  CONSTRAINT interaction_messages_interaction_position_key
    UNIQUE (interaction_id, position),
  CONSTRAINT interaction_messages_position_nonnegative
    CHECK (position >= 0)
);

CREATE TABLE endpoints (
  id text PRIMARY KEY,
  egress_adapter text NOT NULL,
  address text NOT NULL,
  enabled boolean NOT NULL
);

CREATE FUNCTION reject_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'messages are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER messages_reject_update_or_delete
BEFORE UPDATE OR DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION reject_message_mutation();

CREATE TRIGGER messages_reject_truncate
BEFORE TRUNCATE ON messages
FOR EACH STATEMENT
EXECUTE FUNCTION reject_message_mutation();

-- migrate:down

DROP TABLE endpoints;
DROP TABLE interaction_messages;
DROP TABLE interactions;
DROP TRIGGER messages_reject_truncate ON messages;
DROP TRIGGER messages_reject_update_or_delete ON messages;
DROP TABLE messages;
DROP FUNCTION reject_message_mutation();
