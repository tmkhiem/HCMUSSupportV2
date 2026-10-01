using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class D04_Hrm : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
                name: "teaching_loads",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    employee_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    academic_year = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    term = table.Column<int>(type: "integer", nullable: false),
                    course_code = table.Column<string>(type: "text", nullable: true),
                    course_name = table.Column<string>(type: "text", nullable: false),
                    class_code = table.Column<string>(type: "text", nullable: true),
                    level = table.Column<string>(type: "text", nullable: true),
                    periods = table.Column<int>(type: "integer", nullable: false),
                    standard_hours = table.Column<decimal>(type: "numeric(7,2)", nullable: false),
                    source_import_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_teaching_loads", x => x.id);
                    table.CheckConstraint("ck_teaching_loads_term", "term BETWEEN 1 AND 3");
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
                name: "ix_employee_profiles_hrm_id",
                table: "employee_profiles",
                column: "hrm_id",
                unique: true);

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
                name: "ix_teaching_loads_academic_year",
                table: "teaching_loads",
                column: "academic_year");

            migrationBuilder.CreateIndex(
                name: "ix_teaching_loads_employee_code_academic_year_term",
                table: "teaching_loads",
                columns: new[] { "employee_code", "academic_year", "term" });

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
                name: "business_trips");

            migrationBuilder.DropTable(
                name: "commendations");

            migrationBuilder.DropTable(
                name: "employee_profiles");

            migrationBuilder.DropTable(
                name: "employee_sensitive");

            migrationBuilder.DropTable(
                name: "innovations");

            migrationBuilder.DropTable(
                name: "position_history");

            migrationBuilder.DropTable(
                name: "publication_authors");

            migrationBuilder.DropTable(
                name: "research_project_members");

            migrationBuilder.DropTable(
                name: "salary_history");

            migrationBuilder.DropTable(
                name: "sync_issues");

            migrationBuilder.DropTable(
                name: "teaching_loads");

            migrationBuilder.DropTable(
                name: "trainings");

            migrationBuilder.DropTable(
                name: "publications");

            migrationBuilder.DropTable(
                name: "research_projects");

            migrationBuilder.DropTable(
                name: "sync_runs");

            migrationBuilder.DropTable(
                name: "dataset_imports");
        }
    }
}
