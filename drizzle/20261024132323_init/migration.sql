CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`color` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`imapHost` text NOT NULL,
	`imapPort` integer NOT NULL,
	`imapSecurity` text NOT NULL,
	`smtpHost` text NOT NULL,
	`smtpPort` integer NOT NULL,
	`smtpSecurity` text NOT NULL,
	`username` text NOT NULL,
	`authType` text DEFAULT 'password' NOT NULL,
	`secret` blob,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`messageId` integer NOT NULL,
	`part` text NOT NULL,
	`filename` text,
	`contentType` text NOT NULL,
	`size` integer,
	`contentId` text,
	`inline` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_attachments_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`accountId` integer NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`delimiter` text,
	`role` text,
	`uidValidity` integer,
	`uidNext` integer,
	`highestModseq` text,
	`lastSyncedAt` integer,
	CONSTRAINT `fk_mailboxes_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `message_bodies` (
	`messageId` integer PRIMARY KEY,
	`text` text,
	`html` text,
	`fetchedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_message_bodies_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`mailboxId` integer NOT NULL,
	`uid` integer NOT NULL,
	`messageId` text,
	`inReplyTo` text,
	`references` text,
	`threadId` text,
	`subject` text DEFAULT '' NOT NULL,
	`fromName` text,
	`fromAddress` text,
	`to` text DEFAULT '[]' NOT NULL,
	`cc` text DEFAULT '[]' NOT NULL,
	`date` integer NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`size` integer,
	`seen` integer DEFAULT false NOT NULL,
	`flagged` integer DEFAULT false NOT NULL,
	`answered` integer DEFAULT false NOT NULL,
	`draft` integer DEFAULT false NOT NULL,
	`hasAttachments` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_messages_mailboxId_mailboxes_id_fk` FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `sender_avatars` (
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`contentType` text,
	`data` blob,
	`fetchedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`expiresAt` integer NOT NULL,
	CONSTRAINT `sender_avatars_pk` PRIMARY KEY(`kind`, `key`)
);
--> statement-breakpoint
CREATE INDEX `attachments_message` ON `attachments` (`messageId`);--> statement-breakpoint
CREATE UNIQUE INDEX `mailboxes_account_path` ON `mailboxes` (`accountId`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_mailbox_uid` ON `messages` (`mailboxId`,`uid`);--> statement-breakpoint
CREATE INDEX `messages_mailbox_date` ON `messages` (`mailboxId`,`date`);--> statement-breakpoint
CREATE INDEX `messages_thread` ON `messages` (`threadId`);--> statement-breakpoint
CREATE INDEX `messages_message_id` ON `messages` (`messageId`);