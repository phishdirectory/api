import {
  QueryBuilder,
  bigint,
  bigserial,
  boolean,
  index,
  json,
  pgEnum,
  pgMaterializedView,
  pgTable,
  pgView,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { and, desc, eq, gt, isNull, max, or, sql } from "drizzle-orm";

const qb = new QueryBuilder();

// TODO (@jsp) ~ enable/create proper RLS policies

// export const owner = pgRole("owner");
// export const admin = pgRole("admin");
// export const trusted = pgRole("trusted");
// export const user = pgRole("user");

const timestamps = {
  created_at: timestamp().defaultNow().notNull(),
  deleted_at: timestamp(),
  updated_at: timestamp(),
};

export const permissionLevel = pgEnum("permission_level", [
  "user",
  "trusted",
  "admin",
  "superadmin",
  "owner",
]);

export const useExtendedData = pgEnum("use_extended_data", [
  "off",
  "on",
  "forced",
]);

export const users = pgTable(
  "users",
  {
    local_id: bigserial({ mode: "number" }).primaryKey().unique(),
    pd_id: varchar().notNull().unique(),
    firstName: varchar().notNull(),
    lastName: varchar().notNull(),
    email: varchar().notNull().unique(),
    permissionLevel: permissionLevel().notNull().default("user"),
    useExtendedData: useExtendedData().notNull().default("off"),
    ...timestamps,
  },
  (table) => [
    index("idx_firstName").on(table.firstName),
    index("idx_lastName").on(table.lastName),
    index("idx_email").on(table.email),
  ]
).enableRLS();

export const authTokens = pgTable(
  "user_auth-tokens",
  {
    id: bigserial({
      mode: "number",
    })
      .primaryKey()
      .unique(),
    uuid: uuid().defaultRandom().unique(),
    userId: bigint({ mode: "number" })
      .notNull()
      .references(() => users.id),
    token: varchar(),
    used: boolean().default(false),
    expiresAt: timestamp(),
    ...timestamps,
  },
  (table) => [
    index("idx_userId").on(table.userId),
    index("idx_expiresAt").on(table.expiresAt),
  ]
).enableRLS();

export const loginAttempts = pgTable(
  "user_login-attempts",
  {
    id: bigserial({
      mode: "number",
    }).primaryKey(),
    uuid: uuid().defaultRandom().unique(),
    userId: bigint({ mode: "number" })
      .notNull()
      .references(() => users.id),
    ipAddress: varchar().notNull(),
    userAgent: varchar().notNull(),
    success: boolean().default(false).notNull(),
    ipInfo: json(),
    country: varchar(),
    city: varchar(),
    region: varchar(),
    isp: varchar(),
    organization: varchar(),
    deviceType: varchar(),
    browser: varchar(),
    os: varchar(),
    ...timestamps,
  },
  (table) => [
    index("idx_loginAttempts_userId").on(table.userId),
    index("idx_loginAttempts_ipAddress").on(table.ipAddress),
    index("idx_loginAttempts_success").on(table.success),
  ]
).enableRLS();

export const requestsLog = pgTable(
  "requests",
  {
    id: bigserial({
      mode: "number",
    })
      .primaryKey()
      .unique(),
    uuid: uuid().defaultRandom().unique(),
    // TODO ~ change method to enum
    method: varchar({ length: 10 }).notNull(),
    url: varchar().notNull(),
    headers: json(),
    body: json(),
    query: json(),
    ip: varchar().notNull(),
    userAgent: varchar().notNull(),
    xIdentity: varchar(),
    referer: varchar(),
    userId: bigint({ mode: "number" }).references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("idx_requests_userId").on(table.userId),
    index("idx_requests_url").on(table.url),
    index("idx_requests_method").on(table.method),
    index("idx_requests_ip").on(table.ip),
  ]
).enableRLS();

export const domains = pgTable(
  "domains",
  {
    id: bigserial({
      mode: "number",
    })
      .primaryKey()
      .unique(),
    uuid: uuid().defaultRandom().unique(),
    domain: varchar().notNull().unique(),
    malicious: boolean().default(false).notNull(),
    last_checked: timestamp().notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index("idx_domains_domain").on(table.domain)]
).enableRLS();

export const emails = pgTable(
  "emails",
  {
    id: bigserial({
      mode: "number",
    })
      .primaryKey()
      .unique(),
    uuid: uuid().defaultRandom().unique(),
    email: varchar().notNull().unique(),
    malicious: boolean().default(false).notNull(),
    last_checked: timestamp().notNull(),
    ...timestamps,
  },
  (table) => [index("idx_emails_email").on(table.email)]
).enableRLS();

export const APIs = pgEnum("apis", [
  "SafeBrowsing",
  "GoogleWebRisk",
  "IpQualityScore",
  "PhishObserver",
  "PhishReport",
  "SecurityTrails",
  "SinkingYachts",
  "UrlScan",
  "VirusTotal",
  "Walshy",
  "IpQuery",
  "AbuseCh",
]);

export const rawAPIData = pgTable(
  "raw_api_data",
  {
    id: bigserial({
      mode: "number",
    })
      .primaryKey()
      .unique(),
    uuid: uuid().defaultRandom().unique(),
    sourceAPI: APIs().notNull(),
    data: json().notNull(),
    domain: bigint({ mode: "number" }).references(() => domains.id),
    email: bigint({ mode: "number" }).references(() => emails.id),
    ...timestamps,
  },
  (table) => [
    index("idx_rawAPIData_sourceAPI").on(table.sourceAPI),
    index("idx_raw_api_data_created_at").on(table.created_at),
  ]
).enableRLS();

export const classifications = pgEnum("classifications", [
  "postal",
  "banking",
  "crypto",
]);

export const AbuseContactType = pgEnum("abuse_contact_type", [
  "hostingProvider",
  "domainRegistrar",
  "linkShortener",
  "registrar",
  "other",
]);

export const AbuseContactReportMethod = pgEnum("abuse_contact_report_method", [
  "email",
  "form",
  "discord",
  "other",
]);

export const abuseContacts = pgTable(
  "abuse_contacts",
  {
    id: bigserial({
      mode: "number",
    })
      .primaryKey()
      .unique(),
    uuid: uuid().defaultRandom().unique(),
    name: varchar().notNull(),
    type: AbuseContactType().notNull(),
    method: AbuseContactReportMethod().notNull(),
    reportContactEmail: varchar(),
    reportContactForm: varchar(),
    reportContactDiscord: varchar(),
    reportContactOther: varchar(),
    notes: varchar(),
    ...timestamps,
  },
  (table) => [
    index("idx_abuseContacts_name").on(table.name),
    index("idx_abuseContacts_type").on(table.type),
  ]
).enableRLS();

export const activeUsers = pgView("active_users_view").as((qb) =>
  qb.select().from(users).where(isNull(users.deleted_at))
);

// Admin Users View
export const adminUsers = pgView("admin_users_view").as((qb) =>
  qb
    .select({
      id: users.id,
      uuid: users.uuid,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      permissionLevel: users.permissionLevel,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(
      and(
        isNull(users.deleted_at),
        or(
          eq(users.permissionLevel, "admin"),
          eq(users.permissionLevel, "owner")
        )
      )
    )
);

// Trusted Users View
export const trustedUsersView = pgView("trusted_users_view").as((qb) =>
  qb
    .select({
      id: users.id,
      uuid: users.uuid,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(
      and(isNull(users.deleted_at), or(eq(users.permissionLevel, "trusted")))
    )
);

// Failed Login Attempts View
export const failedLoginAttemptsView = pgMaterializedView(
  "failed_login_attempts_view"
).as((qb) =>
  qb
    .select({
      id: loginAttempts.id,
      uuid: loginAttempts.uuid,
      userId: loginAttempts.userId,
      userEmail: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      ipAddress: loginAttempts.ipAddress,
      userAgent: loginAttempts.userAgent,
      country: loginAttempts.country,
      city: loginAttempts.city,
      ipInfo: loginAttempts.ipInfo,
      created_at: loginAttempts.created_at,
    })
    .from(loginAttempts)
    .innerJoin(users, eq(loginAttempts.userId, users.id))
    .where(eq(loginAttempts.success, false))
    .orderBy(loginAttempts.created_at)
);

// Malicious Domains Report View
export const maliciousDomainsReportView = pgMaterializedView(
  "malicious_domains_report_view"
).as((qb) => {
  // Subquery to get the latest API data for each domain
  const latestApiDataSubquery = qb
    .select({
      domainName: sql`data->>'domain'`.as("domain_name"), // Add alias here
      maxCreatedAt: max(rawAPIData.created_at).as("max_created_at"), // Add alias here
    })
    .from(rawAPIData)
    .groupBy(sql`data->>'domain'`)
    .as("latest_api_data");

  // Join this with the domains table and the raw API data
  return qb
    .select({
      id: domains.id,
      domain: domains.domain,
      malicious: domains.malicious,
      last_checked: domains.last_checked,
      created_at: domains.created_at,
      sourceAPI: rawAPIData.sourceAPI,
      data: rawAPIData.data,
    })
    .from(domains)
    .leftJoin(
      latestApiDataSubquery,
      eq(domains.domain, latestApiDataSubquery.domainName)
    )
    .leftJoin(
      rawAPIData,
      and(
        eq(sql`${rawAPIData.data}->>'domain'`, domains.domain),
        eq(rawAPIData.created_at, latestApiDataSubquery.maxCreatedAt)
      )
    )
    .where(eq(domains.malicious, true))
    .orderBy(desc(domains.last_checked));
});

// Recent API Requests View
export const recentApiRequestsView = pgView("recent_api_requests_view").as(
  (qb) =>
    qb
      .select({
        id: requestsLog.id,
        method: requestsLog.method,
        url: requestsLog.url,
        ip: requestsLog.ip,
        userAgent: requestsLog.userAgent,
        created_at: requestsLog.created_at,
        userId: requestsLog.userId,
        userEmail: users.email,
        permissionLevel: users.permissionLevel,
      })
      .from(requestsLog)
      .leftJoin(users, eq(requestsLog.userId, users.id))
      .where(gt(requestsLog.created_at, sql`NOW() - INTERVAL '7 days'`))
      .orderBy(desc(requestsLog.created_at))
);
