-- AI directory three-table design, v1.0, 2026-11-19
-- New business tables only; not an existing-table migration.
-- Requires schema "ai-tools" and its ai_directory_users authentication table.
-- Review docs/database-design.md before execution.
-- For psql, use: psql -v ON_ERROR_STOP=1 -f db/directory-v2.sql

BEGIN;

SET LOCAL search_path = "ai-tools", public;

-- 防止目标 schema 缺失时意外回退到 public。
DO $$
BEGIN
    IF current_schema() IS DISTINCT FROM 'ai-tools' THEN
        RAISE EXCEPTION 'Target schema ai-tools is unavailable';
    END IF;
END;
$$;

CREATE TABLE ai_directory_categories (
    id           varchar(40) PRIMARY KEY,
    name         varchar(50) NOT NULL CHECK (btrim(name) <> ''),
    short_name   varchar(30) NOT NULL CHECK (btrim(short_name) <> ''),
    description  varchar(200) NOT NULL DEFAULT '',
    icon_key     varchar(50) NOT NULL CHECK (btrim(icon_key) <> ''),
    sort_order   integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_enabled   boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT categories_id_format
        CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE ai_directory_tools (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug            varchar(70) NOT NULL UNIQUE,
    category_id     varchar(40) NOT NULL
                    REFERENCES ai_directory_categories(id) ON DELETE RESTRICT,
    name            varchar(90) NOT NULL CHECK (btrim(name) <> ''),
    website         varchar(1500) NOT NULL,
    summary         varchar(130) NOT NULL CHECK (btrim(summary) <> ''),
    content         text NOT NULL,
    logo_key        varchar(40),
    logo_data       bytea,
    logo_type       varchar(30),
    cover_data      bytea,
    cover_type      varchar(30),
    featured_order  integer CHECK (featured_order >= 0),
    display_order   integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    status          varchar(16) NOT NULL DEFAULT 'published',
    created_by      text REFERENCES ai_directory_users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tools_slug_format
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT tools_website_format
        CHECK (website ~ '^https?://[^[:space:]]+$'),
    CONSTRAINT tools_content_length
        CHECK (char_length(content) BETWEEN 1 AND 12000 AND btrim(content) <> ''),
    CONSTRAINT tools_status_values
        CHECK (status IN ('published', 'disabled')),
    CONSTRAINT tools_logo_pair
        CHECK (
            (logo_data IS NULL AND logo_type IS NULL)
            OR
            (logo_data IS NOT NULL AND logo_type IS NOT NULL
             AND logo_type = 'image/webp'
             AND octet_length(logo_data) BETWEEN 1 AND 524288)
        ),
    CONSTRAINT tools_cover_pair
        CHECK (
            (cover_data IS NULL AND cover_type IS NULL)
            OR
            (cover_data IS NOT NULL AND cover_type IS NOT NULL
             AND cover_type = 'image/webp'
             AND octet_length(cover_data) BETWEEN 1 AND 2097152)
        )
);

CREATE TABLE ai_directory_tool_submissions (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    submitted_by       text REFERENCES ai_directory_users(id) ON DELETE SET NULL,
    requested_slug     varchar(70) NOT NULL,
    category_id        varchar(40) NOT NULL
                       REFERENCES ai_directory_categories(id) ON DELETE RESTRICT,
    name               varchar(90) NOT NULL CHECK (btrim(name) <> ''),
    website            varchar(1500) NOT NULL,
    summary            varchar(130) NOT NULL CHECK (btrim(summary) <> ''),
    content            text NOT NULL,
    logo_data          bytea,
    logo_type          varchar(30),
    cover_data         bytea,
    cover_type         varchar(30),
    status             varchar(16) NOT NULL DEFAULT 'pending',
    reviewed_by        text REFERENCES ai_directory_users(id) ON DELETE SET NULL,
    reviewed_at        timestamptz,
    rejection_reason   varchar(1000),
    published_tool_id  bigint UNIQUE
                       REFERENCES ai_directory_tools(id) ON DELETE RESTRICT,
    submitted_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT submissions_slug_format
        CHECK (requested_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT submissions_website_format
        CHECK (website ~ '^https?://[^[:space:]]+$'),
    CONSTRAINT submissions_content_length
        CHECK (char_length(content) BETWEEN 1 AND 12000 AND btrim(content) <> ''),
    CONSTRAINT submissions_status_values
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT submissions_review_shape
        CHECK (
            (status = 'pending'
             AND reviewed_by IS NULL AND reviewed_at IS NULL
             AND rejection_reason IS NULL AND published_tool_id IS NULL)
            OR
            (status = 'approved'
             AND reviewed_at IS NOT NULL
             AND rejection_reason IS NULL AND published_tool_id IS NOT NULL)
            OR
            (status = 'rejected'
             AND reviewed_at IS NOT NULL AND published_tool_id IS NULL
             AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
        ),
    CONSTRAINT submissions_review_time
        CHECK (reviewed_at IS NULL OR reviewed_at >= submitted_at),
    CONSTRAINT submissions_logo_pair
        CHECK (
            (logo_data IS NULL AND logo_type IS NULL)
            OR
            (logo_data IS NOT NULL AND logo_type IS NOT NULL
             AND logo_type = 'image/webp'
             AND octet_length(logo_data) BETWEEN 1 AND 524288)
        ),
    CONSTRAINT submissions_cover_pair
        CHECK (
            (cover_data IS NULL AND cover_type IS NULL)
            OR
            (cover_data IS NOT NULL AND cover_type IS NOT NULL
             AND cover_type = 'image/webp'
             AND octet_length(cover_data) BETWEEN 1 AND 2097152)
        )
);

-- 分类导航：只索引启用分类。
CREATE INDEX categories_enabled_order_idx
    ON ai_directory_categories (sort_order, id)
    WHERE is_enabled = true;

-- 分类外键的通用索引，同时服务后台查询和引用检查。
CREATE INDEX tools_category_idx ON ai_directory_tools (category_id);
CREATE INDEX submissions_category_idx ON ai_directory_tool_submissions (category_id);

-- 分类工具列表、最新收录、热门工具。
CREATE INDEX tools_category_published_idx
    ON ai_directory_tools (category_id, display_order, published_at DESC, id DESC)
    WHERE status = 'published';
CREATE INDEX tools_latest_idx
    ON ai_directory_tools (published_at DESC, id DESC)
    WHERE status = 'published';
CREATE INDEX tools_featured_idx
    ON ai_directory_tools (featured_order, id)
    WHERE status = 'published' AND featured_order IS NOT NULL;

-- 用户提交历史、管理员待审核列表。
CREATE INDEX submissions_user_history_idx
    ON ai_directory_tool_submissions (submitted_by, submitted_at DESC, id DESC);
CREATE INDEX submissions_pending_idx
    ON ai_directory_tool_submissions (submitted_at, id)
    WHERE status = 'pending';

-- 同一用户对同一 Slug 只能存在一条待审核投稿。
CREATE UNIQUE INDEX submissions_user_pending_slug_uidx
    ON ai_directory_tool_submissions (submitted_by, requested_slug)
    WHERE status = 'pending';

-- 用户外键引用检查，避免删除用户时全表扫描。
CREATE INDEX tools_creator_idx ON ai_directory_tools (created_by);
CREATE INDEX submissions_reviewer_idx ON ai_directory_tool_submissions (reviewed_by);

COMMENT ON TABLE ai_directory_categories IS '首页工具分类与导航配置';
COMMENT ON TABLE ai_directory_tools IS '已正式收录的工具，不存放待审核投稿';
COMMENT ON TABLE ai_directory_tool_submissions IS '用户原始投稿快照及最终审核结果';
COMMENT ON COLUMN ai_directory_tool_submissions.published_tool_id IS '通过后关联正式工具，原始投稿保留';
COMMENT ON COLUMN ai_directory_tools.featured_order IS 'NULL 不进入热门列表，非空时越小越靠前';


-- Seed the current 17 categories in the same transaction.
INSERT INTO ai_directory_categories
    (id, name, short_name, description, icon_key, sort_order)
VALUES
    ('writing', 'AI 写作工具', 'AI 写作', '从灵感、提纲到定稿，帮你写得更快。', 'PenLine', 10),
    ('image', 'AI 图像工具', 'AI 图像', '发现图像生成、视觉设计和图片编辑工具。', 'Image', 20),
    ('video', 'AI 视频工具', 'AI 视频', '让创意从文字、图片或分镜走进视频。', 'Video', 30),
    ('office', 'AI 办公工具', 'AI 办公', '整理资料、制作演示文稿，减少重复工作。', 'LibraryBig', 40),
    ('chat', 'AI 聊天助手', 'AI 对话', '问答、推理和日常协作的智能伙伴。', 'MessageCircle', 50),
    ('agents', 'AI 智能体', 'AI 智能体', '发现能调用工具、协作和完成多步骤任务的智能体。', 'Bot', 60),
    ('code', 'AI 编程工具', 'AI 编程', '理解代码、调试问题并辅助日常开发。', 'Code2', 70),
    ('platforms', 'AI 开发平台', 'AI 开发', '探索构建、测试和部署 AI 应用的平台。', 'Laptop', 80),
    ('design', 'AI 设计工具', 'AI 设计', '辅助界面设计、品牌视觉和创意排版。', 'Palette', 90),
    ('audio', 'AI 音频工具', 'AI 音频', '探索语音合成、配音和音乐创作工具。', 'AudioLines', 100),
    ('search', 'AI 搜索引擎', 'AI 搜索', '检索网络信息、整理线索并追踪来源。', 'Search', 110),
    ('learning', 'AI 学习网站', 'AI 学习', '从入门课程到实战教程，按自己的节奏学习 AI。', 'GraduationCap', 120),
    ('training', 'AI 训练模型', '模型训练', '查找用于训练、微调和管理 AI 模型的资源。', 'BrainCircuit', 130),
    ('evaluation', 'AI 模型评测', '模型评测', '通过基准测试和排行榜比较不同模型的表现。', 'ClipboardCheck', 140),
    ('detection', 'AI 内容检测', '内容检测', '发现辅助识别 AI 生成内容和核查内容来源的工具。', 'ScanText', 150),
    ('prompts', 'AI 提示指令', 'AI 提示词', '查找、整理和改写适合不同任务的提示词。', 'Terminal', 160),
    ('side-hustle', 'AI 副业工具', 'AI 副业', '寻找辅助内容制作、接单和独立项目的工具。', 'BriefcaseBusiness', 170)
ON CONFLICT (id) DO NOTHING;

COMMIT;
