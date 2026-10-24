CREATE TABLE `settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `signature` text DEFAULT '' NOT NULL;