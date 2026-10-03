using System;
using System.Net;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using NpgsqlTypes;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:citext", ",,")
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,")
                .Annotation("Npgsql:PostgresExtension:unaccent", ",,");

            // Vietnamese-friendly search: accent-insensitive text search configuration and an IMMUTABLE unaccent wrapper
            // (the built-in unaccent() is only STABLE, so it cannot be used in generated columns or index expressions).
            migrationBuilder.Sql("""
                CREATE FUNCTION public.f_unaccent(text) RETURNS text
                    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
                    AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
                """);
            migrationBuilder.Sql("CREATE TEXT SEARCH CONFIGURATION public.vn_unaccent (COPY = pg_catalog.simple);");
            migrationBuilder.Sql("""
                ALTER TEXT SEARCH CONFIGURATION public.vn_unaccent
                    ALTER MAPPING FOR hword, hword_part, word
                    WITH public.unaccent, pg_catalog.simple;
                """);

            migrationBuilder.CreateTable(
                name: "api_clients",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    token_hash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    scopes = table.Column<string[]>(type: "text[]", nullable: false),
                    last_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_api_clients", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "audit_log",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    actor_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    acting_as_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    target_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    target_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    details = table.Column<string>(type: "jsonb", nullable: true),
                    ip = table.Column<IPAddress>(type: "inet", nullable: true),
                    user_agent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_log", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "data_protection_keys",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    friendly_name = table.Column<string>(type: "text", nullable: true),
                    xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_protection_keys", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "files",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    storage_key = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    content_type = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    sha256 = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    uploaded_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_files", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "jobs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    type = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    run_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    max_attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 5),
                    locked_until = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_error = table.Column<string>(type: "text", nullable: true),
                    done_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_jobs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "legacy_import_marks",
                columns: table => new
                {
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    key = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    target_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    content_hash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_legacy_import_marks", x => new { x.kind, x.key });
                });

            migrationBuilder.CreateTable(
                name: "notification_series",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_series", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "org_units",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    parent_id = table.Column<long>(type: "bigint", nullable: true),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_org_units", x => x.id);
                    table.CheckConstraint("ck_org_units_kind", "kind IN ('unit','department')");
                    table.ForeignKey(
                        name: "fk_org_units_org_units_parent_id",
                        column: x => x.parent_id,
                        principalTable: "org_units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sync_runs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    source = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    dataset = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    received = table.Column<int>(type: "integer", nullable: false),
                    inserted = table.Column<int>(type: "integer", nullable: false),
                    updated = table.Column<int>(type: "integer", nullable: false),
                    deleted = table.Column<int>(type: "integer", nullable: false),
                    error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sync_runs", x => x.id);
                    table.CheckConstraint("ck_sync_runs_status", "status IN ('running','success','failed','refused')");
                });

            migrationBuilder.CreateTable(
                name: "tags",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    color = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    sort = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tags", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "dataset_imports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    dataset = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    summary = table.Column<string>(type: "jsonb", nullable: false),
                    report = table.Column<string>(type: "jsonb", nullable: false),
                    created_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_dataset_imports", x => x.id);
                    table.CheckConstraint("ck_dataset_imports_dataset", "dataset IN ('teaching','research','publications')");
                    table.CheckConstraint("ck_dataset_imports_status", "status IN ('validated','applied','rejected')");
                    table.ForeignKey(
                        name: "fk_dataset_imports_stored_file_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "employees",
                columns: table => new
                {
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    hrm_id = table.Column<int>(type: "integer", nullable: true),
                    full_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    full_name_unaccent = table.Column<string>(type: "text", nullable: false, computedColumnSql: "f_unaccent(full_name)", stored: true),
                    org_unit_id = table.Column<long>(type: "bigint", nullable: true),
                    department_id = table.Column<long>(type: "bigint", nullable: true),
                    position_title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    academic_rank = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    degree = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "active"),
                    photo_url = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "manual"),
                    last_login_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    previous_login_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    synced_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_employees", x => x.code);
                    table.CheckConstraint("ck_employees_source", "source IN ('hrm','manual')");
                    table.CheckConstraint("ck_employees_status", "status IN ('active','inactive','retired')");
                    table.ForeignKey(
                        name: "fk_employees_org_unit_department_id",
                        column: x => x.department_id,
                        principalTable: "org_units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_employees_org_unit_org_unit_id",
                        column: x => x.org_unit_id,
                        principalTable: "org_units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sync_issues",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    sync_run_id = table.Column<long>(type: "bigint", nullable: false),
                    dataset = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    source_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    details = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    resolved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    resolved_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sync_issues", x => x.id);
                    table.ForeignKey(
                        name: "fk_sync_issues_sync_run_sync_run_id",
                        column: x => x.sync_run_id,
                        principalTable: "sync_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "publications",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    doi = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    eid = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    title = table.Column<string>(type: "text", nullable: false),
                    venue = table.Column<string>(type: "text", nullable: true),
                    year = table.Column<int>(type: "integer", nullable: true),
                    details = table.Column<string>(type: "text", nullable: true),
                    url = table.Column<string>(type: "text", nullable: true),
                    source_import_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_publications", x => x.id);
                    table.ForeignKey(
                        name: "fk_publications_dataset_imports_source_import_id",
                        column: x => x.source_import_id,
                        principalTable: "dataset_imports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "research_projects",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    level = table.Column<string>(type: "text", nullable: true),
                    research_type = table.Column<string>(type: "text", nullable: true),
                    funding = table.Column<decimal>(type: "numeric(14,0)", nullable: true),
                    period_text = table.Column<string>(type: "text", nullable: true),
                    accepted_on = table.Column<DateOnly>(type: "date", nullable: true),
                    result = table.Column<string>(type: "text", nullable: true),
                    source_import_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_research_projects", x => x.id);
                    table.ForeignKey(
                        name: "fk_research_projects_dataset_imports_source_import_id",
                        column: x => x.source_import_id,
                        principalTable: "dataset_imports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "academic_degrees",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    degree_type = table.Column<string>(type: "text", nullable: true),
                    major = table.Column<string>(type: "text", nullable: true),
                    institution = table.Column<string>(type: "text", nullable: true),
                    country = table.Column<string>(type: "text", nullable: true),
                    training_form = table.Column<string>(type: "text", nullable: true),
                    enrolled_on = table.Column<DateOnly>(type: "date", nullable: true),
                    enrolled_on_precision = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "day"),
                    graduated_on = table.Column<DateOnly>(type: "date", nullable: true),
                    graduated_on_precision = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "day"),
                    thesis_title = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_academic_degrees", x => x.id);
                    table.ForeignKey(
                        name: "fk_academic_degrees_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "business_trips",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    from_on = table.Column<DateOnly>(type: "date", nullable: true),
                    to_on = table.Column<DateOnly>(type: "date", nullable: true),
                    place = table.Column<string>(type: "text", nullable: true),
                    purpose = table.Column<string>(type: "text", nullable: true),
                    transport = table.Column<string>(type: "text", nullable: true),
                    decision_no = table.Column<string>(type: "text", nullable: true),
                    decided_on = table.Column<DateOnly>(type: "date", nullable: true),
                    note = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_business_trips", x => x.id);
                    table.ForeignKey(
                        name: "fk_business_trips_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "commendations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    academic_year = table.Column<string>(type: "text", nullable: true),
                    decision_no = table.Column<string>(type: "text", nullable: true),
                    decided_on = table.Column<DateOnly>(type: "date", nullable: true),
                    decided_on_precision = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "day"),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_commendations", x => x.id);
                    table.CheckConstraint("ck_commendations_kind", "kind IN ('award','title')");
                    table.ForeignKey(
                        name: "fk_commendations_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "employee_emails",
                columns: table => new
                {
                    email = table.Column<string>(type: "citext", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    added_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    added_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_employee_emails", x => x.email);
                    table.ForeignKey(
                        name: "fk_employee_emails_employees_added_by",
                        column: x => x.added_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_employee_emails_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "employee_profiles",
                columns: table => new
                {
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    hrm_id = table.Column<int>(type: "integer", nullable: true),
                    last_name = table.Column<string>(type: "text", nullable: true),
                    first_name = table.Column<string>(type: "text", nullable: true),
                    date_of_birth = table.Column<DateOnly>(type: "date", nullable: true),
                    date_of_birth_precision = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "day"),
                    gender = table.Column<string>(type: "text", nullable: true),
                    ethnicity = table.Column<string>(type: "text", nullable: true),
                    religion = table.Column<string>(type: "text", nullable: true),
                    nationality = table.Column<string>(type: "text", nullable: true),
                    birth_place = table.Column<string>(type: "text", nullable: true),
                    hometown = table.Column<string>(type: "text", nullable: true),
                    phone_mobile = table.Column<string>(type: "text", nullable: true),
                    phone_home = table.Column<string>(type: "text", nullable: true),
                    personal_email = table.Column<string>(type: "text", nullable: true),
                    permanent_address = table.Column<string>(type: "text", nullable: true),
                    permanent_ward = table.Column<string>(type: "text", nullable: true),
                    permanent_district = table.Column<string>(type: "text", nullable: true),
                    permanent_province = table.Column<string>(type: "text", nullable: true),
                    contact_address = table.Column<string>(type: "text", nullable: true),
                    contact_ward = table.Column<string>(type: "text", nullable: true),
                    contact_district = table.Column<string>(type: "text", nullable: true),
                    contact_province = table.Column<string>(type: "text", nullable: true),
                    salary_grade_code = table.Column<string>(type: "text", nullable: true),
                    salary_grade_name = table.Column<string>(type: "text", nullable: true),
                    salary_step = table.Column<int>(type: "integer", nullable: true),
                    salary_coefficient = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    over_grade_pct = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    education_level = table.Column<string>(type: "text", nullable: true),
                    major = table.Column<string>(type: "text", nullable: true),
                    political_theory = table.Column<string>(type: "text", nullable: true),
                    is_party_member = table.Column<bool>(type: "boolean", nullable: false),
                    party_joined_on = table.Column<DateOnly>(type: "date", nullable: true),
                    party_file_no = table.Column<string>(type: "text", nullable: true),
                    party_card_no = table.Column<string>(type: "text", nullable: true),
                    is_youth_union_member = table.Column<bool>(type: "boolean", nullable: false),
                    youth_union_joined_on = table.Column<DateOnly>(type: "date", nullable: true),
                    youth_file_no = table.Column<string>(type: "text", nullable: true),
                    youth_card_no = table.Column<string>(type: "text", nullable: true),
                    is_trade_union_member = table.Column<bool>(type: "boolean", nullable: false),
                    trade_union_joined_on = table.Column<DateOnly>(type: "date", nullable: true),
                    trade_union_card_no = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_employee_profiles", x => x.employee_code);
                    table.CheckConstraint("ck_employee_profiles_dob_precision", "date_of_birth_precision IN ('day','month','year')");
                    table.ForeignKey(
                        name: "fk_employee_profiles_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "employee_sensitive",
                columns: table => new
                {
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    national_id = table.Column<string>(type: "text", nullable: true),
                    national_id_issued_on = table.Column<DateOnly>(type: "date", nullable: true),
                    national_id_issued_by = table.Column<string>(type: "text", nullable: true),
                    tax_code = table.Column<string>(type: "text", nullable: true),
                    bank_name = table.Column<string>(type: "text", nullable: true),
                    bank_branch = table.Column<string>(type: "text", nullable: true),
                    bank_account = table.Column<string>(type: "text", nullable: true),
                    social_insurance_no = table.Column<string>(type: "text", nullable: true),
                    health_insurance_no = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_employee_sensitive", x => x.employee_code);
                    table.ForeignKey(
                        name: "fk_employee_sensitive_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "groups",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    org_unit_id = table.Column<long>(type: "bigint", nullable: true),
                    include_descendants = table.Column<bool>(type: "boolean", nullable: false),
                    rule = table.Column<string>(type: "jsonb", nullable: true),
                    member_count = table.Column<int>(type: "integer", nullable: false),
                    created_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_groups", x => x.id);
                    table.CheckConstraint("ck_groups_kind", "kind IN ('static','org_unit','rule')");
                    table.CheckConstraint("ck_groups_shape", "(kind <> 'org_unit' OR org_unit_id IS NOT NULL) AND (kind <> 'rule' OR rule IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_groups_employees_created_by",
                        column: x => x.created_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_groups_org_units_org_unit_id",
                        column: x => x.org_unit_id,
                        principalTable: "org_units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "innovations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    code = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: false),
                    type = table.Column<string>(type: "text", nullable: true),
                    decision_no = table.Column<string>(type: "text", nullable: true),
                    recognized_on = table.Column<DateOnly>(type: "date", nullable: true),
                    academic_year = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_innovations", x => x.id);
                    table.ForeignKey(
                        name: "fk_innovations_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    series_id = table.Column<long>(type: "bigint", nullable: true),
                    title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    summary = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false, defaultValue: ""),
                    summary_is_custom = table.Column<bool>(type: "boolean", nullable: false),
                    body_md = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    content_text = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    variables = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb"),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "draft"),
                    publish_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    audience_all = table.Column<bool>(type: "boolean", nullable: false),
                    recipient_count = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    content_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    updated_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    search = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: false, computedColumnSql: "setweight(to_tsvector('vn_unaccent', coalesce(title, '')), 'A') || setweight(to_tsvector('vn_unaccent', coalesce(summary, '')), 'B') || setweight(to_tsvector('vn_unaccent', coalesce(content_text, '')), 'C')", stored: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notifications", x => x.id);
                    table.CheckConstraint("ck_notifications_status", "status IN ('draft','scheduled','published','archived')");
                    table.ForeignKey(
                        name: "fk_notifications_employees_created_by",
                        column: x => x.created_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_notifications_employees_updated_by",
                        column: x => x.updated_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_notifications_notification_series_series_id",
                        column: x => x.series_id,
                        principalTable: "notification_series",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "position_history",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    unit_description = table.Column<string>(type: "text", nullable: true),
                    coefficient = table.Column<decimal>(type: "numeric(4,2)", nullable: true),
                    appointed_on = table.Column<DateOnly>(type: "date", nullable: true),
                    decision_no = table.Column<string>(type: "text", nullable: true),
                    signed_on = table.Column<DateOnly>(type: "date", nullable: true),
                    ended_on = table.Column<DateOnly>(type: "date", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_position_history", x => x.id);
                    table.ForeignKey(
                        name: "fk_position_history_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "role_assignments",
                columns: table => new
                {
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    granted_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    granted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_role_assignments", x => new { x.employee_code, x.role });
                    table.CheckConstraint("ck_role_assignments_role", "role IN ('editor','admin')");
                    table.ForeignKey(
                        name: "fk_role_assignments_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_role_assignments_employees_granted_by",
                        column: x => x.granted_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "salary_history",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    grade_code = table.Column<string>(type: "text", nullable: true),
                    grade_name = table.Column<string>(type: "text", nullable: true),
                    step = table.Column<int>(type: "integer", nullable: true),
                    coefficient = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    over_grade_pct = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    decision_no = table.Column<string>(type: "text", nullable: true),
                    signed_on = table.Column<DateOnly>(type: "date", nullable: true),
                    effective_from = table.Column<DateOnly>(type: "date", nullable: true),
                    next_raise_on = table.Column<DateOnly>(type: "date", nullable: true),
                    note = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_salary_history", x => x.id);
                    table.ForeignKey(
                        name: "fk_salary_history_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "teaching_loads",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    academic_year = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    program = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    term = table.Column<int>(type: "integer", nullable: true),
                    module = table.Column<string>(type: "text", nullable: true),
                    course_code = table.Column<string>(type: "text", nullable: true),
                    course_name = table.Column<string>(type: "text", nullable: false),
                    class_code = table.Column<string>(type: "text", nullable: true),
                    track = table.Column<string>(type: "text", nullable: true),
                    activity = table.Column<string>(type: "text", nullable: true),
                    periods = table.Column<int>(type: "integer", nullable: false),
                    standard_hours = table.Column<decimal>(type: "numeric(7,2)", nullable: false),
                    source_import_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_teaching_loads", x => x.id);
                    table.CheckConstraint("ck_teaching_loads_program", "program IN ('dai_hoc','cao_hoc','tien_si')");
                    table.CheckConstraint("ck_teaching_loads_term", "(program = 'dai_hoc' AND term IS NOT NULL AND term BETWEEN 1 AND 3) OR (program <> 'dai_hoc' AND term IS NULL)");
                    table.ForeignKey(
                        name: "fk_teaching_loads_dataset_imports_source_import_id",
                        column: x => x.source_import_id,
                        principalTable: "dataset_imports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_teaching_loads_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "trainings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    hrm_id = table.Column<int>(type: "integer", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    place = table.Column<string>(type: "text", nullable: true),
                    training_form = table.Column<string>(type: "text", nullable: true),
                    start_on = table.Column<DateOnly>(type: "date", nullable: true),
                    start_on_precision = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "day"),
                    end_on = table.Column<DateOnly>(type: "date", nullable: true),
                    end_on_precision = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "day"),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_trainings", x => x.id);
                    table.ForeignKey(
                        name: "fk_trainings_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "publication_authors",
                columns: table => new
                {
                    publication_id = table.Column<long>(type: "bigint", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ordinal = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_publication_authors", x => new { x.publication_id, x.employee_code });
                    table.ForeignKey(
                        name: "fk_publication_authors_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_publication_authors_publication_publication_id",
                        column: x => x.publication_id,
                        principalTable: "publications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "research_project_members",
                columns: table => new
                {
                    project_id = table.Column<long>(type: "bigint", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    role = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_research_project_members", x => new { x.project_id, x.employee_code });
                    table.ForeignKey(
                        name: "fk_research_project_members_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_research_project_members_research_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "research_projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "group_members",
                columns: table => new
                {
                    group_id = table.Column<long>(type: "bigint", nullable: false),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    added_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    added_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_group_members", x => new { x.group_id, x.employee_code });
                    table.CheckConstraint("ck_group_members_source", "source IN ('manual','computed')");
                    table.ForeignKey(
                        name: "fk_group_members_employees_added_by",
                        column: x => x.added_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_group_members_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_group_members_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_attachments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sort = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_attachments", x => x.id);
                    table.ForeignKey(
                        name: "fk_notification_attachments_notification_notification_id",
                        column: x => x.notification_id,
                        principalTable: "notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_attachments_stored_file_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notification_deliveries",
                columns: table => new
                {
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    vars = table.Column<string>(type: "jsonb", nullable: true),
                    delivered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    dismissed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_deliveries", x => new { x.employee_code, x.notification_id });
                    table.ForeignKey(
                        name: "fk_notification_deliveries_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_deliveries_notifications_notification_id",
                        column: x => x.notification_id,
                        principalTable: "notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_recipient_imports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    columns = table.Column<string>(type: "jsonb", nullable: false),
                    rows = table.Column<string>(type: "jsonb", nullable: false),
                    report = table.Column<string>(type: "jsonb", nullable: false),
                    created_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    applied_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_recipient_imports", x => x.id);
                    table.CheckConstraint("ck_notification_recipient_imports_status", "status IN ('validated','applied','rejected')");
                    table.ForeignKey(
                        name: "fk_notification_recipient_imports_employees_created_by",
                        column: x => x.created_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_notification_recipient_imports_notifications_notification_id",
                        column: x => x.notification_id,
                        principalTable: "notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_recipient_imports_stored_file_file_id",
                        column: x => x.file_id,
                        principalTable: "files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "notification_revisions",
                columns: table => new
                {
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    summary = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    variables = table.Column<string>(type: "jsonb", nullable: false),
                    edited_by = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    edited_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_revisions", x => new { x.notification_id, x.version });
                    table.ForeignKey(
                        name: "fk_notification_revisions_employees_edited_by",
                        column: x => x.edited_by,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_notification_revisions_notifications_notification_id",
                        column: x => x.notification_id,
                        principalTable: "notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_tags",
                columns: table => new
                {
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tag_id = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_tags", x => new { x.notification_id, x.tag_id });
                    table.ForeignKey(
                        name: "fk_notification_tags_notifications_notification_id",
                        column: x => x.notification_id,
                        principalTable: "notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_tags_tag_tag_id",
                        column: x => x.tag_id,
                        principalTable: "tags",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_audiences",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    notification_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    group_id = table.Column<long>(type: "bigint", nullable: true),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    import_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_audiences", x => x.id);
                    table.CheckConstraint("ck_notification_audiences_kind", "kind IN ('all','group','employee','import')");
                    table.ForeignKey(
                        name: "fk_notification_audiences_employees_employee_code",
                        column: x => x.employee_code,
                        principalTable: "employees",
                        principalColumn: "code",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_audiences_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_audiences_notification_notification_id",
                        column: x => x.notification_id,
                        principalTable: "notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_notification_audiences_notification_recipient_import_import",
                        column: x => x.import_id,
                        principalTable: "notification_recipient_imports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "tags",
                columns: new[] { "id", "color", "created_at", "name", "sort", "updated_at" },
                values: new object[,]
                {
                    { 1L, "#303F9F", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Lương", 10, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { 2L, "#00796B", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Thâm niên", 20, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { 3L, "#F9A825", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Khen thưởng", 30, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { 4L, "#6A1B9A", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Khảo sát", 40, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { 5L, "#0277BD", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Đào tạo", 50, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { 6L, "#546E7A", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Chung", 60, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) }
                });

            migrationBuilder.CreateIndex(
                name: "ix_academic_degrees_employee_code_graduated_on",
                table: "academic_degrees",
                columns: new[] { "employee_code", "graduated_on" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_academic_degrees_hrm_id",
                table: "academic_degrees",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_api_clients_name",
                table: "api_clients",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_api_clients_token_hash",
                table: "api_clients",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_action_at",
                table: "audit_log",
                columns: new[] { "action", "at" });

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_at",
                table: "audit_log",
                column: "at")
                .Annotation("Npgsql:IndexMethod", "brin");

            migrationBuilder.CreateIndex(
                name: "ix_audit_log_at_id",
                table: "audit_log",
                columns: new[] { "at", "id" },
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_business_trips_employee_code_from_on",
                table: "business_trips",
                columns: new[] { "employee_code", "from_on" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_business_trips_hrm_id",
                table: "business_trips",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_commendations_employee_code_kind_decided_on",
                table: "commendations",
                columns: new[] { "employee_code", "kind", "decided_on" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "ix_commendations_hrm_id",
                table: "commendations",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_dataset_imports_dataset_created_at",
                table: "dataset_imports",
                columns: new[] { "dataset", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_dataset_imports_file_id",
                table: "dataset_imports",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_employee_emails_added_by",
                table: "employee_emails",
                column: "added_by");

            migrationBuilder.CreateIndex(
                name: "ix_employee_emails_employee_code_added_at",
                table: "employee_emails",
                columns: new[] { "employee_code", "added_at" });

            migrationBuilder.CreateIndex(
                name: "ux_employee_emails_one_primary",
                table: "employee_emails",
                column: "employee_code",
                unique: true,
                filter: "is_primary");

            migrationBuilder.CreateIndex(
                name: "ix_employee_profiles_hrm_id",
                table: "employee_profiles",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_employees_department_id",
                table: "employees",
                column: "department_id");

            migrationBuilder.CreateIndex(
                name: "ix_employees_full_name_unaccent_trgm",
                table: "employees",
                column: "full_name_unaccent")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "ix_employees_hrm_id",
                table: "employees",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_employees_org_unit_id",
                table: "employees",
                column: "org_unit_id");

            migrationBuilder.CreateIndex(
                name: "ix_employees_status",
                table: "employees",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_group_members_added_by",
                table: "group_members",
                column: "added_by");

            migrationBuilder.CreateIndex(
                name: "ix_group_members_employee_code",
                table: "group_members",
                column: "employee_code");

            migrationBuilder.CreateIndex(
                name: "ix_groups_created_by",
                table: "groups",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_groups_name",
                table: "groups",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_groups_org_unit",
                table: "groups",
                column: "org_unit_id",
                unique: true,
                filter: "kind = 'org_unit'");

            migrationBuilder.CreateIndex(
                name: "ix_innovations_employee_code_recognized_on",
                table: "innovations",
                columns: new[] { "employee_code", "recognized_on" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_innovations_hrm_id",
                table: "innovations",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_jobs_run_at_pending",
                table: "jobs",
                column: "run_at",
                filter: "done_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_notification_attachments_file_id",
                table: "notification_attachments",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_attachments_notification_id",
                table: "notification_attachments",
                column: "notification_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_audiences_employee_code",
                table: "notification_audiences",
                column: "employee_code");

            migrationBuilder.CreateIndex(
                name: "ix_notification_audiences_group_id",
                table: "notification_audiences",
                column: "group_id",
                filter: "group_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_notification_audiences_import_id",
                table: "notification_audiences",
                column: "import_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_audiences_notification_id",
                table: "notification_audiences",
                column: "notification_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_deliveries_inbox",
                table: "notification_deliveries",
                columns: new[] { "employee_code", "delivered_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_notification_deliveries_notification_id",
                table: "notification_deliveries",
                column: "notification_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_recipient_imports_created_by",
                table: "notification_recipient_imports",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_notification_recipient_imports_file_id",
                table: "notification_recipient_imports",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_recipient_imports_notification_id",
                table: "notification_recipient_imports",
                column: "notification_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_revisions_edited_by",
                table: "notification_revisions",
                column: "edited_by");

            migrationBuilder.CreateIndex(
                name: "ix_notification_series_name",
                table: "notification_series",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_tags_tag_id",
                table: "notification_tags",
                column: "tag_id");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_created_by",
                table: "notifications",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_search",
                table: "notifications",
                column: "search")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_series_id",
                table: "notifications",
                column: "series_id");

            migrationBuilder.CreateIndex(
                name: "ix_notifications_status_publish_at",
                table: "notifications",
                columns: new[] { "status", "publish_at" });

            migrationBuilder.CreateIndex(
                name: "ix_notifications_updated_by",
                table: "notifications",
                column: "updated_by");

            migrationBuilder.CreateIndex(
                name: "ix_org_units_hrm_id",
                table: "org_units",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_org_units_parent_id",
                table: "org_units",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "ix_position_history_employee_code_appointed_on",
                table: "position_history",
                columns: new[] { "employee_code", "appointed_on" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_position_history_hrm_id",
                table: "position_history",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_publication_authors_employee_code",
                table: "publication_authors",
                column: "employee_code");

            migrationBuilder.CreateIndex(
                name: "ix_publications_doi",
                table: "publications",
                column: "doi",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_publications_eid",
                table: "publications",
                column: "eid",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_publications_source_import_id",
                table: "publications",
                column: "source_import_id");

            migrationBuilder.CreateIndex(
                name: "ix_research_project_members_employee_code",
                table: "research_project_members",
                column: "employee_code");

            migrationBuilder.CreateIndex(
                name: "ix_research_projects_code",
                table: "research_projects",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_research_projects_source_import_id",
                table: "research_projects",
                column: "source_import_id");

            migrationBuilder.CreateIndex(
                name: "ix_role_assignments_granted_by",
                table: "role_assignments",
                column: "granted_by");

            migrationBuilder.CreateIndex(
                name: "ix_salary_history_employee_code_effective_from",
                table: "salary_history",
                columns: new[] { "employee_code", "effective_from" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_salary_history_hrm_id",
                table: "salary_history",
                column: "hrm_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sync_issues_resolved_at",
                table: "sync_issues",
                column: "resolved_at",
                filter: "resolved_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_sync_issues_sync_run_id",
                table: "sync_issues",
                column: "sync_run_id");

            migrationBuilder.CreateIndex(
                name: "ix_sync_runs_dataset_started_at",
                table: "sync_runs",
                columns: new[] { "dataset", "started_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_tags_name",
                table: "tags",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_teaching_loads_academic_year",
                table: "teaching_loads",
                column: "academic_year");

            migrationBuilder.CreateIndex(
                name: "ix_teaching_loads_employee_code_academic_year_program_term",
                table: "teaching_loads",
                columns: new[] { "employee_code", "academic_year", "program", "term" });

            migrationBuilder.CreateIndex(
                name: "ix_teaching_loads_source_import_id",
                table: "teaching_loads",
                column: "source_import_id");

            migrationBuilder.CreateIndex(
                name: "ix_trainings_employee_code_start_on",
                table: "trainings",
                columns: new[] { "employee_code", "start_on" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_trainings_hrm_id",
                table: "trainings",
                column: "hrm_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "academic_degrees");

            migrationBuilder.DropTable(
                name: "api_clients");

            migrationBuilder.DropTable(
                name: "audit_log");

            migrationBuilder.DropTable(
                name: "business_trips");

            migrationBuilder.DropTable(
                name: "commendations");

            migrationBuilder.DropTable(
                name: "data_protection_keys");

            migrationBuilder.DropTable(
                name: "employee_emails");

            migrationBuilder.DropTable(
                name: "employee_profiles");

            migrationBuilder.DropTable(
                name: "employee_sensitive");

            migrationBuilder.DropTable(
                name: "group_members");

            migrationBuilder.DropTable(
                name: "innovations");

            migrationBuilder.DropTable(
                name: "jobs");

            migrationBuilder.DropTable(
                name: "legacy_import_marks");

            migrationBuilder.DropTable(
                name: "notification_attachments");

            migrationBuilder.DropTable(
                name: "notification_audiences");

            migrationBuilder.DropTable(
                name: "notification_deliveries");

            migrationBuilder.DropTable(
                name: "notification_revisions");

            migrationBuilder.DropTable(
                name: "notification_tags");

            migrationBuilder.DropTable(
                name: "position_history");

            migrationBuilder.DropTable(
                name: "publication_authors");

            migrationBuilder.DropTable(
                name: "research_project_members");

            migrationBuilder.DropTable(
                name: "role_assignments");

            migrationBuilder.DropTable(
                name: "salary_history");

            migrationBuilder.DropTable(
                name: "sync_issues");

            migrationBuilder.DropTable(
                name: "teaching_loads");

            migrationBuilder.DropTable(
                name: "trainings");

            migrationBuilder.DropTable(
                name: "groups");

            migrationBuilder.DropTable(
                name: "notification_recipient_imports");

            migrationBuilder.DropTable(
                name: "tags");

            migrationBuilder.DropTable(
                name: "publications");

            migrationBuilder.DropTable(
                name: "research_projects");

            migrationBuilder.DropTable(
                name: "sync_runs");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "dataset_imports");

            migrationBuilder.DropTable(
                name: "employees");

            migrationBuilder.DropTable(
                name: "notification_series");

            migrationBuilder.DropTable(
                name: "files");

            migrationBuilder.DropTable(
                name: "org_units");

            migrationBuilder.Sql("DROP TEXT SEARCH CONFIGURATION IF EXISTS public.vn_unaccent;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS public.f_unaccent(text);");
        }
    }
}
