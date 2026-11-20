import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { CatalogCategory, CatalogTool } from './catalog'
import { adminPagination } from './admin-pagination.ts'

export type ToolInput = {
  slug: string; category: string; name: string; website: string; summary: string; content: string
  logoData: Buffer | null; coverData: Buffer | null
}
export type ManagedToolInput = ToolInput & {
  id?: string; status: 'published' | 'disabled'; featuredOrder: number | null; displayOrder: number
  logoKey: string | null; removeLogo: boolean; removeCover: boolean
}
export type SubmissionItem = {
  id: string; slug: string; name: string; category: string; categoryName: string; categoryEnabled: boolean
  website: string; summary: string; content: string; hasLogo: boolean; hasCover: boolean
  status: 'pending' | 'approved' | 'rejected'; submittedAt: Date; reviewedAt: Date | null
  rejectionReason: string | null; publishedSlug: string | null; submitterName: string | null
}
export type ManagedTool = CatalogTool & { content: string; hasCover: boolean; status: 'published' | 'disabled' }
export type ManagedFrontendUser = {
  id: string
  name: string
  email: string
  isEnabled: boolean
  submissionCount: number
  approvedCount: number
  createdAt: Date
}
export type ManagedAdminUser = {
  id: string
  name: string
  email: string
  isEnabled: boolean
  toolCount: number
  reviewCount: number
  createdAt: Date
}
export type ManagedUserAccountInput = {
  id?: string
  name: string
  email: string
  passwordHash: string | null
  isEnabled: boolean
}
export type AdminOverview = {
  pendingSubmissions: number
  enabledCategories: number
  disabledCategories: number
  publishedTools: number
  disabledTools: number
  featuredTools: number
}
export const PAGE_SIZE = 20

const publicFields = `t.id::text AS id, t.slug, t.name, t.category_id AS category,
  c.name AS "categoryName", c.short_name AS "categoryShort", t.website, t.summary,
  t.logo_key AS "logoKey", t.logo_data IS NOT NULL AS "hasLogo",
  t.featured_order AS "featuredOrder", t.display_order AS "displayOrder", t.published_at::text AS "publishedAt"`

const submissionFields = `s.id::text AS id, s.requested_slug AS slug, s.name,
  s.category_id AS category, c.name AS "categoryName", c.is_enabled AS "categoryEnabled",
  s.website, s.summary, s.content, s.logo_data IS NOT NULL AS "hasLogo", s.cover_data IS NOT NULL AS "hasCover",
  s.status, s.submitted_at AS "submittedAt", s.reviewed_at AS "reviewedAt", s.rejection_reason AS "rejectionReason",
  CASE WHEN t.status = 'published' AND t.deleted_at IS NULL AND tc.is_enabled THEN t.slug END AS "publishedSlug", u.name AS "submitterName"`
const submissionJoins = `JOIN ai_directory_categories c ON c.id = s.category_id
  LEFT JOIN ai_directory_tools t ON t.id = s.published_tool_id
  LEFT JOIN ai_directory_categories tc ON tc.id = t.category_id
  LEFT JOIN ai_directory_users u ON u.id = s.submitted_by`

// Only interpolate trusted SQL fragments; every user value is a bound parameter.
const admin = (parameter: string) => `EXISTS (SELECT 1 FROM admin_user a
  WHERE a.id = ${parameter} AND a."isEnabled" = true)`
const offset = (page: number) => (Math.max(1, Math.min(Math.trunc(page) || 1, 100000)) - 1) * PAGE_SIZE
function paginated<T>(rows: T[]) { return { items: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE } }

