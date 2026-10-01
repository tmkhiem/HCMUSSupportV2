using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class D03_Identity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.CreateIndex(
                name: "ix_employee_emails_added_by",
                table: "employee_emails",
                column: "added_by");

            migrationBuilder.CreateIndex(
                name: "ix_employee_emails_employee_code",
                table: "employee_emails",
                column: "employee_code");

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
                name: "ix_groups_org_unit_id",
                table: "groups",
                column: "org_unit_id");

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
                name: "ix_role_assignments_granted_by",
                table: "role_assignments",
                column: "granted_by");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "employee_emails");

            migrationBuilder.DropTable(
                name: "group_members");

            migrationBuilder.DropTable(
                name: "role_assignments");

            migrationBuilder.DropTable(
                name: "groups");

            migrationBuilder.DropTable(
                name: "employees");

            migrationBuilder.DropTable(
                name: "org_units");
        }
    }
}
