using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class D13b_TeachingPrograms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_teaching_loads_employee_code_academic_year_term",
                table: "teaching_loads");

            migrationBuilder.DropCheckConstraint(
                name: "ck_teaching_loads_term",
                table: "teaching_loads");

            migrationBuilder.RenameColumn(
                name: "level",
                table: "teaching_loads",
                newName: "activity");

            migrationBuilder.AlterColumn<int>(
                name: "term",
                table: "teaching_loads",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<string>(
                name: "track",
                table: "teaching_loads",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "module",
                table: "teaching_loads",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "program",
                table: "teaching_loads",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "dai_hoc");   // backfill: every existing row is undergraduate

            migrationBuilder.Sql("ALTER TABLE teaching_loads ALTER COLUMN program DROP DEFAULT;");

            migrationBuilder.CreateIndex(
                name: "ix_teaching_loads_employee_code_academic_year_program_term",
                table: "teaching_loads",
                columns: new[] { "employee_code", "academic_year", "program", "term" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_teaching_loads_program",
                table: "teaching_loads",
                sql: "program IN ('dai_hoc','cao_hoc','tien_si')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_teaching_loads_term",
                table: "teaching_loads",
                sql: "(program = 'dai_hoc' AND term IS NOT NULL AND term BETWEEN 1 AND 3) OR (program <> 'dai_hoc' AND term IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_teaching_loads_employee_code_academic_year_program_term",
                table: "teaching_loads");

            migrationBuilder.DropCheckConstraint(
                name: "ck_teaching_loads_program",
                table: "teaching_loads");

            migrationBuilder.DropCheckConstraint(
                name: "ck_teaching_loads_term",
                table: "teaching_loads");

            // Postgraduate rows have no term and cannot be represented by the old schema.
            migrationBuilder.Sql("DELETE FROM teaching_loads WHERE program <> 'dai_hoc';");

            migrationBuilder.DropColumn(
                name: "track",
                table: "teaching_loads");

            migrationBuilder.DropColumn(
                name: "module",
                table: "teaching_loads");

            migrationBuilder.DropColumn(
                name: "program",
                table: "teaching_loads");

            migrationBuilder.RenameColumn(
                name: "activity",
                table: "teaching_loads",
                newName: "level");

            migrationBuilder.AlterColumn<int>(
                name: "term",
                table: "teaching_loads",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_teaching_loads_employee_code_academic_year_term",
                table: "teaching_loads",
                columns: new[] { "employee_code", "academic_year", "term" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_teaching_loads_term",
                table: "teaching_loads",
                sql: "term BETWEEN 1 AND 3");
        }
    }
}
