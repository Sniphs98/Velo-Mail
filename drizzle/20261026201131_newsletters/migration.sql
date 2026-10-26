-- Newsletters are recognized by their headers; messages cached before keep
-- `newsletter` at null until the next sync looks at their headers.
ALTER TABLE `accounts` ADD `notify` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `newsletter` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `unsubscribe` text;