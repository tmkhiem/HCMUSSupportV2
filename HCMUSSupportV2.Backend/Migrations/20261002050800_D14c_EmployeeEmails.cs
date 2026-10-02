using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HCMUSSupportV2.Backend.Migrations
{
    /// <inheritdoc />
    public partial class D14c_EmployeeEmails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_employee_emails_employee_code",
                table: "employee_emails");

            migrationBuilder.CreateIndex(
                name: "ix_employee_emails_employee_code_added_at",
                table: "employee_emails",
                columns: new[] { "employee_code", "added_at" });

            // Keep only the oldest primary per employee so the unique index can be created on existing data.
            migrationBuilder.Sql(@"
UPDATE employee_emails e SET is_primary = false
WHERE is_primary AND EXISTS (
    SELECT 1 FROM employee_emails o
    WHERE o.employee_code = e.employee_code AND o.is_primary
      AND (o.added_at, o.email) < (e.added_at, e.email));");

            migrationBuilder.CreateIndex(
                name: "ux_employee_emails_one_primary",
                table: "employee_emails",
                column: "employee_code",
                unique: true,
                filter: "is_primary");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_employee_emails_employee_code_added_at",
                table: "employee_emails");

            migrationBuilder.DropIndex(
                name: "ux_employee_emails_one_primary",
                table: "employee_emails");

            migrationBuilder.CreateIndex(
                name: "ix_employee_emails_employee_code",
                table: "employee_emails",
                column: "employee_code");
        }
    }
}
