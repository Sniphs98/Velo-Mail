CREATE TABLE `trusted_senders` (
	`address` text PRIMARY KEY,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
