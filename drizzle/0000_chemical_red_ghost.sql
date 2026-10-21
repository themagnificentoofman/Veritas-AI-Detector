CREATE TABLE `request_quotas` (
	`scope` text NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `window`)
);