// Accepts either a Pool or a single transaction connection, enabling real SQL tests with rollback.
export function createDirectoryStore(database: Pick<Pool, 'query'>) {
  return {
    async getCategories(includeDisabled = false) {
      const { rows } = await database.query<CatalogCategory>(`SELECT id, name, short_name AS short, description,
        icon_key AS "iconKey", sort_order AS "sortOrder", is_enabled AS "isEnabled"
        FROM ai_directory_categories WHERE ($1::boolean OR is_enabled) ORDER BY sort_order, id`, [includeDisabled])
      return rows
    },
    async getCatalog() {
      const { rows } = await database.query<CatalogTool>(`SELECT ${publicFields} FROM ai_directory_tools t
        JOIN ai_directory_categories c ON c.id = t.category_id
        WHERE t.status = 'published' AND t.deleted_at IS NULL AND c.is_enabled ORDER BY t.published_at DESC, t.id DESC`)
      return rows
    },
    async getTool(slug: string) {
      const { rows } = await database.query<CatalogTool & { content: string; hasCover: boolean }>(`SELECT ${publicFields},
        t.content, t.cover_data IS NOT NULL AS "hasCover" FROM ai_directory_tools t
        JOIN ai_directory_categories c ON c.id = t.category_id
        WHERE t.slug = $1 AND t.status = 'published' AND t.deleted_at IS NULL AND c.is_enabled`, [slug])
      return rows[0]
    },
    async isAdmin(userId: string) {
      const { rows } = await database.query<{ allowed: boolean }>(`SELECT ${admin('$1')} AS allowed`, [userId])
      return rows[0].allowed
    },
    async submitTool(userId: string, input: ToolInput) {
      const { rows } = await database.query<{ id: string }>(`INSERT INTO ai_directory_tool_submissions
        (submitted_by, requested_slug, category_id, name, website, summary, content, logo_data, logo_type, cover_data, cover_type)
        SELECT $1::text, $2::text, c.id, $4::text, $5::text, $6::text, $7::text, $8::bytea, $9::text, $10::bytea, $11::text FROM ai_directory_categories c
        WHERE c.id = $3 AND c.is_enabled AND EXISTS (SELECT 1 FROM ai_directory_users WHERE id = $1 AND role <> 'disabled')
          AND NOT EXISTS (SELECT 1 FROM ai_directory_tools WHERE slug = $2)
        RETURNING id::text`, [userId, input.slug, input.category, input.name, input.website, input.summary, input.content,
        input.logoData, input.logoData ? 'image/webp' : null, input.coverData, input.coverData ? 'image/webp' : null])
      return rows[0]
    },
    async getSubmissionHistory(userId: string, page = 1) {
      const { rows } = await database.query<SubmissionItem>(`SELECT ${submissionFields}
        FROM ai_directory_tool_submissions s ${submissionJoins} WHERE s.submitted_by = $1
        ORDER BY s.submitted_at DESC, s.id DESC LIMIT $2 OFFSET $3`, [userId, PAGE_SIZE + 1, offset(page)])
      return paginated(rows)
    },
    async getReviewQueue(userId: string, page = 1) {
      const { rows } = await database.query<SubmissionItem>(`SELECT ${submissionFields}
        FROM ai_directory_tool_submissions s ${submissionJoins}
        WHERE s.status = 'pending' AND ${admin('$1')}
        ORDER BY s.submitted_at, s.id LIMIT $2 OFFSET $3`, [userId, PAGE_SIZE + 1, offset(page)])
      return paginated(rows)
    },
    async approveTool(userId: string, id: string) {
      const { rows } = await database.query<{ id: string; slug: string }>(`WITH candidate AS MATERIALIZED (
        SELECT s.* FROM ai_directory_tool_submissions s
        JOIN ai_directory_categories c ON c.id = s.category_id
        WHERE s.id = $1 AND s.status = 'pending' AND c.is_enabled AND ${admin('$2')}
        FOR UPDATE OF s
      ), published AS (
        INSERT INTO ai_directory_tools
          (slug, category_id, name, website, summary, content, logo_data, logo_type, cover_data, cover_type, created_by_admin)
        SELECT requested_slug, category_id, name, website, summary, content,
          logo_data, logo_type, cover_data, cover_type, $2 FROM candidate RETURNING id, slug
      ) UPDATE ai_directory_tool_submissions s SET status = 'approved', reviewed_by_admin = $2,
        reviewed_at = statement_timestamp(), published_tool_id = p.id, rejection_reason = NULL,
        updated_at = statement_timestamp() FROM published p WHERE s.id = $1 AND s.status = 'pending'
        RETURNING p.id::text, p.slug`, [id, userId])
      return rows[0]
    },
    async rejectTool(userId: string, id: string, reason: string) {
      const { rows } = await database.query<{ id: string }>(`UPDATE ai_directory_tool_submissions
        SET status = 'rejected', reviewed_by_admin = $2, reviewed_at = statement_timestamp(),
          rejection_reason = $3, updated_at = statement_timestamp()
        WHERE id = $1 AND status = 'pending' AND ${admin('$2')} RETURNING id::text`, [id, userId, reason])
      return rows[0]
    },
    async getPublicMedia(slug: string, kind: 'logo' | 'cover') {
      const column = kind === 'logo' ? 'logo' : 'cover'
      const { rows } = await database.query<{ data: Buffer; type: string }>(`SELECT t.${column}_data AS data, t.${column}_type AS type
        FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id = t.category_id
        WHERE t.slug = $1 AND t.status = 'published' AND t.deleted_at IS NULL AND c.is_enabled`, [slug])
      return rows[0]
    },
    async getSubmissionMedia(userId: string | null, id: string, kind: 'logo' | 'cover', adminId: string | null = null) {
      const column = kind === 'logo' ? 'logo' : 'cover'
      const { rows } = await database.query<{ data: Buffer; type: string }>(`SELECT ${column}_data AS data, ${column}_type AS type
        FROM ai_directory_tool_submissions WHERE id = $1 AND (submitted_by = $2 OR ${admin('$3')})`, [id, userId, adminId])
      return rows[0]
    },
    async getManagedToolMedia(adminId: string, id: string, kind: 'logo' | 'cover') {
      const column = kind === 'logo' ? 'logo' : 'cover'
      const { rows } = await database.query<{ data: Buffer; type: string }>(`SELECT t.${column}_data AS data, t.${column}_type AS type
        FROM ai_directory_tools t
        WHERE t.id::text = $2 AND t.deleted_at IS NULL AND ${admin('$1')}`, [adminId, id])
      return rows[0]
    },
    async getAdminOverview(adminId: string) {
      const { rows } = await database.query<AdminOverview>(`SELECT
        (SELECT count(*)::integer FROM ai_directory_tool_submissions WHERE status = 'pending') AS "pendingSubmissions",
        (SELECT count(*)::integer FROM ai_directory_categories WHERE is_enabled) AS "enabledCategories",
        (SELECT count(*)::integer FROM ai_directory_categories WHERE NOT is_enabled) AS "disabledCategories",
        (SELECT count(*)::integer FROM ai_directory_tools WHERE deleted_at IS NULL AND status = 'published') AS "publishedTools",
        (SELECT count(*)::integer FROM ai_directory_tools WHERE deleted_at IS NULL AND status = 'disabled') AS "disabledTools",
        (SELECT count(*)::integer FROM ai_directory_tools WHERE deleted_at IS NULL AND status = 'published' AND featured_order IS NOT NULL) AS "featuredTools"
        WHERE ${admin('$1')}`, [adminId])
      return rows[0]
    },
    async saveCategory(userId: string, value: CatalogCategory) {
      const { rows } = await database.query<{ id: string }>(`INSERT INTO ai_directory_categories
        (id, name, short_name, description, icon_key, sort_order, is_enabled)
        SELECT $2::text, $3::text, $4::text, $5::text, $6::text, $7::integer, $8::boolean WHERE ${admin('$1')}
        ON CONFLICT (id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name,
          description = excluded.description, icon_key = excluded.icon_key, sort_order = excluded.sort_order,
          is_enabled = excluded.is_enabled, updated_at = statement_timestamp()
        WHERE ${admin('$1')} RETURNING id`,
      [userId, value.id, value.name, value.short, value.description, value.iconKey, value.sortOrder, value.isEnabled])
      return rows[0]
    },
    async setCategoryStatus(userId: string, id: string, enabled: boolean, expected: boolean) {
      const { rows } = await database.query<{ id: string }>(`UPDATE ai_directory_categories
        SET is_enabled = $3, updated_at = statement_timestamp()
        WHERE id = $2 AND is_enabled = $4 AND ${admin('$1')} RETURNING id`, [userId, id, enabled, expected])
      return rows[0]
    },
    async getManagedTools(userId: string, page = 1, filters: { query?: string; status?: string; category?: string; pageSize?: string | number } = {}) {
      const args = [userId, filters.query?.trim().slice(0, 100) ?? '', ['published', 'disabled'].includes(filters.status ?? '') ? filters.status : '', filters.category ?? '']
      const from = `FROM ai_directory_tools t JOIN ai_directory_categories c ON c.id = t.category_id
        WHERE ${admin('$1')} AND t.deleted_at IS NULL
          AND ($2::text = '' OR strpos(lower(t.name || ' ' || t.slug || ' ' || t.website), lower($2)) > 0)
          AND ($3::text = '' OR t.status = $3) AND ($4::text = '' OR t.category_id = $4)`
      const count = await database.query<{ total: number }>(`SELECT count(*)::integer AS total ${from}`, args)
      const pagination = adminPagination(count.rows[0].total, page, filters.pageSize)
      const result = await database.query<CatalogTool & { status: 'published' | 'disabled' }>(`SELECT ${publicFields}, t.status ${from}
        ORDER BY t.created_at DESC, t.id DESC LIMIT $5 OFFSET $6`, [...args, pagination.pageSize, pagination.offset])
      return { items: result.rows, ...pagination }
    },
    async getManagedTool(userId: string, id: string) {
      const { rows } = await database.query<ManagedTool>(`SELECT ${publicFields}, t.content, t.status,
        t.cover_data IS NOT NULL AS "hasCover" FROM ai_directory_tools t
        JOIN ai_directory_categories c ON c.id = t.category_id
        WHERE t.id::text = $2 AND t.deleted_at IS NULL AND ${admin('$1')}`, [userId, id])
      return rows[0]
    },
    async deleteTool(userId: string, id: string) {
      const { rows } = await database.query<{ id: string }>(`UPDATE ai_directory_tools
        SET deleted_at = statement_timestamp(), status = 'disabled', updated_at = statement_timestamp()
        WHERE id = $2 AND deleted_at IS NULL AND ${admin('$1')} RETURNING id::text`, [userId, id])
      return rows[0]
    },
    async setToolStatus(userId: string, id: string, status: 'published' | 'disabled', expected: 'published' | 'disabled') {
      const { rows } = await database.query<{ id: string }>(`UPDATE ai_directory_tools SET status = $3::text, updated_at = statement_timestamp()
        WHERE id = $2 AND deleted_at IS NULL AND status = $4::text AND ${admin('$1')}
          AND EXISTS (SELECT 1 FROM ai_directory_categories WHERE id = category_id AND (is_enabled OR $3 = 'disabled'))
        RETURNING id::text`, [userId, id, status, expected])
      return rows[0]
    },
    async saveTool(userId: string, value: ManagedToolInput) {
      const args = [userId, value.slug, value.category, value.name, value.website, value.summary, value.content,
        value.logoData, value.logoData ? 'image/webp' : null, value.coverData, value.coverData ? 'image/webp' : null,
        value.status, value.featuredOrder, value.displayOrder, value.logoKey]
      if (value.id) {
        const { rows } = await database.query<{ id: string; slug: string }>(`UPDATE ai_directory_tools SET
          category_id = $3::text, name = $4::text, website = $5::text, summary = $6::text, content = $7::text,
          logo_data = CASE WHEN $8::bytea IS NOT NULL THEN $8 WHEN $17 THEN NULL ELSE logo_data END,
          logo_type = CASE WHEN $8::bytea IS NOT NULL THEN $9::text WHEN $17 THEN NULL ELSE logo_type END,
          cover_data = CASE WHEN $10::bytea IS NOT NULL THEN $10 WHEN $18 THEN NULL ELSE cover_data END,
          cover_type = CASE WHEN $10::bytea IS NOT NULL THEN $11::text WHEN $18 THEN NULL ELSE cover_type END,
          status = $12::text, featured_order = $13, display_order = $14, logo_key = $15::text, updated_at = statement_timestamp()
          WHERE id = $16 AND slug = $2 AND deleted_at IS NULL AND ${admin('$1')}
            AND EXISTS (SELECT 1 FROM ai_directory_categories WHERE id = $3 AND (is_enabled OR $12 = 'disabled'))
          RETURNING id::text, slug`, [...args, value.id, value.removeLogo, value.removeCover])
        return rows[0]
      }
      const { rows } = await database.query<{ id: string; slug: string }>(`INSERT INTO ai_directory_tools
        (slug, category_id, name, website, summary, content, logo_data, logo_type, cover_data, cover_type,
          status, featured_order, display_order, logo_key, created_by_admin)
        SELECT $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::bytea, $9::text,
          $10::bytea, $11::text, $12::text, $13::integer, $14::integer, $15::text, $1::text
        WHERE ${admin('$1')} AND EXISTS (SELECT 1 FROM ai_directory_categories WHERE id = $3 AND (is_enabled OR $12 = 'disabled'))
        RETURNING id::text, slug`, args)
      return rows[0]
    },
    async getManagedUsers(adminId: string, page = 1, filters: { query?: string; status?: string; pageSize?: string | number } = {}) {
      const args = [
        adminId,
        filters.query?.trim().slice(0, 100) ?? '',
        ['enabled', 'disabled'].includes(filters.status ?? '') ? filters.status : '',
      ]
      const from = `FROM ai_directory_users u
        WHERE ${admin('$1')}
          AND ($2::text = '' OR strpos(lower(u.name || ' ' || u.email), lower($2)) > 0)
          AND ($3::text = '' OR (CASE WHEN $3 = 'enabled' THEN u.role <> 'disabled' ELSE u.role = 'disabled' END))`
      const count = await database.query<{ total: number }>(`SELECT count(*)::integer AS total ${from}`, args)
      const pagination = adminPagination(count.rows[0].total, page, filters.pageSize)
      const result = await database.query<ManagedFrontendUser>(`SELECT
        u.id, u.name, u.email, (u.role <> 'disabled') AS "isEnabled", u."createdAt",
        (SELECT count(*)::integer FROM ai_directory_tool_submissions s WHERE s.submitted_by = u.id) AS "submissionCount",
        (SELECT count(*)::integer FROM ai_directory_tool_submissions s WHERE s.submitted_by = u.id AND s.status = 'approved') AS "approvedCount"
        ${from}
        ORDER BY u."createdAt" DESC, u.id DESC LIMIT $4 OFFSET $5`, [...args, pagination.pageSize, pagination.offset])
      return { items: result.rows, ...pagination }
    },
    async getManagedUser(adminId: string, id: string) {
      const { rows } = await database.query<ManagedFrontendUser>(`SELECT
        u.id, u.name, u.email, (u.role <> 'disabled') AS "isEnabled", u."createdAt",
        (SELECT count(*)::integer FROM ai_directory_tool_submissions s WHERE s.submitted_by = u.id) AS "submissionCount",
        (SELECT count(*)::integer FROM ai_directory_tool_submissions s WHERE s.submitted_by = u.id AND s.status = 'approved') AS "approvedCount"
        FROM ai_directory_users u
        WHERE u.id = $2::text AND ${admin('$1')}`, [adminId, id])
      return rows[0]
    },
    async saveManagedUser(adminId: string, value: ManagedUserAccountInput) {
      if (value.id) {
        const { rows } = await database.query<{ id: string }>(`WITH updated_user AS (
          UPDATE ai_directory_users
          SET name = $3::text,
              email = $4::text,
              role = CASE WHEN $5::boolean THEN 'user' ELSE 'disabled' END,
              "updatedAt" = statement_timestamp()
          WHERE id = $2::text AND ${admin('$1')}
          RETURNING id
        ), updated_account AS (
          UPDATE ai_directory_accounts a
          SET password = $6::text, "updatedAt" = statement_timestamp()
          FROM updated_user u
          WHERE $6::text IS NOT NULL AND a."userId" = u.id AND a."providerId" = 'credential'
          RETURNING a.id
        ), inserted_account AS (
          INSERT INTO ai_directory_accounts (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          SELECT $7::text, u.id, 'credential', u.id, $6::text, statement_timestamp(), statement_timestamp()
          FROM updated_user u
          WHERE $6::text IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM ai_directory_accounts WHERE "userId" = u.id AND "providerId" = 'credential')
          RETURNING id
        ), revoked_sessions AS (
          DELETE FROM ai_directory_sessions s
          USING updated_user u
          WHERE s."userId" = u.id AND (NOT $5::boolean OR $6::text IS NOT NULL)
          RETURNING s.id
        )
        SELECT id FROM updated_user`, [adminId, value.id, value.name, value.email, value.isEnabled, value.passwordHash, randomUUID()])
        return rows[0]
      }
      if (!value.passwordHash) return undefined
      const userId = randomUUID(), accountId = randomUUID()
      const { rows } = await database.query<{ id: string }>(`WITH created_user AS (
        INSERT INTO ai_directory_users (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
        SELECT $2::text, $3::text, $4::text, false, CASE WHEN $5::boolean THEN 'user' ELSE 'disabled' END, statement_timestamp(), statement_timestamp()
        WHERE ${admin('$1')}
        RETURNING id
      ), created_account AS (
        INSERT INTO ai_directory_accounts (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        SELECT $6::text, u.id, 'credential', u.id, $7::text, statement_timestamp(), statement_timestamp()
        FROM created_user u
        RETURNING "userId"
      )
      SELECT id FROM created_user`, [adminId, userId, value.name, value.email, value.isEnabled, accountId, value.passwordHash])
      return rows[0]
    },
    async setManagedUserStatus(adminId: string, id: string, enabled: boolean, expected: boolean) {
      const { rows } = await database.query<{ id: string }>(`WITH updated AS (
        UPDATE ai_directory_users
        SET role = CASE WHEN $3::boolean THEN 'user' ELSE 'disabled' END,
            "updatedAt" = statement_timestamp()
        WHERE id = $2::text AND (role <> 'disabled') = $4::boolean AND ${admin('$1')}
        RETURNING id
      ), revoked AS (
        DELETE FROM ai_directory_sessions s
        USING updated u
        WHERE s."userId" = u.id AND NOT $3::boolean
      )
      SELECT id FROM updated`, [adminId, id, enabled, expected])
      return rows[0]
    },
    async deleteManagedUser(adminId: string, id: string) {
      const { rows } = await database.query<{ id: string }>(`DELETE FROM ai_directory_users
        WHERE id = $2::text AND ${admin('$1')} RETURNING id`, [adminId, id])
      return rows[0]
    },
    async getManagedAdmins(adminId: string, page = 1, filters: { query?: string; status?: string; pageSize?: string | number } = {}) {
      const args = [
        adminId,
        filters.query?.trim().slice(0, 100) ?? '',
        ['enabled', 'disabled'].includes(filters.status ?? '') ? filters.status : '',
      ]
      const from = `FROM admin_user a
        WHERE ${admin('$1')}
          AND ($2::text = '' OR strpos(lower(a.name || ' ' || a.email), lower($2)) > 0)
          AND ($3::text = '' OR a."isEnabled" = ($3 = 'enabled'))`
      const count = await database.query<{ total: number }>(`SELECT count(*)::integer AS total ${from}`, args)
      const pagination = adminPagination(count.rows[0].total, page, filters.pageSize)
      const result = await database.query<ManagedAdminUser>(`SELECT
        a.id, a.name, a.email, a."isEnabled", a."createdAt",
        (SELECT count(*)::integer FROM ai_directory_tools t WHERE t.created_by_admin = a.id AND t.deleted_at IS NULL) AS "toolCount",
        (SELECT count(*)::integer FROM ai_directory_tool_submissions s WHERE s.reviewed_by_admin = a.id) AS "reviewCount"
        ${from}
        ORDER BY a."createdAt" DESC, a.id DESC LIMIT $4 OFFSET $5`, [...args, pagination.pageSize, pagination.offset])
      return { items: result.rows, ...pagination }
    },
    async getManagedAdmin(adminId: string, id: string) {
      const { rows } = await database.query<ManagedAdminUser>(`SELECT
        a.id, a.name, a.email, a."isEnabled", a."createdAt",
        (SELECT count(*)::integer FROM ai_directory_tools t WHERE t.created_by_admin = a.id AND t.deleted_at IS NULL) AS "toolCount",
        (SELECT count(*)::integer FROM ai_directory_tool_submissions s WHERE s.reviewed_by_admin = a.id) AS "reviewCount"
        FROM admin_user a
        WHERE a.id = $2::text AND ${admin('$1')}`, [adminId, id])
      return rows[0]
    },
    async saveManagedAdmin(adminId: string, value: ManagedUserAccountInput) {
      if (value.id) {
        if (value.id === adminId && !value.isEnabled) return undefined
        const { rows } = await database.query<{ id: string }>(`WITH updated_admin AS (
          UPDATE admin_user
          SET name = $3::text,
              email = $4::text,
              "isEnabled" = $5::boolean,
              "updatedAt" = statement_timestamp()
          WHERE id = $2::text AND ($2::text <> $1::text OR $5::boolean = true) AND ${admin('$1')}
          RETURNING id
        ), updated_account AS (
          UPDATE admin_account ac
          SET password = $6::text, "updatedAt" = statement_timestamp()
          FROM updated_admin u
          WHERE $6::text IS NOT NULL AND ac."userId" = u.id AND ac."providerId" = 'credential'
          RETURNING ac.id
        ), inserted_account AS (
          INSERT INTO admin_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          SELECT $7::text, u.id, 'credential', u.id, $6::text, statement_timestamp(), statement_timestamp()
          FROM updated_admin u
          WHERE $6::text IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM admin_account WHERE "userId" = u.id AND "providerId" = 'credential')
          RETURNING id
        ), revoked_sessions AS (
          DELETE FROM admin_session s
          USING updated_admin u
          WHERE s."userId" = u.id AND (NOT $5::boolean OR $6::text IS NOT NULL)
          RETURNING s.id
        )
        SELECT id FROM updated_admin`, [adminId, value.id, value.name, value.email, value.isEnabled, value.passwordHash, randomUUID()])
        return rows[0]
      }
      if (!value.passwordHash) return undefined
      const userId = randomUUID(), accountId = randomUUID()
      const { rows } = await database.query<{ id: string }>(`WITH created_admin AS (
        INSERT INTO admin_user (id, name, email, "emailVerified", "isEnabled", "createdAt", "updatedAt")
        SELECT $2::text, $3::text, $4::text, false, $5::boolean, statement_timestamp(), statement_timestamp()
        WHERE ${admin('$1')}
        RETURNING id
      ), created_account AS (
        INSERT INTO admin_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        SELECT $6::text, u.id, 'credential', u.id, $7::text, statement_timestamp(), statement_timestamp()
        FROM created_admin u
        RETURNING "userId"
      )
      SELECT id FROM created_admin`, [adminId, userId, value.name, value.email, value.isEnabled, accountId, value.passwordHash])
      return rows[0]
    },
    async setManagedAdminStatus(adminId: string, id: string, enabled: boolean, expected: boolean) {
      if (id === adminId && !enabled) return undefined
      const { rows } = await database.query<{ id: string }>(`WITH updated AS (
        UPDATE admin_user
        SET "isEnabled" = $3::boolean,
            "updatedAt" = statement_timestamp()
        WHERE id = $2::text AND id <> $1::text AND "isEnabled" = $4::boolean AND ${admin('$1')}
        RETURNING id
      ), revoked AS (
        DELETE FROM admin_session s
        USING updated u
        WHERE s."userId" = u.id AND NOT $3::boolean
      )
      SELECT id FROM updated`, [adminId, id, enabled, expected])
      return rows[0]
    },
    async deleteManagedAdmin(adminId: string, id: string) {
      if (id === adminId) return undefined
      const { rows } = await database.query<{ id: string }>(`DELETE FROM admin_user
        WHERE id = $2::text AND id <> $1::text AND ${admin('$1')} RETURNING id`, [adminId, id])
      return rows[0]
    },
  }
}
