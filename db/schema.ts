import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const requestQuotas = sqliteTable('request_quotas', {
  scope: text('scope').notNull(),
  window: integer('window').notNull(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [primaryKey({columns:[table.scope,table.window]})]);
