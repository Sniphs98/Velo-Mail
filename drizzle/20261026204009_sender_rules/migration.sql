-- Senders filed by hand, and one-click unsubscribing (RFC 8058). Newsletters
-- recognized before are looked at again for their List-Unsubscribe-Post header.
CREATE TABLE `sender_rules` (
	`address` text PRIMARY KEY,
	`kind` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `unsubscribeOneClick` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `messages` SET `newsletter` = NULL WHERE `newsletter` = 1;
