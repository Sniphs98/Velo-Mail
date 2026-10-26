-- Newsletters are recognized by their headers; messages cached before keep
-- `newsletter` at null until the next sync looks at their headers.
CREATE TABLE `sender_rules` (
	`address` text PRIMARY KEY,
	`kind` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `notify` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `newsletter` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `unsubscribe` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `unsubscribeOneClick` integer DEFAULT false NOT NULL;